import { useEffect, useRef, useState } from 'react';
import type { Recipe } from '../../engine/recipe';
import { previewRecipe } from '../engineBridge';
import { useStudio } from '../store';
import { announce } from '../toast';
import { IEye, IEyeOff } from '../icons';

/**
 * «ver original»: while pressed (pointer, or Space / Enter held), the stage shows the piece as it
 * came out, before the edits; releasing returns to the edited piece. Nothing is added to the history.
 * `compact`: an eye instead of the words (the phone's seed line), with the same name.
 */
export function HoldCompare({ origin, compact }: { origin: Recipe; compact?: boolean }) {
  const [on, setOn] = useState(false);
  const held = useRef(false);
  const show = () => {
    if (held.current) return;
    held.current = true;
    setOn(true);
    previewRecipe(origin);
    announce('Mostrando el original. Suelta para volver a tu versión.');
  };
  const hide = () => {
    if (!held.current) return;
    held.current = false;
    setOn(false);
    previewRecipe(null);
  };
  // the history moved on while held (a key, the dice): the stage already follows it
  const change = useStudio(s => s.change.n);
  useEffect(() => { held.current = false; setOn(false); }, [change]);
  useEffect(() => () => { if (held.current) previewRecipe(null); }, []);
  const isKey = (k: string) => k === ' ' || k === 'Enter';
  return (
    <button
      type="button" className={'hold' + (on ? ' on' : '')} aria-pressed={on}
      title="Mantén pulsado para ver la pieza sin tus cambios"
      aria-label="Ver el original mientras lo mantienes pulsado"
      onPointerDown={e => { if (e.button !== 0) return; e.currentTarget.setPointerCapture?.(e.pointerId); show(); }}
      onPointerUp={hide} onPointerCancel={hide} onLostPointerCapture={hide}
      onKeyDown={e => { if (isKey(e.key)) { e.preventDefault(); if (!e.repeat) show(); } }}
      onKeyUp={e => { if (isKey(e.key)) { e.preventDefault(); hide(); } }}
      onBlur={hide}
      onContextMenu={e => e.preventDefault()}
    >
      {compact ? (on ? <IEyeOff width={18} height={18} /> : <IEye width={18} height={18} />) : on ? 'original' : 'ver original'}
    </button>
  );
}
