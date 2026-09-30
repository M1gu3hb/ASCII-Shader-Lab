import { describe, expect, it } from 'vitest';
import { defaultRecipe, type Recipe } from '../../src/engine/recipe';
import { roll } from '../../src/random';
import { diceWord5 } from '../../src/random/gen5';
import { ownText, studioWords } from '../../src/studio/ownWords';
import { PRESETS, starterFor } from '../../src/studio/presets';
import { SCENES, makeScene } from '../../src/studio/scenes';

/**
 * Whose words a Texto piece shows (src/studio/ownWords.ts): the studio tells the dice, so a roll keeps what the
 * person typed and changes a word nobody typed (the dice's, a recipe's or a scene's, the brand's names).
 */
const texto = (content: string): Recipe => { const r = defaultRecipe(); r.source = 'text'; r.text.content = content; return r; };
/** A result of the history: what it came with, and what it is now. */
const entry = (origin: string, now = origin) => ({ origin: texto(origin), recipe: texto(now) });

describe('las palabras de la persona', () => {
  it('the studio\'s own words: its recipes\' and scenes\' too, and the brand\'s names', () => {
    const w = studioWords();
    for (const p of PRESETS.tipo) expect(w.has(p.make().text.content.trim()), p.name).toBe(true);
    for (const s of SCENES.filter(x => x.text)) expect(w.has(makeScene(s).text.content), s.name).toBe(true);
    for (const x of ['TRAMA', 'EN VIVO', 'ENJAMBRE', 'FLORECE', 'LO QUE\nSE ESCRIBE\nTAMBIÉN BAILA', 'GLYPHOS', 'MONOTRAMA', 'SEÑAL']) expect(w.has(x), x).toBe(true);
    expect(w.has('MI PALABRA')).toBe(false);
    expect(starterFor('tipo').text.content).toBe('TRAMA');
  });

  it('typed in this history: theirs, even a word the dice or a recipe also use, through every roll after it', () => {
    // opened on Texto («Trama»), the person writes LUZ
    const history = [entry('TRAMA'), entry('TRAMA', 'LUZ')];
    expect(ownText(history, texto('LUZ'))).toBe(true);
    // a roll kept it: that result came with LUZ, and it is still theirs
    history.push(entry('LUZ'));
    expect(ownText(history, texto('LUZ'))).toBe(true);
    // undone (back to what it came with): not typed any more
    expect(ownText([entry('TRAMA'), entry('TRAMA')], texto('TRAMA'))).toBe(false);
  });

  it('not typed here: a word nobody typed is not theirs; any other (a link, a file, the collection) is', () => {
    for (const w of ['TRAMA', 'EN VIVO', 'SEÑAL', 'MONOTRAMA', 'GLYPHOS', 'HOLA']) expect(ownText([entry(w)], texto(w)), w).toBe(false);
    expect(ownText([entry('Nos vemos el viernes')], texto('Nos vemos el viernes'))).toBe(true);
    expect(ownText([], texto('  '))).toBe(false);
  });

  it('what the dice then do: open Texto and roll, the starting word goes; typed, it stays', () => {
    const start = starterFor('tipo');
    const history = [{ origin: start, recipe: start }];
    for (let i = 0; i < 12; i++) {
      const r = roll({ space: 'tipo', base: start, seen: new Set(), fresh: () => 'tira-' + i, ownText: ownText(history, start) });
      expect(r.recipe.text.content).toBe(diceWord5(r.seed));
    }
    const mine = structuredClone(start);
    mine.text.content = 'TRAMA';
    // the person typed TRAMA themselves over another word: it stays
    const typed = [{ origin: texto('ECO'), recipe: mine }];
    expect(roll({ space: 'tipo', base: mine, seen: new Set(), fresh: () => 'tira', ownText: ownText(typed, mine) }).recipe.text.content).toBe('TRAMA');
  });
});
