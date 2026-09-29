/**
 * Print and social guides over the viewport: for a canvas of a known size (posters.ts posterGuides), the
 * trim line, the bleed around it and the safe area (and a story's bands covered by the apps). Drawn in the
 * page over the art (a DOM layer inside the viewport's frame, in percentages, so it follows zoom and pan):
 * never part of the composition, never exported.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { posterGuides } from '../../project/posters';
import { useProject } from '../../project/store';
import { useFoto } from '../ui';
import { useExtras } from './state';

const pct = (v: number) => `${(v * 100).toFixed(4)}%`;

/** The viewport's frame element (it appears when the editor mounts). */
function useFrameEl(): HTMLElement | null {
  const screen = useFoto(s => s.screen);
  const id = useProject(s => s.project?.id);
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (screen !== 'edit') { setEl(null); return; }
    let raf = 0, n = 0;
    const find = () => {
      const f = document.querySelector<HTMLElement>('[data-testid=frame]');
      if (f) { setEl(f); return; }
      if (++n < 240) raf = requestAnimationFrame(find);
    };
    find();
    return () => cancelAnimationFrame(raf);
  }, [screen, id]);
  return el?.isConnected ? el : null;
}

export function GuidesOverlay() {
  const canvas = useProject(s => s.project?.canvas);
  const on = useExtras(s => s.guides);
  const tool = useFoto(s => s.tool);
  const el = useFrameEl();
  if (!el || !canvas || !on) return null;
  const g = posterGuides(canvas);
  if (!g) return null;
  const box = (r: { x: number; y: number; w: number; h: number }) => ({ left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h) });
  return createPortal(
    <div className={'xg' + (tool ? ' dim' : '')} aria-hidden="true" data-testid="guias">
      {g.bleed > 0 && <div className="xg-trim" style={box(g.trim)} />}
      <div className="xg-safe" style={box(g.safe)} />
      {g.zones.map((z, i) => <div key={i} className="xg-zone" style={box(z)} />)}
      <span className="xg-tag" style={{ left: pct(g.safe.x), top: pct(g.safe.y) }}>{g.label}</span>
    </div>,
    el,
  );
}
