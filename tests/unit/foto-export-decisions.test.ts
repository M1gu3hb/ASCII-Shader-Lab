import { describe, expect, it } from 'vitest';
import { firstSentence, formatsFor, usableFormat, type Facts } from '../../src/foto/export/formats';
import { applyDestination, defaultPlan, frameCount, fpsOptions } from '../../src/foto/export/plan';
import { memoryNote, paperPixels, placement, printText, resolveSize, sizeText } from '../../src/foto/export/sizes';
import { fontFaces, fontNote, nameList, svgDecision, withFonts, type SvgLayerInfo } from '../../src/foto/export/svg';
import type { FormatInfo } from '../../src/video/index';

const L = (o: Partial<SvgLayerInfo> & Pick<SvgLayerInfo, 'kind'>): SvgLayerInfo => ({ name: o.kind, finishes: [], mask: false, blend: 'normal', ...o });

describe('SVG only when faithful', () => {
  it('characters, texts and shapes are vector', () => {
    const d = svgDecision([L({ kind: 'glyphs', blocks: true }), L({ kind: 'text' }), L({ kind: 'shape', blend: 'multiply' })]);
    expect(d.vector).toBe(true);
    expect(d.reasons).toEqual([]);
    expect(d.notes.join(' ')).toMatch(/fuentes de quien abre/);
    expect(d.notes.join(' ')).toMatch(/Bloques y braille/);
    expect(d.notes.join(' ')).toMatch(/mix-blend-mode/);
  });

  it('photos, shader ASCII, pixel finishes, masks, «Sumar», moving characters and pixel clips are not, each said', () => {
    const d = svgDecision([
      L({ kind: 'photo', name: 'Foto' }), L({ kind: 'ascii', name: 'Fósforo' }), L({ kind: 'glyphs', name: 'Letras', finishes: ['grano'] }),
      L({ kind: 'shape', name: 'Marco', mask: true }), L({ kind: 'text', name: 'Título', blend: 'add' }), L({ kind: 'glyphs', name: 'Vuela', cellMoves: true }),
      L({ kind: 'text', name: 'Estira', pixelClips: true }),
    ]);
    expect(d.vector).toBe(false);
    expect(d.reasons).toHaveLength(7);
    expect(d.summary).toBe('Aquí no sería fiel: la composición tiene una foto, ASCII de shader, acabados de píxel, máscaras, fusión «Sumar», caracteres en movimiento en este instante y animaciones de píxeles.');
    expect(d.reasons[1]).toMatch(/«Fósforo» es ASCII de shader/);
    expect(d.reasons[2]).toBe('Acabados de píxel en «Letras» (grano).');
  });

  it('names are listed briefly', () => {
    expect(nameList(['a'])).toBe('«a»');
    expect(nameList(['a', 'b', 'c'])).toBe('«a», «b» y «c»');
    expect(nameList(['a', 'b', 'c', 'd', 'e'])).toBe('«a», «b», «c» y 2 más');
  });
});

const vector = svgDecision([L({ kind: 'glyphs' })]);
const pixels = svgDecision([L({ kind: 'photo', name: 'Foto' })]);
const facts = (o: Partial<Facts> = {}): Facts => ({
  moving: false, duration: 0, transparent: false, stills: { jpeg: true, webp: true }, movies: [], glyphs: [], shaderAscii: 0, soloGlyph: null, svg: pixels, ...o,
});
const info = (format: FormatInfo['format'], o: Partial<FormatInfo> = {}): FormatInfo => ({
  format, label: format.toUpperCase(), limits: `${format.toUpperCase()}: una línea de límites bastante larga. Y más detalle después.`, available: true, alpha: false, audio: false, ...o,
});

describe('formats: what is possible here, why not, and what instead', () => {
  it('still pictures: WebP or JPEG this browser does not encode are said, with PNG instead', () => {
    const list = formatsFor('resultado', facts({ stills: { jpeg: true, webp: false } }));
    const webp = list.find(f => f.id === 'webp')!;
    expect(webp.available).toBe(false);
    expect(webp.why).toMatch(/no codifica WebP/);
    expect(webp.alt).toBe('png');
    expect(usableFormat(list, 'webp')).toBe('png');
    expect(list.find(f => f.id === 'jpeg')!.available).toBe(true);
  });

  it('SVG: vector when faithful; otherwise why, and an SVG with an image labelled as such', () => {
    const v = formatsFor('resultado', facts({ svg: vector }));
    expect(v.find(f => f.id === 'svg')!.available).toBe(true);
    expect(v.some(f => f.id === 'svg-img')).toBe(false);
    const p = formatsFor('resultado', facts());
    const svg = p.find(f => f.id === 'svg')!;
    expect(svg.available).toBe(false);
    expect(svg.why).toBe(pixels.summary);
    expect(svg.alt).toBe('svg-img');
    const img = p.find(f => f.id === 'svg-img')!;
    expect(img.label).toMatch(/no es vector/);
    expect(img.more).toMatch(/Por qué no es vector: «Foto» es una foto/);
  });

  it('a still project: moving formats say why and offer a picture', () => {
    const list = formatsFor('resultado', facts({ movies: [info('mp4')] }));
    const mp4 = list.find(f => f.id === 'mp4')!;
    expect(mp4.available).toBe(false);
    expect(mp4.why).toMatch(/no se mueve/);
    expect(mp4.alt).toBe('png');
  });

  it('a moving project: while probing, without movie export in this version, and with lane video\'s answers', () => {
    expect(formatsFor('resultado', facts({ moving: true, movies: null })).find(f => f.id === 'gif')!.why).toMatch(/Revisando/);
    expect(formatsFor('resultado', facts({ moving: true, movies: [] })).find(f => f.id === 'webm')!.why).toMatch(/todavía no exporta video/);
    const list = formatsFor('resultado', facts({
      moving: true, transparent: true,
      movies: [info('mp4', { available: false, why: 'Este navegador no codifica H.264, AV1 ni VP9.' }), info('webm', { alpha: false }), info('gif', { alpha: true }), info('png-zip', { alpha: true })],
    }));
    const mp4 = list.find(f => f.id === 'mp4')!;
    expect(mp4.available).toBe(false);
    expect(mp4.why).toMatch(/H\.264/);
    expect(mp4.alt).toBe('webm');
    const webm = list.find(f => f.id === 'webm')!;
    expect(webm.limit).toBe('WEBM: una línea de límites bastante larga.');
    // asked for transparency, and this WebM cannot carry it: said, with the PNG sequence as the way
    expect(webm.more).toMatch(/secuencia PNG/);
    expect(list.find(f => f.id === 'png-zip')!.alpha).toBe(true);
  });

  it('text only from real characters; animated text only when the layer moves', () => {
    const none = formatsFor('texto', facts({ shaderAscii: 2 }));
    expect(none.every(f => !f.available)).toBe(true);
    expect(none[0].why).toMatch(/render de shader \(una imagen, no texto\)/);
    const still = formatsFor('texto', facts({ glyphs: [{ id: 'g', name: 'Letras', moves: false, visible: true }] }), { layer: 'g' });
    expect(still.find(f => f.id === 'txt')!.available).toBe(true);
    const cast = still.find(f => f.id === 'cast')!;
    expect(cast.available).toBe(false);
    expect(cast.alt).toBe('txt');
    const moving = formatsFor('texto', facts({ moving: true, glyphs: [{ id: 'g', name: 'Letras', moves: true, visible: true }] }), { layer: 'g' });
    expect(moving.filter(f => f.moving).every(f => f.available)).toBe(true);
  });

  it('parts', () => {
    expect(formatsFor('mascara', facts(), { hasMask: false }).every(f => !f.available)).toBe(true);
    expect(formatsFor('mascara', facts(), { hasMask: true }).map(f => f.id)).toEqual(['mask-grey', 'mask-alpha']);
    expect(formatsFor('recorte', facts()).map(f => f.id)).toEqual(['cutout-png', 'matte']);
    expect(formatsFor('proyecto', facts())[0].ext).toBe('zip');
  });

  it('firstSentence keeps short texts whole', () => {
    expect(firstSentence('Corto. Otro.')).toEqual({ line: 'Corto. Otro.', rest: '' });
    expect(firstSentence('Una frase larga que explica algo: y sigue. Detalle.')).toEqual({ line: 'Una frase larga que explica algo: y sigue.', rest: 'Detalle.' });
    // lane video's MP4 line: a long first sentence is cut at its first clause
    const av1 = 'Este navegador no codifica H.264, así que va en AV1: lo reproducen Chrome, Edge y Firefox recientes y los equipos Apple con chip M3 o A17 Pro en adelante; muchas redes y editores aún no lo aceptan. Para H.264, exporta desde Safari.';
    expect(firstSentence(av1).line).toBe('Este navegador no codifica H.264, así que va en AV1: lo reproducen Chrome, Edge y Firefox recientes y los equipos Apple con chip M3 o A17 Pro en adelante.');
  });
});

describe('destinations', () => {
  const P = { canvas: { transparent: false }, time: { duration: 3, fps: 30, loop: true } };
  const base = defaultPlan(P, 1);
  const moving = facts({ moving: true, movies: [info('mp4'), info('webm'), info('gif'), info('png-zip')], glyphs: [{ id: 'g', name: 'Letras', moves: true, visible: true }] });

  it('terminal: real characters (a recording when they move, ANSI when not)', () => {
    expect(applyDestination(base, 'terminal', moving)).toMatchObject({ what: 'texto', target: 'g', format: 'cast' });
    expect(applyDestination(base, 'terminal', facts({ glyphs: [{ id: 'g', name: 'L', moves: false, visible: true }] }))).toMatchObject({ what: 'texto', format: 'ansi' });
  });

  it('vertical, print, README and slides pick their sizes and formats', () => {
    expect(applyDestination(base, 'vertical', moving)).toMatchObject({ what: 'resultado', size: 'historia', fit: 'cover', format: 'mp4' });
    expect(applyDestination(base, 'vertical', facts())).toMatchObject({ size: 'historia', format: 'png' });
    expect(applyDestination(base, 'cartel', moving)).toMatchObject({ size: 'a4', dpi: 300, format: 'png', fit: 'contain' });
    expect(applyDestination(base, 'readme', moving)).toMatchObject({ format: 'readme', readmeText: 'g' });
    expect(applyDestination(base, 'presentacion', facts())).toMatchObject({ size: 'pantalla', fit: 'contain', format: 'png' });
    // a video keeps its own proportion unless it is 16:9
    expect(applyDestination(base, 'presentacion', { ...moving, aspect: 1.6 })).toMatchObject({ size: 'proyecto', format: 'mp4' });
    expect(applyDestination(base, 'presentacion', { ...moving, aspect: 16 / 9 })).toMatchObject({ size: 'pantalla', format: 'mp4' });
  });

  it('web: the text player when the whole piece is one moving layer of characters; otherwise a light picture or a video', () => {
    expect(applyDestination(base, 'web', { ...moving, soloGlyph: 'g' })).toMatchObject({ what: 'texto', format: 'web' });
    expect(applyDestination(base, 'web', moving)).toMatchObject({ what: 'resultado', format: 'webm' });
    expect(applyDestination(base, 'web', facts({ stills: { jpeg: true, webp: false } }))).toMatchObject({ format: 'png' });
    // a video format this browser cannot write is skipped
    const noVideo = facts({ moving: true, movies: [info('mp4', { available: false }), info('webm', { available: false }), info('gif')] });
    expect(applyDestination(base, 'web', noVideo).format).toBe('gif');
  });

  it('frame counts and rates', () => {
    expect(frameCount(0, 3, 30)).toBe(90);
    expect(frameCount(1, 1, 30)).toBe(1);
    expect(fpsOptions(24)).toEqual([12, 15, 24, 25, 30, 60]);
    expect(fpsOptions(20)).toEqual([12, 15, 20, 24, 25, 30, 60]);
  });
});

describe('sizes', () => {
  const photo = { w: 960, h: 600 }, portrait = { w: 1080, h: 1350 };
  it('paper at 300 ppp, following the piece\'s orientation unless asked', () => {
    expect(paperPixels([210, 297], 300, false)).toEqual({ w: 2480, h: 3508 });
    expect(resolveSize('a4', portrait)).toMatchObject({ w: 2480, h: 3508, dpi: 300 });
    expect(resolveSize('a4', photo)).toMatchObject({ w: 3508, h: 2480 });
    expect(resolveSize('a4', photo, { orient: 'vertical' })).toMatchObject({ w: 2480, h: 3508 });
    expect(resolveSize('a3', portrait)).toMatchObject({ w: 3508, h: 4961 });
    expect(resolveSize('carta', portrait)).toMatchObject({ w: 2550, h: 3300 });
    expect(resolveSize('tabloide', portrait)).toMatchObject({ w: 3300, h: 5100 });
    expect(resolveSize('a4', portrait, { dpi: 150 })).toMatchObject({ w: 1240, h: 1754 });
    expect(printText(2480, 3508, 300)).toBe('21,0 × 29,7 cm a 300 ppp');
  });

  it('multiples and fixed sizes, and whether the proportion matches', () => {
    expect(resolveSize('doble', photo)).toMatchObject({ w: 1920, h: 1200, sameAspect: true });
    expect(resolveSize('ig45', portrait).sameAspect).toBe(true);
    expect(resolveSize('historia', portrait).sameAspect).toBe(false);
    expect(resolveSize('nada', photo).preset.id).toBe('proyecto');
  });

  it('placement covers (centred crop) or fits (bands); the preview is the same geometry smaller', () => {
    expect(placement(photo, 1080, 1920, 'cover')).toEqual({ k: 3.2, rw: 3072, rh: 1920, x: -996, y: 0 });
    expect(placement(photo, 1080, 1920, 'contain')).toEqual({ k: 1.125, rw: 1080, rh: 675, x: 0, y: 623 });
    const small = placement(photo, 1080, 1920, 'contain', 0.25);
    expect(small).toEqual({ k: 0.28125, rw: 270, rh: 169, x: 0, y: 156 });
    expect(placement(photo, 960, 600, 'cover')).toEqual({ k: 1, rw: 960, rh: 600, x: 0, y: 0 });
  });

  it('memory: honest about phones and huge prints', () => {
    expect(memoryNote(960, 600, 3).note).toBe('');
    const a3 = memoryNote(3508, 4961, 4, true);
    expect(a3.risky).toBe(true);
    expect(a3.note).toMatch(/iPhone y iPad/);
    expect(memoryNote(9000, 3000, 2, true).note).toMatch(/8192 px/);
    expect(sizeText(2480, 3508)).toBe('2480 × 3508 px · 8,7 MP');
  });
});

describe('fonts inside an SVG', () => {
  it('embeds the studio\'s files for the fonts used, lists the others, and puts the rules after the title', async () => {
    const asked: string[] = [];
    const r = await fontFaces([{ font: 'jetbrains', weight: 500 }, { font: 'jetbrains', weight: 520 }, { font: 'serif', weight: 400 }, { font: 'Comic Sans', weight: 400 }, { font: 'system', weight: 400 }],
      async url => { asked.push(url); return new Uint8Array([1, 2, 3]).buffer; });
    expect(asked).toHaveLength(2);
    expect(r.css).toContain('@font-face{font-family:"JetBrains Mono";src:url(data:font/woff;base64,AQID) format("woff");font-weight:500');
    expect(r.css).toContain('font-family:"Instrument Serif"');
    expect(r.embedded).toEqual(['JetBrains Mono 500', 'Instrument Serif 400']);
    expect(r.missing).toEqual(['Comic Sans', 'Mono del sistema']);
    expect(fontNote(r)).toMatch(/No van dentro/);
    const svg = withFonts('<svg xmlns="http://www.w3.org/2000/svg">\n<title>t</title>\n<g/></svg>', r.css);
    expect(svg.indexOf('<style>')).toBeGreaterThan(svg.indexOf('</title>'));
    expect(withFonts('<svg a="1"><g/></svg>', 'x{}')).toBe('<svg a="1">\n<style>\nx{}\n</style><g/></svg>');
  });
});
