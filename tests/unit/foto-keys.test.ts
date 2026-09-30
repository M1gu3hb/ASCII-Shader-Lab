import { describe, expect, it } from 'vitest';
import { STUDIO_LETTERS } from '../../src/foto/keys';
import { TOOLS } from '../../src/foto/tools/index';
import { hintFor } from '../../src/foto/Chrome';
import { STUDIO_KEYS, TIMELINE_KEYS } from '../../src/foto/Sheets';

/** The photo studio's keyboard map: the tools' letters, the studio's and the help sheet agree. */

describe('keyboard map', () => {
  it('every tool has its own letter, none of the studio’s', () => {
    const letters = TOOLS.map(t => t.shortcut?.toLowerCase()).filter((x): x is string => !!x);
    expect(letters.length).toBe(TOOLS.length);
    expect(new Set(letters).size).toBe(letters.length);
    for (const l of letters) expect(STUDIO_LETTERS).not.toContain(l);
    expect(letters.sort().join('')).toBe('begjklmoprtvw');
  });

  it('the help sheet lists the studio keys and the timeline keys', () => {
    const studio = STUDIO_KEYS.map(([k]) => k).join(' ');
    for (const k of ['F', 'Z', 'H', 'C', '?', 'Esc']) expect(studio).toContain(k);
    const tl = TIMELINE_KEYS.map(([k]) => k).join(' ');
    for (const k of ['K', 'Espacio', 'Supr', 'Inicio']) expect(tl).toContain(k);
  });

  it('a tool’s hint is cut to the device it is read on', () => {
    const h = 'Arrastra para dibujar. En teléfono: dibuja con un dedo.';
    expect(hintFor(h, false)).toBe('Arrastra para dibujar.');
    expect(hintFor(h, true)).toBe('Dibuja con un dedo.');
    expect(hintFor('Sin teléfono.', true)).toBe('Sin teléfono.');
    for (const t of TOOLS) expect(hintFor(t.hint, false).length).toBeGreaterThan(10);
  });
});
