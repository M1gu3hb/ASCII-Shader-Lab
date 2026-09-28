import { describe, expect, it } from 'vitest';
import { blockText } from '../../src/components/lib/blocktext.js';
import { bigNumber, loaderBar } from '../../src/components/lib/loader.js';

describe('Letras de bloque', () => {
  it('dos tipografías de cinco filas, iguales en cualquier parte (sin canvas)', () => {
    const g = blockText('HOLA', { font: 'grande' }).split('\n');
    const c = blockText('HOLA', { font: 'compacta' }).split('\n');
    expect(g).toHaveLength(5);
    expect(c).toHaveLength(5);
    expect(Math.max(...g.map(l => l.length))).toBeGreaterThan(Math.max(...c.map(l => l.length)));
    expect(blockText('HOLA', { font: 'grande' })).toBe(blockText('hola', { font: 'grande' }));
  });

  it('las tildes y la eñe llevan su marca en una fila de más; lo desconocido sale como «?»', () => {
    const n = blockText('AÑO').split('\n');
    const plain = blockText('ANO').split('\n');
    expect(n).toHaveLength(6);
    expect(n.slice(1)).toEqual(plain);
    expect(n[0].trim().length).toBeGreaterThan(0);
    expect(blockText('É').split('\n')).toHaveLength(6);
    expect(blockText('ß')).toBe(blockText('?'));
    // other accents fold to their letter
    expect(blockText('À')).toBe(blockText('A'));
  });

  it('estilos: bloques, sombra (una fila y una columna más), medios bloques (la mitad de alto), almohadilla', () => {
    const b = blockText('SI', { style: 'bloques' }).split('\n');
    const s = blockText('SI', { style: 'sombra' }).split('\n');
    const m = blockText('SI', { style: 'medios' }).split('\n');
    expect(s).toHaveLength(b.length + 1);
    expect(s.join('')).toMatch(/▒/);
    expect(m).toHaveLength(3);
    expect(m.join('')).toMatch(/[▀▄]/);
    expect(blockText('SI', { style: 'almohadilla' })).toMatch(/^[# \n]+$/);
    // no trailing spaces, several lines
    for (const l of blockText('A B\nC', { style: 'bloques' }).split('\n')) expect(l).toBe(l.trimEnd());
    expect(blockText('A\nB').split('\n')).toHaveLength(10);
  });
});

describe('Pantalla de carga', () => {
  it('la barra tiene su ancho, con precisión de subcarácter', () => {
    expect(loaderBar(0, 10)).toBe('··········');
    expect(loaderBar(1, 10)).toBe('██████████');
    expect(Array.from(loaderBar(0.55, 10))).toHaveLength(10);
    expect(loaderBar(0.55, 10).startsWith('█████')).toBe(true);
    expect(loaderBar(0.55, 10)[5]).not.toBe('·');
    expect(loaderBar(2, 4)).toBe('████');
  });
  it('los números grandes son de cinco filas', () => {
    const n = bigNumber('42%');
    expect(n).toHaveLength(5);
    expect(new Set(n.map(l => l.length)).size).toBe(1);
  });
});
