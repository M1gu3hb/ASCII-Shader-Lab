import { describe, expect, it } from 'vitest';
import { decimalsOf, liveValue, parseTyped, rangeHint, settle, showNumber, snapTo } from '../../src/studio/ui/numberMath';

describe('campos de número: lo que se escribe', () => {
  it('lee números con coma o punto, con signo, y con la unidad con que se muestran', () => {
    expect(parseTyped('12')).toBe(12);
    expect(parseTyped(' 12,5 ')).toBe(12.5);
    expect(parseTyped('-0,3')).toBe(-0.3);
    expect(parseTyped('−2')).toBe(-2);
    expect(parseTyped('+4')).toBe(4);
    expect(parseTyped('.5')).toBe(0.5);
    expect(parseTyped('1.')).toBe(1);
    expect(parseTyped('11 px')).toBe(11);
    expect(parseTyped('72 %')).toBe(72);
    expect(parseTyped('90°')).toBe(90);
    expect(parseTyped('1,5×')).toBe(1.5);
    expect(parseTyped('1.200,5')).toBe(1200.5);
  });

  it('vacío o a medio escribir no es un número (y nunca lanza)', () => {
    for (const t of ['', ' ', '-', '+', '.', ',', 'abc', 'quietos', '1-2', '--3', '1e3']) expect(parseTyped(t), JSON.stringify(t)).toBeNull();
    expect(parseTyped(undefined as unknown as string)).toBeNull();
  });

  it('mientras se escribe sólo se aplica un número que ya está en el rango: «3» camino de «300» espera', () => {
    expect(liveValue('3', 10, 300)).toBeNull();
    expect(liveValue('30', 10, 300)).toBe(30);
    expect(liveValue('300', 10, 300)).toBe(300);
    expect(liveValue('3000', 10, 300)).toBeNull();
    expect(liveValue('', 10, 300)).toBeNull();
  });

  it('al terminar: se mete en el rango, cae en su paso, y lo vacío deja el valor que había', () => {
    expect(settle('3000', 80, 10, 300)).toEqual({ value: 300, kind: 'clamped' });
    expect(settle('2', 80, 10, 300)).toEqual({ value: 10, kind: 'clamped' });
    expect(settle('', 80, 10, 300)).toEqual({ value: 80, kind: 'empty' });
    expect(settle('12', 80, 10, 300)).toEqual({ value: 12, kind: 'ok' });
    expect(settle('2,3', 4, 1, 60, 0.5)).toEqual({ value: 2.5, kind: 'snapped' });
    expect(settle('7,5', 4, 1, 60, 0.5)).toEqual({ value: 7.5, kind: 'ok' });
  });

  it('pasos y decimales: sin errores de coma flotante', () => {
    expect(decimalsOf(1)).toBe(0);
    expect(decimalsOf(0.5)).toBe(1);
    expect(decimalsOf(0.05)).toBe(2);
    expect(decimalsOf(0.005)).toBe(3);
    expect(snapTo(0.1 + 0.2, 0, 1, 0.1)).toBe(0.3);
    expect(snapTo(1.237, 0.6, 2.4, 0.01)).toBe(1.24);
    expect(snapTo(-5, 0, 1, 0.01)).toBe(0);
    expect(snapTo(50, 0, 1, 0.01)).toBe(1);
    // a step that does not divide the range never passes its end
    expect(snapTo(48, 3, 48, 10)).toBe(43);
    expect(showNumber(24, 1)).toBe('24');
    expect(showNumber(2.5, 0.5)).toBe('2.5');
    expect(showNumber(0.35, 0.01)).toBe('0.35');
  });

  it('dice qué pasó con palabras claras', () => {
    expect(rangeHint('clamped', 10, 300, 300)).toBe('Va de 10 a 300: queda en 300.');
    expect(rangeHint('empty', 1, 60, 4, 0.5)).toBe('Escribe un número de 1 a 60.');
    expect(rangeHint('snapped', 1, 60, 2.5, 0.5)).toBe('Va de 0.5 en 0.5: queda en 2.5.');
    expect(rangeHint('ok', 1, 60, 3)).toBe('');
  });
});
