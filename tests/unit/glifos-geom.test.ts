import { describe, expect, it } from 'vitest';
import type { Contour, Pt } from '../../src/glifos/doc';
import { flattenContour } from '../../src/glifos/compile';
import { applyMatrix, parsePathData, parseTransform } from '../../src/glifos/geom/svgpath';
import { importSvg } from '../../src/glifos/geom/svgimport';
import { bboxOf, mirrorX, mirrorY, normalizeOrientation, pathOp, reverseContour, rotateAbout, scaleAbout, signedArea, skewX, transformContours, translate, unionAll } from '../../src/glifos/geom/ops';
import { fitCurve, simplify } from '../../src/glifos/geom/fit';
import { traceBitmap } from '../../src/glifos/geom/trace';
import { strokePolyline } from '../../src/glifos/geom/stroke';

/**
 * Geometry of «Crea tus GLYPHOS»: SVG paths and transforms, safe SVG import, boolean operations, curve
 * fitting, tracing and stroking.
 */

const area = (cs: Contour[]) => cs.reduce((s, c) => s + signedArea(c), 0);
const polyArea = (p: Pt[]) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; } return s / 2; };
const square = (x: number, y: number, s: number) => parsePathData(`M${x} ${y}h${s}v${s}h${-s}z`);
const near = (a: number, b: number, rel: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.abs(b) * rel);
const TARGET = { upm: 1000, asc: 800, desc: -200, height: 700 };

describe('svgpath: datos de trazo SVG', () => {
  it('lee todos los comandos, absolutos y relativos, con el mismo resultado', () => {
    const abs = 'M10 10 L30 10 H50 V30 C50 40 60 50 70 50 S90 60 90 70 Q90 90 70 90 T50 110 A20 20 0 0 1 30 90 Z';
    const rel = 'm10 10 l20 0 h20 v20 c0 10 10 20 20 20 s20 10 20 20 q0 20 -20 20 t-20 20 a20 20 0 0 1 -20 -20 z';
    const a = parsePathData(abs), r = parsePathData(rel);
    expect(a).toHaveLength(1);
    expect(a[0].closed).toBe(true);
    expect(r[0].nodes.length).toBe(a[0].nodes.length);
    a[0].nodes.forEach((n, i) => {
      const m = r[0].nodes[i];
      expect(m.x).toBeCloseTo(n.x, 6);
      expect(m.y).toBeCloseTo(n.y, 6);
      expect(!!m.ho).toBe(!!n.ho);
      if (n.ho) { expect(m.ho!.x).toBeCloseTo(n.ho.x, 6); expect(m.ho!.y).toBeCloseTo(n.ho.y, 6); }
    });
    // S reflects the previous control point; T the previous quadratic one
    const s = parsePathData('M0 0 C0 10 10 10 10 0 S20 -10 20 0');
    expect(s[0].nodes[1].ho).toEqual({ x: 10, y: -10 });
    const q = parsePathData('M0 0 Q10 10 20 0');
    expect(q[0].nodes[0].ho!.x).toBeCloseTo(20 / 3, 9);
    expect(q[0].nodes[0].ho!.y).toBeCloseTo(20 / 3, 9);
  });

  it('un círculo hecho con arcos tiene el área de un círculo (±1 %)', () => {
    const c = parsePathData('M 150 100 A 50 50 0 1 0 50 100 A 50 50 0 1 0 150 100 Z')[0];
    near(Math.abs(polyArea(flattenContour(c, 32))), Math.PI * 2500, 0.01);
    near(Math.abs(signedArea(c)), Math.PI * 2500, 0.01);
    // each arc is split into pieces of at most 90°
    expect(c.nodes.length).toBe(4);
    const b = bboxOf([c])!;
    expect(b.x0).toBeCloseTo(50, 3);
    expect(b.x1).toBeCloseTo(150, 3);
    // compact flags and a radius too small to reach the end point
    const e = parsePathData('M0 0a1 1 0 0010 0')[0];
    expect(e.nodes[e.nodes.length - 1].x).toBeCloseTo(10, 9);
  });

  it('acepta comandos implícitos y números compactos', () => {
    expect(parsePathData('M0 0 10 0 10 10')[0].nodes).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
    expect(parsePathData('m1 1 10 0 0 10')[0].nodes).toEqual([{ x: 1, y: 1 }, { x: 11, y: 1 }, { x: 11, y: 11 }]);
    expect(parsePathData('M.5.5L-1-2')[0].nodes).toEqual([{ x: 0.5, y: 0.5 }, { x: -1, y: -2 }]);
    expect(parsePathData('M1e-3,2E2 l1e1 0')[0].nodes).toEqual([{ x: 0.001, y: 200 }, { x: 10.001, y: 200 }]);
    // after Z a drawing command starts at the last start point
    const two = parsePathData('M0 0 h10 v10 z l5 5');
    expect(two).toHaveLength(2);
    expect(two[1].nodes[0]).toEqual({ x: 0, y: 0 });
    expect(parsePathData('')).toEqual([]);
  });

  it('rechaza datos mal formados con mensajes en español', () => {
    expect(() => parsePathData('L 10 10')).toThrow(/debe empezar con M/);
    expect(() => parsePathData('M 10')).toThrow(/le faltan números/);
    expect(() => parsePathData('M 0 0 L 1 x')).toThrow(/carácter no válido/);
    expect(() => parsePathData('M 0 0 A 1 1 0 2 0 5 5')).toThrow(/bandera de arco/);
    expect(() => parsePathData('M 0 0 K 1 1')).toThrow(/comando desconocido/);
    expect(() => parsePathData('M 0 0 L 1e999 0')).toThrow(/fuera de rango/);
  });

  it('rechaza trazos con más comandos que el límite', () => {
    const d = 'M0 0' + ' L1 1'.repeat(60);
    expect(() => parsePathData(d, { commands: 50 })).toThrow(/más de 50 comandos/);
    expect(parsePathData(d, { commands: 100 })[0].nodes.length).toBeGreaterThan(1);
    expect(() => parsePathData('M0 0' + ' 1 1'.repeat(20_001))).toThrow(/más de 20 000 comandos/);
  });

  it('lee listas de transformaciones', () => {
    const p = applyMatrix(parseTransform('translate(10,20) scale(2)'), { x: 1, y: 1 });
    expect(p).toEqual({ x: 12, y: 22 });
    const r = applyMatrix(parseTransform('rotate(90 5 5)'), { x: 10, y: 5 });
    expect(r.x).toBeCloseTo(5, 9);
    expect(r.y).toBeCloseTo(10, 9);
    const k = applyMatrix(parseTransform('skewX(45)'), { x: 0, y: 10 });
    expect(k.x).toBeCloseTo(10, 9);
    expect(applyMatrix(parseTransform('matrix(1 0 0 1 3 4) skewY(0)'), { x: 0, y: 0 })).toEqual({ x: 3, y: 4 });
    expect(() => parseTransform('rotate(1, 2)')).toThrow(/no es válida/);
    expect(() => parseTransform('translate(1) explode(2)')).toThrow(/no es válida/);
  });
});

describe('svgimport: importación segura', () => {
  it('importa transformaciones anidadas y un agujero evenodd con la orientación y la altura pedidas', () => {
    const svg = `<?xml version="1.0"?><!-- dibujo --><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
      <g transform="translate(10 10)"><g transform="scale(2)">
        <path fill-rule="evenodd" d="M0 0H80V80H0Z M20 20H60V60H20Z"/>
      </g></g></svg>`;
    const r = importSvg(svg, TARGET);
    expect(r.contours).toHaveLength(2);
    const areas = r.contours.map(signedArea).sort((a, b) => b - a);
    expect(areas[0]).toBeGreaterThan(0);
    expect(areas[1]).toBeLessThan(0);
    near(-areas[1] / areas[0], 0.25, 0.01);
    const b = bboxOf(r.contours)!;
    expect(b.y0).toBeCloseTo(0, 6);
    expect(b.y1).toBeCloseTo(700, 6);
    expect(b.x0).toBeCloseTo(60, 6);
    expect(r.adv).toBe(820);
  });

  it('con reglas non-zero respeta la dirección del dibujo y voltea y (SVG hacia abajo → fuente hacia arriba)', () => {
    // a triangle pointing down in SVG must point up... no: SVG y grows downwards, so its tip ends at the bottom
    const r = importSvg('<svg viewBox="0 0 100 100"><path d="M0 0 L100 0 L50 100 Z"/></svg>', TARGET);
    expect(r.contours).toHaveLength(1);
    expect(signedArea(r.contours[0])).toBeGreaterThan(0);
    const tip = r.contours[0].nodes.reduce((a, n) => (n.y < a.y ? n : a));
    expect(tip.y).toBeCloseTo(0, 6);
    // same-direction squares under nonzero: the inner one is not a hole
    const nz = importSvg('<svg viewBox="0 0 100 100"><path d="M0 0H90V90H0Z M20 20H60V60H20Z"/></svg>', TARGET);
    expect(nz.contours.every(c => signedArea(c) > 0)).toBe(true);
    const eo = importSvg('<svg viewBox="0 0 100 100"><path fill-rule="evenodd" d="M0 0H90V90H0Z M20 20H60V60H20Z"/></svg>', TARGET);
    expect(eo.contours.filter(c => signedArea(c) < 0)).toHaveLength(1);
  });

  it('un viewBox de un eme conserva la escala y la posición', () => {
    const r = importSvg('<svg viewBox="0 0 600 1000"><rect x="100" y="100" width="100" height="800"/></svg>', TARGET);
    const b = bboxOf(r.contours)!;
    expect(b.y1).toBeCloseTo(700, 6);
    expect(b.y0).toBeCloseTo(-100, 6);
    expect(b.x0).toBeCloseTo(100, 6);
    expect(r.adv).toBe(600);
  });

  it('ignora script, foreignObject, image, use, defs y atributos on*', () => {
    const svg = `<svg viewBox="0 0 100 100" onload="alert(1)">
      <script>alert('x')</script><script><![CDATA[ alert("<path d='M0 0H9V9Z'/>") ]]></script>
      <foreignObject width="100" height="100"><path d="M0 0H50V50Z"/></foreignObject>
      <image href="x.png" width="100" height="100"/>
      <defs><path id="a" d="M0 0H100V100Z"/></defs><use href="#a"/>
      <symbol id="s"><rect width="50" height="50"/></symbol>
      <a href="https://example.com"><rect width="50" height="50"/></a>
      <rect x="0" y="0" width="10" height="20" onclick="alert(2)" style="fill:red"/>
    </svg>`;
    const r = importSvg(svg, TARGET);
    expect(r.contours).toHaveLength(1);
    const b = bboxOf(r.contours)!;
    // only the 10 × 20 rect: scaled to height 700, width 350
    expect(b.x1 - b.x0).toBeCloseTo(350, 6);
    expect(r.warnings.join(' ')).toMatch(/Se ignoraron elementos que no son formas/);
    expect(r.warnings.join(' ')).toMatch(/script/);
  });

  it('convierte en contorno un trazo sin relleno con grosor y omite formas sin relleno ni trazo', () => {
    const r = importSvg('<svg viewBox="0 0 100 100"><line x1="0" y1="50" x2="100" y2="50" stroke="#000" stroke-width="10"/><circle cx="50" cy="50" r="20" fill="none"/></svg>', TARGET);
    expect(r.contours).toHaveLength(1);
    const b = bboxOf(r.contours)!;
    near((b.x1 - b.x0) / (b.y1 - b.y0), 10, 0.01);
  });

  it('rechaza DOCTYPE y ENTITY', () => {
    expect(() => importSvg('<!DOCTYPE svg [<!ENTITY a "aaaa">]><svg><path d="M0 0H1V1Z"/></svg>', TARGET)).toThrow(/DOCTYPE/);
    expect(() => importSvg('<svg><!ENTITY lol "lol"><path d="M0 0H1V1Z"/></svg>', TARGET)).toThrow(/entidades/);
    expect(() => importSvg('<svg><!doctype html></svg>', TARGET)).toThrow(/DOCTYPE/);
  });

  it('decodifica sólo las entidades XML y las referencias numéricas', () => {
    const r = importSvg('<svg viewBox="0 0 10 10"><path d="M0&#32;0H10V10H0Z"/></svg>', TARGET);
    expect(r.contours).toHaveLength(1);
    expect(() => importSvg('<svg viewBox="0 0 10 10"><path d="M0 0H10&foo;V10Z"/></svg>', TARGET)).toThrow(/trazo de un <path>/);
  });

  it('rechaza archivos de más de 1 MB, más de 5 000 elementos o anidados de más', () => {
    expect(() => importSvg('<svg>' + ' '.repeat(1_100_000) + '</svg>', TARGET)).toThrow(/más de 1 MB/);
    expect(() => importSvg('<svg>' + '<g/>'.repeat(5001) + '</svg>', TARGET)).toThrow(/más de 5 000 elementos/);
    expect(() => importSvg('<svg>' + '<g>'.repeat(40) + '</g>'.repeat(40) + '</svg>', TARGET)).toThrow(/más de 32 niveles/);
    expect(() => importSvg('<svg><g></svg>', TARGET)).toThrow(/mal formado/);
    expect(() => importSvg('<html></html>', TARGET)).toThrow(/no es un SVG/);
  });
});

describe('ops: cajas, transformaciones y operaciones de trazo', () => {
  it('la caja incluye los extremos de las curvas, no sólo los manejadores', () => {
    const c: Contour = { closed: true, nodes: [{ x: 0, y: 0, ho: { x: 0, y: 100 } }, { x: 100, y: 0, hi: { x: 100, y: 100 } }] };
    const b = bboxOf([c])!;
    expect(b.y1).toBeCloseTo(75, 9);
    expect(b.x0).toBe(0);
    expect(bboxOf([])).toBeNull();
  });

  it('reflejar mantiene el área positiva (el contorno se invierte)', () => {
    const sq = square(0, 0, 100);
    expect(area(sq)).toBeGreaterThan(0);
    for (const m of [mirrorX(50), mirrorY(50)]) {
      const r = transformContours(sq, m);
      expect(area(r)).toBeCloseTo(10_000, 6);
    }
    expect(area(transformContours(sq, scaleAbout(2, 3, 0, 0)))).toBeCloseTo(60_000, 6);
    expect(area(transformContours(sq, rotateAbout(30, 50, 50)))).toBeCloseTo(10_000, 6);
    expect(area(transformContours(sq, skewX(20, 0)))).toBeCloseTo(10_000, 6);
    expect(bboxOf(transformContours(sq, translate(5, -5)))).toEqual({ x0: 5, y0: -5, x1: 105, y1: 95 });
    expect(signedArea(reverseContour(sq[0]))).toBeCloseTo(-10_000, 9);
  });

  it('normaliza la orientación: exteriores antihorarios, agujeros horarios', () => {
    const outer = reverseContour(square(0, 0, 100)[0]), inner = square(25, 25, 50)[0];
    const n = normalizeOrientation([outer, inner]);
    expect(signedArea(n[0])).toBeGreaterThan(0);
    expect(signedArea(n[1])).toBeLessThan(0);
  });

  it('unir, restar, intersecar y excluir dos cuadrados dan las áreas esperadas (±1 %)', () => {
    const a = square(0, 0, 100), b = square(50, 50, 100);
    near(area(pathOp(a, b, 'unir')), 17_500, 0.01);
    near(area(pathOp(a, b, 'restar')), 7_500, 0.01);
    near(area(pathOp(a, b, 'intersecar')), 2_500, 0.01);
    near(area(pathOp(a, b, 'excluir')), 15_000, 0.01);
    expect(pathOp([], b, 'unir')).toHaveLength(1);
    expect(pathOp(a, [], 'intersecar')).toEqual([]);
  });

  it('restar un círculo de un cuadrado deja un agujero', () => {
    const circle = parsePathData('M 130 100 A 30 30 0 1 0 70 100 A 30 30 0 1 0 130 100 Z');
    const r = pathOp(square(0, 0, 200), circle, 'restar');
    expect(r).toHaveLength(2);
    const holes = r.filter(c => signedArea(c) < 0);
    expect(holes).toHaveLength(1);
    near(-signedArea(holes[0]), Math.PI * 900, 0.01);
    near(area(r), 40_000 - Math.PI * 900, 0.01);
  });

  it('unionAll quita los solapamientos de un glifo (contornos que se pisan cuentan una vez)', () => {
    const r = unionAll([...square(0, 0, 100), ...square(50, 0, 100)]);
    expect(r).toHaveLength(1);
    near(area(r), 15_000, 0.01);
  });
});

describe('fit: simplificación y ajuste de curvas', () => {
  it('ajustar puntos de un círculo queda dentro de la tolerancia', () => {
    const pts = Array.from({ length: 240 }, (_, k) => ({ x: 100 * Math.cos((k * Math.PI) / 120), y: 100 * Math.sin((k * Math.PI) / 120) }));
    const c = fitCurve(pts, true, 0.5);
    expect(c.closed).toBe(true);
    expect(c.nodes.length).toBeLessThanOrEqual(10);
    for (const p of flattenContour(c, 24)) expect(Math.abs(Math.hypot(p.x, p.y) - 100)).toBeLessThan(0.6);
    expect(c.nodes.every(n => n.smooth)).toBe(true);
  });

  it('las esquinas de un cuadrado se conservan como esquinas', () => {
    const pts: Pt[] = [];
    for (const [ax, ay, bx, by] of [[0, 0, 100, 0], [100, 0, 100, 100], [100, 100, 0, 100], [0, 100, 0, 0]]) for (let k = 0; k < 25; k++) pts.push({ x: ax + ((bx - ax) * k) / 25, y: ay + ((by - ay) * k) / 25 });
    // start in the middle of an edge: the closed loop must still start at a corner
    const c = fitCurve([...pts.slice(10), ...pts.slice(0, 10)], true, 0.5);
    expect(c.nodes).toHaveLength(4);
    expect(c.nodes.every(n => !n.hi && !n.ho && !n.smooth)).toBe(true);
    expect(c.nodes.map(n => `${n.x},${n.y}`).sort()).toEqual(['0,0', '0,100', '100,0', '100,100']);
  });

  it('no deforma polígonos con pocos vértices (los lados largos también cuentan)', () => {
    const ring = [[0, 0], [90, 0], [90, 154], [171, 226], [377, 0], [493, 0], [235, 283], [478, 500], [352, 500], [90, 266], [90, 750], [0, 750]].map(([x, y]) => ({ x, y }));
    near(signedArea(fitCurve(ring, true, 0.6)), polyArea(ring), 0.002);
  });

  it('maneja entradas mínimas y simplifica polilíneas', () => {
    expect(fitCurve([{ x: 1, y: 2 }], false, 1).nodes).toEqual([{ x: 1, y: 2 }]);
    expect(fitCurve([{ x: 0, y: 0 }, { x: 5, y: 0 }], false, 1).nodes).toHaveLength(2);
    expect(fitCurve([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 5 }], true, 1).nodes).toHaveLength(3);
    expect(fitCurve([], true, 1).nodes).toEqual([]);
    const line = Array.from({ length: 50 }, (_, k) => ({ x: k, y: k % 2 ? 0.01 : 0 }));
    expect(simplify(line, 0.1, false)).toEqual([{ x: 0, y: 0 }, { x: 49, y: 0.01 }]);
    const sq = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    expect(simplify(sq, 0.1, true)).toHaveLength(4);
  });
});

describe('trace: vectorizar un mapa de bits', () => {
  const W = 140, H = 140;
  function ring(specks = false) {
    const ink = new Uint8Array(W * H);
    let outerPx = 0, holePx = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x + 0.5 - 70, y + 0.5 - 70);
      if (d < 55) { outerPx++; if (d < 28) holePx++; else ink[y * W + x] = 255; }
    }
    if (specks) for (const [x, y] of [[3, 3], [135, 4], [5, 133]]) ink[y * W + x] = 255;
    return { ink, outerPx, holePx };
  }

  it('un anillo da un contorno exterior antihorario y uno interior horario con el área del mapa (±3 %)', () => {
    const { ink, outerPx, holePx } = ring();
    const r = traceBitmap(ink, W, H, { threshold: 0.5, place: { x: 0, y: 700, s: 5 } });
    expect(r.contours).toHaveLength(2);
    const [a, b] = r.contours.map(signedArea).sort((p, q) => q - p);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeLessThan(0);
    near(a, outerPx * 25, 0.03);
    near(-b, holePx * 25, 0.03);
    const box = bboxOf(r.contours)!;
    // y up: the bitmap's top row is at y = 700
    expect(box.y1).toBeLessThanOrEqual(700);
    expect(box.y0).toBeGreaterThanOrEqual(0);
    expect(r.contours.reduce((n, c) => n + c.nodes.length, 0)).toBeLessThan(80);
  });

  it('quita las motas menores que minArea y avisa cuando corta por el límite de contornos', () => {
    const { ink } = ring(true);
    expect(traceBitmap(ink, W, H, { threshold: 0.5, place: { x: 0, y: 0, s: 1 }, minArea: 4 }).contours).toHaveLength(2);
    expect(traceBitmap(ink, W, H, { threshold: 0.5, place: { x: 0, y: 0, s: 1 }, minArea: 0 }).contours).toHaveLength(5);
    const cut = traceBitmap(ink, W, H, { threshold: 0.5, place: { x: 0, y: 0, s: 1 }, minArea: 0, maxContours: 2 });
    expect(cut.contours).toHaveLength(2);
    expect(cut.warnings[0]).toMatch(/se conservaron los 2 más grandes/);
  });
});

describe('stroke: trazos de pluma', () => {
  it('un trazo recto tiene área ≈ largo × grosor (±3 %)', () => {
    near(area(strokePolyline([{ x: 0, y: 0 }, { x: 400, y: 300 }], { width: 60 })), 500 * 60, 0.03);
    // round caps add a disc
    near(area(strokePolyline([{ x: 0, y: 0 }, { x: 500, y: 0 }], { width: 60, cap: 'redondo' })), 500 * 60 + Math.PI * 900, 0.03);
  });

  it('con contraste un trazo horizontal es más delgado que uno vertical', () => {
    const h = bboxOf(strokePolyline([{ x: 0, y: 0 }, { x: 500, y: 0 }], { width: 100, contrast: 0.3 }))!;
    const v = bboxOf(strokePolyline([{ x: 0, y: 0 }, { x: 0, y: 500 }], { width: 100, contrast: 0.3 }))!;
    expect(h.y1 - h.y0).toBeCloseTo(30, 6);
    expect(v.x1 - v.x0).toBeCloseTo(100, 6);
  });

  it('una curva más cerrada que la pluma no deja agujeros falsos', () => {
    const loop = Array.from({ length: 40 }, (_, k) => ({ x: 30 * Math.cos((k * Math.PI) / 20), y: 30 * Math.sin((k * Math.PI) / 20) }));
    const r = strokePolyline(loop, { width: 100, closed: true });
    expect(r).toHaveLength(1);
    near(area(r), Math.PI * 80 * 80, 0.02);
    const wide = Array.from({ length: 64 }, (_, k) => ({ x: 200 * Math.cos((k * Math.PI) / 32), y: 200 * Math.sin((k * Math.PI) / 32) }));
    const o = strokePolyline(wide, { width: 60, closed: true });
    expect(o).toHaveLength(2);
    near(area(o), Math.PI * (230 ** 2 - 170 ** 2), 0.01);
  });

  it('las uniones redondas y las cuñas cambian la forma sin romperla', () => {
    const L = [{ x: 0, y: 300 }, { x: 0, y: 0 }, { x: 300, y: 0 }];
    const sharp = bboxOf(strokePolyline(L, { width: 60, join: 'inglete' }))!, round = strokePolyline(L, { width: 60, join: 'redondo' });
    expect(sharp.x0).toBeCloseTo(-30, 6);
    expect(sharp.y0).toBeCloseTo(-30, 6);
    expect(area(round)).toBeLessThan(area(strokePolyline(L, { width: 60, join: 'inglete' })));
    const wedge = bboxOf(strokePolyline([{ x: 0, y: 0 }, { x: 0, y: 500 }], { width: 60, cap: 'cuna' }))!;
    expect(wedge.x1 - wedge.x0).toBeGreaterThan(70);
    expect(strokePolyline([], { width: 10 })).toEqual([]);
  });
});
