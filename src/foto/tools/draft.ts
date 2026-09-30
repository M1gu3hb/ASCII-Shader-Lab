/**
 * Option-bar edits of a part that is already in the mask (a slider of softness, strength, tolerance…): while the
 * slider moves, the change is only a preview (host.preview with `replace`), and the part is replaced once when
 * the slider is let go (or a moment after the last key), so a whole slider gesture is exactly ONE undo step
 * however slowly the composition redraws.
 */
import { useEffect, useRef, useState } from 'react';
import type { Id, MaskPart } from '../../project/types';
import { replacePart } from './target';
import type { ToolHost } from './types';

export interface PartRef { layer: Id; index: number; part: MaskPart }

export function usePartDraft(host: ToolHost, sel: PartRef | null, onCommitted?: (p: MaskPart) => void) {
  const [draft, setDraft] = useState<MaskPart | null>(null);
  const pending = useRef<{ layer: Id; index: number; part: MaskPart } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    host.preview(null);
    if (replacePart(p.layer, p.index, p.part)) onCommitted?.(p.part);
    setDraft(null);
  };

  // another part (or none, or the bar closes): what was pending goes in first
  const key = sel ? `${sel.layer}|${sel.index}` : '';
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => { if (pending.current) flushRef.current(); }, [key]);

  return {
    /** The part as shown: the draft while a slider moves, else the one in the mask. */
    part: draft ?? sel?.part ?? null,
    set(patch: Partial<MaskPart>) {
      if (!sel) return;
      const next = { ...(pending.current?.part ?? sel.part), ...patch } as MaskPart;
      pending.current = { layer: sel.layer, index: sel.index, part: next };
      setDraft(next);
      host.preview({ layer: sel.layer, part: next, replace: sel.index });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 900);
    },
    /** The slider was let go: at once after a pointer, a moment after the last key (keys come in bursts). */
    commit(how: 'pointer' | 'key' = 'pointer') {
      if (!pending.current) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, how === 'key' ? 1200 : 0);
    },
    flush,
  };
}
