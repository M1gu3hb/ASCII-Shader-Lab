import { useEffect, useRef } from 'react';
import { INTERACT_NAMES } from '../../engine/catalog';
import { loadBasicEngine } from '../../engine/create';
import { cloneRecipe, normInteract, type InteractMode, type Recipe, type TouchGlyphs } from '../../engine/recipe';
import type { Renderer } from '../../engine/renderer';
import { touchSettings, type TouchSettings } from '../../engine/touch';
import { F, Note, Select, Seg, Slider, Sub, Toggle, useField, type Field } from '../controls';
import { studioFonts } from '../engineBridge';
import { mediaElement } from '../media';
import { useRecipe } from '../store';
import { INTERACT_DESC, INTERACT_ICON } from './copy';
import type { PickOpt } from './Picker';
import './touch.css';

/**
 * «Cursor y tacto» in Movimiento / Interacción: what the pointer, a finger or a pen does to the piece.
 * The modes come in groups by gesture; each shows only the settings it uses, a line on how to do it and a
 * small live example (the piece itself on the basic engine, with the ghost making the gesture; still
 * under reduced motion). The optional settings are written through normInteract, so an edited recipe and
 * its normalised copy stay equal.
 */

/** The picker's groups: by what you do. */
const GROUPS: Array<[string, InteractMode[]]> = [
  ['Sin interacción', ['none']],
  ['Al pasar', ['light', 'lens', 'repel', 'magnet', 'swirl', 'scramble', 'follow']],
  ['Dejan rastro', ['trail', 'paint', 'erase', 'reveal', 'ripple']],
  ['Gestos', ['rings', 'blossom', 'sparks', 'stretch', 'zoom']],
];

/** How to do it, in one line. */
export const TOUCH_HOW: Record<InteractMode, string> = {
  none: 'La pieza no responde al cursor ni al dedo.',
  light: 'Pasa el cursor o el dedo: se ilumina lo que tocas.',
  ripple: 'Mueve el dedo o el cursor; un toque deja caer una gota.',
  lens: 'Pasa por encima: lo de debajo se agranda.',
  repel: 'Pasa por encima: los caracteres se apartan.',
  swirl: 'Pasa por encima: gira lo que hay debajo.',
  erase: 'Arrastra para borrar; vuelve poco a poco.',
  paint: 'Pinta arrastrando. Con lápiz, la presión cambia el trazo.',
  scramble: 'Pasa por encima: los caracteres se revuelven.',
  trail: 'Desliza el dedo o mueve el cursor: deja una estela que se apaga. Con lápiz, la presión cuenta.',
  blossom: 'Mantén pulsado sin moverte: la flor crece mientras sigas.',
  rings: 'Toca o haz clic: cada toque abre anillos.',
  sparks: 'Desliza rápido y suelta; un toque suelta una ráfaga.',
  stretch: 'Arrastra: la pieza se estira y vuelve con un rebote.',
  reveal: 'Pasa por encima: se ve lo que hay bajo los caracteres.',
  zoom: 'Pellizca con dos dedos, o Ctrl + rueda; arrastra para mover.',
  magnet: 'Pasa por encima: atrae los caracteres; pulsa para atraer más.',
  follow: 'Mueve el cursor o el dedo: la pieza se inclina hacia él.',
};

type Knob = 'radius' | 'decay' | 'ink' | 'glyphs';
const USES: Partial<Record<InteractMode, Knob[]>> = {
  light: ['radius'], ripple: ['radius'], lens: ['radius'], repel: ['radius'], swirl: ['radius'], scramble: ['radius'], magnet: ['radius'],
  erase: ['radius', 'decay'], paint: ['radius', 'decay'],
  trail: ['radius', 'decay', 'ink', 'glyphs'], blossom: ['radius', 'decay', 'ink', 'glyphs'], rings: ['radius', 'decay', 'ink', 'glyphs'],
  sparks: ['radius', 'decay', 'ink', 'glyphs'], stretch: ['radius', 'decay'], reveal: ['radius', 'decay'], zoom: ['decay'], follow: ['decay'],
};
const STRENGTH: Partial<Record<InteractMode, string>> = { sparks: 'Cantidad', rings: 'Intensidad', zoom: 'Zoom máximo', follow: 'Cuánto se inclina', reveal: 'Cuánto se ve' };
const RADIUS: Partial<Record<InteractMode, string>> = { rings: 'Alcance', sparks: 'Alcance', blossom: 'Tamaño de la flor', stretch: 'Zona que arrastra' };
const DECAY: Partial<Record<InteractMode, string>> = {
  trail: 'Duración del rastro', blossom: 'Tarda en apagarse', rings: 'Duración de los anillos', sparks: 'Vida de las chispas',
  stretch: 'Tarda en volver', reveal: 'Tarda en cerrarse', zoom: 'Tarda en volver', follow: 'Suavidad', paint: 'Duración del trazo', erase: 'Tarda en volver',
};
const GLYPH_OPTS: Array<[TouchGlyphs, string]> = [['dense', 'Densos'], ['random', 'Al azar'], ['piece', 'Los de la pieza']];
const GLYPH_DESC: Record<TouchGlyphs, string> = {
  dense: 'Caracteres llenos que se apagan hacia los más ligeros.',
  random: 'Caracteres al azar que cambian mientras duran.',
  piece: 'Los mismos de la pieza, sólo más claros.',
};

const pct = (v: number) => Math.round(v * 100) + ' %';
const seconds = (s: number) => (s < 10 ? s.toFixed(1).replace('.', ',') : Math.round(s)) + ' s';

/** «Duración» shown as what it means for each mode (touch.ts). */
function decayText(mode: InteractMode, d: number): string {
  if (mode === 'zoom') return d >= 0.98 ? 'se queda' : seconds(0.35 * Math.pow(10, d) * 3);
  if (mode === 'follow') return seconds(0.25 + 2.5 * d);
  if (mode === 'rings') return seconds(0.6 + 2.4 * d);
  if (mode === 'sparks') return seconds(0.4 + 1.8 * d);
  if (mode === 'stretch') return d < 0.34 ? 'rápido' : d < 0.67 ? 'con rebote' : 'lento';
  if (mode === 'erase') return seconds(1 / (0.22 * Math.pow(4, 1 - 2 * d)));
  if (mode === 'paint') return seconds(3 / (0.9 * Math.pow(4, 1 - 2 * d)));
  return seconds(0.25 * Math.pow(16, d) * 3);
}

/** A field of the optional pointer settings: reads the value in effect, writes through normInteract. */
function knob<K extends 'decay' | 'ink' | 'glyphs'>(k: K): Field<TouchSettings[K]> {
  return {
    key: 'interact.' + k,
    get: r => touchSettings(r.interact)[k],
    set: (r, v) => { r.interact = normInteract({ ...r.interact, [k]: v }); },
  };
}
const DECAY_F = knob('decay'), INK_F = knob('ink'), GLYPHS_F = knob('glyphs');

export function touchOptions(): PickOpt<InteractMode>[] {
  return GROUPS.flatMap(([group, modes]) => modes.map(m => ({ value: m, label: INTERACT_NAMES[m], desc: INTERACT_DESC[m], icon: INTERACT_ICON[m], group })));
}
const OPTS = touchOptions();

export function TouchControls() {
  const mode = useField(F<InteractMode>('interact.mode')) ?? 'none';
  const uses = USES[mode] ?? [];
  return (
    <>
      <Sub>Cursor y tacto</Sub>
      <Select f={F<InteractMode>('interact.mode')} label="Qué hace el cursor o el dedo" opts={OPTS} minWidth={280} />
      {mode !== 'none' && (
        <>
          <TouchExample mode={mode} />
          <Slider f={F('interact.strength')} label={STRENGTH[mode] ?? 'Fuerza'} min={0} max={1}
            fmt={mode === 'zoom' ? v => '×' + (1.5 + 6 * v).toFixed(1).replace('.', ',') : undefined} />
          {uses.includes('radius') && <Slider f={F('interact.radius')} label={RADIUS[mode] ?? 'Radio'} min={0.03} max={0.6} />}
          {uses.includes('decay') && <Slider f={DECAY_F} label={DECAY[mode] ?? 'Duración'} min={0} max={1} fmt={v => decayText(mode, v)} />}
          {uses.includes('ink') && <Slider f={INK_F} label="Color del toque" min={0} max={1} fmt={pct} />}
          {uses.includes('glyphs') && <Seg f={GLYPHS_F} label="Caracteres del toque" opts={GLYPH_OPTS} desc={GLYPH_DESC} />}
          <Toggle f={F('interact.auto')} label="Cursor automático si nadie la toca" />
        </>
      )}
      {mode === 'erase' && <Note>Con una imagen, el borrador revela la foto original bajo los caracteres.</Note>}
      {mode === 'reveal' && <Note>Con una imagen se ve la foto; en las demás, el color de cada celda como una tesela.</Note>}
      {mode === 'zoom' && <Note>En una web donde pegues la pieza, la rueda sola sigue desplazando la página: allí el zoom es con dos dedos o Ctrl + rueda.</Note>}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The example: the piece itself, small, with the ghost doing the gesture */
/* ------------------------------------------------------------------ */

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The recipe the example shows: the piece with the ghost on (a picture only when it is already here). */
export function exampleRecipe(r: Recipe, mode: InteractMode, hasImage: boolean): Recipe {
  const x = cloneRecipe(r);
  x.interact = normInteract({ ...x.interact, mode, auto: true });
  if (x.source === 'video' || x.source === 'camera' || (x.source === 'image' && !hasImage)) x.source = 'pattern';
  // small cells, so a gesture has room to show in a small box
  x.glyph.cell = 7;
  // no transition, no sound: just the gesture
  x.motion.pulse = 0;
  return x;
}

function TouchExample({ mode }: { mode: InteractMode }) {
  const recipe = useRecipe();
  const box = useRef<HTMLDivElement>(null);
  const eng = useRef<Renderer | null>(null);
  const still = reducedMotion();
  const want = useRef<Recipe | null>(null);
  want.current = recipe ? exampleRecipe(recipe, mode, !!mediaElement('image')) : null;

  // one small basic engine while the section is open (no second WebGL context on a phone)
  useEffect(() => {
    let dead = false;
    void loadBasicEngine().then(({ BasicEngine }) => {
      const r = want.current;
      if (dead || !box.current || !r) return;
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      box.current.replaceChildren(canvas);
      const w = box.current.clientWidth || 280, h = box.current.clientHeight || 136;
      const e = new BasicEngine(canvas, r, {
        fonts: studioFonts, interactive: !still, pointerTarget: 'canvas', adaptive: false, maxPixelRatio: 1.5,
        autoplay: !still, reducedMotion: still, observeVisibility: true,
        ...(still ? { fixedSize: { width: w, height: h, pixelRatio: Math.min(1.5, devicePixelRatio || 1) } } : {}),
      });
      if (r.source === 'image') e.setMedia('image', mediaElement('image'));
      eng.current = e;
      if (still) void e.ready().then(() => { if (!dead) stillFrame(e); });
    }).catch(() => undefined);
    return () => { dead = true; eng.current?.destroy(); eng.current = null; };
  }, [still]);

  useEffect(() => {
    const e = eng.current, r = want.current;
    if (!e || !r) return;
    const t = setTimeout(() => {
      if (r.source === 'image') e.setMedia('image', mediaElement('image'));
      e.set(r);
      if (still) stillFrame(e);
    }, 120);
    return () => clearTimeout(t);
  });

  return (
    <figure className="tx-demo" data-mode={mode}>
      <div className="tx-stage" ref={box} />
      <figcaption>
        <span className="tx-icon" aria-hidden="true">{INTERACT_ICON[mode]}</span>
        <span>{TOUCH_HOW[mode]}{still ? ' (Ejemplo quieto: tu sistema pide menos movimiento.)' : ' Pruébalo aquí o en la pieza.'}</span>
      </figcaption>
    </figure>
  );
}

/** Reduced motion: the gesture played for two seconds off screen, and its last frame shown still. */
function stillFrame(e: Renderer) {
  for (let i = 0; i <= 60; i++) e.renderAt(i / 30, i / 30);
}

/* ------------------------------------------------------------------ */
/* The export sheet: what each format keeps of the interaction          */
/* ------------------------------------------------------------------ */

/**
 * Said in each export tab when the piece reacts to the pointer: an image, a clip or text cannot keep it
 * (a clip can record the ghost's gesture: `demo`), code keeps it.
 */
export function InteractNote({ r, kind, demo, onDemo }: {
  r: Recipe; kind: 'still' | 'clip' | 'text' | 'code'; demo?: boolean; onDemo?: (on: boolean) => void;
}) {
  const m = r.interact.mode;
  if (m === 'none') return null;
  const name = `«${INTERACT_NAMES[m]}»`;
  if (kind === 'code') return <p className="note tx-export">Esta pieza responde al cursor, al dedo y al lápiz ({name}) y el código lo conserva. En un móvil, deslizar en vertical sigue moviendo la página.</p>;
  if (kind === 'still') return <p className="note tx-export">{name} responde a quien toca la pieza: una imagen fija no puede guardarlo. Para conservarlo, exporta el código.</p>;
  if (kind === 'text') return <p className="note tx-export">El texto no reacciona al cursor: {name} no viaja aquí{r.interact.auto ? '; las animaciones sí llevan el gesto del cursor automático' : ''}.</p>;
  return (
    <div className="tx-export">
      <p className="note">{name} responde a quien toca la pieza: un video o un GIF no puede guardar eso. Sí puede grabar el gesto que hace el cursor automático.</p>
      <label className="toggle"><span>Grabar el cursor automático (demostración)</span><span className="switch"><input type="checkbox" role="switch" checked={!!demo} onChange={e => onDemo?.(e.target.checked)} /><span /></span></label>
    </div>
  );
}

/** The recipe a clip renders: with the ghost playing or not (the piece itself is not changed). */
export function withDemo(r: Recipe, on: boolean): Recipe {
  if (r.interact.mode === 'none' || r.interact.auto === on) return r;
  return { ...r, interact: { ...r.interact, auto: on } };
}
