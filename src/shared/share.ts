import { isV1Settings, migrateV1, normMediaRef, normalizeRecipe, type Recipe } from '../engine/recipe';
import { PATTERN_IDS } from '../engine/catalog';
import { inflateRaw } from './inflate';

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

/** Compact, URL-safe encoding of a recipe ("z" = deflate, "j" = plain JSON fallback). */
export async function encodeRecipe(r: Recipe): Promise<string> {
  const { meta, ...rest } = publicRecipe(r);
  const json = JSON.stringify({ ...rest, meta: { seed: meta.seed, arch: meta.arch, space: meta.space, name: meta.name } });
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
  if (obj.monotrama === 'recipe' && obj.recipe) return normalizeRecipe(obj.recipe, PATTERN_IDS);
  if (isV1Settings(o)) return migrateV1(o);
  if ('layers' in obj || 'glyph' in obj || obj.v === 2) return normalizeRecipe(o, PATTERN_IDS);
  return null;
}

export function recipeFile(r: Recipe): string {
  return JSON.stringify({ monotrama: 'recipe', version: 2, created: new Date().toISOString(), recipe: r }, null, 2);
}

export async function shareUrl(r: Recipe, origin = location.origin): Promise<string> {
  return `${origin}/studio/#r=${await encodeRecipe(r)}`;
}
