import { afterEach, describe, expect, it, vi } from 'vitest';
import { basicRequested, explainWebGL, probeWebGL, type GLReason, type GLStatus } from '../../src/engine/support';

const status = (reason: GLReason, extra: Partial<GLStatus> = {}): GLStatus =>
  ({ webgl2: reason === 'ok' || reason === 'forced', webgl1: reason !== 'blocked', reason, software: false, ...extra });

const BROWSER_VERSION = /versión|actualiza (a|tu navegador)/i;

describe('explainWebGL', () => {
  it.each(['ok', 'no-api', 'blocked', 'no-webgl2', 'forced'] as GLReason[])('has Spanish copy for %s', reason => {
    const e = explainWebGL(status(reason));
    expect(e.title.length).toBeGreaterThan(5);
    expect(e.body.length).toBeGreaterThan(20);
    if (reason !== 'ok') expect(e.steps.length).toBeGreaterThan(0);
  });

  it('only blames the browser version when the API is missing', () => {
    expect(JSON.stringify(explainWebGL(status('no-api')))).toMatch(/versión/);
    for (const r of ['ok', 'blocked', 'no-webgl2', 'forced'] as GLReason[]) {
      const e = explainWebGL(status(r));
      expect(e.title + e.body, r).not.toMatch(BROWSER_VERSION);
    }
  });

  it('gives concrete steps for a blocked context and quotes the browser message', () => {
    const e = explainWebGL(status('blocked', { detail: 'GPU process was unable to boot' }));
    expect(e.body).toContain('GPU process was unable to boot');
    const steps = e.steps.join('\n');
    expect(steps).toContain('Usar aceleración gráfica cuando esté disponible');
    expect(steps).toContain('chrome://gpu');
    expect(steps).toContain('about:support');
    expect(steps).toMatch(/Safari/);
    expect(steps).toMatch(/reinicia/i);
    expect(steps).toMatch(/política/);
  });

  it('warns that software WebGL is slow', () => {
    const e = explainWebGL(status('ok', { software: true, renderer: 'SwiftShader' }));
    expect(e.body).toMatch(/lento/);
    expect(e.body).toContain('SwiftShader');
  });

  it('tells how to leave the forced basic mode', () => {
    expect(explainWebGL(status('forced')).steps.join(' ')).toMatch(/motor=basico/);
  });
});

describe('probeWebGL / basicRequested', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports no-api without a DOM and never throws', () => {
    const s = probeWebGL({ fresh: true });
    expect(s).toMatchObject({ webgl2: false, webgl1: false, reason: 'no-api' });
  });

  it('honours ?motor=basico and localStorage mt.motor', () => {
    expect(basicRequested()).toBe(false);
    vi.stubGlobal('location', { search: '?motor=basico' });
    expect(basicRequested()).toBe(true);
    expect(probeWebGL().reason).toBe('forced');
    vi.unstubAllGlobals();
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'mt.motor' ? 'basico' : null) });
    expect(basicRequested()).toBe(true);
  });

  it('survives storage that throws', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('SecurityError'); } });
    expect(basicRequested()).toBe(false);
  });
});
