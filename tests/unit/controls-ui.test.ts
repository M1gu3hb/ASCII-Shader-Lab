import { describe, expect, it } from 'vitest';
import { BLEND_NAMES, CHARSETS, COLOR_MAP_NAMES, FONTS, GLYPH_MODE_NAMES, INTERACT_NAMES, MSG_MODE_NAMES, PATTERNS, SOURCE_NAMES } from '../../src/engine/catalog';
import { GLSL_BLEND } from '../../src/engine/glsl/core';
import { BLENDS, type BlendMode } from '../../src/engine/recipe';
import { blendIndex, blendValue } from '../../src/studio/ui/blend';
import {
  BLEND_DESC, COLOR_MAP_DESC, DITHER_DESC, FIT_DESC, FONT_DESC, GLYPH_MODE_DESC, GLYPH_MODE_ICON, HELP, INTERACT_DESC, INTERACT_ICON, MSG_MODE_DESC, MSG_MODE_ICON,
  PATTERN_DESC, SOURCE_DESC, helpFor,
} from '../../src/studio/ui/copy';
import { fold, nextIndex, typeAhead } from '../../src/studio/ui/rowMath';

describe('filas y listas: teclado', () => {
  it('← → recorren una fila (dando la vuelta), Inicio y Fin saltan a los extremos', () => {
    expect(nextIndex('ArrowRight', 0, 7)).toBe(1);
    expect(nextIndex('ArrowRight', 6, 7)).toBe(0);
    expect(nextIndex('ArrowLeft', 0, 7)).toBe(6);
    expect(nextIndex('Home', 4, 7)).toBe(0);
    expect(nextIndex('End', 1, 7)).toBe(6);
    // ↑ ↓ only move in vertical groups (radio groups); in a tab row they are left to the page
    expect(nextIndex('ArrowDown', 2, 7)).toBeNull();
    expect(nextIndex('ArrowDown', 2, 7, true)).toBe(3);
    expect(nextIndex('ArrowUp', 0, 7, true)).toBe(6);
    expect(nextIndex('a', 0, 7)).toBeNull();
    expect(nextIndex('ArrowRight', 0, 0)).toBeNull();
  });

  it('escribir salta a la opción que empieza así, sin mayúsculas ni tildes; una letra repetida recorre las que empiezan por ella', () => {
    const labels = ['Clásico', 'Detallado', 'Suave', 'Mínimo', 'Bloques', 'Medios bloques', 'Música'];
    expect(fold('Ámbar Mínimo')).toBe('ambar minimo');
    expect(typeAhead(labels, 'm', 0)).toBe(3);
    expect(typeAhead(labels, 'm', 3)).toBe(5);
    expect(typeAhead(labels, 'mm', 5)).toBe(6);
    expect(typeAhead(labels, 'mu', 0)).toBe(6);
    // a longer query keeps the current match while it still fits
    expect(typeAhead(labels, 'me', 5)).toBe(5);
    expect(typeAhead(labels, 'x', 0)).toBe(-1);
    // disabled options are skipped
    expect(typeAhead(labels, 'm', 0, i => i === 3)).toBe(5);
  });
});

describe('diagramas de mezcla', () => {
  it('cada modo usa el mismo índice que el shader', () => {
    // the shader's branches: `if (m == 1) r = a + b;` … in the order of BLENDS
    BLENDS.forEach((m, i) => expect(blendIndex(m), m).toBe(i));
    const lines = GLSL_BLEND.split('\n').filter(l => /m == \d+/.test(l));
    expect(lines.length).toBe(BLENDS.length - 1);
  });

  it('las mezclas dan lo que dice su descripción', () => {
    const v = (m: BlendMode, a: number, b: number) => blendValue(m, a, b);
    expect(v('normal', 0.8, 0.3)).toBeCloseTo(0.3);
    expect(v('add', 0.6, 0.6)).toBe(1);
    expect(v('multiply', 0.5, 0.5)).toBeCloseTo(0.25);
    expect(v('screen', 0.5, 0.5)).toBeCloseTo(0.75);
    expect(v('difference', 0.8, 0.8)).toBeCloseTo(0);
    expect(v('lighten', 0.2, 0.7)).toBeCloseTo(0.7);
    expect(v('darken', 0.2, 0.7)).toBeCloseTo(0.2);
    // mask: below shows only where this layer is bright; cutout: the opposite
    expect(v('mask', 0.8, 1)).toBeCloseTo(0.8);
    expect(v('mask', 0.8, 0)).toBeCloseTo(0);
    expect(v('cutout', 0.8, 1)).toBeCloseTo(0);
    expect(v('cutout', 0.8, 0)).toBeCloseTo(0.8);
    expect(v('subtract', 0.8, 0.3)).toBeCloseTo(0.5);
  });
});

describe('textos de los controles', () => {
  it('cada opción de cada lista tiene su línea (y los modos, su icono)', () => {
    for (const p of PATTERNS) expect(PATTERN_DESC[p.id], p.id).toMatch(/\S/);
    for (const k of Object.keys(BLEND_NAMES)) expect(BLEND_DESC[k as BlendMode], k).toMatch(/\S/);
    for (const k of Object.keys(COLOR_MAP_NAMES)) expect(COLOR_MAP_DESC[k as keyof typeof COLOR_MAP_DESC], k).toMatch(/\S/);
    for (const k of Object.keys(GLYPH_MODE_NAMES)) {
      expect(GLYPH_MODE_DESC[k as keyof typeof GLYPH_MODE_DESC], k).toMatch(/\S/);
      expect(GLYPH_MODE_ICON[k as keyof typeof GLYPH_MODE_ICON], k).toMatch(/\S/);
    }
    for (const k of Object.keys(INTERACT_NAMES)) {
      expect(INTERACT_DESC[k as keyof typeof INTERACT_DESC], k).toMatch(/\S/);
      expect(INTERACT_ICON[k as keyof typeof INTERACT_ICON], k).toMatch(/\S/);
    }
    for (const k of Object.keys(MSG_MODE_NAMES)) {
      expect(MSG_MODE_DESC[k as keyof typeof MSG_MODE_DESC], k).toMatch(/\S/);
      expect(MSG_MODE_ICON[k as keyof typeof MSG_MODE_ICON], k).toMatch(/\S/);
    }
    for (const k of Object.keys(SOURCE_NAMES)) expect(SOURCE_DESC[k as keyof typeof SOURCE_DESC], k).toMatch(/\S/);
    for (const f of FONTS) expect(FONT_DESC[f.id], f.id).toMatch(/\S/);
    expect(Object.keys(FIT_DESC).sort()).toEqual(['contain', 'cover', 'stretch']);
    expect(Object.keys(DITHER_DESC).sort()).toEqual(['bayer', 'noise']);
    expect(CHARSETS.length).toBeGreaterThan(10);
  });

  it('las pistas son de una línea corta, sin promesas universales, y las capas comparten las suyas', () => {
    for (const [k, h] of Object.entries(HELP)) {
      expect(h.hint.length, k).toBeLessThanOrEqual(90);
      expect(h.hint, k).toMatch(/[.:]$/);
      expect(`${h.hint} ${h.more ?? ''}`, k).not.toMatch(/\b(siempre|nunca|todos los navegadores|garantiza)\b/i);
    }
    expect(helpFor('layers.2.scale')).toBe(HELP['layers.*.scale']);
    expect(helpFor('glyph.aspect')?.hint).toMatch(/terminal/);
    expect(helpFor('nada.de.nada')).toBeUndefined();
  });
});
