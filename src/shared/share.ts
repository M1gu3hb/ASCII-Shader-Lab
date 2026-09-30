import { isV1Settings, migrateV1, normMediaRef, normalizeRecipe, type Recipe } from '../engine/recipe';
import { PATTERN_IDS } from '../engine/catalog';
import { inflateRaw } from './inflate';
import { encodeFrame, parseFrame, type Frame } from './frame';

/**
 * A real recipe is a few KB (about 2 KB compressed in a link). Links are refused past these sizes, so
 * a crafted one cannot make the studio decompress hundreds of MB before it even shows.
 */
const MAX_LINK = 64 * 1024;
const MAX_RECIPE = 256 * 1024;

const b64url = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const s = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/**
 * The recipe as it may leave this browser without its media: the media reference keeps what the
 * receiver needs to be told what is missing (kind, pixel size, format) and drops the file name
 * (it can be personal) and the local id (meaningless elsewhere).
 */
export function publicRecipe(r: Recipe): Recipe {
  const ref = r.media.ref;
  if (!ref) return r;
  return { ...r, media: { ...r.media, ref: normMediaRef({ kind: ref.kind, type: ref.type, w: ref.w, h: ref.h }) } };
}

/**
 * Compact, URL-safe encoding of a recipe ("z" = deflate, "j" = plain JSON fallback). The seed travels with the
 * version of the generator that wove it: opened elsewhere, the seed says which version repeats it.
 */
export async function encodeRecipe(r: Recipe): Promise<string> {
  const { meta, ...rest } = publicRecipe(r);
  const json = JSON.stringify({ ...rest, meta: { seed: meta.seed, arch: meta.arch, space: meta.space, name: meta.name, gen: meta.gen } });
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream !== 'undefined') {
    try { return 'z' + b64url(await pipe(bytes, new CompressionStream('deflate-raw'))); } catch { /* fall through */ }
  }
  return 'j' + b64url(bytes);
}

export async function decodeRecipe(s: string): Promise<Recipe | null> {
  try {
    if (s.length > MAX_LINK) return null;
    const kind = s[0], body = unb64url(s.slice(1));
    let bytes: Uint8Array | null = body;
    if (kind === 'z') bytes = await inflateRaw(body, MAX_RECIPE);
    else if (kind !== 'j') return null;
    if (!bytes || bytes.length > MAX_RECIPE) return null;
    return parseRecipe(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/** Accepts JSON from this app, from the original single-file lab, or garbage (returns null). */
export function parseRecipe(text: string): Recipe | null {
  let o: unknown;
  try { o = JSON.parse(text); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  const obj = o as Record<string, unknown>;
  // files saved as GLYPHOS, and as Monotrama (its earlier name)
  if ((obj.glyphos === 'recipe' || obj.monotrama === 'recipe') && obj.recipe) return normalizeRecipe(obj.recipe, PATTERN_IDS);
  if (isV1Settings(o)) return migrateV1(o);
  if ('layers' in obj || 'glyph' in obj || obj.v === 2) return normalizeRecipe(o, PATTERN_IDS);
  return null;
}

export function recipeFile(r: Recipe): string {
  return JSON.stringify({ glyphos: 'recipe', version: 2, created: new Date().toISOString(), recipe: r }, null, 2);
}

/* ------------------------------------------------------------------ */
/* Links                                                               */
/* ------------------------------------------------------------------ */

/**
 * How the piece was seen when it was shared: its frame (see frame.ts), the moment of its motion and whether
 * it was paused there. A link carries it next to the recipe, so the viewer shows that same composition.
 */
export interface ShareView {
  frame: Frame | null;
  /** Engine time in seconds (the piece's clock). */
  t?: number;
  paused?: boolean;
}

const T_MAX = 1e7;
/**
 * The moment of a paused piece, exactly as its engine holds it (written as the shortest decimal that reads back
 * to the same number). Not rounded: grain and flicker hash the piece's time, so a moment rounded to the
 * millisecond showed the receiver other noise than the sender saw. Under half a millisecond is the start.
 */
const cleanTime = (t: unknown) => (typeof t === 'number' && Number.isFinite(t) && t >= 0.0005 && t < T_MAX ? t : 0);

/**
 * What goes after «#» in a link to a piece: the recipe (r, first, as links always started), the frame (f)
 * and, for a piece shared paused, the moment it shows (t) and the pause (p). A piece that moves starts from
 * its beginning: where the studio's clock was is incidental (it runs on across pieces), and the same piece
 * seen the same way gives the same link. Everything travels in the fragment: browsers never send it to a
 * server.
 */
export function pieceHash(code: string, view?: ShareView | null): string {
  const parts = ['r=' + code];
  if (view?.frame) parts.push('f=' + encodeFrame(view.frame));
  const t = view?.paused ? cleanTime(view.t) : 0;
  if (t) parts.push('t=' + t);
  if (view?.paused) parts.push('p=1');
  return parts.join('&');
}

/** A link's fragment read back: the recipe code (still to decode) and how it was seen. Never throws. */
export function readPieceHash(hash: string): { code: string | null; view: ShareView } {
  let h: URLSearchParams;
  try { h = new URLSearchParams(hash.replace(/^#/, '')); } catch { return { code: null, view: { frame: null } }; }
  const t = cleanTime(Number(h.get('t')));
  return {
    code: h.get('r') || null,
    view: { frame: parseFrame(h.get('f')), ...(t ? { t } : {}), ...(h.get('p') === '1' ? { paused: true } : {}) },
  };
}

/** The public viewer: the piece full screen, in its own frame (src/ver/). */
export async function viewerUrl(r: Recipe, view: ShareView | null, origin = location.origin): Promise<string> {
  return `${origin}/ver/#${pieceHash(await encodeRecipe(r), view)}`;
}

/** The studio with the piece as a new entry of the history (links from before the viewer look like this). */
export async function studioUrl(r: Recipe, view: ShareView | null = null, origin = location.origin): Promise<string> {
  return `${origin}/studio/#${pieceHash(await encodeRecipe(r), view?.frame ? { frame: view.frame } : null)}`;
}

/**
 * Where links made in this page take the view from: the studio registers the live stage (ShareSheet.tsx),
 * so every link it makes, wherever it is shown, carries the frame the piece is seen in.
 */
let viewOf: ((r: Recipe) => ShareView | null) | null = null;
export function provideShareView(fn: ((r: Recipe) => ShareView | null) | null) { viewOf = fn; }

/** A link to share a piece: the public viewer, with the frame it is seen in here (a default one elsewhere). */
export async function shareUrl(r: Recipe, origin = location.origin): Promise<string> {
  let view: ShareView | null = null;
  try { view = viewOf?.(r) ?? null; } catch { view = null; }
  return viewerUrl(r, view, origin);
}
