import { describe, expect, it } from 'vitest';
import { audioRouteFor, describeFormats, encoderGap, videoCodecFor, type EncodeCaps, type SoundInfo } from '../../src/video/formats';

const caps = (o: Partial<{ video: Partial<EncodeCaps['video']>; alpha: Partial<EncodeCaps['alpha']>; audio: Partial<EncodeCaps['audio']>; gap: EncodeCaps['gap'] }> = {}): EncodeCaps => ({
  gap: o.gap ?? '',
  video: { avc: false, hevc: false, vp9: false, vp8: false, av1: false, ...o.video },
  alpha: { vp9: false, vp8: false, ...o.alpha },
  audio: { aac: false, opus: false, ...o.audio },
});

/** This machine's Chromium (Playwright, Linux): no H.264, VP8/VP9/AV1, Opus only, no alpha encoding. */
const linuxChromium = caps({ video: { vp9: true, vp8: true, av1: true }, audio: { opus: true } });
/** Chrome on Windows/macOS: H.264 and AAC too; VP9 alpha works. */
const desktopChrome = caps({ video: { avc: true, vp9: true, vp8: true, av1: true }, audio: { opus: true, aac: true }, alpha: { vp9: true, vp8: true } });
/** Firefox desktop: H.264 (via OpenH264), VP8/VP9, no AAC encoder. */
const firefox = caps({ video: { avc: true, vp9: true, vp8: true }, audio: { opus: true } });

const aac: SoundInfo = { has: true, codec: 'aac', decodable: true };
const opus: SoundInfo = { has: true, codec: 'opus', decodable: true };

describe('video codec choice', () => {
  it('MP4: H.264 first, then AV1, then VP9', () => {
    expect(videoCodecFor('mp4', desktopChrome, false)).toEqual({ codec: 'avc', alpha: false });
    expect(videoCodecFor('mp4', linuxChromium, false)).toEqual({ codec: 'av1', alpha: false });
    expect(videoCodecFor('mp4', caps({ video: { vp9: true } }), false)).toEqual({ codec: 'vp9', alpha: false });
    expect(videoCodecFor('mp4', caps({ video: { vp8: true } }), false)).toBeNull();
  });
  it('WebM: alpha only where the round trip worked', () => {
    expect(videoCodecFor('webm', desktopChrome, true)).toEqual({ codec: 'vp9', alpha: true });
    expect(videoCodecFor('webm', linuxChromium, true)).toEqual({ codec: 'vp9', alpha: false });
    expect(videoCodecFor('webm', caps({ video: { vp8: true }, alpha: { vp8: true } }), true)).toEqual({ codec: 'vp8', alpha: true });
    expect(videoCodecFor('webm', caps({ gap: 'no-webcodecs' }), false)).toBeNull();
  });
});

describe('audio route', () => {
  it('copies when the codec fits the container and the range is straight', () => {
    expect(audioRouteFor('mp4', aac, linuxChromium, true)).toEqual({ route: 'copy' });
    expect(audioRouteFor('mp4', opus, linuxChromium, true)).toEqual({ route: 'copy' });
    expect(audioRouteFor('webm', opus, linuxChromium, true)).toEqual({ route: 'copy' });
  });
  it('re-encodes AAC for WebM with Opus, or when the plan is not straight', () => {
    expect(audioRouteFor('webm', aac, desktopChrome, true)).toEqual({ route: 'encode', codec: 'opus' });
    expect(audioRouteFor('mp4', aac, desktopChrome, false)).toEqual({ route: 'encode', codec: 'aac' });
    expect(audioRouteFor('mp4', aac, firefox, false)).toEqual({ route: 'encode', codec: 'opus' });
  });
  it('says why when it cannot', () => {
    const r = audioRouteFor('webm', { has: true, codec: 'aac', decodable: false }, linuxChromium, true);
    expect(r.route).toBe('unsupported');
    expect(audioRouteFor('mp4', opus, caps({ video: { avc: true } }), false).route).toBe('unsupported');
    expect(audioRouteFor('mp4', { has: false, codec: null, decodable: false }, desktopChrome, true)).toEqual({ route: 'none' });
  });
});

describe('format list', () => {
  const base = { transparent: false, sound: opus, straight: true, w: 1280, h: 720, frames: 300 };
  it('this machine: MP4 in AV1 with an honest note, WebM VP9, GIF and PNG always', () => {
    const f = describeFormats(linuxChromium, base);
    expect(f.map(x => x.format)).toEqual(['mp4', 'webm', 'gif', 'png-zip']);
    expect(f[0]).toMatchObject({ available: true, label: 'MP4 (AV1)', audio: true, alpha: false });
    expect(f[0].limits).toMatch(/no codifica H\.264/);
    expect(f[1]).toMatchObject({ available: true, label: 'WebM (VP9)', audio: true });
    expect(f[2]).toMatchObject({ available: true, audio: false });
    expect(f[3]).toMatchObject({ available: true, audio: false });
  });
  it('transparency: real in WebM where alpha round-trips, otherwise PNG is offered', () => {
    const here = describeFormats(linuxChromium, { ...base, transparent: true });
    expect(here[1].alpha).toBe(false);
    expect(here[1].limits).toMatch(/secuencia PNG/);
    expect(here[3].alpha).toBe(true);
    const chrome = describeFormats(desktopChrome, { ...base, transparent: true });
    expect(chrome[1]).toMatchObject({ alpha: true, label: 'WebM (VP9)' });
  });
  it('without WebCodecs, video is unavailable with a reason and alternatives', () => {
    const f = describeFormats(caps({ gap: 'no-webcodecs' }), base);
    expect(f[0].available).toBe(false);
    expect(f[0].why).toMatch(/GIF/);
    expect(f[2].available).toBe(true);
  });
  it('too many frames for a zip', () => {
    expect(describeFormats(linuxChromium, { ...base, frames: 70_000 })[3].available).toBe(false);
  });
  it('WebKit without encoders is never asked (it closes the page)', () => {
    // node has no VideoEncoder: no WebCodecs at all
    expect(encoderGap('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15')).toBe('no-webcodecs');
  });
});
