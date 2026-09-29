/**
 * H.264 in MP4: the AVC description the browser's encoder hands over, checked before it goes into the file.
 * repairAvcDescription is pure (no DOM); withRepairedAvc wraps the browser's VideoEncoder while a render runs
 * (shared by the lab's exports, studio/exporting.ts, and the movie exports, video/movie.ts).
 */

/**
 * An AVC description (AVCDecoderConfigurationRecord) whose parameter sets repeat their NAL header byte, as
 * Firefox 142's H.264 encoder hands it over on Linux (SPS «67 67 64 00 1f…»): the MP4's header then names
 * a parameter set that does not exist. Players that read the sets inside the video still play it; the
 * header is what editors and stricter players read. Returns the record repaired, or null when it is fine.
 */
export function repairAvcDescription(desc: Uint8Array): Uint8Array | null {
  if (desc.length < 7 || desc[0] !== 1) return null;
  let p = 5, fixed = false;
  const out: number[] = Array.from(desc.subarray(0, 5));
  const sets = (count: number, type: number, countByte: number) => {
    const list: Uint8Array[] = [];
    for (let k = 0; k < count; k++) {
      if (p + 2 > desc.length) return null;
      const len = (desc[p] << 8) | desc[p + 1];
      let nal = desc.subarray(p + 2, p + 2 + len);
      p += 2 + len;
      // a duplicated header: the byte after the header repeats it (0x67 is no H.264 profile; PPS only with it)
      if (nal.length > 2 && (nal[0] & 0x1f) === type && nal[1] === nal[0] && (type === 7 || fixed)) { nal = nal.subarray(1); fixed = true; }
      list.push(nal);
    }
    out.push(countByte);
    for (const n of list) out.push(n.length >> 8, n.length & 0xff, ...n);
    return list;
  };
  const nSps = desc[p] & 0x1f;
  const spsByte = desc[p++];
  if (!sets(nSps, 7, spsByte)) return null;
  if (p >= desc.length) return null;
  const nPps = desc[p++];
  if (!sets(nPps, 8, nPps)) return null;
  if (!fixed) return null;
  out.push(...desc.subarray(p));
  return new Uint8Array(out);
}

/**
 * While a render runs, the video encoder's AVC description goes through repairAvcDescription before the
 * muxer sees it (the encoder is created inside mediabunny). Returns the function that puts things back.
 */
export function withRepairedAvc(): () => void {
  const g = globalThis as unknown as { VideoEncoder?: typeof VideoEncoder };
  const Orig = g.VideoEncoder;
  if (!Orig) return () => {};
  class Repairing extends Orig {
    constructor(init: VideoEncoderInit) {
      super({
        ...init,
        output: (chunk, meta) => {
          const d = meta?.decoderConfig?.description;
          if (d && meta?.decoderConfig) {
            const bytes = ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : new Uint8Array(d);
            const fixed = /^avc1/.test(meta.decoderConfig.codec) ? repairAvcDescription(bytes) : null;
            if (fixed) meta = { ...meta, decoderConfig: { ...meta.decoderConfig, description: fixed } };
          }
          init.output(chunk, meta);
        },
      });
    }
  }
  g.VideoEncoder = Repairing;
  return () => { if (g.VideoEncoder === Repairing) g.VideoEncoder = Orig; };
}
