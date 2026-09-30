import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from '../../src/random/archetypes';
import { FOTO_STUDIO, GUIDES, MORPHIQ, PAGES, SITE_URL, fotoPage, sitePages } from '../../src/shared/site';
import { cleanVerification, contactSheet, fmtBytes, fotoBlocks, headTags, jsonForScript, jsonLd, renderPage, robotsTxt, salida, shortUsage, sitemapXml } from '../../scripts/seo';
import { PATTERNS } from '../../src/engine/catalog';
import { CONTACTS, contactSrc } from '../../src/landing/contacts';
import { GUIDE_MEDIA, GUIDE_MEDIA_PX, guideLoop, guidePoster } from '../../src/landing/guias-data';
import { PRESETS } from '../../src/studio/presets';

const root = join(import.meta.dirname, '../..');
const page = (id: string) => PAGES.find(p => p.id === id)!;
const graphOf = (id: string) => (JSON.parse(jsonForScript(jsonLd(page(id)))) as { '@graph': Array<Record<string, unknown>> })['@graph'];

describe('site pages', () => {
  it('every page has an HTML source with the head directive, and an honest-length title and description', () => {
    for (const p of [...sitePages(true), ...sitePages(false)]) {
      const html = readFileSync(join(root, p.file), 'utf8');
      expect(html, p.file).toContain('<!-- @head -->');
      expect(html, p.file).not.toMatch(/<title>/);
      expect(p.title.length, p.title).toBeLessThanOrEqual(70);
      expect(p.description.length, p.description).toBeLessThanOrEqual(160);
      expect(existsSync(join(root, 'public', p.image.path)), p.image.path).toBe(true);
    }
  });

  it('the landing counts the dice\'s art styles right', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const words: Record<number, string> = { 12: 'doce', 13: 'trece', 14: 'catorce', 15: 'quince', 16: 'dieciséis' };
    expect(html).toContain(`con ${words[ARCHETYPES.length]} estilos de arte`);
  });

  it('the landing and the guides count the catalog and the presets right', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const solids = PATTERNS.filter(p => p.family === 'solidos').length;
    expect(html).toContain(`${PATTERNS.length} patrones`);
    expect(html).toContain(`${solids} objetos en 3D`);
    const word: Record<number, string> = { 5: 'Cinco', 6: 'Seis', 7: 'Siete', 8: 'Ocho', 9: 'Nueve', 10: 'Diez', 11: 'Once', 12: 'Doce' };
    expect(readFileSync(join(root, 'fondos-ascii/index.html'), 'utf8')).toContain(`${word[PRESETS.fondos.length]} puntos de partida`);
    expect(readFileSync(join(root, 'arte-ascii-terminal/index.html'), 'utf8')).toContain(`${word[PRESETS.terminal.length]} puntos de partida`);
    expect(readFileSync(join(root, 'imagen-a-ascii/index.html'), 'utf8')).toContain(`${word[PRESETS.media.length]} estilos de partida`);
  });

  it('guide posters and the Morphiq logo files exist', () => {
    for (const g of GUIDES) for (const s of ['.webp', '-640.webp', '-og.jpg']) expect(existsSync(join(root, 'public', g.poster + s)), g.poster + s).toBe(true);
    expect(existsSync(join(root, 'public', MORPHIQ.logo.path))).toBe(true);
    for (const w of MORPHIQ.display.files) for (const ext of ['png', 'webp']) expect(existsSync(join(root, `public/brand/morphiq/morphiq-logo-${w}.${ext}`))).toBe(true);
    expect(MORPHIQ.display.width * MORPHIQ.logo.height).toBe(MORPHIQ.display.height * MORPHIQ.logo.width);
  });
});

describe('sitemap and robots', () => {
  const PUBLIC = ['/', '/studio/', '/studio/foto/', '/imagen-a-ascii/', '/video-a-ascii/', '/fondos-ascii/', '/texto-animado-ascii/', '/arte-ascii-terminal/', '/licencia/'];
  const locsOf = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

  it('lists absolute canonical URLs with a trailing slash, landing first', () => {
    const xml = sitemapXml('2026-09-27', sitePages(true));
    expect(locsOf(xml)).toEqual(PUBLIC.map(p => SITE_URL + p));
    expect(xml.match(/<lastmod>2026-09-27<\/lastmod>/g)).toHaveLength(9);
    expect(xml).not.toContain('404');
  });

  it('leaves the photo studio out while it is paused (VITE_FOTO_STUDIO unset), and the build uses the flag', () => {
    const xml = sitemapXml('2026-09-27', sitePages(false));
    expect(locsOf(xml)).toEqual(PUBLIC.filter(p => p !== '/studio/foto/').map(p => SITE_URL + p));
    expect(xml).not.toContain('/studio/foto/');
    // the page itself still exists (old links do not 404): same file and path, out of the index
    const paused = sitePages(false).find(p => p.id === 'foto')!;
    expect(paused).toMatchObject({ file: 'studio/foto/index.html', path: '/studio/foto/', kind: 'paused', sitemap: false });
    expect(sitePages(true).find(p => p.id === 'foto')).toMatchObject({ kind: 'app', sitemap: true });
    expect(sitePages(false).map(p => p.id)).toEqual(sitePages(true).map(p => p.id));
    // one source of truth: the default build (no variable) pauses it, and PAGES and the sitemap follow the flag
    expect(FOTO_STUDIO).toBe(process.env.VITE_FOTO_STUDIO === '1');
    expect(PAGES).toEqual(sitePages(FOTO_STUDIO));
    expect(sitemapXml('2026-09-27').includes('/studio/foto/')).toBe(FOTO_STUDIO);
  });

  it('robots allows everything and points to the absolute sitemap', () => {
    expect(robotsTxt()).toBe(`User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  });
});

describe('head tags', () => {
  it('uses absolute canonical and share image URLs', () => {
    const h = headTags(page('imagen'));
    expect(h).toContain(`<link rel="canonical" href="${SITE_URL}/imagen-a-ascii/">`);
    expect(h).toContain(`<meta property="og:url" content="${SITE_URL}/imagen-a-ascii/">`);
    expect(h).toContain(`<meta property="og:image" content="${SITE_URL}/ex/imagen-a-ascii-og.jpg">`);
    expect(h).toContain('<meta property="og:locale" content="es_MX">');
    expect(h).toContain('<meta name="twitter:card" content="summary_large_image">');
  });

  it('keeps the 404 out of the index and without a canonical', () => {
    const h = headTags(page('notfound'));
    expect(h).toContain('<meta name="robots" content="noindex">');
    expect(h).not.toContain('canonical');
    expect(h).not.toContain('application/ld+json');
  });

  it('keeps the paused photo studio out of the index: noindex, no canonical, no share tags, no structured data', () => {
    const paused = fotoPage(false);
    const h = headTags(paused);
    expect(h).toContain('<meta name="robots" content="noindex">');
    expect(h).toContain('<title>Estudio de foto y video en revisión · GLYPHOS</title>');
    for (const no of ['canonical', 'og:', 'twitter:', 'application/ld+json']) expect(h).not.toContain(no);
    expect(jsonLd(paused)).toBeNull();
    // public again, it describes itself as before
    const on = headTags(fotoPage(true));
    expect(on).toContain(`<link rel="canonical" href="${SITE_URL}/studio/foto/">`);
    expect(on).not.toContain('noindex');
    const app = (jsonLd(fotoPage(true)) as { '@graph': Array<Record<string, unknown>> })['@graph'][0];
    expect(app).toMatchObject({ '@type': 'WebApplication', '@id': `${SITE_URL}/studio/foto/#app`, url: `${SITE_URL}/studio/foto/` });
  });

  it('adds the Search Console tag only for a well-formed token', () => {
    expect(headTags(page('main'))).not.toContain('google-site-verification');
    expect(headTags(page('main'), { verification: cleanVerification(' abcDEF123_-xyz ') })).toContain('<meta name="google-site-verification" content="abcDEF123_-xyz">');
    expect(cleanVerification('"><script>alert(1)</script>')).toBeNull();
    expect(cleanVerification('')).toBeNull();
    expect(cleanVerification(undefined)).toBeNull();
  });
});

describe('structured data', () => {
  it('landing: WebSite, Morphiq as creator and publisher, and the studio as a free WebApplication', () => {
    const g = graphOf('main');
    const site = g.find(n => n['@type'] === 'WebSite')!;
    const org = g.find(n => n['@type'] === 'Organization')!;
    const app = g.find(n => n['@type'] === 'WebApplication')!;
    expect(site).toMatchObject({ name: 'GLYPHOS', alternateName: ['Monotrama', 'ASCII Shader Lab'], url: SITE_URL + '/', inLanguage: 'es', creator: { '@id': org['@id'] }, publisher: { '@id': org['@id'] } });
    expect(org).toMatchObject({ name: 'Morphiq', url: 'https://morphiq.com.mx', logo: { url: SITE_URL + MORPHIQ.logo.path } });
    expect(app).toMatchObject({
      url: SITE_URL + '/studio/', applicationCategory: 'DesignApplication', operatingSystem: 'Web', isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'MXN' }, inLanguage: 'es', license: SITE_URL + '/licencia/',
      browserRequirements: 'Requiere JavaScript; WebGL 2 para el motor completo',
    });
  });

  it('guides: WebPage and a two-step BreadcrumbList', () => {
    for (const g of GUIDES) {
      const graph = graphOf(g.id);
      expect(graph.find(n => n['@type'] === 'WebPage')).toMatchObject({ url: SITE_URL + g.path, inLanguage: 'es' });
      const crumbs = graph.find(n => n['@type'] === 'BreadcrumbList')!.itemListElement as Array<{ item: string; position: number }>;
      expect(crumbs.map(c => c.item)).toEqual([SITE_URL + '/', SITE_URL + g.path]);
    }
  });

  it('never lets "</script>" into the JSON-LD block', () => {
    expect(jsonForScript({ a: '</script><b>' })).not.toContain('<');
    expect(JSON.parse(jsonForScript({ a: '</script>' }))).toEqual({ a: '</script>' });
  });
});

describe('directives', () => {
  const opts = { readPublic: (p: string) => (p === 'ex/x.txt' ? '\n  <a> & b\n' : '') };

  it('expands the shared footer with the Morphiq credit', () => {
    const html = renderPage('<body><!-- @footer --></body>', page('imagen'), opts);
    expect(html).toContain('Desarrollado por');
    expect(html).toContain(`href="${MORPHIQ.url}"`);
    expect(html).toContain(`alt="${MORPHIQ.alt}"`);
    expect(html).toContain('width="128" height="37"');
    expect(renderPage('<!-- @footer paper -->', page('licencia'), opts)).toContain('class="foot paper"');
  });

  it('leaves the current guide out of "@guides others"', () => {
    const html = renderPage('<!-- @guides others -->', page('video'), opts);
    expect(html).not.toContain('href="/video-a-ascii/"');
    expect(html.match(/class="guide-card"/g)).toHaveLength(4);
  });

  it('each guide card carries its example: the picture, the loop in MP4 and WebM, a real description, light files', () => {
    const html = renderPage('<!-- @guides -->', page('main'), opts);
    for (const g of GUIDES) {
      expect(html).toContain(`data-loop="${guideLoop(g.id)}"`);
      expect(html).toContain(`src="${guidePoster(g.id)}" width="${GUIDE_MEDIA_PX.width}" height="${GUIDE_MEDIA_PX.height}" alt="${GUIDE_MEDIA[g.id].alt}"`);
      expect(GUIDE_MEDIA[g.id].alt.length, g.id).toBeGreaterThan(30);
      // what a card may weigh: the picture loads with the page (lazily), a loop only when someone asks for it
      const limit = { webp: 110, mp4: 200, webm: 200 } as const;
      for (const ext of ['webp', 'mp4', 'webm'] as const) {
        const f = join(root, 'public', `${guideLoop(g.id)}.${ext}`);
        expect(existsSync(f), f).toBe(true);
        expect(statSync(f).size / 1024, f).toBeLessThan(limit[ext]);
      }
    }
    expect(html).not.toContain('alt=""');
  });

  it('the public pages show GLYPHOS in their examples: no «SEÑAL», no «MONOTRAMA», and the headline without «que se mueve»', () => {
    const files = ['index.html', '404.html', ...GUIDES.map(g => `${g.path.slice(1)}index.html`)];
    for (const f of files) expect(readFileSync(join(root, f), 'utf8'), f).not.toMatch(/SEÑAL|MONOTRAMA/);
    for (const g of GUIDES) expect(`${g.posterAlt} ${GUIDE_MEDIA[g.id].alt}`).not.toMatch(/SEÑAL|MONOTRAMA/);
    expect(readFileSync(join(root, 'index.html'), 'utf8')).toMatch(/<h1 id="hero-title" class="hero-title">Haz arte ASCII<\/h1>/);
    for (const p of PAGES) expect(`${p.title} ${p.description}`).not.toContain('que se mueve');
  });

  it('includes text files escaped and keeps a leading blank row inside <pre>', () => {
    expect(renderPage('<pre><!-- @include:ex/x.txt --></pre>', page('terminal'), opts)).toBe('<pre>\n\n  &lt;a&gt; &amp; b</pre>');
    expect(() => renderPage('<!-- @include:../secret.txt -->', page('terminal'), opts)).toThrow();
  });

  it('rejects unknown directives instead of shipping them', () => {
    expect(() => renderPage('<!-- @hed -->', page('main'), opts)).toThrow(/@hed/);
  });

  it('keeps @foto-on blocks only with the photo studio public and @foto-off ones only while it is paused', () => {
    const html = 'a<!-- @foto-on -->ON<!-- @foto-end -->b<!-- @foto-off -->OFF<!-- @foto-end -->c';
    expect(fotoBlocks(html, true)).toBe('aONbc');
    expect(fotoBlocks(html, false)).toBe('abOFFc');
    expect(renderPage(html, page('main'), { ...opts, foto: false })).toBe('abOFFc');
    // blocks do not nest, and a block left open (or a stray end) is an error, not shipped
    expect(() => fotoBlocks('<!-- @foto-on --><!-- @foto-off -->x<!-- @foto-end --><!-- @foto-end -->', true)).toThrow(/anidan/);
    expect(() => renderPage('<!-- @foto-on -->x', page('main'), { ...opts, foto: true })).toThrow(/@foto-on/);
    expect(() => renderPage('x<!-- @foto-end -->', page('main'), { ...opts, foto: false })).toThrow(/@foto-end/);
  });

  it('while paused, no public page links to the photo studio, and its page is the «en revisión» one without the app', () => {
    const readPublic = (p: string) => readFileSync(join(root, 'public', p), 'utf8');
    for (const foto of [false, true]) {
      for (const p of sitePages(foto)) {
        const out = renderPage(readFileSync(join(root, p.file), 'utf8'), p, { readPublic, foto });
        expect(out, p.file).not.toMatch(/<!--\s*@/);
        if (!foto && p.id !== 'foto') expect(out, p.file).not.toContain('/studio/foto');
      }
    }
    const fotoHtml = readFileSync(join(root, 'studio/foto/index.html'), 'utf8');
    const off = renderPage(fotoHtml, fotoPage(false), { readPublic, foto: false });
    expect(off).toContain('data-foto-review');
    expect(off).toContain('<meta name="robots" content="noindex">');
    expect(off).not.toMatch(/<script(?![^>]*application\/ld\+json)/);
    expect(off).not.toContain('src/foto');
    expect(off).toContain('href="/studio/"');
    expect(off).toContain('href="/"');
    expect(off.match(/<h1[\s>]/g)).toHaveLength(1);
    const on = renderPage(fotoHtml, fotoPage(true), { readPublic, foto: true });
    expect(on).toContain('<script type="module" src="/src/foto/main.tsx"></script>');
    expect(on).not.toContain('data-foto-review');
    // the landing's card and the licence's wording follow the flag
    const landing = readFileSync(join(root, 'index.html'), 'utf8');
    expect(renderPage(landing, page('main'), { readPublic, foto: true })).toContain('href="/studio/foto/"');
    const licence = readFileSync(join(root, 'licencia/index.html'), 'utf8');
    expect(renderPage(licence, page('licencia'), { readPublic, foto: false })).toContain('en revisión y todavía no está disponible');
    expect(renderPage(licence, page('licencia'), { readPublic, foto: true })).not.toContain('en revisión');
  });
});

describe('the landing\'s «Azar» contact sheet', () => {
  it('shows one real draw per style, each with its pre-rendered image', () => {
    expect(new Set(CONTACTS.map(c => c.arch))).toEqual(new Set(ARCHETYPES.map(a => a.id)));
    expect(new Set(CONTACTS.map(c => c.seed)).size).toBe(CONTACTS.length);
    for (const c of CONTACTS) {
      expect(c.name, c.arch).toBe(ARCHETYPES.find(a => a.id === c.arch)!.name);
      expect(existsSync(join(root, 'public', contactSrc(c.seed))), c.seed).toBe(true);
    }
    // the dice's strip starts with contacts too (their images, their seeds)
    const landing = readFileSync(join(root, 'index.html'), 'utf8');
    const strip = [...landing.matchAll(/<li data-seed="([^"]+)"><span class="shot"[^>]*><img src="([^"]+)"/g)];
    expect(strip).toHaveLength(3);
    for (const [, seed, src] of strip) {
      expect(CONTACTS.some(c => c.seed === seed), seed).toBe(true);
      expect(src).toBe(contactSrc(seed));
    }
    const html = contactSheet();
    expect(html.match(/<li data-contact=/g)).toHaveLength(CONTACTS.length);
    expect(renderPage('<!-- @contacts -->', page('main'), { readPublic: () => '' })).toBe(html);
  });
});

describe('the landing\'s exported files (@salida)', () => {
  const readPublic = (p: string) => readFileSync(join(root, 'public', p), 'utf8');
  const manifest = JSON.parse(readPublic('ex/salidas/manifest.json')) as { bytes: Record<string, number>; link: string; frames: number };

  it('quotes the real size of every file it links', () => {
    const files: Record<string, string> = {
      png: 'glyphos-saturno.png', svg: 'glyphos-saturno.svg', webm: 'glyphos-saturno.webm', mp4: 'glyphos-saturno.mp4',
      mjs: 'glyphos-saturno.mjs', 'glyphos.json': 'glyphos-saturno.glyphos.json', wc: 'web/glyphos-field.js',
    };
    for (const [key, file] of Object.entries(files)) {
      const size = statSync(join(root, 'public/ex/salidas', file)).size;
      expect(manifest.bytes[key], file).toBe(size);
      expect(salida(key, readPublic)).toBe(fmtBytes(size));
    }
    expect(fmtBytes(538 * 1024)).toBe('538 KB');
    expect(fmtBytes(1.25 * 1024 * 1024)).toMatch(/^1,[23] MB$/);
  });

  it('links a real recipe and shows the exported code as it is, with the recipe cut short', () => {
    expect(manifest.link).toMatch(/^\/studio\/#r=z[\w-]+$/);
    expect(salida('link', readPublic)).toBe(manifest.link);
    expect(Number(salida('linklen', readPublic))).toBe(manifest.link.length - '/studio/#r='.length);
    const usage = shortUsage('<x recipe=\'{"v":2,"source":"pattern","layers":[{"on":true,"pattern":"planeta","blend":"normal","mix":1}]}\'>');
    expect(usage).toMatch(/recipe='\{"v":2.*…\}'>$/);
    expect(salida('usage', readPublic)).toContain('&lt;script src=&quot;glyphos-field.js&quot; defer&gt;');
    expect(salida('frames', readPublic)).toBe(String(manifest.frames));
    expect(() => salida('nada', readPublic)).toThrow();
  });

  it('every @salida directive of the landing renders', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const out = renderPage(html, page('main'), { readPublic });
    expect(out).not.toMatch(/<!--\s*@/);
    expect(out).not.toContain('{{');
  });
});
