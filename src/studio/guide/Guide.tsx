import { useEffect, useRef } from 'react';
import { IClose } from '../icons';
import { useMedia } from '../media';
import { useStudio } from '../store';
import { FondoMotion, FondoPresence, FondoStyle, FondoTake } from './FondoPath';
import { FotoAdjust, FotoPick, FotoStyle, FotoTake } from './FotoPath';
import { PalabraRhythm, PalabraStyle, PalabraTake, PalabraWord } from './PalabraPath';
import { PATHS, STEP_COUNT, validWord, type PathId } from './paths';
import { exitGuide, goStep, useGuide } from './state';
import '../css/guide.css';
import { useScramble, useSwap } from '../motion/hooks';

const STEPS: Record<PathId, Array<() => React.ReactNode>> = {
  foto: [FotoPick, FotoStyle, FotoAdjust, FotoTake],
  fondo: [FondoStyle, FondoPresence, FondoMotion, FondoTake],
  palabra: [PalabraWord, PalabraStyle, PalabraRhythm, PalabraTake],
};

/** Whether «Siguiente» can go on, and what is missing when it cannot. */
function useGate(path: PathId | null, step: number): string {
  const src = useStudio(s => s.entries[s.cursor]?.recipe.source);
  const text = useStudio(s => s.entries[s.cursor]?.recipe.text.content ?? '');
  const word = useGuide(s => s.word);
  const media = useMedia();
  if (path === 'foto' && step === 0) {
    const ok = (src === 'image' && !!media.image) || (src === 'video' && !!media.video) || (src === 'camera' && media.camera === 'on');
    return ok ? '' : 'Elige una foto para seguir.';
  }
  if (path === 'palabra' && step === 0) return src === 'text' && validWord(word ?? text) ? '' : 'Escribe tu palabra para seguir.';
  return '';
}

/**
 * The guided path, in the place of the settings panel: numbered steps, few and large choices,
 * «Atrás» / «Siguiente», and a way out to every control that keeps the piece.
 */
export function Guide() {
  const path = useGuide(s => s.path);
  const step = useGuide(s => s.step);
  const tick = useGuide(s => s.focusTick);
  const missing = useGate(path, step);
  const title = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  // a new step: its title resolves out of glyphs and its body recomposes (the step is usable at once)
  const stepName = useScramble<HTMLSpanElement>(path ? PATHS[path].steps[step] : null, { duration: 320 });
  useSwap(body, `${path}|${step}`, 'step');

  // each step starts at its top, with focus on its title (screen readers hear «Paso 2 de 4 …»)
  useEffect(() => {
    body.current?.scrollTo(0, 0);
    title.current?.focus({ preventScroll: true });
  }, [tick]);

  if (!path) return null;
  const info = PATHS[path];
  const Step = STEPS[path][step];
  const last = step === STEP_COUNT - 1;
  return (
    <div className="guide">
      <div className="guide-head">
        <div className="guide-top">
          <p className="eyebrow">Guía · {info.title}</p>
          <button type="button" className="icon-btn" onClick={() => exitGuide('close')} aria-label="Cerrar la guía" title="Cerrar la guía (tu pieza se queda)"><IClose /></button>
        </div>
        <h2 ref={title} id="guide-title" tabIndex={-1}>
          <span className="guide-n">Paso {step + 1} de {STEP_COUNT}</span>
          <span className="guide-step" ref={stepName}>{info.steps[step]}</span>
        </h2>
        <div className="guide-bar" aria-hidden="true">
          {info.steps.map((_, i) => <i key={i} className={i < step ? 'done' : i === step ? 'now' : ''} />)}
        </div>
      </div>
      <div className="guide-body" ref={body}>
        <Step key={path + step} />
      </div>
      <div className="guide-foot">
        {missing && <p className="guide-why">{missing}</p>}
        <div className="guide-nav">
          <button type="button" className="btn" disabled={step === 0} onClick={() => goStep(step - 1)}>Atrás</button>
          {last
            ? <button type="button" className="btn primary" onClick={() => exitGuide('done')}>Terminar</button>
            : <button type="button" className="btn primary" disabled={!!missing} onClick={() => goStep(step + 1)}>Siguiente</button>}
        </div>
        <button type="button" className="guide-all" onClick={() => exitGuide('panel')}>Ver todos los controles</button>
      </div>
    </div>
  );
}
