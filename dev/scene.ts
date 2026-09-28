import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource-variable/martian-mono';
import '@fontsource/vt323/400.css';
import { AsciiEngine, PATTERN_GLSL, defaultRecipe, createFontLoader, type Recipe } from '../src/engine';

const scenes: Record<string, (r: Recipe) => void> = {
  base(r) {
    r.layers = [{ ...r.layers[0], pattern: 'marmol' }, { ...r.layers[0], pattern: 'anillos', blend: 'multiply', mix: .6, scale: .8 }];
    r.color.stops = ['#1b0f2e', '#ff5b1f', '#ffe9c7']; r.color.bg = '#0b0708';
    r.glyph.cell = 12; r.fx.glow = .4; r.fx.vig = .4;
  },
  msg(r) {
    r.layers = [{ ...r.layers[0], pattern: 'nube' }];
    r.color.stops = ['#0a1a10', '#39ff88']; r.color.bg = '#020805';
    r.glyph.font = 'vt'; r.glyph.cell = 12; r.fx.scan = .5; r.fx.curve = .5; r.fx.vig = .6; r.fx.bloom = .6;
    r.msg = { ...r.msg, on: true, text: 'GLYPHOS v2\\n> teje luz con caracteres_', mode: 'type', speed: 18, box: .9 };
    r.msg.text = 'GLYPHOS v2\n> teje luz con caracteres';
  },
  text(r) {
    r.source = 'text'; r.text.content = 'TRAMA'; r.text.font = 'martian'; r.text.weight = 800;
    r.layers = [{ ...r.layers[0], pattern: 'franjas', a: .3 }]; r.media.mix = .8; r.media.blend = 'multiply';
    r.color.stops = ['#e9e2d0', '#1c1a17']; r.color.bg = '#f2ecdf'; r.glyph.cell = 9; r.glyph.edge = .5;
  },
  words(r) {
    r.layers = [{ ...r.layers[0], pattern: 'dona' }];
    r.glyph.mode = 'words'; r.glyph.words = 'GLYPHOS · TEJE LUZ CON CARACTERES · '; r.glyph.cell = 10; r.glyph.jitter = .3;
    r.color.stops = ['#221133', '#ff3d7f', '#ffd0e0']; r.color.bg = '#0d0712'; r.fx.bloom = .8;
  },
  lines(r) {
    r.layers = [{ ...r.layers[0], pattern: 'esfera' }]; r.glyph.mode = 'lines'; r.glyph.edge = .6; r.glyph.cell = 8;
    r.color.stops = ['#ffffff']; r.color.bg = '#0a0a0a';
  },
};
const params = new URLSearchParams(location.search);
const name = params.get('s') ?? 'base';
const r = defaultRecipe();
scenes[name]?.(r);
const errs: string[] = [];
const eng = new AsciiEngine(document.getElementById('c') as HTMLCanvasElement, r, {
  library: PATTERN_GLSL, fonts: createFontLoader({ google: false }), onError: e => errs.push(e), interactive: true,
});
(window as unknown as Record<string, unknown>).__eng = eng;
(window as unknown as Record<string, unknown>).__errs = errs;
