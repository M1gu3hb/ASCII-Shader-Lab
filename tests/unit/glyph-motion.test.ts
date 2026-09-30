import { describe, expect, it } from 'vitest';
import { CHARSETS, LETTER_ANIMS, charsetById } from '../../src/engine/catalog';
import { animateMessage, letterPose, movedCell, msgAnimPeriod, textAnimPeriod } from '../../src/engine/letters';
import { TEXT_ANIMS, MSG_ANIMS, normalizeRecipe, defaultRecipe, type LetterAnim } from '../../src/engine/recipe';
import { layoutMessage } from '../../src/engine/text';
import { generate } from '../../src/random/generator';

const kinds = ['orbita', 'enjambre', 'cascada'] as const;
const glyphs = ['barras_ascii', 'terminal_densa', 'puntuacion', 'numeros', 'tejido_fino',
  'diagonales', 'media_luna', 'marcos', 'sismografo', 'pincel'];

describe('alfabetos y movimiento nuevos', () => {
  it('keeps every alphabet distinct and terminal ramps genuinely ASCII', () => {
    expect(new Set(CHARSETS.map(c => c.chars)).size).toBe(CHARSETS.length);
    for (const id of glyphs) {
      const c = charsetById(id);
      expect(c?.chars.length, id).toBeGreaterThanOrEqual(5);
      expect(new Set(c?.chars).size, id).toBe(c?.chars.length);
      expect(c?.ascii, id).toBe(/^[\x20-\x7e]*$/.test(c?.chars ?? ''));
      const r = defaultRecipe(); r.glyph.charset = c!.chars;
      expect(normalizeRecipe(r).glyph.charset).toBe(c!.chars);
    }
    for (let i = 0; i < 80; i++) {
      const r = generate({ seed: `charset-v6-${i}`, space: 'terminal', base: defaultRecipe(), gen: 6 });
      expect(/^[\x20-\x7e]*$/.test(r.glyph.charset)).toBe(true);
    }
  });

  it('loops each animation, changes the text and preserves a recoverable pose', () => {
    const slot = { k: 3, n: 8, word: 1, words: 2, cx: 40, cy: -10 };
    for (const kind of kinds) {
      expect(TEXT_ANIMS).toContain(kind); expect(MSG_ANIMS).toContain(kind);
      expect(LETTER_ANIMS[kind].desc.length).toBeGreaterThan(20);
      const a: LetterAnim = { kind, amount: .8, speed: 1.1 };
      expect(textAnimPeriod(a, 2)).toBeGreaterThan(0);
      expect(msgAnimPeriod(a, 8)).toBeGreaterThan(0);
      const p = letterPose(a, 2.1, slot, 100, 300);
      expect([p.dx, p.dy, p.rot, p.scale, p.grey].every(Number.isFinite), kind).toBe(true);
      expect(p).not.toEqual(letterPose(a, 0, slot, 100, 300));
      for (const t of [.37, 1.15, 3.4]) {
        expect(letterPose(a, t + 6, slot, 100, 300, 6)).toEqual(letterPose(a, t, slot, 100, 300, 6));
      }
    }
  });

  it('animates message letters on the shared cell grid and moves the cursor with them', () => {
    const lay = layoutMessage('GLYPHOS VIVE', 48, 14, .5, .5, 'center', false, c => 1 + c.charCodeAt(0) % 9);
    for (const kind of kinds) {
      const a: LetterAnim = { kind, amount: .8, speed: 1 };
      const early = animateMessage(lay, a, .1, 14, 12);
      const mid = animateMessage(lay, a, 2, 14, 12);
      expect(Array.from(early), kind).not.toEqual(Array.from(mid));
      expect(mid.some(v => v > 0), kind).toBe(true);
      const cursor = movedCell(lay, a, 2, 14, [15, 6], 3);
      expect(cursor).toHaveLength(2);
      expect(cursor.every(Number.isInteger)).toBe(true);
      for (const t of [.2, 1.1, 2.7]) {
        expect(animateMessage(lay, a, t + 6, 14, 12, 6)).toEqual(animateMessage(lay, a, t, 14, 12, 6));
      }
    }
  });
});
