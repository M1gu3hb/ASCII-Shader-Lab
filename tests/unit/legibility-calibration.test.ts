import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { judge, type Level, type RegionSpec } from '../../src/studio/views/readability';

/**
 * The legibility limits against the calibration set: 239 text regions of real preview renders (dark and
 * light backgrounds, sparse and dense glyphs, bright and dim, with and without the protected zone),
 * each labelled by eye. Whatever the limits become, none of them may say «se lee bien» where a person
 * saw otherwise. (The set and how it was made: tests/unit/fixtures/legibility-calibration.json.)
 */
type Row = [string, string, 0 | 1, number, number, number, Level];
const { rows } = JSON.parse(readFileSync(new URL('./fixtures/legibility-calibration.json', import.meta.url), 'utf8')) as { rows: Row[] };

const verdictOf = ([, region, large, clash, texture, ratio]: Row) => {
  const spec: RegionSpec = { id: region, role: region === 'headline' ? 'headline' : region === 'nav' ? 'nav' : region === 'ghost' ? 'button' : 'body', name: region, text: [255, 255, 255], alpha: 1, large: !!large };
  return judge(spec, { clash, texture, ratio }).level;
};

describe('legibility limits on the calibration set', () => {
  it('has enough labelled cases of every kind', () => {
    const cases = new Set(rows.map(r => r[0].split('/')[0]));
    expect(cases.size).toBeGreaterThanOrEqual(30);
    for (const l of ['buena', 'justa', 'baja'] as const) expect(rows.filter(r => r[6] === l).length).toBeGreaterThan(20);
    expect(rows.some(r => /-(suave|fuerte)/.test(r[0]))).toBe(true);
  });

  it('never says «se lee bien» where the render was labelled otherwise', () => {
    const wrong = rows.filter(r => r[6] !== 'buena' && verdictOf(r) === 'buena').map(r => `${r[0]} ${r[1]}`);
    expect(wrong).toEqual([]);
  });

  it('says «se lee bien» for most of what reads well (it is cautious, not blind)', () => {
    const good = rows.filter(r => r[6] === 'buena');
    const said = good.filter(r => verdictOf(r) === 'buena').length;
    expect(said / good.length).toBeGreaterThan(0.85);
  });
});
