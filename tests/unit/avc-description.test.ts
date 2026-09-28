import { describe, expect, it } from 'vitest';
import { repairAvcDescription } from '../../src/exporters/avc';

const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map(b => parseInt(b, 16)));
const toHex = (u: Uint8Array) => Array.from(u, b => b.toString(16).padStart(2, '0')).join('');

/**
 * Descriptions taken from real MP4s rendered by the studio on this machine. Firefox 142 (Linux) repeated the
 * NAL header byte of each parameter set: ffmpeg then read an SPS with id 14 and a PPS pointing at SPS 1
 * («sps_id 1 out of range»), while the parameter sets inside the video said SPS 0.
 */
const FIREFOX = '0164001f0301001a676764001facd94040067ea5840000030004007a12003c60c6580100076868ebe3cb22c0';
const CHROME = '01640c1fffe1001467640c1fac18d00800cfd4b35010d0107844235001000468ce3c80fdf8f800';

describe('AVC description of an MP4', () => {
  it('drops the repeated header byte of each parameter set', () => {
    const fixed = repairAvcDescription(hex(FIREFOX))!;
    expect(fixed).not.toBeNull();
    // same header; SPS «67 64 00 1f…» (25 bytes) and PPS «68 eb e3 cb 22 c0» (6 bytes), as in the video
    expect(toHex(fixed)).toBe('0164001f03' + '01' + '0019' + '6764001facd94040067ea5840000030004007a12003c60c658' + '01' + '0006' + '68ebe3cb22c0');
  });

  it('leaves a well-formed description alone', () => {
    expect(repairAvcDescription(hex(CHROME))).toBeNull();
    expect(repairAvcDescription(hex('01'))).toBeNull();
  });
});
