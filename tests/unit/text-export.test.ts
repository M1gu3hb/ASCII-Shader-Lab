import { describe, expect, it } from 'vitest';
import { gridToAnsi, gridToText, gridToHtml, toAsciicast, toNodePlayer, toPythonPlayer } from '../../src/exporters/text';
import { layoutMessage, messageState } from '../../src/engine/text';
import { defaultRecipe } from '../../src/engine/recipe';
import type { GridSnapshot } from '../../src/engine/engine';

function grid(lines: string[], rgb: [number, number, number] = [255, 91, 31]): GridSnapshot {
  const rows = lines.length, cols = Math.max(...lines.map(l => l.length));
  const chars: string[] = [];
  for (const l of lines) for (let x = 0; x < cols; x++) chars.push(l[x] ?? ' ');
  const n = cols * rows;
  const c = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) c.set(rgb, i * 3);
  return { cols, rows, chars, rgb: c, alpha: new Uint8Array(n).fill(255), lum: new Uint8Array(n).fill(128), flags: new Uint8Array(n), bg: '#0b0708', cw: 8, ch: 16 };
}

describe('text exporters', () => {
  const g = grid(['.:-=+*#', '  @@  ']);

  it('plain text keeps characters and trims line ends', () => {
    expect(gridToText(g)).toBe('.:-=+*#\n  @@\n');
  });

  it('ANSI only emits colour codes when the colour changes', () => {
    const a = gridToAnsi(g, 'truecolor', false);
    expect(a.match(/38;2;255;91;31m/g)?.length).toBe(2);
    expect(a).toContain('\x1b[0m');
    const b = gridToAnsi(g, '256', true);
    expect(b).toMatch(/\x1b\[48;5;\d+m/);
    expect(b).toMatch(/\x1b\[38;5;\d+m/);
    expect(gridToAnsi(g, '16', false)).toMatch(/\x1b\[(3|9)\dm/);
    expect(gridToAnsi(g, 'none')).toBe(gridToText(g));
  });

  it('HTML escapes and groups colour runs', () => {
    const h = gridToHtml(grid(['<a>']));
    expect(h).toContain('&lt;a&gt;');
    expect(h.match(/<span/g)?.length).toBe(1);
  });

  it('asciicast is valid v2', () => {
    const cast = toAsciicast({ cols: 7, rows: 2, fps: 10, frames: ['a', 'b'] }, 'prueba');
    const [header, ...events] = cast.trim().split('\n').map(l => JSON.parse(l));
    expect(header.version).toBe(2);
    expect(header.width).toBe(7);
    expect(events.length).toBe(4);
    expect(events[1][1]).toBe('o');
  });

  it('Node and Python players embed the frames compressed', async () => {
    const f = { cols: 7, rows: 2, fps: 12, frames: Array.from({ length: 30 }, (_, i) => 'frame ' + i) };
    const node = await toNodePlayer(f, 'x');
    expect(node).toContain("import { gunzipSync } from 'node:zlib'");
    const py = await toPythonPlayer(f, 'x');
    expect(py).toContain('gzip.decompress');
    // the payload decodes back to the frames
    const b64 = /Buffer\.from\("([^"]+)"/.exec(node)![1];
    const { gunzipSync } = await import('node:zlib');
    expect(JSON.parse(gunzipSync(Buffer.from(b64, 'base64')).toString())).toEqual(f.frames);
  });
});

describe('message overlay', () => {
  it('wraps words inside the grid and keeps typing order', () => {
    const lay = layoutMessage('hola mundo querido', 10, 6, 0.5, 0.5, 'left', false, c => c.charCodeAt(0));
    expect(lay.count).toBeGreaterThan(15);
    expect(lay.cells.every(([x, y]) => x >= 0 && x < 10 && y >= 0 && y < 6)).toBe(true);
  });

  it('typewriter timeline types, holds, erases and restarts', () => {
    const m = { ...defaultRecipe().msg, mode: 'type' as const, speed: 10, hold: 1 };
    expect(messageState(m, 10, 0.5).prog).toBeCloseTo(5);
    expect(messageState(m, 10, 1.5).prog).toBe(10);
    expect(messageState(m, 10, 2.2).prog).toBeLessThan(10);
    const cycle = 1 + 1 + 10 / 26 + 0.7;
    expect(messageState(m, 10, cycle + 0.3).prog).toBeCloseTo(3);
  });
});
