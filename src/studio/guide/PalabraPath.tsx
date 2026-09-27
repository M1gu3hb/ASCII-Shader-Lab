import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { F, Slider } from '../controls';
import { downloadBlob } from '../download';
import { exportGif, exportVideo, liveTime, loopSeconds, useStopOnLeave, type Cancel } from '../exporting';
import { openExport } from '../exportTab';
import { slug } from '../packages';
import { PRESETS } from '../presets';
import { applyRecipe, currentRecipe, edit, useEntry, useRecipe } from '../store';
import { toast } from '../toast';
import { clipCaps, type ClipCaps } from './caps';
import { LOOP_SECONDS, WORD_MAX, WORD_SPEEDS, loopFor, nearestChoice, normWord, validWord, withSpeed, withWord } from './paths';
import { Busy, CodeBox, StyleGrid, type StyleItem } from './parts';
import { goStep, useGuide } from './state';

/* 1 · Escribe tu palabra ---------------------------------------------- */

export function PalabraWord() {
  const recipe = useRecipe();
  const id = useId();
  const [raw, setRaw] = useState(() => useGuide.getState().word ?? (recipe?.source === 'text' ? recipe.text.content : ''));
  const change = (v: string) => {
    const s = v.replace(/[\r\n]+/g, ' ').slice(0, WORD_MAX);
    setRaw(s);
    useGuide.setState({ word: s });
    if (validWord(s)) edit(r => { const x = withWord(r, s); r.source = x.source; r.text.content = x.text.content; r.glyph.words = x.glyph.words; }, 'guide-word');
  };
  const n = normWord(raw).length;
  return (
    <>
      <div className="ctl guide-word">
        <label className="lbl" htmlFor={id}>Tu palabra</label>
        <output htmlFor={id}>{n}/{WORD_MAX}</output>
        <input id={id} type="text" value={raw} maxLength={WORD_MAX} autoComplete="off" spellCheck={false} aria-describedby={id + '-h'}
          onChange={e => change(e.target.value)} onFocus={e => e.currentTarget.select()}
          onKeyDown={e => { if (e.key === 'Enter' && validWord(raw)) goStep(1); }} />
      </div>
      <p className="note" id={id + '-h'}>De 1 a {WORD_MAX} caracteres. Las palabras cortas y en mayúsculas se leen mejor hechas de caracteres.</p>
    </>
  );
}

/* 2 · Estilo ---------------------------------------------------------- */

export function PalabraStyle() {
  const recipe = useRecipe();
  const entry = useEntry();
  const word = recipe?.text.content ?? '';
  const make = (p: (typeof PRESETS.tipo)[number]) => {
    const cur = currentRecipe();
    const r = withWord(p.make(cur), cur.text.content);
    // the rhythm chosen later travels with the style (a loop stays a loop)
    if (cur.motion.loop > 0) { r.motion.speed = cur.motion.speed; r.motion.loop = cur.motion.loop; }
    return r;
  };
  // the styles made for a word (not «Máquina», a message over a pattern)
  const looks = useMemo(() => PRESETS.tipo.filter(p => p.make().source === 'text').map(p => ({ p, recipe: make(p) })), [word]);
  const items: StyleItem[] = looks.map(({ p, recipe: r }) => ({
    id: p.id, name: p.name, recipe: r,
    pressed: !!entry && entry.label === p.name && (entry.kind === 'receta' || entry.kind === 'espacio'),
    pick: () => applyRecipe(make(p), 'receta', p.name),
  }));
  return (
    <>
      <p className="guide-lead">Tu palabra, tejida de cinco maneras.</p>
      <StyleGrid items={items} label="Estilos para tu palabra" />
    </>
  );
}

/* 3 · Ritmo y tamaño -------------------------------------------------- */

/** Palabra clips loop by default: turned on as the rhythm step opens (a normal, undoable edit). */
function useDefaultLoop() {
  const loopWanted = useGuide(s => s.wordLoop);
  useEffect(() => {
    const r = currentRecipe();
    if (loopWanted && r.motion.loop === 0) edit(x => { x.motion.loop = loopFor(x.motion.speed); }, 'guide-loop:' + Date.now());
  }, [loopWanted]);
}

export function PalabraRhythm() {
  const recipe = useRecipe();
  useDefaultLoop();
  if (!recipe) return null;
  const cur = nearestChoice(WORD_SPEEDS, recipe.motion.speed, Infinity);
  const loop = recipe.motion.loop > 0;
  const setLoop = (on: boolean) => {
    useGuide.setState({ wordLoop: on });
    edit(r => { r.motion.loop = on ? loopFor(r.motion.speed) : 0; }, 'guide-loop:' + Date.now());
  };
  return (
    <>
      <h3 className="guide-sub" id="g-wspeed">Velocidad</h3>
      <div className="seg guide-seg" role="group" aria-labelledby="g-wspeed">
        {WORD_SPEEDS.map((c, i) => (
          <button key={c.label} type="button" aria-pressed={cur === i} onClick={() => edit(r => { const x = withSpeed(r, c.value); r.motion.speed = x.motion.speed; r.motion.loop = x.motion.loop; }, 'guide-wspeed:' + Date.now())}>{c.label}</button>
        ))}
      </div>
      <p className="note">Lento se lee mejor; vivo llama la atención.</p>
      <Slider f={F('text.size')} label="Tamaño de la palabra" min={0.3} max={1.6} />
      <label className="toggle guide-toggle">
        <span>Bucle perfecto</span>
        <span className="switch"><input type="checkbox" role="switch" checked={loop} onChange={e => setLoop(e.target.checked)} /><span /></span>
      </label>
      <p className="note">{loop
        ? `El final se funde con el principio: el GIF y el video durarán ${loopSeconds(recipe).toFixed(1)} s y se repetirán sin salto.`
        : 'Sin bucle, el GIF y el video cortan de golpe al repetirse.'}</p>
    </>
  );
}

/* 4 · Llévatela ------------------------------------------------------- */

const VIDEO = { w: 1080, h: 1080 };
const GIF_W = 640, GIF_FPS = 20;

export function PalabraTake() {
  const recipe = useRecipe();
  const [caps, setCaps] = useState<ClipCaps | null>(null);
  const [busy, setBusy] = useState<{ what: string; p: number; label?: string } | null>(null);
  const cancel = useRef<Cancel>({ cancelled: false });
  useStopOnLeave(cancel);
  useDefaultLoop();
  useEffect(() => { let alive = true; void clipCaps(VIDEO.w, VIDEO.h).then(c => { if (alive) setCaps(c); }); return () => { alive = false; }; }, []);
  if (!recipe) return null;
  const secs = loopSeconds(recipe) || LOOP_SECONDS;
  const start = recipe.motion.loop > 0 ? 0 : liveTime();
  const base = 'monotrama-' + slug(recipe.text.content || 'palabra');
  const run = async (kind: 'gif' | 'mp4' | 'webm') => {
    const job: Cancel = cancel.current = { cancelled: false, active: true };
    setBusy({ what: kind, p: 0 });
    const progress = (p: number, label?: string) => setBusy({ what: kind, p, label });
    try {
      const blob = kind === 'gif'
        ? await exportGif(recipe, GIF_W, { fps: GIF_FPS, seconds: secs, start, colors: 128 }, progress, cancel.current)
        : await exportVideo(recipe, { kind: 'fixed', w: VIDEO.w, h: VIDEO.h }, { fps: 30, seconds: secs, format: kind, start }, progress, cancel.current);
      downloadBlob(`${base}.${kind}`, blob);
    } catch (err) {
      if ((err as Error).message !== 'cancelado') toast('No se pudo crear el archivo: ' + (err as Error).message);
    }
    job.active = false;
    setBusy(null);
  };
  const stop = () => { cancel.current.cancelled = true; };
  return (
    <>
      <section className="guide-card" aria-labelledby="g-gif">
        <h3 id="g-gif">GIF animado</h3>
        <p>Para un README, Slack o un correo: {GIF_W} px de ancho, {secs.toFixed(1)} s{recipe.motion.loop > 0 ? ' en bucle perfecto' : ''}.</p>
        {busy?.what === 'gif'
          ? <Busy p={busy.p} label={busy.label} onCancel={stop} />
          : <button type="button" className="btn primary" disabled={!!busy} onClick={() => void run('gif')}>Descargar GIF</button>}
      </section>
      <section className="guide-card" aria-labelledby="g-video">
        <h3 id="g-video">Video</h3>
        {!caps && <p>Comprobando qué puede crear este navegador…</p>}
        {caps && (caps.mp4 || caps.webm) && (
          <>
            <p>Cuadrado de {VIDEO.w}×{VIDEO.h} para redes y presentaciones, {secs.toFixed(1)} s a 30 fps.</p>
            {busy && busy.what !== 'gif'
              ? <Busy p={busy.p} label={busy.label} onCancel={stop} />
              : (
                <div className="row2">
                  {caps.mp4 && <button type="button" className="btn" disabled={!!busy} onClick={() => void run('mp4')}>Descargar MP4</button>}
                  {caps.webm && <button type="button" className="btn" disabled={!!busy} onClick={() => void run('webm')}>Descargar WebM</button>}
                </div>
              )}
          </>
        )}
        {caps?.why && <p className={caps.mp4 || caps.webm ? 'note' : 'warn'}>{caps.why}</p>}
      </section>
      <section className="guide-card" aria-labelledby="g-web">
        <h3 id="g-web">En una página web</h3>
        <CodeBox kinds={['html', 'wc']} placements={['block', 'hero']} placement="block" />
      </section>
      <button type="button" className="btn ghost" onClick={() => openExport('video')}>Más formatos…</button>
    </>
  );
}
