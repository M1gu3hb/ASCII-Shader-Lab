import { useLayoutEffect, useRef, type RefObject } from 'react';
import { scrambleEl, type ScrambleOptions } from './scramble';
import { swap, type SwapKind } from './swap';

/**
 * React glue for the studio's motion. Both run in a layout effect, after the new content is in the page
 * and before it is painted, so the first frame the person sees is already the effect's first frame; the
 * state change itself never waits for them. Nothing runs on the first render (only on changes).
 */

/**
 * The content of `ref` resolves out of glyphs whenever `key` changes. `kind` may depend on the previous
 * and the new key (a new space is richer than a new tab); null skips that change.
 */
export function useSwap<K>(ref: RefObject<Element | null>, key: K, kind: SwapKind | ((prev: K, next: K) => SwapKind | null)) {
  const prev = useRef(key);
  useLayoutEffect(() => {
    const was = prev.current;
    prev.current = key;
    if (Object.is(was, key)) return;
    const k = typeof kind === 'function' ? kind(was, key) : kind;
    if (k) swap(ref.current, k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** A ref for an element whose text resolves out of glyphs each time `text` changes. */
export function useScramble<T extends HTMLElement>(text: string | null | undefined, o?: ScrambleOptions): RefObject<T | null> {
  const ref = useRef<T>(null);
  const prev = useRef(text);
  useLayoutEffect(() => {
    const was = prev.current;
    prev.current = text;
    if (was === text || !text || was == null) return;
    scrambleEl(ref.current, o);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return ref;
}
