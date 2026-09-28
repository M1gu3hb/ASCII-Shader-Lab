import { afterEach, describe, expect, it, vi } from 'vitest';
import { videoEncoderGap } from '../../src/studio/caps';

// user agents as each browser sends them
const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const IOS_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const WEBKIT_LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
const CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const IOS_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1';
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0';

const withApis = (o: { encoder: boolean; recorder: boolean }) => {
  if (o.encoder) { vi.stubGlobal('VideoEncoder', class {}); vi.stubGlobal('VideoFrame', class {}); }
  if (o.recorder) vi.stubGlobal('MediaRecorder', class {});
};

describe('frame-by-frame video: when the studio asks for encoders', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('asks every browser that has WebCodecs and a recorder (Safari included)', () => {
    withApis({ encoder: true, recorder: true });
    for (const ua of [SAFARI, IOS_SAFARI, CHROME, IOS_CHROME, FIREFOX, WEBKIT_LINUX]) expect(videoEncoderGap(ua), ua).toBe('');
  });

  it('does not ask a WebKit without media encoding (asking closes the page)', () => {
    withApis({ encoder: true, recorder: false });
    expect(videoEncoderGap(WEBKIT_LINUX)).toBe('no-encoders');
    expect(videoEncoderGap(SAFARI)).toBe('no-encoders');
    // other engines without MediaRecorder are still asked: only WebKit crashes on the question
    expect(videoEncoderGap(CHROME)).toBe('');
    expect(videoEncoderGap(IOS_CHROME)).toBe('');
    expect(videoEncoderGap(FIREFOX)).toBe('');
  });

  it('says when there is no WebCodecs at all', () => {
    withApis({ encoder: false, recorder: true });
    expect(videoEncoderGap(CHROME)).toBe('no-webcodecs');
  });
});
