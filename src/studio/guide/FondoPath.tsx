import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Recipe } from '../../engine/recipe';
import { openExport } from '../exportTab';
import { IDice } from '../icons';
import { PRESETS } from '../presets';
import { applyRecipe, currentRecipe, edit, rollDice, useEntry, useRecipe, useStudio } from '../store';
import { announce } from '../toast';
import { VERDICT, inkFor, useLegibility } from '../views/legibility';
import { currentView, setView, useView } from '../views/state';
import { FONDO_SPEEDS, applyPresence, nearestChoice, presence, presenceWord } from './paths';
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

export function FondoPresence() {
  const recipe = useRecipe();
  // the test content is the «Fondo web» destination preview, which also measures the headline
  const preview = useView() === 'web';
  const ink = useStudio(s => inkFor(s.ui.viewOpts.ink, s.entries[s.cursor]?.recipe.color.bg ?? '#000000'));
  const est = useLegibility(s => s.est);
  const id = useId();
  // the base the slider works from: taken when the step opens, and again whenever the piece
  // changes by other means (another style, undo, the full panel)
  const base = useRef<Recipe | null>(null);
  const mine = useRef<Recipe | null>(null);
  const [p, setP] = useState(0.5);
  useEffect(() => {
    if (recipe && recipe !== mine.current) { base.current = recipe; setP(0.5); }
  }, [recipe]);
  useEffect(() => { if (currentView() !== 'web') setView('web'); }, []);
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
        <span className="switch"><input type="checkbox" role="switch" checked={preview} onChange={e => setView(e.target.checked ? 'web' : 'libre')} /><span /></span>
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
        Es una estimación: mide el fondo real detrás del titular de prueba ({ink === '#ffffff' ? 'texto blanco' : 'texto oscuro'}), en sus zonas más difíciles.
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
