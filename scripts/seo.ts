/**
 * Build-time HTML for the public site, generated from src/shared/site.ts: head tags, JSON-LD,
 * sitemap, robots.txt and the shared header, footer and guide cards. Pure functions (unit tested);
 * scripts/seo-plugin.ts wires them into Vite.
 *
 * HTML sources use comment directives that are replaced at build (and in dev):
 *   <!-- @head -->              title, description, canonical, Open Graph, Twitter, JSON-LD
 *   <!-- @header -->            top bar of the guide pages
 *   <!-- @footer -->            footer with the guides, links and the Morphiq credit (`@footer paper` on light pages)
 *   <!-- @guides -->            cards for the five guides and their examples (`@guides others` leaves out the current one)
 *   <!-- @guide-links -->       plain list of links to the guides
 *   <!-- @mark -->              the GLYPHOS symbol (inline SVG)
 *   <!-- @word -->              the GLYPHOS wordmark (inline SVG, in the text colour)
 *   <!-- @include:ex/x.txt -->  HTML-escaped contents of public/ex/x.txt
 *   <!-- @contacts -->          the landing's «Azar» contact sheet (src/landing/contacts.ts)
 *   <!-- @salida:key -->        a fact about the landing's exported files, read from public/ex/salidas/manifest.json
 *                               (sizes, duration, link…), so the page never quotes a stale number
 *
 * and two blocks that depend on whether the photo and video studio is public (FOTO_STUDIO, src/shared/site.ts):
 *   <!-- @foto-on -->…<!-- @foto-end -->    kept only when it is public (links to it, its app script)
 *   <!-- @foto-off -->…<!-- @foto-end -->   kept only while it is paused (the «en revisión» wording)
 * They are resolved before anything else (a dropped block's scripts never reach the bundle) and do not nest.
 */
import { logoMark, wordmark } from '../src/shared/brand.ts';
import { CONTACTS, CONTACT_PX, contactSrc } from '../src/landing/contacts.ts';
import { GUIDE_MEDIA, GUIDE_MEDIA_PX, guideLoop, guidePoster } from '../src/landing/guias-data.ts';
import {
  FOTO_STUDIO, GUIDES, MORPHIQ, PAGES, REPO_URL, SITE_LOCALE, SITE_NAME, SITE_URL, absUrl, type SitePage,
} from '../src/shared/site.ts';

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** JSON that is safe inside <script type="application/ld+json"> (no "</script>" can appear). */
export const jsonForScript = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');

/** Search Console tokens are short base64url-like strings; anything else is ignored (never injected). */
export function cleanVerification(token: string | undefined): string | null {
  const t = (token ?? '').trim();
  return /^[A-Za-z0-9_-]{10,100}$/.test(t) ? t : null;
}

/* ---------------------------------------------------------------- head */

export function headTags(p: SitePage, o: { verification?: string | null } = {}): string {
  const url = absUrl(p.path);
  const img = absUrl(p.image.path);
  const e = escapeHtml;
  const tags = [
    `<title>${e(p.title)}</title>`,
    `<meta name="description" content="${e(p.description)}">`,
  ];
  // the 404 and a paused page (kept so old links do not break) stay out of the index, with no canonical or share tags;
  // the viewer of shared pieces stays out of search results too, but keeps its canonical and share tags
  const indexed = p.kind !== 'error' && p.kind !== 'paused';
  if (!indexed || p.kind === 'viewer') tags.push('<meta name="robots" content="noindex">');
  if (indexed) tags.push(`<link rel="canonical" href="${url}">`);
  tags.push(
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    '<meta name="theme-color" content="#0c0b0a">',
  );
  if (indexed) {
    tags.push(
      `<meta property="og:type" content="website">`,
      `<meta property="og:site_name" content="${SITE_NAME}">`,
      `<meta property="og:locale" content="${SITE_LOCALE}">`,
      `<meta property="og:url" content="${url}">`,
      `<meta property="og:title" content="${e(p.title)}">`,
      `<meta property="og:description" content="${e(p.description)}">`,
      `<meta property="og:image" content="${img}">`,
      `<meta property="og:image:width" content="${p.image.width}">`,
      `<meta property="og:image:height" content="${p.image.height}">`,
      `<meta property="og:image:alt" content="${e(p.image.alt)}">`,
      '<meta name="twitter:card" content="summary_large_image">',
      `<meta name="twitter:title" content="${e(p.title)}">`,
      `<meta name="twitter:description" content="${e(p.description)}">`,
      `<meta name="twitter:image" content="${img}">`,
      `<meta name="twitter:image:alt" content="${e(p.image.alt)}">`,
    );
  }
  if (o.verification) tags.push(`<meta name="google-site-verification" content="${e(o.verification)}">`);
  const ld = jsonLd(p);
  if (ld) tags.push(`<script type="application/ld+json">${jsonForScript(ld)}</script>`);
  return tags.join('\n');
}

/* ---------------------------------------------------------------- JSON-LD */

const ID = {
  website: `${SITE_URL}/#website`,
  org: `${SITE_URL}/#morphiq`,
  app: `${SITE_URL}/studio/#app`,
};
const page = (id: string) => PAGES.find(p => p.id === id)!;

function organization() {
  return {
    '@type': 'Organization', '@id': ID.org, name: MORPHIQ.name, alternateName: MORPHIQ.alternateName, url: MORPHIQ.url,
    logo: { '@type': 'ImageObject', url: absUrl(MORPHIQ.logo.path), width: MORPHIQ.logo.width, height: MORPHIQ.logo.height },
  };
}

function website() {
  return {
    '@type': 'WebSite', '@id': ID.website, name: SITE_NAME, alternateName: ['Monotrama', 'ASCII Shader Lab'], url: `${SITE_URL}/`,
    inLanguage: 'es', description: page('main').description, creator: { '@id': ID.org }, publisher: { '@id': ID.org },
  };
}

/** The lab (/studio/) by default; the photo and video studio (/studio/foto/) describes itself. */
function webApplication(studio: SitePage = page('studio')) {
  const foto = studio.id === 'foto';
  return {
    '@type': 'WebApplication', '@id': foto ? `${SITE_URL}/studio/foto/#app` : ID.app, name: foto ? 'Estudio de foto y video GLYPHOS' : 'Estudio GLYPHOS',
    url: absUrl(studio.path), description: studio.description,
    applicationCategory: 'DesignApplication', operatingSystem: 'Web',
    browserRequirements: 'Requiere JavaScript; WebGL 2 para el motor completo',
    isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'MXN' },
    inLanguage: 'es', license: absUrl('/licencia/'), image: absUrl(studio.image.path),
    isPartOf: { '@id': ID.website }, creator: { '@id': ID.org }, publisher: { '@id': ID.org },
  };
}

function webPage(p: SitePage) {
  const url = absUrl(p.path);
  return [
    {
      '@type': 'WebPage', '@id': `${url}#webpage`, url, name: p.title, description: p.description, inLanguage: 'es',
      isPartOf: { '@id': ID.website }, publisher: { '@id': ID.org }, breadcrumb: { '@id': `${url}#breadcrumb` },
      primaryImageOfPage: { '@type': 'ImageObject', url: absUrl(p.image.path), width: p.image.width, height: p.image.height },
    },
    {
      '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: p.crumb, item: url },
      ],
    },
  ];
}

/** Structured data per page kind. Describes what is on the page; it does not ask for any rich result (none for the 404 or a paused page). */
export function jsonLd(p: SitePage): object | null {
  const graph = (nodes: object[]) => ({ '@context': 'https://schema.org', '@graph': nodes });
  switch (p.kind) {
    case 'home': return graph([website(), organization(), webApplication()]);
    case 'app': return graph([webApplication(p), website(), organization()]);
    case 'guide':
    case 'doc': return graph([...webPage(p), website(), organization()]);
    default: return null;
  }
}

/* ---------------------------------------------------------------- sitemap & robots */

export function sitemapXml(date: string, pages: SitePage[] = PAGES): string {
  const urls = pages.filter(p => p.sitemap).map(p => `  <url><loc>${absUrl(p.path)}</loc><lastmod>${date}</lastmod></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export function robotsTxt(): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}

/* ---------------------------------------------------------------- shared markup */

const mark = (size: number) => logoMark(size);
/** The wordmark next to the symbol: as tall as the letters of the official lockup. */
const word = (height: number) => wordmark(height, { className: 'word' });

export function siteHeader(p: SitePage): string {
  const links = GUIDES.map(g => `<a href="${g.path}"${g.path === p.path ? ' aria-current="page"' : ''}>${g.short}</a>`).join('\n    ');
  return `<a class="skip" href="#contenido">Saltar al contenido</a>
<header class="nav solid" id="top">
  <a class="nav-brand" href="/" aria-label="GLYPHOS, inicio"><span class="logo">${mark(24)}</span>${word(17)}</a>
  <nav class="nav-links" aria-label="Guías">
    ${links}
  </nav>
  <a class="btn-cta small" href="/studio/">Abrir el estudio <span aria-hidden="true">→</span></a>
</header>`;
}

export function morphiqCredit(): string {
  const { display: d } = MORPHIQ;
  const set = (ext: string) => d.files.map((w, i) => `/brand/morphiq/morphiq-logo-${w}.${ext} ${i + 1}x`).join(', ');
  return `<p class="foot-credit"><span class="foot-credit-by">Desarrollado por</span>
    <a class="morphiq" href="${MORPHIQ.url}"><picture><source type="image/webp" srcset="${set('webp')}"><img src="/brand/morphiq/morphiq-logo-${d.files[0]}.png" srcset="${set('png')}" width="${d.width}" height="${d.height}" alt="${escapeHtml(MORPHIQ.alt)}" loading="lazy" decoding="async"></picture></a></p>`;
}

export function siteFooter(tone: 'ink' | 'paper' = 'ink'): string {
  const guides = GUIDES.map(g => `<li><a href="${g.path}">${g.name}</a></li>`).join('');
  return `<footer class="foot${tone === 'paper' ? ' paper' : ''}">
  <div class="foot-grid">
    <div class="foot-about">
      <a class="foot-brand" href="/" aria-label="GLYPHOS, inicio"><span class="logo">${mark(24)}</span>${word(17)}</a>
      <p>Teje luz con caracteres. Un estudio de arte ASCII en tiempo real, gratis y en tu navegador: lo que haces es tuyo.</p>
    </div>
    <nav class="foot-col" aria-labelledby="foot-guias"><p class="foot-h" id="foot-guias">Qué puedes hacer</p><ul>${guides}</ul></nav>
    <nav class="foot-col" aria-labelledby="foot-mt"><p class="foot-h" id="foot-mt">GLYPHOS</p><ul><li><a href="/studio/">Estudio</a></li><li><a href="/licencia/">Licencia y uso</a></li><li><a href="${REPO_URL}">Código fuente</a></li></ul></nav>
  </div>
  <div class="foot-base">
    <p class="foot-small">GLYPHOS nace del ASCII Shader Lab · motor WebGL2 propio · tipografías con licencia OFL · <a href="#top">Volver arriba ↑</a></p>
    ${morphiqCredit()}
  </div>
</footer>`;
}

/**
 * The guides as an editorial index: a large row per guide and its example (src/landing/guias-data.ts), a
 * picture that turns into a short loop on hover, on keyboard focus and on a first tap (src/landing/guias.ts;
 * a second tap, or Enter, opens the guide).
 */
export function guideCards(exceptPath?: string): string {
  const { width, height } = GUIDE_MEDIA_PX;
  const items = GUIDES.filter(g => g.path !== exceptPath).map(g => `<li><a class="guide-card" href="${g.path}" data-loop="${guideLoop(g.id)}">
      <span class="gc-txt"><b>${g.name}</b><span>${g.blurb}</span></span><span class="gc-go" aria-hidden="true">→</span>
      <span class="gc-media"><img src="${guidePoster(g.id)}" width="${width}" height="${height}" alt="${escapeHtml(GUIDE_MEDIA[g.id].alt)}" loading="lazy" decoding="async"></span></a></li>`);
  return `<ul class="guides" role="list">\n    ${items.join('\n    ')}\n  </ul>`;
}

/** The «Azar» contact sheet: figures in the HTML; the landing turns each into a button that weaves it live. */
export function contactSheet(): string {
  return CONTACTS.map((c, i) => `<li data-contact="${escapeHtml(c.seed)}"><figure><img src="${contactSrc(c.seed)}" width="${CONTACT_PX.width}" height="${CONTACT_PX.height}" alt="Tirada del estilo ${escapeHtml(c.name)}" loading="lazy" decoding="async"><figcaption><span class="cn"><span>${String(i + 1).padStart(2, '0')}</span><i>${escapeHtml(c.name)}</i></span><span class="cs">${escapeHtml(c.seed)}</span></figcaption></figure></li>`).join('\n          ');
}

/* ---------------------------------------------------------------- the landing's exported files */

export interface SalidaManifest {
  piece: string; loopSeconds: number; frames: number; svgSize: { w: number; h: number };
  link: string; usage: string; bytes: Record<string, number>;
}
const es1 = (n: number) => n.toLocaleString('es', { maximumFractionDigits: 1 });
/** «538 KB», «1,2 MB» (1024-based, Spanish decimals, like the studio). */
export const fmtBytes = (n: number) => (n >= 1024 * 1024 ? es1(n / 1048576) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
export const SALIDA_FILES = 'ex/salidas/';

/** The usage snippet with the recipe cut short (the page says so): the rest is the exported code as is. */
export function shortUsage(usage: string): string {
  return usage.replace(/recipe='(\{.{0,64})[^']*'/, (_m, head: string) => `recipe='${head}…}'`);
}

export function salida(key: string, readPublic: (path: string) => string): string {
  const m = JSON.parse(readPublic(SALIDA_FILES + 'manifest.json')) as SalidaManifest;
  if (key in m.bytes) {
    if (!m.bytes[key]) throw new Error(`[mt-seo] falta el archivo exportado «${key}» (node scripts/posters.mjs --portada)`);
    return fmtBytes(m.bytes[key]);
  }
  switch (key) {
    case 'svgsize': return `${m.svgSize.w} × ${m.svgSize.h} px`;
    case 'secs': return es1(m.loopSeconds);
    case 'frames': return String(m.frames);
    case 'link': return escapeHtml(m.link);
    case 'linklen': return String(m.link.length - '/studio/#r='.length);
    case 'usage': return escapeHtml(shortUsage(m.usage));
    case 'json': {
      const lines = readPublic(SALIDA_FILES + 'glyphos-saturno.glyphos.json').split('\n');
      return escapeHtml(lines.slice(0, 18).join('\n') + (lines.length > 18 ? '\n      …' : ''));
    }
    default: throw new Error(`[mt-seo] @salida:${key} no existe`);
  }
}

export function guideLinks(): string {
  return `<ul>${GUIDES.map(g => `<li><a href="${g.path}">${g.name}</a></li>`).join('')}</ul>`;
}

/* ---------------------------------------------------------------- directives */

const DIRECTIVE = /<!--\s*@([a-z-]+)(?::([\w./-]+))?(?:\s+(\w+))?\s*-->/g;
const FOTO_BLOCK = /<!--\s*@foto-(on|off)\s*-->([\s\S]*?)<!--\s*@foto-end\s*-->/g;

/** Keeps the @foto-on blocks when the photo studio is public (`foto`), the @foto-off ones while it is paused. */
export function fotoBlocks(html: string, foto: boolean): string {
  return html.replace(FOTO_BLOCK, (_m, when: string, body: string) => {
    if (/<!--\s*@foto-(on|off)\s*-->/.test(body)) throw new Error('[mt-seo] los bloques @foto-on/@foto-off no se anidan');
    return (when === 'on') === foto ? body : '';
  });
}

/**
 * Expands the directives of one page. `readPublic` returns a file from public/ (for @include); `foto` says whether
 * the photo studio is public (FOTO_STUDIO by default).
 */
export function renderPage(html: string, p: SitePage, o: { verification?: string | null; readPublic: (path: string) => string; foto?: boolean }): string {
  return fotoBlocks(html, o.foto ?? FOTO_STUDIO).replace(DIRECTIVE, (_m, name: string, arg: string | undefined, opt: string | undefined) => {
    switch (name) {
      case 'head': return headTags(p, o);
      case 'header': return siteHeader(p);
      case 'footer': return siteFooter(opt === 'paper' ? 'paper' : 'ink');
      case 'guides': return guideCards(opt === 'others' ? p.path : undefined);
      case 'guide-links': return guideLinks();
      case 'mark': return mark(24);
      case 'word': return word(17);
      case 'contacts': return contactSheet();
      case 'salida': {
        if (!arg) throw new Error('[mt-seo] @salida necesita una clave');
        return salida(arg, o.readPublic);
      }
      case 'include': {
        if (!arg || !/^ex\/[\w.-]+\.txt$/.test(arg)) throw new Error(`[mt-seo] @include only reads public/ex/*.txt (got "${arg}")`);
        // Meant for <pre>: keep every row (drop only the file's final newline) and protect a leading blank
        // row from the parser, which ignores one newline right after <pre>.
        const text = o.readPublic(arg).replace(/\r\n/g, '\n').replace(/\n$/, '');
        return (text.startsWith('\n') ? '\n' : '') + escapeHtml(text);
      }
      default: throw new Error(`[mt-seo] unknown directive @${name} in ${p.file}`);
    }
  });
}
