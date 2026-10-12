import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYER, defaultRecipe, normalizeRecipe, normFxKind, normInteract, normOptics, tidyTail, type Recipe,
} from '../../src/engine/recipe';
import { OP, OPD, OPX, opticsAt, opticsLoop } from '../../src/engine/basic/optics';
import { fieldOptics, glassColourMode, opticsUniforms, solidUniforms } from '../../src/engine/opticsU';
import { buildFieldShader, fieldKey, ANAMORPHIC_FS, PAPER_FS, SIM_FS } from '../../src/engine/glsl/programs';
import { PATTERN_GLSL } from '../../src/engine';
import { FieldBuffers, fieldLayers, runField } from '../../src/engine/basic/field';
import { SelectBuffers, runSelect } from '../../src/engine/basic/select';
import { blurGrid, blurGridAnamorphic, grainPass, paperField, type ComposeFrame } from '../../src/engine/basic/compose';
import { bakeGradient } from '../../src/engine/color';
import { brushDry, brushGhost, brushWidth, isCalligraphy, simSettle } from '../../src/engine/pointer';
import { SimGrid } from '../../src/engine/basic/sim';
import { PRESETS } from '../../src/studio/presets';
import { sectionOf } from '../../src/studio/recipes/catalog';

/*
 * Closing of PR #10, «acabados» group: the glass solids (I-36…I-43), the anamorphic flare (I-22), the paper
 * grain (I-27) and the calligraphic brush (I-20). Every new recipe key is optional and absent by default.
 */

const json = (r: unknown) => JSON.parse(JSON.stringify(r));

describe('receta: claves nuevas opcionales y compatibles', () => {
  it('una receta por defecto no gana ninguna clave y sigue en el formato 2', () => {
    const r = normalizeRecipe(json(defaultRecipe()));
    expect(r).not.toHaveProperty('fxKind');
    expect(r).not.toHaveProperty('optics');
    expect(r.interact).not.toHaveProperty('stroke');
    expect(r.interact).not.toHaveProperty('bleed');
    expect(r.v).toBe(2);
    expect(Object.keys(r.fx)).toEqual(Object.keys(defaultRecipe().fx));
  });

  it('la lluvia y el acanalado se normalizan con sus ocho claves de siempre', () => {
    for (const kind of ['lluvia', 'acanalado'] as const) {
      const o = normOptics({ kind, x: 0.5, ior: 2, disp: 1, tint: '#ff0000' })!;
      expect(Object.keys(o)).toEqual(['kind', 'amount', 'scale', 'speed', 'angle', 'profile', 'shine', 'fog']);
    }
  });

  it('esfera y poliedro: sus claves propias, con valores por defecto y acotadas', () => {
    const e = normOptics({ kind: 'esfera' })!;
    expect(e).toMatchObject({ amount: 1, profile: 0, x: 0, y: 0, ior: 1.5, thick: 1, disp: 0, tint: '#ffffff', fog: 0 });
    const p = normOptics({ kind: 'poliedro', profile: 9.3, ior: 9, thick: 0, disp: -1, x: 5, y: -5, tint: 'rojo' })!;
    expect(p).toMatchObject({ profile: 4, ior: 2.4, thick: 0.15, disp: 0, x: 1.2, y: -0.6, tint: '#ffffff' });
    expect(normOptics({ kind: 'poliedro', profile: 1.4 })!.profile).toBe(1);
    expect(normOptics({ kind: 'esfera', profile: 3 })!.profile).toBe(0);
  });

  it('fxKind: sólo lo que conoce, el pliegue sólo con papel; nada → ausente', () => {
    expect(normFxKind({ bloom: 'anamorfico', grain: 'papel', fold: 'arrugado', otro: 1 })).toEqual({ bloom: 'anamorfico', grain: 'papel', fold: 'arrugado' });
    expect(normFxKind({ fold: 'cuartos' })).toBeUndefined();
    expect(normFxKind({ bloom: 'cuadrado', grain: 'arena' })).toBeUndefined();
    expect(normFxKind(null)).toBeUndefined();
  });

  it('el pincel caligráfico: stroke y bleed sólo si se dan; un trazo desconocido se descarta', () => {
    const it0 = normInteract({ mode: 'paint', strength: 0.5, radius: 0.1, auto: true });
    expect(it0).not.toHaveProperty('stroke');
    const it1 = normInteract({ mode: 'paint', strength: 0.5, radius: 0.1, auto: true, stroke: 'caligrafia', bleed: 3 });
    expect(it1.stroke).toBe('caligrafia');
    expect(it1.bleed).toBe(1);
    expect(Object.keys(it1).slice(-2)).toEqual(['stroke', 'bleed']);
    expect(normInteract({ mode: 'paint', stroke: 'brocha' })).not.toHaveProperty('stroke');
  });

  it('con cualquiera de ellas la receta pasa al formato 3, y vuelve igual al normalizarse (claves al final, en orden)', () => {
    const r = defaultRecipe();
    r.fxKind = { grain: 'papel', fold: 'carta' };
    r.optics = normOptics({ kind: 'esfera', disp: 0.5 })!;
    tidyTail(r);
    expect(Object.keys(r).slice(-2)).toEqual(['optics', 'fxKind']);
    const n = normalizeRecipe(json(r));
    expect(n.v).toBe(3);
    expect(Object.keys(n).slice(-2)).toEqual(['optics', 'fxKind']);
    expect(json(normalizeRecipe(json(n)))).toEqual(json(n));
    const c = defaultRecipe();
    c.interact = normInteract({ ...c.interact, mode: 'paint', stroke: 'caligrafia' });
    expect(normalizeRecipe(json(c)).v).toBe(3);
    const b = defaultRecipe();
    b.fxKind = { bloom: 'anamorfico' };
    expect(normalizeRecipe(json(b)).v).toBe(3);
  });

  it('los presets nuevos son recetas válidas de su espacio y están donde deben', () => {
    const want: Record<string, Array<[string, string]>> = {
      arte: [['esfera-de-vidrio', 'figuras'], ['prisma-de-vidrio', 'figuras'], ['gema-tenida', 'figuras'], ['caligrafia', 'organicas']],
      media: [['bola-de-cristal', 'efectos'], ['destello-de-cine', 'efectos'], ['impreso-en-papel', 'efectos']],
      tipo: [['bajo-la-lupa', 'texturas']],
    };
    for (const [space, list] of Object.entries(want)) {
      for (const [id, section] of list) {
        const p = PRESETS[space as 'arte'].find(x => x.id === id);
        expect(p, id).toBeTruthy();
        const r = p!.make();
        expect(json(normalizeRecipe(json(r))), id).toEqual(json(r));
        expect(r.v, id).toBe(3);
        expect(sectionOf(space as 'arte', id, r), id).toBe(section);
      }
    }
  });
});

describe('vidrio en sólidos (I-36…I-43): el mecanismo', () => {
  const sphere = (o: Record<string, unknown> = {}) => opticsUniforms(normOptics({ kind: 'esfera', speed: 0, shine: 1, ...o })!);
  // where the ray from p lands behind the solid, in radii from its centre
  const landing = (u: ReturnType<typeof sphere>, x: number, y = 0) => {
    opticsAt(x * u.s!.c[2], y * u.s!.c[2], 0, u);
    return [(x * u.s!.c[2] + OP[0]) / u.s!.c[2], (y * u.s!.c[2] + OP[1]) / u.s!.c[2]];
  };

  it('fuera del sólido no mueve nada; dentro, el centro ve lo de detrás sin moverlo', () => {
    const u = sphere();
    opticsAt(2, 2, 0, u);
    expect([OP[0], OP[1], OP[2], OPX[0]]).toEqual([0, 0, 0, 0]);
    opticsAt(0, 0, 0, u);
    expect(OPX[0]).toBe(1);
    expect(Math.hypot(OP[0], OP[1])).toBeLessThan(1e-9);
  });

  it('una bola entera invierte lo de detrás; una lente fina lo agranda derecho', () => {
    const [ball] = landing(sphere(), 0.5);
    expect(ball).toBeLessThan(0);
    const [thin] = landing(sphere({ thick: 0.25 }), 0.5);
    expect(thin).toBeGreaterThan(0);
    expect(thin).toBeLessThan(0.5);
  });

  it('más índice de refracción, más se dobla el rayo', () => {
    const lo = landing(sphere({ ior: 1.2, thick: 0.4 }), 0.5)[0], hi = landing(sphere({ ior: 2, thick: 0.4 }), 0.5)[0];
    expect(Math.abs(hi - 0.5)).toBeGreaterThan(Math.abs(lo - 0.5));
  });

  it('Fresnel: el borde refleja más que el centro, y deja pasar menos', () => {
    const u = sphere();
    opticsAt(0, 0, 0, u);
    const c = OP[2], cf = OPX[3];
    opticsAt(-0.97 * u.s!.c[2], 0.1 * u.s!.c[2], 0, u);
    expect(OP[2]).toBeGreaterThan(c + 0.2);
    expect(OPX[3]).toBeGreaterThan(cf);
  });

  it('el tinte recorre más vidrio en el centro que en el borde', () => {
    const u = sphere();
    opticsAt(0, 0, 0, u);
    const centre = OPX[1];
    opticsAt(0.9 * u.s!.c[2], 0, 0, u);
    // (a refracted chord: 2 · cos of the angle inside, 1.6 at nine tenths of the radius)
    expect(centre).toBeGreaterThan(OPX[1] * 1.15);
  });

  it('dispersión: sin ella OPD es cero; con ella el rojo y el azul caen a lados opuestos del verde', () => {
    let u = sphere();
    opticsAt(0.6 * u.s!.c[2], 0.2 * u.s!.c[2], 0, u);
    expect([...OPD]).toEqual([0, 0, 0, 0]);
    u = sphere({ disp: 1 });
    opticsAt(0.6 * u.s!.c[2], 0.2 * u.s!.c[2], 0, u);
    const r = [OPD[0], OPD[1]], b = [OPD[2], OPD[3]];
    expect(Math.hypot(r[0], r[1])).toBeGreaterThan(1e-3);
    expect(r[0] * b[0] + r[1] * b[1]).toBeLessThan(0);
  });

  it('su sombra cae fuera, abajo a la derecha, y sólo con luz', () => {
    const u = sphere();
    const R = u.s!.c[2];
    opticsAt(0.5 * R, -1.1 * R, 0, u);
    expect(OP[3]).toBeGreaterThan(0.2);
    opticsAt(-0.5 * R, 1.1 * R, 0, u);
    expect(OP[3]).toBe(0);
    const dark = sphere({ shine: 0 });
    opticsAt(0.5 * R, -1.1 * R, 0, dark);
    expect(OP[3]).toBe(0);
  });

  it('un poliedro: caras planas (cada una desvía distinto), aristas que brillan, y gira con el tiempo', () => {
    for (let shape = 0; shape < 5; shape++) {
      const o = normOptics({ kind: 'poliedro', profile: shape, speed: 1, ior: 2.2, disp: 0.5 })!;
      const u = opticsUniforms(o, 3, 0), R = u.s!.c[2];
      const seen = new Set<string>();
      let glints = 0, inside = 0;
      for (let i = 0; i < 41; i++) for (let j = 0; j < 41; j++) {
        opticsAt(((i - 20) / 20) * R, ((j - 20) / 20) * R, 0, u);
        for (const v of [...OP, ...OPD, ...OPX]) expect(Number.isFinite(v)).toBe(true);
        if (OPX[0] > 0.5) { inside++; if (OP[2] > 0.6) glints++; }
      }
      // the entry normals of the faces it is seen through
      const pl = u.s!.n;
      for (let i = 0; i < u.s!.d[3]; i++) if (pl[i * 4 + 2] > 0.05) seen.add(i.toString());
      expect(inside, `forma ${shape}`).toBeGreaterThan(200);
      expect(seen.size, `forma ${shape}`).toBeGreaterThanOrEqual(2);
      expect(glints, `forma ${shape}`).toBeGreaterThan(0);
      const later = opticsUniforms(o, 5, 0);
      expect(Array.from(later.s!.n.slice(0, 8))).not.toEqual(Array.from(u.s!.n.slice(0, 8)));
    }
  });

  it('con «Bucle perfecto» el sólido da vueltas enteras: al final del bucle está como al principio', () => {
    for (const kind of ['esfera', 'poliedro'] as const) {
      const o = normOptics({ kind, speed: 0.7 })!;
      const a = solidUniforms(o, 0, 9), b = solidUniforms(o, 9 - 1e-6, 9);
      for (let i = 0; i < 4; i++) expect(b.c[i]).toBeCloseTo(a.c[i], 4);
      for (let i = 0; i < 80; i++) expect(b.n[i]).toBeCloseTo(a.n[i], 4);
      const u = opticsUniforms(o, 4, 9);
      opticsLoop(0.1, 0.05, 4, 9, u);
      expect(Number.isFinite(OP[0])).toBe(true);
    }
  });

  it('el programa del vidrio sólido es otro: la lluvia y el acanalado no cambian', () => {
    expect(fieldOptics(normOptics({ kind: 'esfera' }))).toBe('solido');
    expect(fieldOptics(normOptics({ kind: 'lluvia' }))).toBe(true);
    expect(fieldKey(['nube'], 'pattern', false, 'solido')).not.toBe(fieldKey(['nube'], 'pattern', false, true));
    const rain = buildFieldShader(['nube'], 'pattern', false, PATTERN_GLSL, true);
    expect(rain).not.toContain('opSolid');
    expect(rain).not.toContain('GL3');
    const pat = buildFieldShader(['nube'], 'pattern', true, PATTERN_GLSL, 'solido');
    expect(pat).toContain('opSolid');
    expect(pat).toContain('stack(q + OPD.xy, tl)');
    expect(buildFieldShader(['nube'], 'text', false, PATTERN_GLSL, 'solido')).toContain('TX3.r');
    expect(buildFieldShader(['nube'], 'media', false, PATTERN_GLSL, 'solido')).toContain('c4.r = (media(a0).r');
  });

  it('cómo colorea: el color propio de la foto se tiñe; la paleta, por un factor', () => {
    const e = normOptics({ kind: 'esfera' });
    expect(glassColourMode(e, 'source', 'media', false)).toBe(1);
    expect(glassColourMode(e, 'ramp', 'media', false)).toBe(2);
    expect(glassColourMode(e, 'source', 'pattern', true)).toBe(1);
    expect(glassColourMode(e, 'source', 'text', false)).toBe(2);
    expect(glassColourMode(normOptics({ kind: 'lluvia' }), 'ramp', 'pattern', false)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* The basic engine's field and select with a solid in front           */
/* ------------------------------------------------------------------ */

const COLS = 64, ROWS = 36, CW = 10, CH = 10, W = COLS * CW, H = ROWS * CH;

function render(r: Recipe, t = 1) {
  const n = COLS * ROWS, F = new FieldBuffers(n), S = new SelectBuffers(n);
  const opCol = glassColourMode(r.optics, r.color.mode, 'pattern', false);
  runField({
    W, H, cw: CW, ch: CH, cols: COLS, rows: ROWS, time: t, loop: 0, layers: fieldLayers(r, W, H),
    warp: 0, warpScale: 1, pulse: 0, src: 'pattern', mediaMix: 0, mediaBlend: 0, morph: 0, media: null, fit: 0, zoom: 1,
    panX: 0, panY: 0, mirror: false, text: null, imode: 0, ptrX: -1e4, ptrY: -1e4, ptrOn: 0, istr: 0, irad: 0.2, sim: null,
    optics: r.optics ? opticsUniforms(r.optics, t, 0) : null, opCol,
  }, F);
  runSelect({
    cols: COLS, rows: ROWS, time: t, r, fa: F.a, fr: F.r, fg: F.g, fb: F.b, isMedia: false,
    grad: bakeGradient(r.color.stops), n: 10, edgeBase: 10, blockIdx: 14, words: Uint16Array.of(30),
    msg: { on: false, mode: 0, prog: 0, win: 6, shift: 0, data: new Uint8Array(4), width: 1, cursorX: -9, cursorY: -9, cursorOn: false, color: null },
    imode: 0, ptrCellX: -1e4, ptrCellY: -1e4, ptrOn: 0, istr: 0, iradCells: 1, aspect: 1, glassCol: opCol === 2,
  }, S);
  return { F, S };
}

describe('vidrio en sólidos sobre el patrón (motor básico)', () => {
  const base = () => {
    const r = defaultRecipe();
    // light at the top, dark at the bottom, still
    r.layers = [{ ...DEFAULT_LAYER, pattern: 'degradado', a: 0.25, b: 0, speed: 0 }];
    r.interact.mode = 'none';
    r.color.stops = ['#000000', '#ffffff'];
    return r;
  };
  const col = (c: number) => (r: number) => r * COLS + c;

  it('la esfera invierte el degradado de detrás: dentro, abajo es claro y arriba oscuro', () => {
    const r = base();
    r.optics = normOptics({ kind: 'esfera', speed: 0, scale: 1.4, shine: 0 })!;
    const { F } = render(r);
    const at = col(COLS / 2);
    const inTop = F.a[at(ROWS / 2 - 6)], inBottom = F.a[at(ROWS / 2 + 6)];
    expect(inBottom).toBeGreaterThan(inTop + 40);
    const plain = render(base()).F;
    expect(plain.a[at(ROWS / 2 - 6)]).toBeGreaterThan(plain.a[at(ROWS / 2 + 6)] + 40);
  });

  it('con un patrón de un solo tono, la dispersión tiñe de color los bordes que cruzan el vidrio', () => {
    const r = base();
    r.layers = [{ ...DEFAULT_LAYER, pattern: 'franjas', a: 0.3, b: 0.5, speed: 0 }];
    r.optics = normOptics({ kind: 'esfera', speed: 0, scale: 1.4, shine: 0, disp: 1 })!;
    const { F, S } = render(r);
    let coloured = 0, outsideNeutral = true;
    for (let i = 0; i < COLS * ROWS; i++) {
      const spread = Math.max(F.r[i], F.g[i], F.b[i]) - Math.min(F.r[i], F.g[i], F.b[i]);
      if (spread > 30) coloured++;
      const x = (i % COLS) * CW - W / 2, y = Math.floor(i / COLS) * CH - H / 2;
      if (Math.hypot(x, y) > 0.6 * H && (F.r[i] !== 128 || F.g[i] !== 128 || F.b[i] !== 128)) outsideNeutral = false;
    }
    expect(coloured).toBeGreaterThan(20);
    expect(outsideNeutral).toBe(true);
    // the select pass turns the palette's grey into colour where the field says so
    let tinted = 0;
    for (let i = 0; i < COLS * ROWS; i++) {
      const o = i * 3, s = Math.max(S.rgb[o], S.rgb[o + 1], S.rgb[o + 2]) - Math.min(S.rgb[o], S.rgb[o + 1], S.rgb[o + 2]);
      if (s > 30) tinted++;
    }
    expect(tinted).toBeGreaterThan(10);
    // without dispersion nothing gets a colour of its own
    r.optics = normOptics({ kind: 'esfera', speed: 0, scale: 1.4, shine: 0 })!;
    const plain = render(r).F;
    for (let i = 0; i < COLS * ROWS; i++) expect([plain.r[i], plain.g[i], plain.b[i]]).toEqual([128, 128, 128]);
  });

  it('vidrio teñido: el color del tinte, más oscuro donde el vidrio es grueso, y su cuerpo por la opacidad', () => {
    const r = base();
    r.layers = [{ ...DEFAULT_LAYER, pattern: 'degradado', a: 0, b: 0, speed: 0, mix: 0 }];
    r.layers[0].mix = 1;
    r.optics = normOptics({ kind: 'esfera', speed: 0, scale: 1.4, shine: 0, tint: '#e0a040' })!;
    const clear = render(r);
    const centre = (ROWS / 2) * COLS + COLS / 2;
    expect(clear.F.r[centre]).toBeGreaterThan(clear.F.b[centre] + 40);
    r.optics = normOptics({ kind: 'esfera', speed: 0, scale: 1.4, shine: 0, tint: '#e0a040', fog: 1 })!;
    const opaque = render(r).F;
    // fully opaque: the cell shows the glass's lit body, whatever is behind
    const r2 = base();
    r2.optics = r.optics;
    expect(Math.abs(render(r2).F.a[centre] - opaque.a[centre])).toBeLessThanOrEqual(1);
  });
});

/* ------------------------------------------------------------------ */
/* I-22 anamorphic flare                                               */
/* ------------------------------------------------------------------ */

describe('destello anamórfico (I-22)', () => {
  const C = 61, R = 31;
  const oneLight = () => {
    const s = new SelectBuffers(C * R);
    const i = 15 * C + 30;
    s.rgb[i * 3] = s.rgb[i * 3 + 1] = s.rgb[i * 3 + 2] = 255; s.lum[i] = 255;
    return s;
  };
  const sum = (b: Float32Array, i: number) => b[i * 3] + b[i * 3 + 1] + b[i * 3 + 2];

  it('una luz deja una estela horizontal mucho más larga que alta (el halo redondo no)', () => {
    const out = new Float32Array(C * R * 3), tmp = new Float32Array(C * R * 3);
    blurGridAnamorphic(oneLight(), C, R, 1, 1.5, out, tmp);
    let wide = 0, tall = 0;
    for (let c = 0; c < C; c++) if (sum(out, 15 * C + c) > 0.01) wide++;
    for (let r = 0; r < R; r++) if (sum(out, r * C + 30) > 0.01) tall++;
    expect(wide).toBeGreaterThan(30);
    expect(wide).toBeGreaterThan(tall * 3);
    const round = new Float32Array(C * R * 3);
    blurGrid(oneLight(), C, R, 1, round, new Float32Array(C * R * 3));
    let rw = 0, rt = 0;
    for (let c = 0; c < C; c++) if (sum(round, 15 * C + c) > 0.01) rw++;
    for (let r = 0; r < R; r++) if (sum(round, r * C + 30) > 0.01) rt++;
    expect(Math.abs(rw - rt)).toBeLessThanOrEqual(2);
  });

  it('el rojo se va a un lado y el azul al otro; un anillo de desenfoque rodea la luz', () => {
    const out = new Float32Array(C * R * 3);
    blurGridAnamorphic(oneLight(), C, R, 1, 1.5, out, new Float32Array(C * R * 3));
    let redR = 0, redL = 0, blueR = 0, blueL = 0;
    for (let c = 0; c < C; c++) {
      const o = (15 * C + c) * 3;
      if (c > 30) { redR += out[o]; blueR += out[o + 2]; } else if (c < 30) { redL += out[o]; blueL += out[o + 2]; }
    }
    expect(redR).toBeGreaterThan(redL);
    expect(blueL).toBeGreaterThan(blueR);
    // the ring: R = 2 + 2 · step cells across (step 2 at bloom 1), rows R / aspect above and below
    const ringTop = sum(out, (15 - 4) * C + 30), between = sum(out, (15 - 2) * C + 30);
    expect(ringTop).toBeGreaterThan(between);
    // nothing but the lights: a dim cell leaves no trace
    const dim = new SelectBuffers(C * R);
    dim.rgb.fill(80); dim.lum.fill(80);
    const none = new Float32Array(C * R * 3);
    blurGridAnamorphic(dim, C, R, 1, 1.5, none, new Float32Array(C * R * 3));
    expect(Math.max(...none)).toBe(0);
  });

  it('el sombreador tiene sus dos pasos y su anillo', () => {
    expect(ANAMORPHIC_FS).toContain('uPass == 0');
    expect(ANAMORPHIC_FS).toContain('k < 24');
  });
});

/* ------------------------------------------------------------------ */
/* I-27 paper                                                           */
/* ------------------------------------------------------------------ */

describe('grano de papel (I-27)', () => {
  const PW = 200, PH = 120;

  it('es una hoja quieta: la misma en cada fotograma, con fibras y grano', () => {
    const a = paperField(PW, PH, 10, 0);
    const copy = Int16Array.from(a);
    expect(paperField(PW, PH, 10, 0)).toBe(a);
    let mn = 0, mx = 0;
    for (const v of copy) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
    expect(mx - mn).toBeGreaterThan(200);
    // grain on frames at two different times: the same pixels (it does not move)
    const frameAt = (realT: number) => {
      const px = new Uint32Array(PW * PH).fill(0xff808080);
      grainPass({ W: PW, H: PH, fx: { ...defaultRecipe().fx, grain: 0.8 }, transparent: false, realT } as unknown as ComposeFrame, px, copy);
      return px;
    };
    expect(Array.from(frameAt(1))).toEqual(Array.from(frameAt(7.3)));
    expect(Array.from(frameAt(1))).not.toEqual(Array.from(new Uint32Array(PW * PH).fill(0xff808080)));
  });

  it('los pliegues: una línea oscura a lo largo de cada uno, un lado más claro que el otro', () => {
    const plain = Int16Array.from(paperField(PW, PH, 10, 0));
    const four = Int16Array.from(paperField(PW, PH, 10, 1));
    // the vertical crease of «en cuatro» runs down the middle column
    let line = 0, left = 0, right = 0;
    for (let y = 0; y < PH; y++) {
      const o = y * PW;
      line += four[o + PW / 2] - plain[o + PW / 2];
      left += four[o + PW / 2 - 6] - plain[o + PW / 2 - 6];
      right += four[o + PW / 2 + 6] - plain[o + PW / 2 + 6];
    }
    expect(line / PH).toBeLessThan(-40);
    expect(Math.sign(left)).not.toBe(Math.sign(right));
    // crumpled: facets of their own all over the sheet
    const crumpled = Int16Array.from(paperField(PW, PH, 10, 4));
    let diff = 0;
    for (let i = 0; i < crumpled.length; i++) diff += Math.abs(crumpled[i] - plain[i]);
    expect(diff / crumpled.length).toBeGreaterThan(10);
  });

  it('el sombreador del papel conoce los cuatro pliegues', () => {
    for (const k of ['uFold == 1', 'uFold == 2', 'uFold == 3', 'uFold == 4']) expect(PAPER_FS).toContain(k);
  });
});

/* ------------------------------------------------------------------ */
/* I-20 calligraphic brush                                             */
/* ------------------------------------------------------------------ */

describe('pincel caligráfico (I-20)', () => {
  it('ancho según la velocidad: ancho despacio, fino deprisa; seco sólo deprisa', () => {
    expect(brushWidth(0)).toBeCloseTo(1.35);
    expect(brushWidth(3)).toBeCloseTo(0.3);
    for (let v = 0; v < 2; v += 0.1) expect(brushWidth(v + 0.1)).toBeLessThanOrEqual(brushWidth(v));
    expect(brushDry(0.5)).toBe(0);
    expect(brushDry(2.5)).toBe(1);
  });

  it('el fantasma escribe trazos, cada uno lento en sus extremos y rápido en medio, y levanta el pincel entre ellos', () => {
    let lifts = 0;
    for (let s = 0; s < 20; s += 0.05) if (!brushGhost(s).down) lifts++;
    expect(lifts).toBeGreaterThan(20);
    const speed = (s: number) => { const a = brushGhost(s), b = brushGhost(s + 0.01); return Math.hypot(b.x - a.x, b.y - a.y) / 0.01; };
    // stroke 3 starts at 3 · 1.6 s and lasts 1.15 s
    const t0 = 3 * 1.6;
    expect(speed(t0 + 0.57)).toBeGreaterThan(speed(t0 + 0.03) * 4);
    expect(speed(t0 + 0.57)).toBeGreaterThan(speed(t0 + 1.11) * 4);
    for (let s = 0; s < 30; s += 0.1) { const g = brushGhost(s); expect(g.x).toBeGreaterThan(0); expect(g.x).toBeLessThan(1); expect(g.y).toBeGreaterThan(0); expect(g.y).toBeLessThan(1); }
  });

  it('en la simulación: un trazo lento deja más tinta de ancho que uno rápido', () => {
    const across = (rFactor: number, dry: number) => {
      const g = new SimGrid(); g.resize(60, 40);
      g.step(7, 10, 10, [100, 200, 500, 200], 30 * rFactor, 0.9, 1, 0, 1 / 60, 0.5, { r0: 30 * rFactor, dry, bleed: 0 });
      let n = 0;
      for (let r = 0; r < 40; r++) if (g.tr[r * 60 + 30] > 0.3) n++;
      return n;
    };
    expect(across(brushWidth(0.1), brushDry(0.1))).toBeGreaterThan(across(brushWidth(2), brushDry(2)) + 2);
  });

  it('la tinta se corre por el papel con el tiempo (sangrado), y sin sangrado no', () => {
    const run = (bleed: number) => {
      const g = new SimGrid(); g.resize(60, 40);
      g.step(7, 10, 10, [100, 200, 500, 200], 25, 0.9, 1, 0, 1 / 60, 0.85, { r0: 25, dry: 0, bleed });
      const first = Float32Array.from(g.tr);
      for (let k = 0; k < 90; k++) g.step(7, 10, 10, [-1e4, -1e4, -1e4, -1e4], 25, 0.9, 0, 0, 1 / 60, 0.85, { r0: 25, dry: 0, bleed });
      let grown = 0;
      for (let i = 0; i < first.length; i++) if (first[i] < 0.05 && g.tr[i] > 0.1) grown++;
      return grown;
    };
    expect(run(0.8)).toBeGreaterThan(20);
    expect(run(0)).toBe(0);
  });

  it('el pincel redondo de siempre no cambia (sin trazo caligráfico)', () => {
    const g = new SimGrid(); g.resize(30, 20);
    g.step(7, 10, 10, [50, 100, 250, 100], 20, 0.5, 1, 0, 1 / 60, 0.5);
    // the old formula: exp(-dd² · 2.5) · active · (0.4 + str · 0.8), the cell 5 px off the segment
    expect(g.tr[10 * 30 + 15]).toBeCloseTo(Math.exp(-(0.25 ** 2) * 2.5) * (0.4 + 0.5 * 0.8), 5);
    expect(isCalligraphy(normInteract({ mode: 'paint' }))).toBe(false);
    expect(isCalligraphy(normInteract({ mode: 'paint', stroke: 'caligrafia' }))).toBe(true);
    // the ink stays longer than Pincel's trail
    const it0 = normInteract({ mode: 'paint', decay: 0.5 }), it1 = normInteract({ mode: 'paint', decay: 0.5, stroke: 'caligrafia' });
    expect(simSettle(it1)).toBeGreaterThan(simSettle(it0) * 2);
    expect(SIM_FS).toContain('uStroke == 1');
  });
});
