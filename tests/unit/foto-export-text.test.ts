import { describe, expect, it } from 'vitest';
import { defaultGlyphStyle, gridText, type GlyphGrid } from '../../src/glyphs';
import { packFrames, packedText, toPlayerPage, toWebPlayer } from '../../src/exporters/player';
import { applyFrame } from '../../src/foto/export/frameGrid';
import { colorFrames, movingText, readmeMarkdown, stillText, terminalFrames, type FramesLike } from '../../src/foto/export/text';

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

function grid(lines: string[], rgb: [number, number, number] = [255, 91, 31]): GlyphGrid {
  const rows = lines.length, cols = Math.max(...lines.map(l => Array.from(l).length));
  const chars: string[] = [];
  for (const l of lines) { const a = Array.from(l); for (let x = 0; x < cols; x++) chars.push(a[x] ?? ' '); }
  const n = cols * rows;
  const c = new Uint8ClampedArray(n * 3);
  for (let i = 0; i < n; i++) c.set(rgb, i * 3);
  return { cols, rows, cw: 10, ch: 20, chars, rgb: c, lum: new Float32Array(n).fill(0.5), alpha: Float32Array.from(chars, ch => (ch === ' ' ? 0 : 1)) };
}

/** Frames of a typing animation over a grid: frame k shows the first k characters and a cursor after them. */
function typing(lines: string[]): FramesLike {
  const g = grid(lines);
  const n = g.cols * g.rows;
  const frames: GlyphGrid[] = [];
  for (let k = 0; k <= n; k++) {
    frames.push(applyFrame(g, new Uint32Array(n).fill(0xff5b1f), { cells: i => (i < k ? null : i === k ? { visible: 1, glyph: '█', color: '#ede6da' } : { visible: 0 }) }));
  }
  return { frames, fps: 12, cols: g.cols, rows: g.rows, bg: '#0c0b0a', paper: false, style: { ...defaultGlyphStyle(), color: 'source' }, name: 'Prueba' };
}

describe('text of animated frames', () => {
  it('terminal frames are the frames drawn as ANSI; without the codes they are the frames\' text', () => {
    const fr = typing(['hola', 'mund']);
    const t = terminalFrames(fr, 'truecolor');
    expect(t.frames).toHaveLength(fr.frames.length);
    t.frames.forEach((s, k) => {
      const plain = s.replace(ANSI, '').split('\n').map(l => l.replace(/\s+$/, '')).join('\n') + '\n';
      expect(plain).toBe(gridText(fr.frames[k]));
    });
    // the cursor's own colour is kept
    expect(t.frames[2]).toContain('38;2;237;230;218');
  });

  it('an asciicast holds one event per frame, at i / fps, with the frames\' characters', async () => {
    const fr = typing(['ab', 'cd']);
    const out = await movingText(fr, 'cast', { title: 'Prueba' });
    const lines = out.text.trim().split('\n').map(l => JSON.parse(l));
    expect(lines[0]).toMatchObject({ version: 2, width: 2, height: 2, title: 'Prueba' });
    const frames = lines.slice(2, -1);
    expect(frames).toHaveLength(fr.frames.length);
    frames.forEach((ev: [number, string, string], k: number) => {
      expect(ev[0]).toBeCloseTo(0.001 + k / 12, 3);
      const text = ev[2].replace(ANSI, '').split('\r\n').map(l => l.replace(/\s+$/, '')).join('\n') + '\n';
      expect(text).toBe(gridText(fr.frames[k]));
    });
  });

  it('the node and python players carry every frame (gzip + base64) and say how to run them', async () => {
    const fr = typing(['xy']);
    const node = await movingText(fr, 'node', { title: 'Prueba' });
    const py = await movingText(fr, 'python', { title: 'Prueba' });
    expect(node.text).toMatch(/^#!\/usr\/bin\/env node/);
    expect(node.text).toContain(`${fr.frames.length} fotogramas a 12 fps`);
    expect(py.text).toMatch(/^#!\/usr\/bin\/env python3/);
    expect(py.ext).toBe('py');
  });

  it('the web player packs identical frames once and its text is the frames\' text', () => {
    const fr = typing(['ab']);
    // hold the last frame three more times (a pause)
    const held: FramesLike = { ...fr, frames: [...fr.frames, fr.frames[fr.frames.length - 1], fr.frames[fr.frames.length - 1]] };
    const p = packFrames(colorFrames(held, true));
    expect(p.o).toHaveLength(held.frames.length);
    expect(p.f.length).toBe(fr.frames.length);
    held.frames.forEach((g, k) => expect(packedText(p, k) + '\n').toBe(gridText(g)));
    expect(p.pal).toContain('#ff5b1f');
    expect(p.pal).toContain('#ede6da');
  });

  it('the web snippet is self-contained and cannot close its own script', () => {
    const g = grid(['</script><b>']);
    const fr: FramesLike = { frames: [g, g], fps: 10, cols: g.cols, rows: 1, bg: '#000000', paper: false, style: defaultGlyphStyle(), name: 'x</script>' };
    const snippet = toWebPlayer(colorFrames(fr, true), { title: 'x</script>', bg: null, cw: 10, ch: 20, font: 'monospace' });
    expect(snippet.match(/<\/script>/gi)).toHaveLength(1);
    expect(snippet).toContain('prefers-reduced-motion');
    expect(snippet).not.toMatch(/https?:\/\/(?!glyphos)/);
    const page = toPlayerPage(colorFrames(fr, false), { title: 'Mi <pieza>', bg: '#101010', cw: 10, ch: 20, font: 'monospace' });
    expect(page).toMatch(/^<!doctype html>/);
    expect(page).toContain('<title>Mi &lt;pieza&gt;</title>');
  });

  it('still text formats of a frame', () => {
    const f = { grid: grid(['ab', ' c']), style: { ...defaultGlyphStyle(), color: 'source' as const }, bg: '#0c0b0a', paper: false, name: 'P' };
    expect(stillText(f, 'txt').text).toBe('ab\n c\n');
    expect(stillText(f, 'ansi').text.replace(ANSI, '')).toBe('ab\n c\n');
    expect(stillText(f, 'html').text).toContain('<span style="color:#ff5b1f">ab</span>');
    expect(stillText(f, 'svg-text').text).toContain('<tspan');
    expect(stillText(f, 'shell').text).toContain("cat <<'GLYPHOS'");
  });
});

describe('README', () => {
  it('has the picture, the text in a fence longer than any backticks inside, and honest notes', () => {
    const r = readmeMarkdown({ title: 'Pieza', image: { file: 'pieza.gif', alt: 'Pieza', w: 800, h: 400, moving: true }, text: 'a```b\n░▒▓\n' });
    expect(r.md).toContain('<img src="pieza.gif" alt="Pieza" width="800">');
    expect(r.md).toContain('````text\na```b\n░▒▓\n````');
    expect(r.snippet).toContain('pieza.gif');
    expect(r.notes.join(' ')).toMatch(/fuera del ASCII básico/);
    expect(r.notes.join(' ')).toMatch(/GIF/);
  });

  it('the project name is one line of text in the heading, never HTML or Markdown of its own', () => {
    const name = 'Pieza <img src=x onerror=alert(1)>\n\n<script>alert(2)</script>\n# otro';
    const r = readmeMarkdown({ title: name, image: { file: 'pieza.png', alt: name, w: 800, h: 400, moving: false } });
    const [head, second] = r.md.split('\n');
    expect(head).toBe('# Pieza &lt;img src=x onerror=alert(1)&gt; &lt;script&gt;alert(2)&lt;/script&gt; # otro');
    expect(second).toBe('');
    expect(r.md).not.toMatch(/<script|<img src=x/);
  });
});
