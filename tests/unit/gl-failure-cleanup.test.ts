import { expect, it, vi } from 'vitest';
import { compileProgram } from '../../src/engine/gl';

it.each(['fragmento', 'enlace'])('libera los recursos al fallar %s', failure => {
  let shader = 0;
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    createShader: () => ++shader, shaderSource: vi.fn(), compileShader: vi.fn(),
    getShaderParameter: (s: number) => failure !== 'fragmento' || s !== 2,
    getShaderInfoLog: () => 'error de compilación', isContextLost: () => false,
    createProgram: () => 10, attachShader: vi.fn(), bindAttribLocation: vi.fn(), linkProgram: vi.fn(),
    getProgramParameter: () => false, getProgramInfoLog: () => 'error de enlazado',
    deleteShader: vi.fn(), deleteProgram: vi.fn(),
  };
  expect(() => compileProgram(gl as unknown as WebGL2RenderingContext, 'vert', 'frag')).toThrow();
  expect(gl.deleteShader.mock.calls.flat().sort()).toEqual([1, 2]);
  expect(gl.deleteProgram.mock.calls.flat()).toEqual(failure === 'enlace' ? [10] : []);
});
