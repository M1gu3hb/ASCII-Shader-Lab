import { existsSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';
import { FOTO_STUDIO, pageByFile } from '../src/shared/site.ts';
import { cleanVerification, renderPage, robotsTxt, sitemapXml } from './seo.ts';

/** Repository files published next to /licencia/ so the deployed site carries its own notices. */
const LICENSE_FILES: Array<[string, string]> = [
  ['licencia/MIT.txt', 'LICENSE'],
  ['licencia/MIT-0.txt', 'LICENSES/MIT-0.txt'],
  ['licencia/terceros.txt', 'THIRD_PARTY_NOTICES.md'],
];

/**
 * Public-site build step (see scripts/seo.ts for the HTML directives):
 * - expands head tags, JSON-LD, header, footer and guide cards in every page listed in src/shared/site.ts;
 * - emits robots.txt, sitemap.xml (lastmod = build date) and the license texts;
 * - adds <meta name="google-site-verification"> when GOOGLE_SITE_VERIFICATION is set at build time;
 * - keeps or drops the photo studio's @foto-on / @foto-off blocks (VITE_FOTO_STUDIO, see src/shared/site.ts);
 * - `vite preview` answers unknown pages with 404.html and status 404, like the host does.
 */
export function seoPlugin(): Plugin {
  let root = process.cwd();
  let outDir = 'dist';
  let isBuild = false;
  const verification = cleanVerification(process.env.GOOGLE_SITE_VERIFICATION);
  const readPublic = (path: string) => readFileSync(join(root, 'public', path), 'utf8');

  return {
    name: 'mt-seo',
    configResolved(c) {
      root = c.root;
      outDir = c.build.outDir;
      isBuild = c.command === 'build';
      // The pages, the sitemap and the app must agree on the photo studio. The app would also see the variable in a
      // .env file, which this file (read while the config loads) cannot: set it in the environment instead.
      if ((c.env.VITE_FOTO_STUDIO === '1') !== FOTO_STUDIO) {
        throw new Error('[mt-seo] VITE_FOTO_STUDIO está en un archivo .env: defínela en el entorno (VITE_FOTO_STUDIO=1 npm run build) para que las páginas, el sitemap y la app coincidan.');
      }
      if (isBuild && process.env.GOOGLE_SITE_VERIFICATION && !verification) {
        c.logger.warn('[mt-seo] GOOGLE_SITE_VERIFICATION no parece un token válido: no se añade la etiqueta.');
      }
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const file = relative(root, ctx.filename).split(sep).join('/');
        const page = pageByFile(file);
        if (!page) {
          if (isBuild) throw new Error(`[mt-seo] ${file} no está en src/shared/site.ts (PAGES)`);
          return html; // dev-only pages (dev/*.html)
        }
        return renderPage(html, page, { verification, readPublic });
      },
    },
    generateBundle() {
      const date = new Date().toISOString().slice(0, 10);
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt() });
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml(date) });
      for (const [fileName, src] of LICENSE_FILES) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(join(root, src), 'utf8') });
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (url === '/robots.txt') { res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end(robotsTxt()); return; }
        if (url === '/sitemap.xml') { res.setHeader('Content-Type', 'application/xml; charset=utf-8'); res.end(sitemapXml(new Date().toISOString().slice(0, 10))); return; }
        next();
      });
    },
    configurePreviewServer(server) {
      const dist = join(root, outDir);
      return () => {
        server.middlewares.use((req, res, next) => {
          const [raw, query] = (req.url ?? '/').split('?');
          let url: string;
          try { url = decodeURIComponent(raw); } catch { next(); return; }
          const wantsHtml = !req.headers.accept || req.headers.accept.includes('text/html');
          if (!wantsHtml) { next(); return; }
          // trailingSlash: true on the host: /studio → /studio/
          if (!url.endsWith('/') && existsSync(join(dist, url, 'index.html'))) {
            res.statusCode = 308;
            res.setHeader('Location', raw + '/' + (query ? '?' + query : ''));
            res.end();
            return;
          }
          if (existsSync(join(dist, url)) || !existsSync(join(dist, '404.html'))) { next(); return; }
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(readFileSync(join(dist, '404.html')));
        });
      };
    },
  };
}
