/**
 * What this device can run. `gateModels` is pure (unit-tested with made-up devices); `detectEnv` reads the
 * browser once. No model is downloaded here.
 */
import type { Backend, ModelInfo } from './index';
import { MODELS, variantBytes, type ModelSpec } from './models';

export interface DeviceEnv {
  /** A WebGPU adapter with fp16 shaders (the WebGPU files are fp16). */
  webgpu: boolean;
  /** crossOriginIsolated + SharedArrayBuffer: WASM threads. */
  threads: boolean;
  /** WebAssembly with SIMD (onnxruntime-web needs it). */
  simd: boolean;
  /** Cache Storage + SubtleCrypto (secure context): where models are kept and verified. */
  storage: boolean;
  /** navigator.deviceMemory when the browser tells it (Chromium; capped at 8). */
  memoryGB?: number;
  phone: boolean;
  /** Forced by the person or a test: never use WebGPU. */
  forceWasm?: boolean;
}

export const MB = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;

/** Backend a model would use on this device, or null when none of its builds fits. */
export function backendFor(spec: ModelSpec, env: DeviceEnv): Backend | null {
  if (env.webgpu && !env.forceWasm && spec.webgpu) return 'webgpu';
  if (spec.wasm) return env.threads ? 'wasm-threads' : 'wasm';
  return null;
}

export function gateModels(env: DeviceEnv): ModelInfo[] {
  return MODELS.map(spec => {
    const backend = backendFor(spec, env);
    const variant = backend === 'webgpu' ? spec.webgpu : backend ? spec.wasm : spec.webgpu ?? spec.wasm;
    const info: ModelInfo = {
      id: spec.id,
      name: spec.name,
      blurb: spec.blurb,
      upstream: spec.upstream,
      licence: { ...spec.licence },
      bytes: variant ? variantBytes(variant) : 0,
      backend: backend ?? 'webgpu',
      available: true,
    };
    const no = (why: string) => { info.available = false; info.why = why; return info; };
    if (!env.simd) return no('Este navegador no puede ejecutar los modelos: le falta WebAssembly con SIMD.');
    if (!env.storage) return no('Hace falta una conexión segura (https) para guardar y verificar el modelo en este navegador.');
    if (!backend) return no('Necesita WebGPU, que este navegador o equipo no ofrece (o está desactivado).');
    if (backend !== 'webgpu' && spec.desktopWasmOnly) {
      if (env.phone) return no('En teléfonos sin WebGPU este modelo necesita más memoria de la que suele haber (≈3 GB). Usa «Retrato» o «Seleccionar objeto».');
      if (env.memoryGB !== undefined && env.memoryGB < 8) return no(`Este equipo informa ${env.memoryGB} GB de memoria y, sin WebGPU, el modelo necesita ≈3 GB. Usa «Retrato» o «Seleccionar objeto».`);
      info.note = backend === 'wasm-threads'
        ? 'Sin WebGPU: usa ≈3 GB de memoria y tarda unos 4 s o más por foto.'
        : 'Sin WebGPU ni hilos: usa ≈3 GB de memoria y tarda unos 11 s o más por foto.';
    }
    if (backend === 'wasm' && !spec.desktopWasmOnly) info.note = 'Sin WebGPU ni hilos: funciona, pero más lento.';
    return info;
  });
}

/* ------------------------------------------------------------------ browser detection */

interface GpuLike { requestAdapter(o?: object): Promise<{ features: { has(f: string): boolean } } | null> }

let webgpuP: Promise<boolean> | null = null;

/** A WebGPU adapter with 'shader-f16' (checked once; 3 s timeout because some drivers stall). */
export function detectWebGPU(): Promise<boolean> {
  if (webgpuP) return webgpuP;
  const gpu = (globalThis.navigator as unknown as { gpu?: GpuLike } | undefined)?.gpu;
  if (!gpu) return (webgpuP = Promise.resolve(false));
  webgpuP = Promise.race([
    gpu.requestAdapter({ powerPreference: 'high-performance' }).then(a => !!a && a.features.has('shader-f16')).catch(() => false),
    new Promise<boolean>(r => setTimeout(() => r(false), 3000)),
  ]);
  return webgpuP;
}

/** The same probe onnxruntime-web runs before it starts (a tiny module with one SIMD instruction). */
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 30, 1, 28, 0, 65, 0, 253, 15, 253, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 253, 186, 1, 26, 11]);

export function hasSimd(): boolean {
  try { return typeof WebAssembly === 'object' && WebAssembly.validate(SIMD_PROBE); } catch { return false; }
}

export function isPhone(): boolean {
  const nav = globalThis.navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (!nav) return false;
  if (nav.userAgentData?.mobile === true) return true;
  if (/Android.+Mobile|iPhone|iPod|Windows Phone/i.test(nav.userAgent)) return true;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const small = typeof screen === 'object' && Math.min(screen.width, screen.height) <= 600;
  return coarse && small;
}

export async function detectEnv(forceWasm = false): Promise<DeviceEnv> {
  const g = globalThis as typeof globalThis & { crossOriginIsolated?: boolean; isSecureContext?: boolean };
  const nav = g.navigator as Navigator & { deviceMemory?: number };
  return {
    webgpu: forceWasm ? false : await detectWebGPU(),
    threads: !!g.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined',
    simd: hasSimd(),
    storage: !!g.isSecureContext && typeof caches !== 'undefined' && !!g.crypto?.subtle,
    memoryGB: typeof nav?.deviceMemory === 'number' ? nav.deviceMemory : undefined,
    phone: isPhone(),
    forceWasm,
  };
}

/** Threads ORT should use: min(4, cores / 2) when isolated, else 1. */
export function threadCount(env: Pick<DeviceEnv, 'threads'>, cores = globalThis.navigator?.hardwareConcurrency ?? 2): number {
  return env.threads ? Math.max(1, Math.min(4, Math.floor(cores / 2))) : 1;
}
