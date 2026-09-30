import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { headTags, jsonLd, renderPage, sitemapXml } from '../../scripts/seo';
import { PAGES, SITE_URL } from '../../src/shared/site';

const root = join(import.meta.dirname, '../..');
const page = (id: string) => PAGES.find(p => p.id === id)!;
/** Source without comments: a contract must not find its words in an explanation. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('the public viewer page (/ver/)', () => {
  const ver = page('ver');

  it('is a page of the site, never indexed, left out of the sitemap, with its own canonical and share tags', () => {
    expect(ver).toMatchObject({ file: 'ver/index.html', path: '/ver/', kind: 'viewer', sitemap: false });
    const h = headTags(ver);
    expect(h).toContain('<meta name="robots" content="noindex">');
    expect(h).toContain(`<link rel="canonical" href="${SITE_URL}/ver/">`);
    expect(h).toContain(`<meta property="og:url" content="${SITE_URL}/ver/">`);
    // the brand image: crawlers never see the piece (it travels after the «#»), and never an empty result
    expect(h).toContain(`<meta property="og:image" content="${SITE_URL}/og.jpg">`);
    expect(h).toContain(`<meta name="twitter:image" content="${SITE_URL}/og.jpg">`);
    expect(jsonLd(ver)).toBeNull();
    expect(sitemapXml('2026-09-30')).not.toContain('/ver/');
    // the other pages keep theirs: only the 404, the viewer and a paused page (the photo studio while in review) say noindex
    const quiet = PAGES.filter(p => p.kind === 'error' || p.kind === 'viewer' || p.kind === 'paused').map(p => p.id).sort();
    expect(quiet).toContain('ver');
    expect(PAGES.filter(p => headTags(p).includes('noindex')).map(p => p.id).sort()).toEqual(quiet);
  });

  it('runs no inline script (the site\'s CSP allows only its own files) and expands its head', () => {
    const html = readFileSync(join(root, ver.file), 'utf8');
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map(m => m[1]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const attrs of scripts) expect(attrs).toMatch(/\bsrc="\/src\/ver\/main\.ts"/);
    const out = renderPage(html, ver, { readPublic: () => '' });
    expect(out).not.toMatch(/<!--\s*@/);
    expect(out).toContain('<title>Una pieza de arte ASCII · GLYPHOS</title>');
  });
});

describe('the site\'s share image (public/og.jpg)', () => {
  it('says «Haz arte ASCII» and its alt text says the same, on every page that uses it', () => {
    const img = page('main').image;
    expect(img.path).toBe('/og.jpg');
    expect(img.alt).toContain('«Haz arte ASCII»');
    expect(img.alt).not.toMatch(/que se mueve|vercel\.app/);
    for (const p of PAGES.filter(x => x.image.path === '/og.jpg' && x.kind !== 'error' && x.kind !== 'paused')) {
      const h = headTags(p);
      expect(h, p.id).toContain(`<meta property="og:image:alt" content="${img.alt}">`);
      expect(h, p.id).toContain(`<meta name="twitter:image:alt" content="${img.alt}">`);
    }
  });

  it('is drawn with the headline and without the site\'s address (dev/posters.ts, siteOg)', () => {
    const src = code(readFileSync(join(root, 'dev/posters.ts'), 'utf8'));
    const start = src.indexOf('async function siteOg(');
    expect(start).toBeGreaterThan(-1);
    // the function's body: up to the first line that closes a top-level block
    const body = src.slice(start, src.indexOf('\n}\n', start));
    expect(body).toMatch(/const\s+line\s*=\s*'Haz arte ASCII'\s*;/);
    expect(body).toMatch(/fillText\(\s*line\s*,/);
    expect(body).not.toMatch(/que se mueve/);
    expect(body).not.toMatch(/SITE_URL|vercel\.app/);
  });
});
