import { Accum, toBytes } from '../draw';
import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params } from '../types';

/**
 * «Galaxia de brazos» of the N-body family: a disc galaxy whose arms are a kinematic density wave (Lindblad's
 * picture, the one Lin and Shu made a theory of). In the epicycle approximation a star's orbit, seen from a
 * frame that turns at the pattern speed Ωp, is a closed oval: r = a (1 + e cos mψ) for an m-armed pattern. Each
 * oval is turned by an angle that grows with its size (φ = twist · a), so neighbouring ovals crowd together
 * along m spiral lanes: the arms. The pattern turns rigidly at Ωp while every star runs around its own oval at
 * Ω(a) − Ωp (a flat rotation curve, Ω = v₀ / √(a² + rc²)): stars flow in and out of the arms, which persist.
 * Its own pieces: a hot central bulge, a thin disc with a little vertical breathing, and young bright stars that
 * light up while they cross an arm (where the lanes crowd) and fade after it. The winding and the ovals breathe
 * slowly, so the arms tighten and open over a minute or two. Positions are a function of the model time and
 * the seed's constants: the state is the time, the camera and the trail.
 *
 * This is not an N-body sum: the stars do not pull one another (the arms would dissolve in a few turns with a
 * few thousand bodies). It is the gravity of a galaxy as orbits in its potential.
 */

const ID = 'gravedad', V = 1, RATE = 30;
const MAX_STARS = 9600, STARS_PER_BODY = 8;
const hyp3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);

interface P { n: number; G: number; soft: number; dt: number; trail: number; zoom: number; tilt: number; spin: number; view: string; arms: number }
const read = (p: Params): P => ({
  n: Math.max(16, Math.min(1200, Math.round(Number(p.bodies ?? 300)))),
  G: Number(p.G ?? 1), soft: Number(p.soft ?? 0.04), dt: Number(p.dt ?? 0.012),
  trail: Number(p.trail ?? 0.5), zoom: Number(p.zoom ?? 1), tilt: (Number(p.tilt ?? 35) * Math.PI) / 180,
  spin: Number(p.spin ?? 0.1), view: String(p.view ?? 'masa'), arms: Math.max(1, Math.min(4, Math.round(Number(p.arms ?? 2)))),
});

export function createSpiral(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h;
  const rng = new SimRng(`${ID}|espiral|${V}|${cfg.seed}`);
  let p = read(cfg.params);
  const NS = Math.min(MAX_STARS, p.n * STARS_PER_BODY);
  // per star: size of its oval (disc) or radius (bulge), phase, vertical amplitude and phase, kind, brightness
  const A = new Float32Array(NS), PH = new Float32Array(NS), ZA = new Float32Array(NS), ZP = new Float32Array(NS);
  const KIND = new Uint8Array(NS), BR = new Float32Array(NS);
  const nBulge = Math.round(NS * 0.16);
  for (let i = 0; i < NS; i++) {
    if (i < nBulge) {
      // bulge: an exponential sphere, slightly flattened
      KIND[i] = 1;
      A[i] = Math.min(0.32, -0.075 * Math.log(1 - rng.next() * 0.995));
      ZP[i] = Math.asin(rng.range(-1, 1)); ZA[i] = 0.65;
      BR[i] = rng.range(0.35, 0.6);
    } else {
      // disc: exponential surface density Σ ∝ exp(−a / 0.45) between 0.06 and 1.05 (radii drawn from a Σ(a))
      let a = 0;
      do { a = rng.range(0.06, 1.05); } while (rng.next() * 0.45 / Math.E * 1.02 > a * Math.exp(-a / 0.45));
      A[i] = a;
      ZA[i] = 0.012 + 0.02 * rng.next() * a; ZP[i] = rng.next() * Math.PI * 2;
      // one star in six is young and bright (it shines while it crosses an arm)
      KIND[i] = rng.next() < 1 / 6 ? 2 : 0;
      BR[i] = KIND[i] === 2 ? rng.range(0.8, 1.3) : rng.range(0.22, 0.42);
    }
    PH[i] = rng.next() * Math.PI * 2;
  }
  const phi0 = rng.next() * Math.PI * 2, breathP = rng.next() * Math.PI * 2;
  let steps = 0, tm = 0, yaw = 0;
  const trail = new Float32Array(w * h);

  /** Ω(a): a flat rotation curve (speed v₀ past the core rc), scaled by «Atracción». */
  const v0 = () => 0.34 * Math.sqrt(p.G);
  const rc = 0.07;
  const omega = (a: number) => v0() / Math.sqrt(a * a + rc * rc);
  // where the pattern turns with the stars (corotation): the outer disc
  const RCO = 0.85;

  const X = new Float32Array(NS), Y = new Float32Array(NS), Z = new Float32Array(NS), L = new Float32Array(NS);
  /** Every star's position at model time T, and how bright it is (into X, Y, Z, L). */
  const place = (T: number) => {
    const m = p.arms, op = omega(RCO);
    // the winding and the ovals breathe over a couple of minutes
    const twist = 4.2 * (1 + 0.16 * Math.sin(T * 0.05 + breathP)), e0 = 0.3 * (1 + 0.18 * Math.sin(T * 0.031 + breathP * 1.7));
    const rot = phi0 + op * T;
    for (let i = 0; i < NS; i++) {
      const a = A[i], om = omega(a);
      if (KIND[i] === 1) {
        // bulge: inclined circular orbits, slower than the disc's
        const ps = PH[i] + om * 0.7 * T, cl = Math.cos(ZP[i]);
        X[i] = a * cl * Math.cos(ps); Y[i] = a * cl * Math.sin(ps); Z[i] = a * Math.sin(ZP[i]) * ZA[i];
        L[i] = BR[i];
        continue;
      }
      const e = e0 * (a < 0.22 ? a / 0.22 : 1) * (1.1 - 0.35 * a);
      const ps = PH[i] + (om - op) * T, cm = Math.cos(m * ps);
      const r = a * (1 + e * cm), th = ps + twist * a + rot;
      X[i] = r * Math.cos(th); Y[i] = r * Math.sin(th);
      Z[i] = ZA[i] * Math.sin(ZP[i] + 2 * om * T);
      // young stars light up near the outer turn of their oval (cm ≈ 1), where the ovals crowd into the arm
      if (KIND[i] === 2) { const q = 0.5 + 0.5 * cm, q3 = q * q * q; L[i] = BR[i] * (0.15 + 0.85 * q3 * q3); } else L[i] = BR[i];
    }
  };

  // camera: orthographic, yaw about the galaxy's axis, then tilt towards the viewer (as the N-body camera)
  const FIT = 0.95;
  const P2 = [0, 0], CAM = [1, 0, 1, 0, 1];
  /** The camera's sines and cosines, once per pass over the stars. */
  const aim = () => { CAM[0] = Math.cos(yaw); CAM[1] = Math.sin(yaw); CAM[2] = Math.cos(p.tilt); CAM[3] = Math.sin(p.tilt); CAM[4] = (0.42 * p.zoom) / FIT; };
  const project = (x: number, y: number, z: number) => {
    const c = CAM[0], s = CAM[1], k = CAM[4];
    const xr = x * c - y * s, yr = x * s + y * c;
    P2[0] = xr * k; P2[1] = (yr * CAM[2] + z * CAM[3]) * k;
  };

  const step1 = () => {
    tm += p.dt;
    yaw += ((p.spin * Math.PI * 2) / 60) / RATE;
    if (p.trail > 0.001) {
      const decay = Math.exp(-1 / RATE / (0.05 + 3 * p.trail * p.trail));
      for (let i = 0; i < trail.length; i++) trail[i] *= decay;
      // the trail only needs the stars every other step (they move less than a cell)
      if (steps % 2 === 0) {
        place(tm);
        aim();
        for (let i = 0; i < NS; i++) {
          project(X[i], Y[i], Z[i]);
          const fx = (P2[0] * 0.5 + 0.5) * w - 0.5, fy = (0.5 - P2[1]) * h - 0.5;
          const x0 = Math.floor(fx), y0 = Math.floor(fy);
          if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) continue;
          const tx = fx - x0, ty = fy - y0, a = 0.05 * L[i], o = y0 * w + x0;
          trail[o] += a * (1 - tx) * (1 - ty); trail[o + 1] += a * tx * (1 - ty);
          trail[o + w] += a * (1 - tx) * ty; trail[o + w + 1] += a * tx * ty;
        }
      }
    } else trail.fill(0);
    steps++;
  };

  const acc = new Accum(w, h), stars = new Accum(w, h), tmp = new Float32Array(w * h);
  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) { p = { ...read(np), n: p.n }; },
    step(k: number) { for (let i = 0; i < k; i++) step1(); },
    render(out: Uint8Array) {
      // stars as soft points: each one splatted bilinearly (thousands of them: a gaussian each would cost more than
      // the rest of the frame), then the layer smoothed by (1 2 1) passes to about the width of a gaussian of σ;
      // «Brillo por velocidad» lights the fast inner disc
      const s = stars.d;
      s.fill(0);
      place(tm);
      aim();
      const sg = Math.max(0.5, h / 170), amt = 0.42 * Math.PI * 2 * sg * sg;
      const vref = omega(0.5) * 0.5;
      for (let i = 0; i < NS; i++) {
        project(X[i], Y[i], Z[i]);
        let b = L[i];
        if (p.view === 'velocidad') b *= Math.min(1.8, 0.5 + 0.7 * (omega(A[i]) * hyp3(X[i], Y[i], 0)) / vref);
        const fx = (P2[0] * 0.5 + 0.5) * w - 0.5, fy = (0.5 - P2[1]) * h - 0.5;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) continue;
        const tx = fx - x0, ty = fy - y0, a = amt * b, o = y0 * w + x0;
        s[o] += a * (1 - tx) * (1 - ty); s[o + 1] += a * tx * (1 - ty);
        s[o + w] += a * (1 - tx) * ty; s[o + w + 1] += a * tx * ty;
      }
      stars.blur(Math.max(1, Math.round((sg * sg - 0.17) / 0.5)), false, tmp);
      const d = acc.d;
      for (let i = 0; i < d.length; i++) d[i] = 0.5 * (1 - Math.exp(-trail[i] * 1.5)) + s[i];
      toBytes(d, out, 1.4, 1, 'log');
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = { tm, yaw, spiral: 1 };
      rng.save(scalars);
      return { id: ID, v: V, steps, res: h, scalars, arrays: { trail: trail.slice() } };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== h || s.scalars.spiral !== 1) throw new Error('El estado guardado no corresponde a este sistema.');
      const t = s.arrays.trail;
      if (!(t instanceof Float32Array) || t.length !== w * h) throw new Error('El estado guardado está incompleto.');
      trail.set(t);
      tm = s.scalars.tm ?? 0; yaw = s.scalars.yaw ?? 0;
      steps = s.steps;
      rng.load(s.scalars);
    },
  };
}
