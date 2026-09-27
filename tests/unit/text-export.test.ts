import { describe, expect, it } from 'vitest';
import {
  LICENSE_LINE, charWidth, gridToAnsi, gridToText, gridToHtml, gridToHtmlPage, textWidth, toAsciicast, toJsString, toNodePlayer, toPythonPlayer, toShellBanner,
} from '../../src/exporters/text';
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

describe('text exports on a real terminal', () => {
  /** A one-row grid from an array of cells (a cell may hold a wide or zero-width glyph). */
  const row = (cells: string[]): GridSnapshot => {
    const n = cells.length;
    return { cols: n, rows: 1, chars: cells, rgb: new Uint8Array(n * 3).fill(200), alpha: new Uint8Array(n).fill(255), lum: new Uint8Array(n), flags: new Uint8Array(n), bg: '#000000', cw: 8, ch: 16 };
  };

  it('a double-width glyph takes its cell and the next one, so rows keep exactly cols columns', () => {
    expect(charWidth('こ')).toBe(2);
    expect(charWidth('😀')).toBe(2);
    expect(charWidth('ｱ')).toBe(1);
    expect(charWidth('́')).toBe(0);
    const g = row(['a', 'こ', 'b', 'c', '😀', 'd', 'e', '界']);
    expect(gridToText(g)).toBe('aこc😀e\n');
    const ansi = gridToAnsi(g, 'truecolor', true).replace(/\n$/, '');
    expect(textWidth(ansi)).toBe(8);
    expect(gridToHtml(g)).toContain('aこc😀e');
  });

  it('control and combining characters become spaces', () => {
    expect(gridToText(row(['a', '\x1b', 'b', '́', 'c']))).toBe('a b c\n');
  });

  it('an empty first row survives the HTML parser (it eats one newline after <pre>)', () => {
    const h = gridToHtml(grid(['    ', 'abcd']));
    expect(h).toMatch(/aria-label="Arte ASCII">\n\n/);
    expect(gridToHtmlPage(grid(['ab']), '</title><script>x</script>')).toContain('<title>&lt;/title&gt;&lt;script&gt;x&lt;/script&gt;</title>');
  });

  it('asciicast ends without a newline that would scroll the last frame', () => {
    const lines = toAsciicast({ cols: 2, rows: 2, fps: 10, frames: ['a\nb'] }, 't').trim().split('\n');
    expect(JSON.parse(lines.at(-1)!)[2]).toBe('\x1b[0m\x1b[?25h');
  });

  it('players pad frames to the full width and print one frame when stdout is not a terminal', async () => {
    const f = { cols: 10, rows: 2, fps: 12, frames: ['#####\n##', '#\n########'] };
    const node = await toNodePlayer(f, 'x');
    expect(node).toContain(LICENSE_LINE);
    const b64 = /Buffer\.from\("([^"]+)"/.exec(node)![1];
    const { gunzipSync } = await import('node:zlib');
    const frames: string[] = JSON.parse(gunzipSync(Buffer.from(b64, 'base64')).toString());
    expect(frames.every(fr => fr.split('\n').every(l => l.length === 10))).toBe(true);
    const { spawnSync } = await import('node:child_process');
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const file = join(mkdtempSync(join(tmpdir(), 'mt-')), 'p.mjs');
    writeFileSync(file, node);
    const r = spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 5000 });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('#####     \n##        \x1b[0m\n');
    const py = await toPythonPlayer(f, 'x');
    expect(py).toContain('if not out.isatty():');
    expect(py).toContain('except BrokenPipeError');
  });

  it('shell greeting only prints in interactive shells; the CLI snippet drops colours when redirected', async () => {
    expect(toShellBanner('hola\n')).toMatch(/^# Hecho con Monotrama[^\n]*\n# [^\n]*\ncase \$- in \*i\*\)\ncat <<'MONOTRAMA'\nhola\nMONOTRAMA\n;; esac\n$/);
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', toJsString('\x1b[38;5;208mhola\x1b[0m\n')], { encoding: 'utf8' });
    expect(r.stdout).toBe('hola\n');
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
