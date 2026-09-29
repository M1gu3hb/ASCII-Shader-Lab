/**
 * Speed curves: the named presets as small curve buttons, and a curve editor for a custom one (two bezier
 * handles, dragged with a pointer or moved with the arrow keys; shift = bigger steps). Model: anim/curve.ts.
 */
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { EASE_PRESETS, presetOf } from '../../anim/ease';
import { curveBox, curvePath, dragHandle, easeOfHandles, fromPx, handlesOf, nudgeHandle, toPx, type Handles } from '../../anim/curve';
import type { Ease } from '../../project/types';

export function EaseIcon({ ease }: { ease: Ease }) {
  const box = curveBox(ease, 56, 36, 4);
  return <svg viewBox="0 0 56 36" aria-hidden="true"><path d={curvePath(ease, box)} /></svg>;
}

export function EasePicker({ value, onChange, label = 'Curva de velocidad' }: { value: Ease; onChange: (e: Ease, commit?: boolean) => void; label?: string }) {
  const current = presetOf(value);
  const [custom, setCustom] = useState(!current && value.kind === 'bezier');
  return (
    <div role="group" aria-label={label}>
      <div className="tl-eases">
        {EASE_PRESETS.filter(p => !p.id.startsWith('css-') || current?.id === p.id).map(p => (
          <button key={p.id} type="button" className="tl-ease" aria-pressed={current?.id === p.id} title={p.blurb} onClick={() => { setCustom(false); onChange(p.ease, true); }}>
            <EaseIcon ease={p.ease} />{p.name}
          </button>
        ))}
        <button type="button" className="tl-ease" aria-pressed={!current || custom} title="Mueve los dos tiradores de la curva"
          onClick={() => { setCustom(true); if (value.kind !== 'bezier') onChange(easeOfHandles(handlesOf(value) ?? [0.4, 0, 0.6, 1]), true); }}>
          <EaseIcon ease={value.kind === 'bezier' && !current ? value : { kind: 'bezier', p: [0.2, 0.8, 0.6, 0.4] }} />Curva propia
        </button>
      </div>
      {(custom || !current) && handlesOf(value) && <CurveEditor value={value} onChange={onChange} />}
    </div>
  );
}

const W = 260, H = 190;

export function CurveEditor({ value, onChange }: { value: Ease; onChange: (e: Ease, commit?: boolean) => void }) {
  const h = handlesOf(value) ?? [0.4, 0, 0.6, 1];
  const box = curveBox(value, W, H, 18);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ which: 1 | 2; id: number; box: typeof box } | null>(null);
  const pt = (e: PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H] as const;
  };
  const down = (which: 1 | 2) => (e: PointerEvent<SVGElement>) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    // the box stays as it was when the drag started (it would grow under the pointer otherwise)
    drag.current = { which, id: e.pointerId, box };
  };
  const move = (e: PointerEvent<SVGElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const [px, py] = pt(e);
    const [x, y] = fromPx(d.box, px, py);
    onChange(easeOfHandles(dragHandle(h, d.which, x, y)));
  };
  const up = (e: PointerEvent<SVGElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    onChange(easeOfHandles(h), true);
  };
  const key = (which: 1 | 2) => (e: KeyboardEvent<SVGElement>) => {
    const s = e.shiftKey ? 0.1 : 0.01;
    const d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] }[e.key];
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    onChange(easeOfHandles(nudgeHandle(h, which, d[0], d[1])), true);
  };
  const [x0, y0] = toPx(box, 0, 0), [x1, y1] = toPx(box, 1, 1);
  const [ax, ay] = toPx(box, h[0], h[1]), [bx, by] = toPx(box, h[2], h[3]);
  const fmt = (v: Handles) => v.map(n => n.toFixed(2)).join(', ');
  return (
    <svg ref={svg} className="tl-curve" viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Curva propia: cubic-bezier(${fmt(h)})`}
      onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <rect className="frame" x={x0} y={y1} width={x1 - x0} height={y0 - y1} />
      <line className="guide" x1={x0} y1={y0} x2={x1} y2={y1} />
      <line className="arm" x1={x0} y1={y0} x2={ax} y2={ay} />
      <line className="arm" x1={x1} y1={y1} x2={bx} y2={by} />
      <path className="c" d={curvePath(value, box)} />
      {([[1, ax, ay], [2, bx, by]] as const).map(([w, x, y]) => (
        <g key={w}>
          <circle className="hit" cx={x} cy={y} r={20} onPointerDown={down(w)} />
          <circle className="hnd" cx={x} cy={y} r={7} tabIndex={0} role="slider" aria-label={w === 1 ? 'Tirador de salida' : 'Tirador de llegada'}
            aria-valuetext={`tiempo ${(w === 1 ? h[0] : h[2]).toFixed(2)}, valor ${(w === 1 ? h[1] : h[3]).toFixed(2)}`}
            onPointerDown={down(w)} onKeyDown={key(w)} />
        </g>
      ))}
    </svg>
  );
}
