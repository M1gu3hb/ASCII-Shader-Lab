import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import {
  BLEND_NAMES, CHARSETS, COLOR_MAP_NAMES, FAMILY_NAMES, FONTS, INTERACT_NAMES, LETTER_ANIMS, MSG_MODE_NAMES, PATTERNS, XFORMS, fontById, patternById, type PatternFamily,
} from '../../engine/catalog';
import {
  DEFAULT_LAYER, cloneRecipe, defaultRecipe, type BlendMode, type ColorMap, type InteractMode, type LetterAnimKind, type MsgMode, type Recipe, type Xform, type XformKind,
} from '../../engine/recipe';
import { ARCHETYPES } from '../../random/archetypes';
import { renderCrops, type CropSpec, type Signal } from '../guide/thumbs';
import {
  BLEND_DESC, CHARSET_ASCII_LINE, CHARSET_UNICODE_LINE, COLOR_MAP_DESC, FONT_DESC, INTERACT_DESC, INTERACT_ICON, MSG_MODE_DESC, MSG_MODE_ICON, PATTERN_DESC,
} from './copy';
import type { PickOpt } from './Picker';
import { blendValue } from './blend';

/**
 * Options of the studio's pickers with what helps choose: character sets with their ramp in the
 * piece's font, fonts in their own face, colour maps and blends as tiny diagrams, patterns grouped
 * by family with small renders. Renders are lazy (only options in view, or the highlighted one),
 * batched on one offscreen engine, cancelled when the list closes and cached.
 */

/* ------------------------------------------------------------------ */
/* Character sets                                                       */
/* ------------------------------------------------------------------ */

/** Text ramp of a character set: how its glyphs go from empty to full. */
export function ramp(chars: string, n = 12) {
  const a = [...chars];
  if (a.length <= n) return a.join('');
  return Array.from({ length: n }, (_, i) => a[Math.round((i / (n - 1)) * (a.length - 1))]).join('');
}

export function charsetOptions(asciiOnly: boolean): PickOpt<string>[] {
  const list = asciiOnly ? CHARSETS.filter(c => c.ascii) : CHARSETS;
  return [
    ...list.map(c => ({ value: c.id, label: c.name, desc: c.ascii ? CHARSET_ASCII_LINE : CHARSET_UNICODE_LINE, group: c.ascii ? 'ASCII' : 'Unicode' })),
    { value: 'custom', label: 'Personalizado', desc: 'Los que escribes abajo, en «Tus caracteres».', disabled: true, group: 'Tuyos' },
  ];
}

/** A character set's ramp on the piece's colours, in the piece's font (decoration: hidden from assistive tech). */
export function CharsetRamp({ id, chars, recipe, n = 12 }: { id: string; chars?: string; recipe?: Recipe; n?: number }) {
  const c = chars !== undefined ? { chars } : CHARSETS.find(x => x.id === id);
  if (!c) return null;
  const font = fontById(recipe?.glyph.font ?? 'jetbrains');
  const stops = recipe?.color.stops ?? ['#ede6da'];
  return (
    <span className="pk-ramp-box" aria-hidden="true" style={{ background: recipe?.color.bg ?? '#0b0a09' }}>
      <span className="pk-ramp" style={{ fontFamily: font.stack, fontWeight: recipe?.glyph.weight, color: stops[stops.length - 1] }}>{ramp(c.chars, n)}</span>
    </span>
  );
}

/** A character set in the list: its name and ramp on one line, its use under them. */
export function CharsetOption({ o, recipe, chars }: { o: PickOpt<string>; recipe?: Recipe; chars?: string }) {
  return (
    <span className="pk-main pk-cs">
      <span className="pk-cs-top"><span className="pk-name">{o.label}</span>{o.value !== 'custom' && <CharsetRamp id={o.value} chars={chars} recipe={recipe} />}</span>
      {o.desc && <span className="pk-desc">{o.desc}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Dice styles                                                          */
/* ------------------------------------------------------------------ */

/** The dice's styles: «any», then this space's own (with what each does), then the rest. */
export function archetypeOptions(pool: string[]): PickOpt<string>[] {
  return [
    { value: '', label: 'Cualquiera (según el espacio)', desc: 'El dado elige entre los estilos de este espacio.' },
    ...ARCHETYPES.filter(a => pool.includes(a.id)).map(a => ({ value: a.id, label: a.name, desc: a.blurb, group: 'De este espacio' })),
    ...ARCHETYPES.filter(a => !pool.includes(a.id)).map(a => ({ value: a.id, label: a.name, desc: a.blurb, group: 'Otros estilos' })),
  ];
}

/* ------------------------------------------------------------------ */
/* Fonts                                                                */
/* ------------------------------------------------------------------ */

export function fontOptions(display: boolean): PickOpt<string>[] {
  const list = display ? FONTS.filter(f => f.display) : FONTS;
  return list.map(f => ({
    value: f.id, label: f.name, desc: FONT_DESC[f.id] ?? (f.mono ? 'Monoespaciada.' : 'Proporcional.'),
    icon: <span className="pk-font-sample" style={{ fontFamily: f.stack }}>Ag@#</span>,
  }));
}

/* ------------------------------------------------------------------ */
/* Colour maps: where each colour of the palette goes                   */
/* ------------------------------------------------------------------ */

export function colorMapOptions(recipe?: Recipe): PickOpt<ColorMap>[] {
  const stops = recipe?.color.stops.length ? recipe.color.stops : ['#3a3530', '#ede6da'];
  const bg = recipe?.color.bg ?? '#0b0a09';
  const s = stops.join(', ');
  const first = stops[0], last = stops[stops.length - 1], mid = stops[Math.floor(stops.length / 2)];
  const pictures: Record<ColorMap, string> = {
    // brightness: bright blobs take the last colour, dim ones the first, whatever their place
    luma: `radial-gradient(circle at 28% 40%, ${last} 0 18%, transparent 30%), radial-gradient(circle at 72% 62%, ${mid} 0 16%, transparent 28%), radial-gradient(circle at 60% 20%, ${first} 0 12%, transparent 22%), ${bg}`,
    x: `linear-gradient(90deg, ${s})`,
    y: `linear-gradient(180deg, ${s})`,
    radial: `radial-gradient(circle, ${s})`,
    angle: `conic-gradient(${s}, ${first})`,
    noise: `radial-gradient(ellipse at 20% 30%, ${last} 0 20%, transparent 36%), radial-gradient(ellipse at 75% 70%, ${last} 0 14%, transparent 30%), radial-gradient(ellipse at 60% 25%, ${mid} 0 18%, transparent 34%), ${first}`,
  };
  return (Object.keys(COLOR_MAP_NAMES) as ColorMap[]).map(k => ({
    value: k, label: COLOR_MAP_NAMES[k], desc: COLOR_MAP_DESC[k],
    icon: <i className="pk-diagram" style={{ background: pictures[k] }} />,
  }));
}

/* ------------------------------------------------------------------ */
/* Blends: two shapes mixed the way the engine mixes them               */
/* ------------------------------------------------------------------ */

/** A value 0..1 as a tone between the panel's ink and bone. */
const tone = (v: number) => { const c = (k: number, lo: number, hi: number) => Math.round(lo + (hi - lo) * k); return `rgb(${c(v, 27, 237)}, ${c(v, 25, 230)}, ${c(v, 23, 218)})`; };

function BlendDiagram({ mode }: { mode: BlendMode }) {
  const id = useId().replace(/:/g, '');
  // below: a disc at 0.8; this layer: a disc at 0.7, overlapping
  const A = 0.8, B = 0.7;
  return (
    <svg className="pk-diagram" viewBox="0 0 40 26" aria-hidden="true">
      <defs><clipPath id={id + 'a'}><circle cx="15" cy="13" r="9.5" /></clipPath></defs>
      <rect width="40" height="26" fill={tone(blendValue(mode, 0, 0))} />
      <circle cx="15" cy="13" r="9.5" fill={tone(blendValue(mode, A, 0))} />
      <circle cx="25" cy="13" r="9.5" fill={tone(blendValue(mode, 0, B))} />
      <circle cx="25" cy="13" r="9.5" fill={tone(blendValue(mode, A, B))} clipPath={`url(#${id}a)`} />
    </svg>
  );
}

export function blendOptions(): PickOpt<BlendMode>[] {
  return (Object.keys(BLEND_NAMES) as BlendMode[]).map(b => ({ value: b, label: BLEND_NAMES[b], desc: BLEND_DESC[b], icon: <BlendDiagram mode={b} /> }));
}

/* ------------------------------------------------------------------ */
/* Cursor, message                                                      */
/* ------------------------------------------------------------------ */

export function interactOptions(): PickOpt<InteractMode>[] {
  return (Object.keys(INTERACT_NAMES) as InteractMode[]).map(k => ({ value: k, label: INTERACT_NAMES[k], desc: INTERACT_DESC[k], icon: INTERACT_ICON[k] }));
}

export function msgModeOptions(): PickOpt<MsgMode>[] {
  return (Object.keys(MSG_MODE_NAMES) as MsgMode[]).map(k => ({ value: k, label: MSG_MODE_NAMES[k], desc: MSG_MODE_DESC[k], icon: MSG_MODE_ICON[k] }));
}

/* ------------------------------------------------------------------ */
/* Patterns: grouped by family, with small renders                      */
/* ------------------------------------------------------------------ */

export function patternOptions(): PickOpt<string>[] {
  return (Object.keys(FAMILY_NAMES) as PatternFamily[]).flatMap(fam => PATTERNS.filter(p => p.family === fam).map(p => ({
    value: p.id, label: p.name, group: FAMILY_NAMES[fam], desc: PATTERN_DESC[p.id],
  })));
}

/**
 * The recipe a pattern's thumbnail shows: that pattern alone, with the piece's colours, characters
 * and font (so the picture looks like what you will get), without anything that would slow it down.
 */
export function patternThumbRecipe(base: Recipe, pattern: string): Recipe {
  const d = defaultRecipe();
  // a 3D object is drawn smaller, so the thumbnail's centre crop shows all of it
  d.layers = [{ ...DEFAULT_LAYER, pattern, scale: patternById(pattern).family === 'solidos' ? 1.6 : 1 }];
  d.color = { ...base.color, mode: 'ramp', cycle: 0 };
  d.glyph = { ...base.glyph, cell: 14, mode: 'density', edge: 0, dither: 0 };
  d.interact = { ...d.interact, mode: 'none' };
  return d;
}

const THUMB: CropSpec = { w: 128, h: 80, zoom: 0.62 };
const PREVIEW: CropSpec = { w: 320, h: 96, zoom: 0.34 };

/**
 * Asks for small renders in batches: the options that come into view within a short moment share
 * one offscreen engine. `session` is cancelled when the list closes.
 */
let session: Signal = { cancelled: true };
let batch: Array<{ r: Recipe; cb: (url: string | null) => void }> = [];
let flushT = 0;

export function openThumbSession() { session.cancelled = true; session = { cancelled: false }; batch = []; }
export function closeThumbSession() { session.cancelled = true; batch = []; clearTimeout(flushT); }

function requestThumb(r: Recipe, spec: CropSpec, cb: (url: string | null) => void) {
  const sig = session;
  if (sig.cancelled) return;
  batch.push({ r, cb });
  clearTimeout(flushT);
  flushT = window.setTimeout(() => {
    const jobs = batch;
    batch = [];
    if (sig.cancelled || !jobs.length) return;
    renderCrops(jobs.map(j => j.r), spec, (i, url) => { if (!sig.cancelled) jobs[i].cb(url); }, sig);
  }, 90);
}

/** A pattern's picture in the list: rendered once it scrolls into view (and while the list is open). */
export function PatternThumb({ base, pattern }: { base?: Recipe; pattern: string }) {
  const ref = useRef<HTMLElement>(null);
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const key = base ? JSON.stringify([base.color, base.glyph.charset, base.glyph.font, base.glyph.weight, base.glyph.aspect, pattern]) : '';
  useEffect(() => {
    const el = ref.current;
    if (!el || !base) return;
    let alive = true;
    const go = () => requestThumb(patternThumbRecipe(base, pattern), THUMB, u => { if (alive) setUrl(u); });
    if (typeof IntersectionObserver !== 'function') { go(); return () => { alive = false; }; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); go(); } }, { root: el.closest('.pk-list'), rootMargin: '120px 0px' });
    io.observe(el);
    return () => { alive = false; io.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <i ref={ref} className={'pk-thumb' + (url ? '' : ' wait')} style={url ? { backgroundImage: `url(${url})` } : undefined} />;
}

/**
 * The highlighted option applied to the current piece, as a small render above the list (character
 * sets). It waits a moment after the highlight settles, and the previous one is dropped.
 */
export function PiecePreview({ recipe, label }: { recipe: Recipe | null; label: string }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const key = recipe ? JSON.stringify(recipe) : '';
  useEffect(() => {
    if (!recipe) return;
    setUrl(undefined);
    const sig: Signal = { cancelled: false };
    const t = setTimeout(() => renderCrops([recipe], PREVIEW, (_i, u) => { if (!sig.cancelled) setUrl(u); }, sig), 140);
    return () => { sig.cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (url === null) return null;
  return (
    <div className={'pk-preview-img' + (url ? '' : ' wait')} style={url ? { backgroundImage: `url(${url})` } as CSSProperties : undefined}>
      <span>{url ? `Tu pieza con «${label}»` : 'Tejiendo la vista previa…'}</span>
    </div>
  );
}

/** The current piece with another character set (for the preview): a built-in one, or these characters. */
export function withCharset(r: Recipe, id: string, chars?: string): Recipe | null {
  const c = chars ?? CHARSETS.find(x => x.id === id)?.chars;
  if (!c) return null;
  const out = cloneRecipe(r);
  out.glyph.charset = c;
  return out;
}

/* ------------------------------------------------------------------ */
/* Transformations of the source, letters that move                    */
/* ------------------------------------------------------------------ */

/** Where each transformation is listed: what it does to the source. */
const XF_GROUP: Record<XformKind, string> = {
  caleido: 'Mueven la imagen', desplazar: 'Mueven la imagen', ondular: 'Mueven la imagen', bloques: 'Mueven la imagen',
  semitono: 'Tinta y color', bandas: 'Tinta y color', contorno: 'Tinta y color',
  arrastre: 'Error de señal', canales: 'Error de señal',
  estela: 'Con movimiento',
};

/** The transformations as picker options; those already in the stack (but `own`) cannot be chosen twice. */
export function xformOptions(used: XformKind[], own?: XformKind): PickOpt<XformKind>[] {
  const order = ['Mueven la imagen', 'Tinta y color', 'Error de señal', 'Con movimiento'];
  return [...XFORMS].sort((a, b) => order.indexOf(XF_GROUP[a.id]) - order.indexOf(XF_GROUP[b.id])).map(x => ({
    value: x.id, label: x.name, desc: x.desc + (x.id !== own && used.includes(x.id) ? ' (ya está en la lista)' : ''),
    disabled: x.id !== own && used.includes(x.id), group: XF_GROUP[x.id],
  }));
}

/** The piece with this transformation stack (what a transformation's picture shows). */
export function withXforms(base: Recipe, list: Xform[]): Recipe {
  const r = cloneRecipe(base);
  r.media.xform = list.map(x => ({ ...x }));
  r.interact = { ...r.interact, mode: 'none' };
  return r;
}

/** A transformation's picture in the list: the piece with it, rendered once it scrolls into view. */
export function XformThumb({ base, list }: { base?: Recipe; list: Xform[] }) {
  const ref = useRef<HTMLElement>(null);
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const key = base ? JSON.stringify([base.media, base.source, base.color, base.glyph, base.text.content, list]) : '';
  useEffect(() => {
    const el = ref.current;
    if (!el || !base) return;
    let alive = true;
    const go = () => requestThumb(withXforms(base, list), THUMB, u => { if (alive) setUrl(u); });
    if (typeof IntersectionObserver !== 'function') { go(); return () => { alive = false; }; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); go(); } }, { root: el.closest('.pk-list'), rootMargin: '120px 0px' });
    io.observe(el);
    return () => { alive = false; io.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <i ref={ref} className={'pk-thumb' + (url ? '' : ' wait')} style={url ? { backgroundImage: `url(${url})` } : undefined} />;
}

/** Per-letter animations as picker options (with «none» first). */
export function letterAnimOptions(kinds: readonly LetterAnimKind[]): PickOpt<string>[] {
  return [
    { value: '', label: 'Quietas', desc: 'Las letras no se mueven solas.', icon: 'Aa' },
    ...kinds.map(k => ({ value: k, label: LETTER_ANIMS[k].name, desc: LETTER_ANIMS[k].desc, icon: LETTER_ANIMS[k].icon })),
  ];
}
