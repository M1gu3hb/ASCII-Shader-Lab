import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { HOLD_MS, SCROLL_QUIET_MS, dragValue, fineGain, intentOf, pickIntentOf } from '../slideMath';
import { C_MAX, describe, formats, gamutChroma, hexToLch, lchToHex, parseColor, type Lch } from './color-math';
import './color.css';

/**
 * The studio's own colour editor (the same on phone, tablet and computer; native pickers differ everywhere):
 * a square of light (up) and intensity (right) for the current hue, a strip of hues, and exact fields (a code
 * in hex, rgb(), hsl() or oklch(), or tone, light and intensity as numbers). It works in OKLCH, a space where
 * the same step looks like the same change to the eye, and never leaves what the screen can show (the hatched
 * part of the square is out of reach). The keyboard moves with the arrows. Every change reaches the piece at
 * once (onChange); the studio groups quick changes into one undo step.
 *
 * A mouse presses and drags directly. Where fingers and pens are used (any coarse pointer), scrolling the
 * settings over the editor never changes the colour, and a change is deliberate (ui/slideMath.ts):
 *  - the hue strip, as every slider (ui/Range.tsx): a clear sideways movement takes it, then the hue follows the
 *    finger from where it was (no jump), finer away from the strip; up or down scrolls; a tap changes nothing;
 *  - the square: a tap places the knob; resting still a moment takes it (the knob comes under the finger and
 *    follows it, up and down too), and so does a sideways start (the knob follows from where it was); a quick
 *    movement up or down scrolls.
 */
export interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  /** what the colour is for («Fondo», «Color 2 de 3»…), for names and screen readers */
  label: string;
  /** colours shown as quick picks under the fields (e.g. the palette of the piece) */
  swatches?: string[];
}

const AREA_W = 96, AREA_H = 64;
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const HUE_MAX = 359.9;

/** Devices with fingers or pens (the same test as the sliders'). */
const coarse = () => typeof matchMedia === 'function' && matchMedia('(any-pointer: coarse)').matches;
/** When the page (any scrolling part of it) last scrolled: a tap that only stopped a scroll places nothing. */
let lastScroll = -1e9;
if (typeof document !== 'undefined') document.addEventListener('scroll', () => { lastScroll = performance.now(); }, { capture: true, passive: true });

/** A finger or pen on the square or the strip, until it shows what it wants and while it adjusts. */
interface Finger {
  id: number;
  which: 'area' | 'hue';
  mode: 'pending' | 'drag';
  x0: number; y0: number; t0: number;
  x: number; y: number;
  /** strip: the hue (unrounded) and the row the drag was taken on (finer away from it) */
  acc: number; ey: number;
  /** square: from the finger to the knob (CSS px), kept while it drags */
  ox: number; oy: number;
  hold: number;
}

/** Paints the square of light × intensity for one hue; beyond the screen's gamut, a neutral hatch. */
function paintArea(c: HTMLCanvasElement, h: number) {
  const x = c.getContext('2d');
  if (!x) return;
  const img = x.createImageData(AREA_W, AREA_H);
  const d = img.data;
  for (let j = 0; j < AREA_H; j++) {
    const L = 1 - j / (AREA_H - 1);
    const max = gamutChroma(L, h);
    for (let i = 0; i < AREA_W; i++) {
      const C = (i / (AREA_W - 1)) * C_MAX, o = (j * AREA_W + i) * 4;
      if (C <= max + 0.002) {
        const hex = lchToHex(L, C, h);
        const n = parseInt(hex.slice(1), 16);
        d[o] = n >> 16; d[o + 1] = (n >> 8) & 255; d[o + 2] = n & 255;
      } else {
        const v = (i + j) % 6 < 3 ? 38 : 28;
        d[o] = v; d[o + 1] = v - 2; d[o + 2] = v - 4;
      }
      d[o + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
}

function paintHue(c: HTMLCanvasElement) {
  const x = c.getContext('2d');
  if (!x) return;
  for (let i = 0; i < c.width; i++) {
    const h = (i / (c.width - 1)) * 360;
    // each hue at its most colourful lightness would jump in brightness: a steady .72 reads as one band
    x.fillStyle = lchToHex(0.72, 0.16, h);
    x.fillRect(i, 0, 1, c.height);
  }
}

export function ColorPicker({ value, onChange, label, swatches }: ColorPickerProps) {
  const id = useId();
  const [lch, setLch] = useState<Lch>(() => hexToLch(value));
  const [text, setText] = useState(value.toUpperCase());
  const [bad, setBad] = useState(false);
  const lastOut = useRef(value);
  const area = useRef<HTMLCanvasElement>(null);
  const hue = useRef<HTMLCanvasElement>(null);
  const areaBox = useRef<HTMLDivElement>(null);
  const hueBox = useRef<HTMLDivElement>(null);
  const drag = useRef<'area' | 'hue' | null>(null);
  const finger = useRef<Finger | null>(null);
  const [taken, setTaken] = useState<'area' | 'hue' | null>(null);
  const [tip, setTip] = useState(false);
  const tipT = useRef(0);
  const raf = useRef(0);
  const pending = useRef<string | null>(null);

  // a change from outside (undo, another control, another stop chosen): follow it, keeping the hue of a grey
  useEffect(() => {
    if (value.toLowerCase() === lastOut.current.toLowerCase() && drag.current) return;
    if (value.toLowerCase() !== lastOut.current.toLowerCase()) {
      setLch(prev => hexToLch(value, prev.h));
      lastOut.current = value;
    }
    setText(value.toUpperCase());
    setBad(false);
  }, [value]);

  useEffect(() => { if (area.current) paintArea(area.current, lch.h); }, [lch.h]);
  useEffect(() => { if (hue.current) paintHue(hue.current); }, []);
  useEffect(() => () => { cancelAnimationFrame(raf.current); clearTimeout(tipT.current); clearTimeout(finger.current?.hold); }, []);
  // once a finger has taken the square or the strip, the page must not scroll under it (they allow vertical panning)
  useEffect(() => {
    const els = [areaBox.current, hueBox.current].filter((x): x is HTMLDivElement => !!x);
    const block = (e: TouchEvent) => { if (finger.current?.mode === 'drag' && e.cancelable) e.preventDefault(); };
    for (const el of els) el.addEventListener('touchmove', block, { passive: false });
    return () => { for (const el of els) el.removeEventListener('touchmove', block); };
  }, []);

  const emit = useCallback((next: Lch) => {
    const C = Math.min(next.C, gamutChroma(next.L, next.h));
    const n = { L: next.L, C, h: next.h };
    setLch(n);
    const hex = lchToHex(n.L, n.C, n.h);
    setText(hex.toUpperCase());
    setBad(false);
    lastOut.current = hex;
    // one change per frame reaches the piece (a drag sends many pointer events per frame)
    pending.current = hex;
    if (!raf.current) raf.current = requestAnimationFrame(() => { raf.current = 0; if (pending.current) onChange(pending.current); pending.current = null; });
  }, [onChange]);

  // (the latest colour, for a finger's hold that fires between renders)
  const lchNow = useRef(lch);
  lchNow.current = lch;
  const areaAt = (x: number, y: number) => {
    const r = areaBox.current!.getBoundingClientRect();
    emit({ L: clamp01(1 - (y - r.top) / r.height), C: clamp01((x - r.left) / r.width) * C_MAX, h: lchNow.current.h });
  };
  const fromArea = (ev: PointerEvent<HTMLElement>) => areaAt(ev.clientX, ev.clientY);
  const fromHue = (ev: PointerEvent<HTMLElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    emit({ ...lch, h: Math.max(0, Math.min(HUE_MAX, ((ev.clientX - r.left) / r.width) * 360)) });
  };

  /* a finger or a pen (ui/slideMath.ts): nothing until it shows what it wants */
  const take = (f: Finger, how: 'hold' | 'slide') => {
    f.mode = 'drag';
    clearTimeout(f.hold);
    const box = (f.which === 'area' ? areaBox : hueBox).current;
    try { box?.setPointerCapture(f.id); } catch { /* the pointer is gone */ }
    box?.focus({ preventScroll: true });
    setTaken(f.which);
    setTip(false);
    if (f.which === 'hue') { f.acc = lchNow.current.h; f.ey = f.y; return; }
    // the square: held still, the knob comes under the finger; slid sideways, it follows from where it was
    const r = areaBox.current!.getBoundingClientRect(), c = lchNow.current;
    if (how === 'hold') { f.ox = 0; f.oy = 0; areaAt(f.x, f.y); }
    else { f.ox = r.left + (c.C / C_MAX) * r.width - f.x; f.oy = r.top + (1 - c.L) * r.height - f.y; }
  };
  const release = () => {
    const f = finger.current;
    if (f) clearTimeout(f.hold);
    finger.current = null;
    setTaken(null);
  };
  const fingerDown = (which: 'area' | 'hue', ev: PointerEvent<HTMLElement>) => {
    if (finger.current) return;
    const f: Finger = { id: ev.pointerId, which, mode: 'pending', x0: ev.clientX, y0: ev.clientY, t0: performance.now(), x: ev.clientX, y: ev.clientY, acc: 0, ey: ev.clientY, ox: 0, oy: 0, hold: 0 };
    finger.current = f;
    if (which === 'area') {
      f.hold = window.setTimeout(() => {
        if (finger.current !== f || f.mode !== 'pending') return;
        // confirmed with the next frame: a movement already on its way (a busy page hands it over with that
        // frame, before this) decides first, so a quick swipe never becomes a hold
        requestAnimationFrame(() => {
          if (finger.current !== f || f.mode !== 'pending') return;
          if (pickIntentOf(f.x - f.x0, f.y - f.y0, performance.now() - f.t0) === 'hold') take(f, 'hold');
        });
      }, HOLD_MS);
    }
  };
  const fingerMove = (ev: PointerEvent<HTMLElement>) => {
    const f = finger.current;
    if (!f || ev.pointerId !== f.id) return;
    const dx = ev.clientX - f.x;
    f.x = ev.clientX; f.y = ev.clientY;
    if (f.mode === 'pending') {
      const it = f.which === 'area' ? pickIntentOf(f.x - f.x0, f.y - f.y0, performance.now() - f.t0) : intentOf(f.x - f.x0, f.y - f.y0);
      if (it === 'scroll') { release(); return; }
      // (the movement up to the threshold does not count: the colour starts where it was)
      if (it === 'drag' || it === 'hold') take(f, it === 'hold' ? 'hold' : 'slide');
      return;
    }
    if (f.which === 'area') { areaAt(f.x + f.ox, f.y + f.oy); return; }
    const w = hueBox.current!.getBoundingClientRect().width;
    f.acc = dragValue(f.acc, dx, w, 0, HUE_MAX, fineGain(f.y - f.ey));
    emit({ ...lchNow.current, h: f.acc });
  };
  const fingerUp = (ev: PointerEvent<HTMLElement>) => {
    const f = finger.current;
    if (!f || ev.pointerId !== f.id) return;
    const tap = f.mode === 'pending';
    release();
    if (!tap) return;
    if (f.which === 'area') {
      // a tap places the knob (unless it only stopped the page scrolling)
      if (performance.now() - lastScroll > SCROLL_QUIET_MS) { areaBox.current?.focus({ preventScroll: true }); areaAt(ev.clientX, ev.clientY); }
    } else {
      // a tap on the strip changes nothing: say how it works, for a moment
      setTip(true);
      clearTimeout(tipT.current);
      tipT.current = window.setTimeout(() => setTip(false), 2200);
    }
  };

  const direct = (ev: PointerEvent<HTMLElement>) => ev.pointerType === 'mouse' || !coarse();
  const down = (which: 'area' | 'hue') => (ev: PointerEvent<HTMLElement>) => {
    if (ev.button !== 0) return;
    if (!direct(ev)) { fingerDown(which, ev); return; }
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* a pointer the browser no longer tracks */ }
    ev.currentTarget.focus({ preventScroll: true });
    drag.current = which;
    (which === 'area' ? fromArea : fromHue)(ev);
  };
  const move = (which: 'area' | 'hue') => (ev: PointerEvent<HTMLElement>) => {
    if (finger.current) { fingerMove(ev); return; }
    if (drag.current !== which) return;
    (which === 'area' ? fromArea : fromHue)(ev);
  };
  const up = (ev: PointerEvent<HTMLElement>) => { if (finger.current) fingerUp(ev); drag.current = null; };
  const cancel = (ev: PointerEvent<HTMLElement>) => { if (finger.current?.id === ev.pointerId) release(); drag.current = null; };

  const areaKey = (ev: KeyboardEvent) => {
    const big = ev.shiftKey;
    let { L, C } = lch;
    switch (ev.key) {
      case 'ArrowUp': L += big ? 0.05 : 0.01; break;
      case 'ArrowDown': L -= big ? 0.05 : 0.01; break;
      case 'ArrowRight': C += big ? 0.02 : 0.005; break;
      case 'ArrowLeft': C -= big ? 0.02 : 0.005; break;
      case 'PageUp': L += 0.1; break;
      case 'PageDown': L -= 0.1; break;
      case 'Home': C = 0; break;
      case 'End': C = gamutChroma(L, lch.h); break;
      default: return;
    }
    // the studio's own arrows (history) must not see keys that moved the colour
    ev.preventDefault();
    ev.stopPropagation();
    emit({ L: Math.max(0, Math.min(1, L)), C: Math.max(0, Math.min(C_MAX, C)), h: lch.h });
  };
  const hueKey = (ev: KeyboardEvent) => {
    const step = ev.shiftKey ? 10 : 1;
    let h = lch.h;
    switch (ev.key) {
      case 'ArrowRight': case 'ArrowUp': h += step; break;
      case 'ArrowLeft': case 'ArrowDown': h -= step; break;
      case 'PageUp': h += 30; break;
      case 'PageDown': h -= 30; break;
      case 'Home': h = 0; break;
      case 'End': h = 359; break;
      default: return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    emit({ ...lch, h: ((h % 360) + 360) % 360 });
  };

  const commitText = () => {
    const hex = parseColor(text);
    if (!hex) { setBad(true); return; }
    setBad(false);
    const n = hexToLch(hex, lch.h);
    setLch(n);
    setText(hex.toUpperCase());
    lastOut.current = hex;
    onChange(hex);
  };

  const hex = lchToHex(lch.L, lch.C, lch.h);
  const max = gamutChroma(lch.L, lch.h);
  const L100 = Math.round(lch.L * 100), Cr = round(lch.C, 3), H = Math.round(lch.h);
  const what = describe(hex);
  const f = formats(hex);
  const field = (name: string, v: number, min: number, max: number, step: number, set: (x: number) => Lch, unit: string) => (
    <label className="cp-num">
      <span>{name}</span>
      <NumberField value={v} min={min} max={max} step={step} unit={unit} onCommit={x => emit(set(x))} label={`${name} de ${label}`} />
    </label>
  );
  return (
    <div className="cp" role="group" aria-labelledby={id + 't'}>
      <span id={id + 't'} className="sr-only">Editor de color: {label}</span>
      <div className="cp-top">
        <div
          ref={areaBox} className={'cp-area' + (taken === 'area' ? ' cp-on' : '')} role="slider" tabIndex={0}
          aria-label={`Luz e intensidad de ${label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={L100}
          aria-valuetext={`Luz ${L100} %, intensidad ${Cr.toFixed(2)}: ${what}`}
          aria-describedby={id + 'k'}
          onPointerDown={down('area')} onPointerMove={move('area')} onPointerUp={up} onPointerCancel={cancel} onKeyDown={areaKey}
        >
          <canvas ref={area} width={AREA_W} height={AREA_H} aria-hidden="true" />
          <span className="cp-knob" style={{ left: `${(lch.C / C_MAX) * 100}%`, top: `${(1 - lch.L) * 100}%`, background: hex }} aria-hidden="true" />
          <span className="cp-edge" style={{ left: `${(max / C_MAX) * 100}%` }} aria-hidden="true" />
        </div>
        <div className="cp-now" aria-hidden="true">
          <span className="cp-sw" style={{ background: hex }} />
          <span className="cp-was" style={{ background: value }} />
        </div>
      </div>
      <span id={id + 'k'} className="sr-only">Flechas arriba y abajo: más o menos luz. Derecha e izquierda: más o menos intensidad. Con Mayúsculas, pasos grandes.</span>
      <div
        ref={hueBox} className={'cp-hue' + (taken === 'hue' ? ' cp-on' : '') + (tip ? ' cp-tip' : '')} role="slider" tabIndex={0} aria-label={`Tono de ${label}`}
        aria-valuemin={0} aria-valuemax={360} aria-valuenow={H} aria-valuetext={`${H}°, ${what}`}
        onPointerDown={down('hue')} onPointerMove={move('hue')} onPointerUp={up} onPointerCancel={cancel} onKeyDown={hueKey}
      >
        <canvas ref={hue} width={180} height={1} aria-hidden="true" />
        <span className="cp-knob" style={{ left: `${(lch.h / 360) * 100}%`, background: lchToHex(0.72, 0.16, lch.h) }} aria-hidden="true" />
      </div>
      <div className="cp-fields">
        <label className="cp-code">
          <span>Código</span>
          <input
            type="text" value={text} spellCheck={false} autoComplete="off" aria-invalid={bad || undefined} aria-describedby={id + 'c'}
            aria-label={`Código de ${label} (hex, rgb, hsl u oklch)`}
            onChange={ev => { setText(ev.target.value); const h = parseColor(ev.target.value); if (h && /^#?[0-9a-f]{6}$/i.test(ev.target.value.trim())) { setBad(false); setLch(hexToLch(h, lch.h)); lastOut.current = h; onChange(h); } }}
            onKeyDown={ev => { if (ev.key === 'Enter') { ev.preventDefault(); commitText(); } }}
            onBlur={commitText}
          />
        </label>
        {field('Tono', H, 0, 360, 1, x => ({ ...lch, h: ((x % 360) + 360) % 360 }), '°')}
        {field('Luz', L100, 0, 100, 1, x => ({ ...lch, L: x / 100 }), '%')}
        {field('Intensidad', round(lch.C, 2), 0, C_MAX, 0.01, x => ({ ...lch, C: x }), '')}
      </div>
      <p className="cp-desc" id={id + 'c'} aria-live="polite">
        {bad ? 'No reconozco ese código: prueba #FF5B1F, rgb(255, 91, 31), hsl(16, 100%, 56%) u oklch(68% 0.2 40).' : <>{what} · <span className="mono">{f.rgb}</span></>}
      </p>
      {!!swatches?.length && (
        <div className="cp-quick" role="group" aria-label="Colores de la pieza">
          {swatches.map((s, i) => (
            <button key={s + i} type="button" className="cp-q" style={{ background: s }} aria-label={`Usar ${s.toUpperCase()} (${describe(s)})`} title={s.toUpperCase()}
              onClick={() => { const n = hexToLch(s, lch.h); setLch(n); setText(s.toUpperCase()); lastOut.current = s; onChange(s); }} />
          ))}
        </div>
      )}
      <ColorHelp hue={lch.h} />
    </div>
  );
}

/** A number typed freely (it can be erased while typing): taken on Enter or when leaving the field, within its range. */
function NumberField({ value, min, max, step, unit, onCommit, label }: { value: number; min: number; max: number; step: number; unit: string; onCommit: (v: number) => void; label: string }) {
  const [t, setT] = useState(String(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setT(String(value)); }, [value, focus]);
  const take = () => {
    const v = parseFloat(t.replace(',', '.'));
    if (Number.isFinite(v)) onCommit(Math.max(min, Math.min(max, v)));
    else setT(String(value));
  };
  return (
    <span className="cp-numin">
      <input
        type="text" inputMode="decimal" value={t} aria-label={label} spellCheck={false} autoComplete="off"
        onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); take(); }}
        onChange={ev => setT(ev.target.value)}
        onKeyDown={ev => {
          if (ev.key === 'Enter') { ev.preventDefault(); take(); }
          else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
            ev.preventDefault();
            ev.stopPropagation();
            const v = Math.max(min, Math.min(max, (parseFloat(t.replace(',', '.')) || 0) + (ev.key === 'ArrowUp' ? step : -step) * (ev.shiftKey ? 10 : 1)));
            setT(String(round(v, 3)));
            onCommit(v);
          }
        }}
      />
      {unit && <span className="cp-unit" aria-hidden="true">{unit}</span>}
    </span>
  );
}

/** A short visual explanation of tone, light and intensity, for people who have never used a colour picker. */
function ColorHelp({ hue }: { hue: number }) {
  const strip = (f: (t: number) => string) => `linear-gradient(90deg, ${Array.from({ length: 9 }, (_, i) => f(i / 8)).join(', ')})`;
  return (
    <details className="cp-help">
      <summary>¿Qué son el tono, la luz y la intensidad?</summary>
      <dl>
        <div>
          <dt>Tono</dt>
          <dd>Qué color es: rojo, amarillo, verde, azul… Da la vuelta como un círculo (0° a 360°).</dd>
          <span className="cp-ex" style={{ background: strip(t => lchToHex(0.72, 0.16, t * 360)) }} aria-hidden="true" />
        </div>
        <div>
          <dt>Luz</dt>
          <dd>Qué tan claro u oscuro: 0 % es negro, 100 % es blanco. En el cuadro, hacia arriba.</dd>
          <span className="cp-ex" style={{ background: strip(t => lchToHex(t, 0.12, hue)) }} aria-hidden="true" />
        </div>
        <div>
          <dt>Intensidad</dt>
          <dd>Qué tan vivo: 0 es gris y, hacia la derecha del cuadro, más color. La zona rayada no cabe en una pantalla.</dd>
          <span className="cp-ex" style={{ background: strip(t => lchToHex(0.68, t * 0.3, hue)) }} aria-hidden="true" />
        </div>
      </dl>
      <p>Para que una pieza se lea, el color de las celdas llenas necesita otra <b>luz</b> que el fondo, no solo otro tono.</p>
    </details>
  );
}
