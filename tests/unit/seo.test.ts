import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from '../../src/random/archetypes';
import { GUIDES, MORPHIQ, PAGES, SITE_URL } from '../../src/shared/site';
import { cleanVerification, contactSheet, fmtBytes, headTags, jsonForScript, jsonLd, renderPage, robotsTxt, salida, shortUsage, sitemapXml } from '../../scripts/seo';
import { PATTERNS } from '../../src/engine/catalog';
import { CONTACTS, contactSrc } from '../../src/landing/contacts';
import { PRESETS } from '../../src/studio/presets';

const root = join(import.meta.dirname, '../..');
const page = (id: string) => PAGES.find(p => p.id === id)!;
const graphOf = (id: string) => (JSON.parse(jsonForScript(jsonLd(page(id)))) as { '@graph': Array<Record<string, unknown>> })['@graph'];

describe('site pages', () => {
  it('every page has an HTML source with the head directive, and an honest-length title and description', () => {
    for (const p of PAGES) {
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
    const word: Record<number, string> = { 5: 'Cinco', 6: 'Seis', 7: 'Siete', 8: 'Ocho', 9: 'Nueve', 10: 'Diez' };
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
  it('lists absolute canonical URLs with a trailing slash, landing first', () => {
    const xml = sitemapXml('2026-09-27');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    expect(locs).toEqual(['/', '/studio/', '/imagen-a-ascii/', '/video-a-ascii/', '/fondos-ascii/', '/texto-animado-ascii/', '/arte-ascii-terminal/', '/licencia/'].map(p => SITE_URL + p));
    expect(xml.match(/<lastmod>2026-09-27<\/lastmod>/g)).toHaveLength(8);
    expect(xml).not.toContain('404');
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
    expect(site).toMatchObject({ name: 'Monotrama', alternateName: 'ASCII Shader Lab', url: SITE_URL + '/', inLanguage: 'es', creator: { '@id': org['@id'] }, publisher: { '@id': org['@id'] } });
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

  it('includes text files escaped and keeps a leading blank row inside <pre>', () => {
    expect(renderPage('<pre><!-- @include:ex/x.txt --></pre>', page('terminal'), opts)).toBe('<pre>\n\n  &lt;a&gt; &amp; b</pre>');
    expect(() => renderPage('<!-- @include:../secret.txt -->', page('terminal'), opts)).toThrow();
  });

  it('rejects unknown directives instead of shipping them', () => {
    expect(() => renderPage('<!-- @hed -->', page('main'), opts)).toThrow(/@hed/);
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
      png: 'monotrama-saturno.png', svg: 'monotrama-saturno.svg', webm: 'monotrama-saturno.webm', mp4: 'monotrama-saturno.mp4',
      mjs: 'monotrama-saturno.mjs', 'monotrama.json': 'monotrama-saturno.monotrama.json', wc: 'web/monotrama-field.js',
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
    expect(salida('usage', readPublic)).toContain('&lt;script src=&quot;monotrama-field.js&quot; defer&gt;');
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
