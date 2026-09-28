import { describe, expect, it } from 'vitest';
import { allFiles, fileUrl, inputSize, MODELS, variantBytes, variantFiles } from '../../src/cutout/models';

/** Repositories and names that must never be in the registry (licences: non-commercial, AGPL, gated, none). */
const BANNED = [
  /briaai/i, /rmbg/i, /bria-rmbg/i, // BRIA RMBG 1.4 / 2.0: non-commercial (rembg's default model is RMBG-2.0)
  /isnet/i, /imgly/i, /img\.ly/i, // ISNet ONNX / @imgly/background-removal: AGPL
  /sam3/i, /facebook\/sam-?3/i, // SAM 3: custom licence, gated
  /silueta/i, // no licence
  /u2net/i, // rembg's older default family: not reviewed here
];

describe('cutout model registry', () => {
  it('has the four models of the contract', () => {
    expect(MODELS.map(m => m.id).sort()).toEqual(['portrait', 'select', 'subject', 'subject-hq']);
  });

  it('only contains MIT or Apache-2.0 code AND weights', () => {
    for (const m of MODELS) {
      expect(['MIT', 'Apache-2.0'], `${m.id} code`).toContain(m.licence.code);
      expect(['MIT', 'Apache-2.0'], `${m.id} weights`).toContain(m.licence.weights);
      expect(m.licenceSource.length).toBeGreaterThan(20);
      expect(m.data.length).toBeGreaterThan(20);
    }
  });

  it('never includes excluded models (BRIA RMBG, rembg default, ISNet/IMG.LY, SAM 3, silueta)', () => {
    for (const m of MODELS) {
      const text = [m.repo, m.upstream, m.upstreamUrl, ...[m.webgpu, m.wasm].flatMap(v => (v ? variantFiles(v).map(f => f.path) : []))].join(' ');
      for (const re of BANNED) expect(re.test(text), `${m.id} matches ${re}`).toBe(false);
    }
  });

  it('pins every file to a commit with sha256 and size', () => {
    const files = allFiles();
    expect(files.length).toBeGreaterThanOrEqual(12);
    for (const { spec, file, url } of files) {
      expect(spec.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(file.bytes).toBeGreaterThan(100_000);
      expect(url).toBe(`https://huggingface.co/${spec.repo}/resolve/${spec.commit}/${file.path}`);
      expect(fileUrl(spec, file)).toBe(url);
    }
    // No two different files share a hash.
    const shas = files.map(f => f.file.sha256);
    expect(new Set(shas).size).toBe(shas.length);
  });

  it('keeps the high-definition cutout WebGPU-only, with the hash published on its card', () => {
    const hq = MODELS.find(m => m.id === 'subject-hq')!;
    expect(hq.wasm).toBeUndefined();
    expect(hq.webgpu!.parts.model.graph.sha256).toBe('4059896039dfccb0f15b9080ff06d11d90e499449bb045e797055eb8901cf5f4');
    expect(hq.webgpu!.parts.model.graph.bytes).toBe(114834127);
  });

  it('ships fp16 to WebGPU and fp32/uint8 to WASM', () => {
    for (const m of MODELS) {
      if (m.webgpu) expect(m.webgpu.dtype).toBe('fp16');
      if (m.wasm) expect(['fp32', 'uint8']).toContain(m.wasm.dtype);
    }
    const subject = MODELS.find(m => m.id === 'subject')!;
    expect(variantBytes(subject.wasm!)).toBe(191877254);
    expect(subject.desktopWasmOnly).toBe(true);
    const select = MODELS.find(m => m.id === 'select')!;
    expect(Object.keys(select.wasm!.parts)).toEqual(['encoder', 'decoder']);
    for (const p of Object.values(select.wasm!.parts)) expect(p.data?.path).toMatch(/\.onnx_data$/);
  });

  it('computes model input sizes', () => {
    const portrait = MODELS.find(m => m.id === 'portrait')!.input;
    expect(inputSize(portrait, 1280, 1073)).toEqual({ tw: 608, th: 512 });
    expect(inputSize(portrait, 4000, 500).tw).toBeLessThanOrEqual(1024);
    const subject = MODELS.find(m => m.id === 'subject')!.input;
    expect(inputSize(subject, 1280, 1073)).toEqual({ tw: 512, th: 512 });
  });
});
