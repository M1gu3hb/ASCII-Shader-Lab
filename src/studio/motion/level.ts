import { motionLevel, type MotionLevel } from '../../shared/glyphfx';
import { usePreview } from '../preview';

/**
 * How much the studio moves: 'none' under prefers-reduced-motion (always wins), 'low' with the preview
 * quality «Ligera» (or a weak device, Save-Data), 'full' otherwise. The quality setting reaches every
 * effect through data-motion="low" on <html> (glyphfx reads it; CSS can too).
 */
export const level = (): MotionLevel => motionLevel();

let synced = false;

/** Keeps data-motion on <html> in step with the preview quality. Call once at startup. */
export function syncMotionAttr() {
  if (synced || typeof document === 'undefined') return;
  synced = true;
  const apply = (q: string) => {
    const html = document.documentElement;
    if (q === 'ligera') html.dataset.motion = 'low';
    else if (html.dataset.motion === 'low') delete html.dataset.motion;
  };
  apply(usePreview.getState().quality);
  usePreview.subscribe((s, prev) => { if (s.quality !== prev.quality) apply(s.quality); });
}
