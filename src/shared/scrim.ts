/**
 * «Zona protegida»: a layer between the moving background and the content on top of it, which darkens
 * (or lightens) and blurs the glyphs so text reads. The same definition draws it in the studio's
 * previews, enters the legibility estimate and goes into exported code (runtime option `scrim`), so
 * what the estimate measured is what the page shows. Pure: no DOM.
 */

/**
 * block: a panel behind each block of text (the preview's content; in exported code, a CSS class for
 * your own blocks); full: the whole background; gradient: strongest where text usually sits (from the
 * left on wide screens, from the bottom on tall ones), fading out.
 */
export type ScrimShape = 'block' | 'full' | 'gradient';
export type ScrimMode = 'off' | 'suave' | 'fuerte' | 'custom';

export interface ScrimSettings {
  mode: ScrimMode;
  /** 0..0.95 */
  opacity: number;
  /** Backdrop blur in CSS px, 0..16. */
  blur: number;
  shape: ScrimShape;
}

/** What is drawn: the settings resolved against the text and the background colours. */
export interface Scrim {
  color: string;
  opacity: number;
  blur: number;
  shape: ScrimShape;
}

export const SCRIM_PRESETS: Record<'suave' | 'fuerte', { opacity: number; blur: number }> = {
  suave: { opacity: 0.5, blur: 2 },
  fuerte: { opacity: 0.78, blur: 6 },
};

export const DEFAULT_SCRIM: ScrimSettings = { mode: 'off', opacity: SCRIM_PRESETS.suave.opacity, blur: SCRIM_PRESETS.suave.blur, shape: 'block' };

const SHAPES: ScrimShape[] = ['block', 'full', 'gradient'];
const clamp = (v: unknown, a: number, b: number, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : fb);

/** Settings read from saved preferences (anything missing or odd falls back to «off»). */
export function normalizeScrim(raw: unknown): ScrimSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const mode = (['off', 'suave', 'fuerte', 'custom'] as const).find(m => m === o.mode) ?? 'off';
  return {
    mode,
    opacity: Math.round(clamp(o.opacity, 0, 0.95, DEFAULT_SCRIM.opacity) * 100) / 100,
    blur: Math.round(clamp(o.blur, 0, 16, DEFAULT_SCRIM.blur) * 10) / 10,
    shape: SHAPES.includes(o.shape as ScrimShape) ? (o.shape as ScrimShape) : 'block',
  };
}

/** Choosing «Suave» or «Fuerte» sets its values; moving a slider makes it «a medida». */
export function withPreset(s: ScrimSettings, mode: ScrimMode): ScrimSettings {
  if (mode === 'suave' || mode === 'fuerte') return { ...s, mode, ...SCRIM_PRESETS[mode] };
  return { ...s, mode };
}

const hex = (h: string): [number, number, number] => {
  let s = String(h || '#000').replace('#', '');
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = (h: string) => { const [r, g, b] = hex(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const toHex = (c: number[]) => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

/**
 * The layer's colour: the background's own hue pushed away from the text (darker under light text,
 * lighter under dark text), so the zone looks like part of the piece rather than a grey box.
 */
export function scrimColor(ink: string, bg: string): string {
  const light = lum(ink) > 0.4;
  const [r, g, b] = hex(bg);
  const to = light ? 0 : 255, k = light ? 0.55 : 0.7;
  return toHex([r + (to - r) * k, g + (to - g) * k, b + (to - b) * k]);
}

/** The layer to draw, or null when there is none. */
export function resolveScrim(s: ScrimSettings, ink: string, bg: string): Scrim | null {
  if (s.mode === 'off' || (s.opacity <= 0 && s.blur <= 0)) return null;
  return { color: scrimColor(ink, bg), opacity: s.opacity, blur: s.blur, shape: s.shape };
}

/** The gradient: full up to 35 % of the way, nothing past 80 %. */
export const GRADIENT_STOPS: [number, number] = [0.35, 0.8];

/** How much of the gradient zone is there at `t` (0 = the side where text sits, 1 = the far side). */
export function gradientCover(t: number): number {
  const [a, b] = GRADIENT_STOPS;
  return t <= a ? 1 : t >= b ? 0 : 1 - (t - a) / (b - a);
}

/** Wide boxes fade from the left; tall ones from the bottom. */
export const gradientSide = (w: number, h: number): 'left' | 'bottom' => (w >= h ? 'left' : 'bottom');

/** CSS for the layer: its colour, blur and (gradient) mask, as declarations. */
export function scrimCss(s: Scrim, side: 'left' | 'bottom' = 'left'): string {
  const [r, g, b] = hex(s.color);
  const parts = [`background:rgba(${r},${g},${b},${+s.opacity.toFixed(2)})`];
  if (s.blur > 0) parts.push(`-webkit-backdrop-filter:blur(${s.blur}px)`, `backdrop-filter:blur(${s.blur}px)`);
  if (s.shape === 'gradient') {
    const dir = side === 'left' ? 'to right' : 'to top';
    const m = `linear-gradient(${dir},#000 ${GRADIENT_STOPS[0] * 100}%,transparent ${GRADIENT_STOPS[1] * 100}%)`;
    parts.push(`-webkit-mask-image:${m}`, `mask-image:${m}`);
  }
  return parts.join(';');
}
