import { describe, expect, it } from 'vitest';
import { FINE_MIN, INTENT_PX, dragValue, fineGain, intentOf, repeatWait, valueAt } from '../../src/studio/ui/slideMath';

describe('deslizadores bajo el dedo', () => {
  it('nada cambia hasta que el dedo muestra su intención', () => {
    expect(intentOf(0, 0)).toBe('pending');
    expect(intentOf(INTENT_PX - 1, INTENT_PX - 1)).toBe('pending');
    expect(intentOf(-4, 6)).toBe('pending');
  });

  it('de lado toma el deslizador; arriba o abajo es para desplazar el panel', () => {
    expect(intentOf(12, 0)).toBe('drag');
    expect(intentOf(-14, 3)).toBe('drag');
    expect(intentOf(0, 12)).toBe('scroll');
    expect(intentOf(1, -30)).toBe('scroll');
    // a diagonal is a scroll: sliders only move for a clearly sideways gesture
    expect(intentOf(12, 10)).toBe('scroll');
    expect(intentOf(12, 7)).toBe('scroll');
    expect(intentOf(20, 10)).toBe('drag');
  });

  it('el valor sigue al dedo desde donde estaba: toda la pista es todo el rango', () => {
    expect(dragValue(1, 50, 200, 0, 4)).toBe(2);
    expect(dragValue(1, -50, 200, 0, 4)).toBe(0);
    expect(dragValue(3.9, 200, 200, 0, 4)).toBe(4);
    // a tiny track is treated as 40 px, never a division by almost nothing
    expect(dragValue(0, 10, 2, 0, 1)).toBeCloseTo(0.25);
  });

  it('más lejos de la pista, más fino (hasta un octavo)', () => {
    expect(fineGain(0)).toBe(1);
    expect(fineGain(30)).toBe(1);
    expect(fineGain(-30)).toBe(1);
    expect(fineGain(80)).toBeCloseTo(0.5);
    expect(fineGain(-124)).toBeCloseTo(1 / 3);
    expect(fineGain(10_000)).toBe(FINE_MIN);
    expect(dragValue(0, 100, 200, 0, 1, fineGain(124))).toBeCloseTo(1 / 6);
  });

  it('el ratón conserva el comportamiento directo: el valor bajo el puntero', () => {
    expect(valueAt(100, 0, 200, 0, 10)).toBe(5);
    expect(valueAt(-20, 0, 200, 0, 10)).toBe(0);
    expect(valueAt(260, 0, 200, 0, 10)).toBe(10);
    expect(valueAt(7, 0, 214, 0, 1, 14)).toBe(0);
  });

  it('− y + mantenidos repiten, cada vez más deprisa, sin pasar de un mínimo', () => {
    expect(repeatWait(1)).toBe(420);
    expect(repeatWait(2)).toBe(110);
    expect(repeatWait(6)).toBeLessThan(repeatWait(3));
    expect(repeatWait(100)).toBe(35);
  });
});
