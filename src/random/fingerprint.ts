import { charsetIdOf } from '../engine/catalog';
import { hexToOklch } from '../engine/color';
import type { Recipe } from '../engine/recipe';
import { hash53 } from './prng';

/* ------------------------------------------------------------------ */
/* Fingerprints: two recipes that look alike share a fingerprint.      */
/* ------------------------------------------------------------------ */

export function fingerprint(r: Recipe): string {
  const q = (v: number, s: number) => Math.round(v / s);
  const colour = (hex: string) => { const [L, C, h] = hexToOklch(hex); return C < 0.03 ? `n${q(L, 0.2)}` : `${q(h, 30) % 12}.${q(L, 0.25)}`; };
  const parts = [
    r.source,
    r.layers.filter(l => l.on).map(l => `${l.pattern}:${l.blend}:${q(l.a, 0.34)}${q(l.b, 0.34)}:${q(Math.log2(l.scale), 0.5)}`).join('+'),
    charsetIdOf(r.glyph.charset), r.glyph.font, r.glyph.mode, q(r.glyph.cell, 3), q(r.glyph.aspect, 0.3),
    r.color.stops.map(colour).join('/'), colour(r.color.bg), r.color.map, r.color.mode,
    Object.entries(r.fx).filter(([, v]) => v > 0.2).map(([k]) => k).join(','),
    r.interact.mode, r.motion.hold > 0 ? 'h' : '', r.msg.on ? 'm' : '', r.tone.levels > 0 ? 'L' : '', r.glyph.edge > 0.2 ? 'e' : '',
  ];
  // a different local image or video makes a different piece (appended only then: other fingerprints stay as they were)
  if ((r.source === 'image' || r.source === 'video') && r.media.ref?.id) parts.push(r.media.ref.id);
  // transformations and letters that move change a piece as much as its effects (appended only when used)
  const xf = r.source !== 'pattern' ? (r.media.xform ?? []).filter(x => x.on && x.amount > 0) : [];
  if (xf.length) parts.push('x:' + xf.map(x => `${x.kind}${q(x.p, 0.34)}`).join('+'));
  if (r.source === 'text' && r.text.anim) parts.push('t:' + r.text.anim.kind);
  if (r.msg.on && (r.msg.anim || r.msg.mode === 'words')) parts.push('m:' + (r.msg.anim?.kind ?? '') + r.msg.mode);
  return hash53(parts.join('|')).toString(36);
}
