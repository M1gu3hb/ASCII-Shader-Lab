import { describe, expect, it } from 'vitest';
import {
  GIF_WIDTHS, cardMedia, defaultView, exportFor, markdownBlock, nonAscii, normalizeViewOpts, normalizeViews, readmeGrid, readmeImage,
  terminalWindow, verticalFrame, viewFor,
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
    expect(normalizeViewOpts({ ink: 'dark', page: 'x', caption: 1 })).toEqual({ ink: 'dark', page: 'light', caption: false });
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
    expect(exportFor('readme', { gifW: 800 })).toEqual({ tab: 'video', gifW: 800 });
    expect(exportFor('terminal', { term: { cols: 100, rows: 30 } })).toEqual({ tab: 'terminal', term: { cols: 100, rows: 30 } });
  });
});
