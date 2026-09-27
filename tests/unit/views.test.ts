import { describe, expect, it } from 'vitest';
import { DEFAULT_SCRIM } from '../../src/shared/scrim';
import {
  GIF_WIDTHS, PHONE, VIEWS, cardMedia, defaultView, exportAlt, exportFor, markdownBlock, nonAscii, normalizeViewOpts, normalizeViews, phoneFit,
  readmeGrid, readmeImage, terminalWindow, verticalFrame, viewFor,
} from '../../src/studio/views/views';

describe('vistas de destino', () => {
  it('la terminal abre en su ventana; los demás espacios, libres; «Piezas» no tiene vista', () => {
    expect(defaultView('terminal')).toBe('terminal');
    expect(defaultView('arte')).toBe('libre');
    expect(viewFor({}, 'fondos')).toBe('libre');
    expect(viewFor({ fondos: 'web' }, 'fondos')).toBe('web');
    expect(viewFor({ arte: 'nada' as never }, 'arte')).toBe('libre');
    expect(viewFor({ componentes: 'web' } as never, 'componentes')).toBeNull();
  });

  it('las preferencias guardadas se limpian, y el antiguo «contenido encima» de Fondos pasa a «Fondo web»', () => {
    expect(normalizeViews({ arte: 'vertical', tipo: 'x', componentes: 'web' })).toEqual({ arte: 'vertical' });
    expect(normalizeViews(null, true)).toEqual({ fondos: 'web' });
    expect(normalizeViews({ fondos: 'readme' }, true)).toEqual({ fondos: 'readme' });
    expect(normalizeViewOpts({ ink: 'dark', page: 'x', caption: 1 })).toEqual({ ink: 'dark', page: 'light', caption: false, zones: false, scrim: DEFAULT_SCRIM });
    // preferences saved before the story/phone split: «vertical» is the story frame now, its bands start hidden
    expect(normalizeViews({ arte: 'vertical', fondos: 'movil' })).toEqual({ arte: 'vertical', fondos: 'movil' });
    expect(normalizeViewOpts({ ink: 'light', page: 'dark', caption: true })).toEqual({ ink: 'light', page: 'dark', caption: true, zones: false, scrim: DEFAULT_SCRIM });
    expect(normalizeViewOpts({ zones: true }).zones).toBe(true);
  });

  it('las preferencias de antes de la zona protegida la dejan apagada; las nuevas se leen como se guardaron', () => {
    // exactly what the previous version stored in localStorage (mt.v2.prefs → ui.viewOpts)
    const old = JSON.parse('{"ink":"light","page":"light","caption":false,"zones":true}');
    expect(normalizeViewOpts(old)).toEqual({ ink: 'light', page: 'light', caption: false, zones: true, scrim: { mode: 'off', opacity: 0.5, blur: 2, shape: 'block' } });
    const saved = { ...old, scrim: { mode: 'custom', opacity: 0.66, blur: 7, shape: 'gradient' } };
    expect(normalizeViewOpts(JSON.parse(JSON.stringify(saved))).scrim).toEqual({ mode: 'custom', opacity: 0.66, blur: 7, shape: 'gradient' });
  });

  it('el marco vertical es 9:16 exacto, en pasos que dejan un ancho entero', () => {
    for (const [w, h] of [[1000, 640], [390, 420], [300, 900], [800, 1001]]) {
      const f = verticalFrame(w, h);
      expect(Number.isInteger(f.w)).toBe(true);
      expect(f.w / f.h).toBeCloseTo(9 / 16, 10);
      expect(f.h).toBeLessThanOrEqual(Math.max(368, h));
      // what a 1080×1920 export composes from this canvas: the same CSS size
      expect((f.h * 1080) / 1920).toBe(f.w);
    }
    expect(verticalFrame(100, 100).w).toBeGreaterThanOrEqual(200);
  });

  it('tarjeta de 360×225 donde cabe y 288×180 en pantallas estrechas (las dos 16:10)', () => {
    expect(cardMedia(900)).toEqual({ w: 360, h: 225 });
    expect(cardMedia(340)).toEqual({ w: 288, h: 180 });
  });

  it('README: imagen 2:1 al ancho del contenido (máx. 800) y un GIF que nunca se amplía', () => {
    expect(readmeImage(816)).toEqual({ w: 800, h: 400, gifW: 800 });
    const narrow = readmeImage(326.4);
    expect(narrow).toEqual({ w: 326, h: 163, gifW: 480 });
    for (const w of [210, 330, 500, 700, 900]) {
      const r = readmeImage(w);
      expect(GIF_WIDTHS).toContain(r.gifW);
      expect(r.gifW).toBeGreaterThanOrEqual(r.w);
    }
  });

  it('el texto del README tiene 80 columnas y las proporciones de la imagen con esa celda', () => {
    expect(readmeGrid(800, 400, 10, 2)).toEqual({ cols: 80, rows: 20 });
    expect(readmeGrid(800, 400, 10, 1)).toEqual({ cols: 80, rows: 40 });
  });

  it('la ventana de terminal mide lo mismo que la rejilla que exporta el texto', () => {
    expect(terminalWindow(80, 24, 11, 2)).toEqual({ w: 880, h: 528 });
    expect(terminalWindow(80, 24, 10, 2.06)).toEqual({ w: 800, h: 24 * 21 });
  });

  it('a cualquier densidad de pantalla, el lienzo en vivo de la ventana tiene exactamente cols×filas celdas', () => {
    // what both renderers do: canvas = round(css × pr), cell = round(cell × pr), grid = ceil(canvas / cell)
    const live = (w: number, h: number, cell: number, aspect: number, pr: number) => [
      Math.ceil(Math.round(w * pr) / Math.max(2, Math.round(cell * pr))),
      Math.ceil(Math.round(h * pr) / Math.max(2, Math.round(cell * aspect * pr))),
    ];
    for (const pr of [1, 1.1, 1.15, 1.25, 1.5, 1.75, 2, 0.8, 0.75])
      for (const cell of [3, 6, 9, 10, 11, 14, 24])
        for (const aspect of [1, 1.4, 1.45, 1.47, 2, 2.06]) {
          const { w, h } = terminalWindow(80, 24, cell, aspect, pr);
          expect(live(w, h, cell, aspect, pr), `pr ${pr}, celda ${cell}, proporción ${aspect}`).toEqual([80, 24]);
        }
    // e.g. Windows at 125 %: a slightly larger window, the same 80 columns
    expect(terminalWindow(80, 24, 10, 2, 1.25)).toEqual({ w: 832, h: 480 });
  });

  it('bloque Markdown: valla de tres acentos, más larga si el texto ya trae acentos graves', () => {
    expect(markdownBlock('ab\ncd\n')).toBe('```text\nab\ncd\n```\n');
    expect(markdownBlock('a ``` b')).toBe('````text\na ``` b\n````\n');
  });

  it('avisa de los caracteres que no son ASCII imprimible, cada uno una vez', () => {
    expect(nonAscii(' .:-=+*#%@\n')).toEqual([]);
    expect(nonAscii(' ░▒▓█░ é\n')).toEqual(['░', '▒', '▓', '█', 'é']);
  });

  it('«Exportar para este destino» abre la pestaña y el tamaño de cada destino', () => {
    expect(exportFor('libre')).toBeNull();
    expect(exportFor('web')).toEqual({ tab: 'codigo' });
    expect(exportFor('tarjeta')).toEqual({ tab: 'imagen', size: 'v2' });
    expect(exportFor('vertical')).toEqual({ tab: 'video', size: 'story' });
    expect(exportFor('movil')).toEqual({ tab: 'codigo' });
    expect(exportFor('readme', { gifW: 800 })).toEqual({ tab: 'video', gifW: 800 });
    expect(exportFor('terminal', { term: { cols: 100, rows: 30 } })).toEqual({ tab: 'terminal', term: { cols: 100, rows: 30 } });
  });

  it('Historia / Reel y Pantalla de móvil: dos vistas distintas, ninguna llamada «app»', () => {
    expect(VIEWS.map(v => v.name)).toEqual(['Libre', 'Fondo web', 'Pantalla de móvil', 'Tarjeta', 'Historia / Reel 9:16', 'README', 'Terminal']);
    for (const v of VIEWS) expect(v.name, v.id).not.toMatch(/\bapp\b/i);
    // the story leads to a 1080×1920 video, or a still of the same size; the phone to code, or its screen at ×3
    expect(exportAlt('vertical')?.req).toEqual({ tab: 'imagen', size: 'story' });
    expect(exportAlt('movil')?.req).toEqual({ tab: 'imagen', size: 'v4' });
    expect(exportAlt('movil')?.label).toBe(`Imagen ${PHONE.w * 3}×${PHONE.h * 3}`);
    expect(exportAlt('web')).toBeNull();
  });

  it('el teléfono conserva su pantalla de 390×844 y sólo se dibuja más pequeño', () => {
    expect(phoneFit(2000, 2000)).toEqual({ w: 390, h: 844, k: 1 });
    const short = phoneFit(1000, 439);
    expect([short.w, short.h]).toEqual([390, 844]);
    expect(short.k).toBeCloseTo(439 / (844 + 34), 6);
    expect(phoneFit(0, 0).k).toBe(1);
  });
});
