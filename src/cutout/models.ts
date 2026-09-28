/**
 * The cutout models: every file pinned to a Hugging Face commit, with its sha256 and size.
 *
 * Pure data (no DOM, no imports but types) so the ML worker, the page and scripts/fetch-models.mjs (Node) read
 * the same registry. Sizes and hashes come from the Hugging Face API (`/api/models/<repo>?blobs=true`, LFS oid =
 * sha256 of the file) and were re-computed on local copies of the files.
 *
 * Licences are stated separately for the code and for the weights. Only MIT and Apache-2.0 are allowed here
 * (tests/unit/cutout-models.test.ts): no BRIA RMBG (non-commercial), no ISNet/IMG.LY (AGPL), no rembg default,
 * no SAM 3 (gated custom licence), no silueta (no licence).
 */
import type { CutoutModelId } from './index';

export type Licence = 'MIT' | 'Apache-2.0';

export interface ModelFile {
  /** Path inside the repository at `commit`. */
  path: string;
  sha256: string;
  bytes: number;
}

/** One ONNX graph, optionally with an external-data file (`.onnx_data`) that the graph names by `path`'s base name. */
export interface GraphFiles {
  graph: ModelFile;
  data?: ModelFile;
}

/** The files one backend needs. `parts` has `model` for one-graph models, `encoder` + `decoder` for 'select'. */
export interface ModelVariant {
  dtype: 'fp16' | 'fp32' | 'uint8';
  parts: Record<string, GraphFiles>;
}

export interface ModelInput {
  /** 'square': stretched to size × size; 'shortest': shortest edge to `size`, both sides multiples of `multiple`. */
  resize: 'square' | 'shortest';
  size: number;
  multiple?: number;
  /** Longest side cap for 'shortest' (keeps panoramas bounded). */
  maxSide?: number;
  mean: [number, number, number];
  std: [number, number, number];
  /** Output is logits (apply a sigmoid) or already 0..1. */
  output: 'logits' | 'prob';
  inputName: string;
  outputName: string;
}

export interface ModelSpec {
  id: CutoutModelId;
  /** Spanish name and one honest line. */
  name: string;
  blurb: string;
  repo: string;
  commit: string;
  /** Original project → this export (Spanish, short). */
  upstream: string;
  upstreamUrl: string;
  licence: { code: Licence; weights: Licence };
  /** Where each licence is declared. */
  licenceSource: string;
  /** Training data, with its own terms (honest note, Spanish). */
  data: string;
  input: ModelInput;
  /** WebGPU files (fp16) and WASM files (fp32/uint8). A missing one means «not on that backend». */
  webgpu?: ModelVariant;
  wasm?: ModelVariant;
  /** Not offered on phones without WebGPU (memory). */
  desktopWasmOnly?: boolean;
  /** Rough peak memory on the WASM path, GB (measured, see research). */
  wasmMemoryGB?: number;
}

export const HF = 'https://huggingface.co';

/** The pinned download URL of a file (it redirects to the Hugging Face CDN, which answers with CORS «*»). */
export const fileUrl = (spec: Pick<ModelSpec, 'repo' | 'commit'>, f: ModelFile) =>
  `${HF}/${spec.repo}/resolve/${spec.commit}/${f.path}`;

const IMAGENET = { mean: [0.485, 0.456, 0.406] as [number, number, number], std: [0.229, 0.224, 0.225] as [number, number, number] };

export const MODELS: ModelSpec[] = [
  {
    id: 'subject',
    name: 'Sujeto',
    blurb: 'Recorta personas, objetos y animales. Trabaja a 512 px y los bordes se afinan con la foto.',
    repo: 'studioludens/birefnet-lite-512',
    commit: '4a3c40c36c94093cc1e724d9ea428b8fa4b57dc7',
    upstream: 'BiRefNet_lite (Peng Zheng et al.) · exportación ONNX a 512 × 512 de Studio Ludens',
    upstreamUrl: 'https://github.com/ZhengPeng7/BiRefNet',
    licence: { code: 'MIT', weights: 'MIT' },
    licenceSource: 'Repositorio ZhengPeng7/BiRefNet (LICENSE, MIT) y ficha del modelo en Hugging Face (license: mit).',
    data: 'Entrenado por sus autores con DIS5K y otros conjuntos de segmentación; los términos de DIS5K limitan ese conjunto de datos a investigación no comercial.',
    input: { resize: 'square', size: 512, ...IMAGENET, output: 'logits', inputName: 'input_image', outputName: 'output_image' },
    webgpu: {
      dtype: 'fp16',
      parts: { model: { graph: { path: 'onnx/model_fp16.onnx', sha256: 'eff9216bb2f9d3f023d9c2b7196845a7485739ab1f231593633e4d2344ffc516', bytes: 98484532 } } },
    },
    wasm: {
      dtype: 'fp32',
      parts: { model: { graph: { path: 'onnx/model.onnx', sha256: '1cb0fb360dadd15af77c639085d77a9df67db0c64315560c3de005f676345ac2', bytes: 191877254 } } },
    },
    desktopWasmOnly: true,
    wasmMemoryGB: 3,
  },
  {
    id: 'subject-hq',
    name: 'Sujeto (alta definición)',
    blurb: 'El mismo recorte a 1024 px: mejor pelo y pelaje. Necesita WebGPU y tarda varios segundos.',
    repo: 'jiabins0303/birefnet-lite-1024-webgpu',
    commit: 'dc4edd9f7623961aa5ae2b186c1b428f4ed38d6a',
    upstream: 'BiRefNet_lite (Peng Zheng et al.) · grafo a 1024 × 1024 adaptado a WebGPU por jiabins0303',
    upstreamUrl: 'https://github.com/ZhengPeng7/BiRefNet',
    licence: { code: 'MIT', weights: 'MIT' },
    licenceSource: 'Repositorio ZhengPeng7/BiRefNet (LICENSE, MIT) y ficha del modelo en Hugging Face (license: mit, cubre los pesos).',
    data: 'Mismos pesos que BiRefNet_lite: DIS5K entre sus datos de entrenamiento (términos de investigación no comercial para el conjunto de datos).',
    input: { resize: 'square', size: 1024, ...IMAGENET, output: 'logits', inputName: 'input_image', outputName: 'output_image' },
    webgpu: {
      dtype: 'fp16',
      parts: { model: { graph: { path: 'onnx/model_fp16.onnx', sha256: '4059896039dfccb0f15b9080ff06d11d90e499449bb045e797055eb8901cf5f4', bytes: 114834127 } } },
    },
  },
  {
    id: 'portrait',
    name: 'Retrato',
    blurb: 'Sólo personas: rápido y ligero, funciona en teléfonos. No sirve para objetos ni mascotas.',
    repo: 'Xenova/modnet',
    commit: 'fa2fa546052fba4c08921230a26cc69a333fca12',
    upstream: 'MODNet (Zhanghan Ke et al.) · exportación ONNX de Xenova',
    upstreamUrl: 'https://github.com/ZHKKKe/MODNet',
    licence: { code: 'Apache-2.0', weights: 'Apache-2.0' },
    licenceSource: 'README de ZHKKKe/MODNet («code, models, and demos … Apache License 2.0») y ficha de Xenova/modnet (license: apache-2.0).',
    data: 'Entrenado por sus autores con conjuntos de retratos para investigación; esos conjuntos tienen sus propios términos.',
    input: { resize: 'shortest', size: 512, multiple: 32, maxSide: 1024, mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5], output: 'prob', inputName: 'input', outputName: 'output' },
    webgpu: {
      dtype: 'fp16',
      parts: { model: { graph: { path: 'onnx/model_fp16.onnx', sha256: '25f165da9bfd30830a575f1f0490f1acd995975cb349bc02f3d79332e1fe5cf6', bytes: 12984781 } } },
    },
    wasm: {
      dtype: 'uint8',
      parts: { model: { graph: { path: 'onnx/model_uint8.onnx', sha256: '7bad6522b3cde60246e69e234b7786337ef9c88abc790ee5c1aaa6e535b0c61d', bytes: 6627048 } } },
    },
    wasmMemoryGB: 0.5,
  },
  {
    id: 'select',
    name: 'Seleccionar objeto',
    blurb: 'Toca lo que quieres (y lo que no): la selección se ajusta con cada punto. Funciona en teléfonos.',
    repo: 'onnx-community/EdgeTAM-ONNX',
    commit: '9c77c7bff7fd0f3079585fa17af7f730ddc531ed',
    upstream: 'EdgeTAM (Meta, derivado de SAM 2) · exportación ONNX de onnx-community',
    upstreamUrl: 'https://github.com/facebookresearch/EdgeTAM',
    licence: { code: 'Apache-2.0', weights: 'Apache-2.0' },
    licenceSource: 'README de facebookresearch/EdgeTAM («model checkpoints and code … Apache 2.0») y ficha de onnx-community/EdgeTAM-ONNX (license: apache-2.0).',
    data: 'Entrenado por Meta con SA-1B y SA-V (conjuntos publicados por Meta con sus propios términos).',
    input: { resize: 'square', size: 1024, ...IMAGENET, output: 'logits', inputName: 'pixel_values', outputName: 'pred_masks' },
    webgpu: {
      dtype: 'fp16',
      parts: {
        encoder: {
          graph: { path: 'onnx/vision_encoder_fp16.onnx', sha256: 'd8f560849085892866a5c652a600cafbbd301e11c15ff0d89c81e15fe91264ac', bytes: 167617 },
          data: { path: 'onnx/vision_encoder_fp16.onnx_data', sha256: '6a6741eb00b3049939675569818b207953cb13113a80ca9580c9c714d8646b38', bytes: 9739536 },
        },
        decoder: {
          graph: { path: 'onnx/prompt_encoder_mask_decoder_fp16.onnx', sha256: 'f6c0e539017b05ff12cd5be869f2a125d946dee10f6e79b64a7466dfceafafb9', bytes: 229799 },
          data: { path: 'onnx/prompt_encoder_mask_decoder_fp16.onnx_data', sha256: 'bda4d98aef24b7589313f9771c8d2d6380716a256bf5c926326eaf5054097d5b', bytes: 10454016 },
        },
      },
    },
    // fp32 on WASM: the uint8 encoder was measured here and its masks were unusable (IoU 0.18 against fp32 on
    // the same clicks) for a 6 % speed gain; fp16 on the WASM EP is ≈2.5× slower than fp32.
    wasm: {
      dtype: 'fp32',
      parts: {
        encoder: {
          graph: { path: 'onnx/vision_encoder.onnx', sha256: 'ed068218eba96760fe02d04ce899c449660ac813a088d80ed7f42c8bb01e7cec', bytes: 192225 },
          data: { path: 'onnx/vision_encoder.onnx_data', sha256: '21e75dba7077dfcb53e8c9a6e99977156f2240ff3f1f9cddc43d66aa1ecb528e', bytes: 19532576 },
        },
        decoder: {
          graph: { path: 'onnx/prompt_encoder_mask_decoder.onnx', sha256: 'd3668299ec3edf70fbb139ec642b54bf3d4be453fd1b688a6b5938e0856fe546', bytes: 213114 },
          data: { path: 'onnx/prompt_encoder_mask_decoder.onnx_data', sha256: 'dfa2125e30d08d388732f20c18fb63ab0f0f590cd270eb307f0c2b65919d1be8', bytes: 20958208 },
        },
      },
    },
    wasmMemoryGB: 0.5,
  },
];

export const modelSpec = (id: CutoutModelId): ModelSpec => {
  const m = MODELS.find(x => x.id === id);
  if (!m) throw new Error(`Modelo desconocido: ${id}`);
  return m;
};

/** Every file of a variant, in download order (graphs before their data). */
export const variantFiles = (v: ModelVariant): ModelFile[] =>
  Object.values(v.parts).flatMap(p => (p.data ? [p.graph, p.data] : [p.graph]));

export const variantBytes = (v: ModelVariant) => variantFiles(v).reduce((n, f) => n + f.bytes, 0);

/** Base name of a path: what an ONNX graph calls its external-data file. */
export const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** Every file of every model (for the optional same-origin mirror and the e2e routes). */
export const allFiles = (): Array<{ spec: ModelSpec; file: ModelFile; url: string }> => {
  const seen = new Set<string>();
  const out: Array<{ spec: ModelSpec; file: ModelFile; url: string }> = [];
  for (const spec of MODELS) for (const v of [spec.webgpu, spec.wasm]) {
    if (!v) continue;
    for (const file of variantFiles(v)) {
      if (seen.has(file.sha256)) continue;
      seen.add(file.sha256);
      out.push({ spec, file, url: fileUrl(spec, file) });
    }
  }
  return out;
};

/** The model's input size for a frame of fw × fh. */
export function inputSize(input: ModelInput, fw: number, fh: number): { tw: number; th: number } {
  if (input.resize === 'square') return { tw: input.size, th: input.size };
  const m = input.multiple ?? 1;
  let s = input.size / Math.min(fw, fh);
  if (input.maxSide && Math.max(fw, fh) * s > input.maxSide) s = input.maxSide / Math.max(fw, fh);
  return { tw: Math.max(m, Math.round((fw * s) / m) * m), th: Math.max(m, Math.round((fh * s) / m) * m) };
}
