import { hexToRgb } from './color';
import { loopTime } from './loop';
import type { Optics } from './recipe';

/** Most planes a glass polyhedron has (the icosahedron's 20 faces): the size of uOpN in glsl/optics.ts. */
export const MAX_PLANES = 20;

/**
 * A glass solid's state at one moment (glsl/optics.ts, basic/optics.ts):
 *   c = (centre x, centre y in screen heights, radius, 0 sphere / 1 polyhedron)
 *   d = (index of refraction, thickness: the z scale, dispersion, number of planes)
 *   t = (tint r, g, b, opacity of the tinted body)
 *   n = the polyhedron's planes after its turn and its thickness: unit normal (xyz) and distance (w)
 */
export interface SolidU {
  c: [number, number, number, number];
  d: [number, number, number, number];
  t: [number, number, number, number];
  n: Float32Array;
}

/** The glass's uniforms (glsl/optics.ts): the same numbers for the shader and the CPU port. */
export interface OpticsU {
  a: [number, number, number, number];
  b: [number, number, number, number];
  /** Glass solids only (esfera, poliedro). */
  s?: SolidU;
}

const KIND: Record<Optics['kind'], number> = { lluvia: 1, acanalado: 2, esfera: 3, poliedro: 4 };

/**
 * The glass's uniforms at piece time `t` (a solid moves: a sphere drifts, a polyhedron turns; with a loop of
 * `loop` seconds a whole number of turns fits in it, as everything with a period of its own does: loop.ts).
 * Rain and fluted glass move in the shader and read neither.
 */
export function opticsUniforms(o: Optics, t = 0, loop = 0): OpticsU {
  const u: OpticsU = {
    a: [KIND[o.kind], o.amount, o.scale, o.speed],
    b: [(o.angle * Math.PI) / 180, o.profile, o.shine, o.fog],
  };
  if (o.kind === 'esfera' || o.kind === 'poliedro') u.s = solidUniforms(o, t, loop);
  return u;
}

const TAU = Math.PI * 2;
const PHI = (1 + Math.sqrt(5)) / 2;

/** Each polyhedron's face planes for a circumradius of 1 (POLY_SHAPES order): unit normal and distance. */
const SHAPES: Array<Array<[number, number, number, number]>> = (() => {
  const unit = (x: number, y: number, z: number, h: number): [number, number, number, number] => {
    const l = Math.hypot(x, y, z);
    return [x / l, y / l, z / l, h];
  };
  // a triangular prism standing on its axis (y): three sides around it and its two ends
  const prism: Array<[number, number, number, number]> = [];
  for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + (k * TAU) / 3; prism.push(unit(Math.cos(a), 0, Math.sin(a), 0.48)); }
  prism.push([0, 1, 0, 0.82], [0, -1, 0, 0.82]);
  const cube: Array<[number, number, number, number]> = [];
  for (const s of [1, -1]) cube.push([s, 0, 0, 0.577], [0, s, 0, 0.577], [0, 0, s, 0.577]);
  const octa: Array<[number, number, number, number]> = [];
  for (const x of [1, -1]) for (const y of [1, -1]) for (const z of [1, -1]) octa.push(unit(x, y, z, 0.577));
  // the dodecahedron's faces look along the icosahedron's vertices, and the icosahedron's along the dodecahedron's
  const ico: Array<[number, number, number]> = [];
  for (const a of [1, -1]) for (const b of [PHI, -PHI]) ico.push([0, a, b], [a, b, 0], [b, 0, a]);
  const dode = ico.map(([x, y, z]) => unit(x, y, z, 0.7947));
  const dv: Array<[number, number, number]> = [];
  for (const x of [1, -1]) for (const y of [1, -1]) for (const z of [1, -1]) dv.push([x, y, z]);
  for (const a of [1, -1]) for (const b of [1, -1]) dv.push([0, a / PHI, b * PHI], [a / PHI, b * PHI, 0], [b * PHI, 0, a / PHI]);
  const icosa = dv.map(([x, y, z]) => unit(x, y, z, 0.7947));
  return [prism, cube, octa, dode, icosa];
})();

/** A solid's state at piece time t (see opticsUniforms). */
export function solidUniforms(o: Optics, t: number, loop: number): SolidU {
  const R = 0.3 * o.scale, zs = o.thick ?? 1;
  // a slow turn (or drift), 0.3 rad/s at speed 1; in a loop, a whole number of turns
  const w = 0.3 * o.speed;
  const ph = w > 0 ? w * loopTime(t, loop, TAU / w) : 0;
  const tint = hexToRgb(o.tint ?? '#ffffff');
  const u: SolidU = {
    c: [o.x ?? 0, o.y ?? 0, R, o.kind === 'poliedro' ? 1 : 0],
    d: [o.ior ?? 1.5, zs, o.disp ?? 0, 0],
    t: [tint[0], tint[1], tint[2], o.fog],
    n: new Float32Array(MAX_PLANES * 4),
  };
  if (o.kind === 'esfera') {
    // a ball drifts along a slow figure of eight around its place
    u.c[0] += 0.09 * Math.sin(ph);
    u.c[1] += 0.05 * Math.sin(2 * ph);
    return u;
  }
  const shape = SHAPES[Math.max(0, Math.min(SHAPES.length - 1, Math.round(o.profile)))];
  const prism = Math.round(o.profile) === 0;
  // turns about its axis (yaw), leaning toward the viewer (pitch) with a slight sway; the axis tilted by `angle`
  const yaw = ph, pitch = (prism ? 0.16 : 0.48) + 0.1 * Math.sin(ph), tilt = (o.angle * Math.PI) / 180;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), ct = Math.cos(tilt), st = Math.sin(tilt);
  shape.forEach(([x, y, z, h], i) => {
    // Ry(yaw), then Rx(pitch), then Rz(tilt)
    const x1 = cy * x + sy * z, z1 = -sy * x + cy * z;
    const y2 = cp * y - sp * z1, z2 = sp * y + cp * z1;
    const x3 = ct * x1 - st * y2, y3 = st * x1 + ct * y2;
    // thickness: the solid squeezed along the view (z / zs in the plane's equation)
    const nz = z2 / zs, l = Math.hypot(x3, y3, nz);
    u.n.set([x3 / l, y3 / l, nz / l, h / l], i * 4);
  });
  u.d[3] = shape.length;
  return u;
}

/** Which glass the field program carries (glsl/programs.ts FieldOptics): none, rain or fluted, or a solid. */
export function fieldOptics(o: Optics | undefined): boolean | 'solido' {
  return !o ? false : o.kind === 'esfera' || o.kind === 'poliedro' ? 'solido' : true;
}

/**
 * How a glass solid colours the cells (uOpCol in the field pass, uGlassCol in the select pass): 0 without a
 * solid; 1 when the cells show their own colour (a photo, video or camera, or a colour family, in «colour of
 * the source» mode): the glass tints it; 2 when they take the palette's: the cell carries a factor for it.
 */
export function glassColourMode(o: Optics | undefined, colourMode: 'ramp' | 'source', src: 'pattern' | 'media' | 'text', colourFamily: boolean): 0 | 1 | 2 {
  if (fieldOptics(o) !== 'solido') return 0;
  return colourMode === 'source' && (src === 'media' || (src === 'pattern' && colourFamily)) ? 1 : 2;
}
