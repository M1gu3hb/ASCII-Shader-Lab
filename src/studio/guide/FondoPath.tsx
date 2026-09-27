import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Recipe } from '../../engine/recipe';
import { getEngine } from '../engineBridge';
import { openExport } from '../exportTab';
import { IDice } from '../icons';
import { PRESETS } from '../presets';
import { applyRecipe, currentRecipe, edit, rollDice, setUI, useEntry, useRecipe, useStudio } from '../store';
import { announce } from '../toast';
import { FONDO_SPEEDS, applyPresence, legibility, nearestChoice, presence, presenceWord, previewInk, type Legibility } from './paths';
import { CodeBox, StyleGrid, type StyleItem } from './parts';

/* 1 · Elige un estilo ------------------------------------------------ */

export function FondoStyle() {
  const entry = useEntry();
  const looks = useMemo(() => PRESETS.fondos.map(p => ({ p, recipe: p.make() })), []);
  const items: StyleItem[] = looks.map(({ p, recipe }) => ({
    id: p.id, name: p.name, recipe,
    pressed: !!entry && entry.label === p.name && (entry.kind === 'receta' || entry.kind === 'espacio'),
    pick: () => applyRecipe(p.make(), 'receta', p.name),
  }));
  const roll = () => {
    const e = rollDice();
    announce(`Fondo al azar: ${e.seed?.replace(/-/g, ' ') ?? ''}`);
  };
  return (
    <>
      <p className="guide-lead">Fondos pensados para ir detrás de tu contenido. Elige uno o pide otro al dado.</p>
      <StyleGrid items={items} label="Estilos de fondo">
        <button type="button" className="gs-tile gs-roll" onClick={roll}><IDice width={22} height={22} /><span className="gs-name">Otro al azar</span></button>
      </StyleGrid>
    </>
  );
}

/* 2 · Que se lea el contenido ------------------------------------------ */

const VERDICT: Record<Legibility, string> = {
  buena: 'Se lee bien',
  justa: 'Vale para titulares grandes; para texto normal, baja la presencia',
  baja: 'Cuesta leer: baja la presencia',
};

/**
 * Samples the rendered stage behind the preview headline and estimates its contrast with the
 * headline colour. Runs while the step shows: after each change and every second and a half
 * (the background moves).
 */
function useLegibility(on: boolean, recipe: Recipe | undefined) {
  const [est, setEst] = useState<{ ratio: number; level: Legibility } | null>(null);
  useEffect(() => {
    if (!on || !recipe) { setEst(null); return; }
    let alive = true;
    const measure = () => {
      const eng = getEngine();
      const h1 = document.querySelector('.preview-content h1');
      if (!eng || !h1 || !alive) return;
      const c = eng.canvas, cr = c.getBoundingClientRect(), hr = h1.getBoundingClientRect();
      const x0 = Math.max(hr.left, cr.left), y0 = Math.max(hr.top, cr.top);
      const x1 = Math.min(hr.right, cr.right), y1 = Math.min(hr.bottom, cr.bottom);
      if (x1 - x0 < 4 || y1 - y0 < 4 || !cr.width || !cr.height) return;
      const kx = c.width / cr.width, ky = c.height / cr.height;
      const sw = (x1 - x0) * kx, sh = (y1 - y0) * ky;
      const k = Math.min(1, 360 / sw);
      const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
      const t = document.createElement('canvas');
      t.width = w; t.height = h;
      const x = t.getContext('2d', { willReadFrequently: true });
      if (!x) return;
      try {
        eng.renderNow();
        x.drawImage(c, (x0 - cr.left) * kx, (y0 - cr.top) * ky, sw, sh, 0, 0, w, h);
        const block = Math.max(3, Math.round(recipe.glyph.cell * kx * k * 2));
        setEst(legibility(x.getImageData(0, 0, w, h).data, w, h, previewInk(recipe.color.bg), block));
      } catch { /* a canvas we cannot read: no estimate */ }
    };
    // the first sample waits for a style's crossfade to settle
    const first = setTimeout(measure, 700);
    const every = setInterval(measure, 1500);
    return () => { alive = false; clearTimeout(first); clearInterval(every); };
  }, [on, recipe]);
  return est;
}

export function FondoPresence() {
  const recipe = useRecipe();
  const preview = useStudio(s => s.ui.preview);
  const id = useId();
  // the base the slider works from: taken when the step opens, and again whenever the piece
  // changes by other means (another style, undo, the full panel)
  const base = useRef<Recipe | null>(null);
  const mine = useRef<Recipe | null>(null);
  const [p, setP] = useState(0.5);
  useEffect(() => {
    if (recipe && recipe !== mine.current) { base.current = recipe; setP(0.5); }
  }, [recipe]);
  useEffect(() => { if (!useStudio.getState().ui.preview) setUI({ preview: true }); }, []);
  const est = useLegibility(preview, recipe);
  const move = (v: number) => {
    const b = base.current;
    if (!b) return;
    setP(v);
    const next = presence(b, v);
    edit(r => applyPresence(r, next), 'guide-presence');
    mine.current = currentRecipe();
  };
  return (
    <>
      <p className="guide-lead">Un buen fondo acompaña: tu contenido tiene que leerse sin esfuerzo encima.</p>
      <div className="ctl guide-presence">
        <label className="lbl" htmlFor={id}>Presencia</label>
        <output htmlFor={id}>{presenceWord(p)}</output>
        <input id={id} type="range" min={0} max={1} step={0.01} value={p} aria-valuetext={presenceWord(p)}
          style={{ '--p': p * 100 + '%' } as React.CSSProperties} onChange={e => move(parseFloat(e.target.value))} />
        <span className="guide-ends" aria-hidden="true"><span>sutil</span><span>protagonista</span></span>
      </div>
      <label className="toggle">
        <span>Ver un titular, un texto y un botón encima</span>
        <span className="switch"><input type="checkbox" role="switch" checked={preview} onChange={e => setUI({ preview: e.target.checked })} /><span /></span>
      </label>
      {preview && (
        <div className={'legib ' + (est?.level ?? 'wait')}>
          <p>
            <span className="legib-dot" aria-hidden="true" />
            Contraste estimado del titular: <b>{est ? `${est.ratio.toFixed(1)}:1` : '…'}</b>
          </p>
          <p className="legib-say" aria-live="polite">{est ? VERDICT[est.level] : 'Midiendo…'}</p>
        </div>
      )}
      <p className="note">
        Es una estimación: mide el fondo real detrás del titular de prueba ({previewInk(recipe?.color.bg ?? '#000') === '#ffffff' ? 'texto blanco' : 'texto oscuro'}), en sus zonas más difíciles.
        Para texto normal se recomienda 4.5:1; para titulares grandes, 3:1.
      </p>
    </>
  );
}

/* 3 · Movimiento ------------------------------------------------------ */

export function FondoMotion() {
  const recipe = useRecipe();
  const entry = useEntry();
  if (!recipe) return null;
  const cur = nearestChoice(FONDO_SPEEDS, recipe.motion.speed, Infinity);
  const cursor = recipe.interact.mode !== 'none';
  const origin = entry?.origin.interact.mode;
  const setCursor = (on: boolean) => edit(r => { r.interact.mode = on ? (origin && origin !== 'none' ? origin : 'light') : 'none'; }, 'guide-cursor:' + Date.now());
  return (
    <>
      <h3 className="guide-sub" id="g-speed">Velocidad</h3>
      <div className="seg guide-seg" role="group" aria-labelledby="g-speed">
        {FONDO_SPEEDS.map((c, i) => (
          <button key={c.label} type="button" aria-pressed={cur === i} onClick={() => edit(r => { r.motion.speed = c.value; }, 'guide-speed:' + Date.now())}>{c.label}</button>
        ))}
      </div>
      <p className="note">Lento distrae menos: es lo mejor detrás de texto.</p>
      <label className="toggle guide-toggle">
        <span>Reacciona al cursor</span>
        <span className="switch"><input type="checkbox" role="switch" checked={cursor} onChange={e => setCursor(e.target.checked)} /><span /></span>
      </label>
      <p className="note">Pasa el ratón por el lienzo para probarlo. En la web se pausa fuera de pantalla, y quien tenga activado «reducir movimiento» lo verá quieto.</p>
    </>
  );
}

/* 4 · Llévalo a tu web ------------------------------------------------ */

export function FondoTake() {
  return (
    <>
      <p className="guide-lead">Copia el código y pégalo en tu web. «Fondo de página» va detrás de todo; «Portada» llena la primera pantalla; «Bloque» es una caja.</p>
      <CodeBox kinds={['html', 'wc', 'react']} placements={['fixed', 'hero', 'block']} placement="fixed" />
      <button type="button" className="btn ghost" onClick={() => openExport('codigo')}>Más formatos…</button>
    </>
  );
}
