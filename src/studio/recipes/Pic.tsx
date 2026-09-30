import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Recipe } from '../../engine/recipe';
import type { Look } from './catalog';
import { peekPreview, previewKey, requestPreview } from './previews';

/**
 * A recipe's picture: its colours at once, its render when it comes (previews.ts). The render is asked for
 * only while the picture is in view (or near it) inside `root`, and withdrawn when it leaves, so a long
 * list only draws what is looked at; a hidden panel draws nothing.
 */
export function RecipePic({ recipe, look, prio = 0, root, className, thumb }: {
  recipe: Recipe | null;
  /** Shown until the render arrives (and where there is none). */
  look: Look;
  /** Lower first (the position in its list). */
  prio?: number;
  /** The scrolling box it lives in (default: the window). */
  root?: RefObject<HTMLElement | null>;
  className?: string;
  /** A picture that already exists (a saved piece's thumbnail): no render needed. */
  thumb?: string;
}) {
  const el = useRef<HTMLSpanElement>(null);
  const key = useMemo(() => (recipe && !thumb ? previewKey(recipe) : ''), [recipe, thumb]);
  const [got, setGot] = useState<{ key: string; url: string } | null>(null);
  useEffect(() => {
    if (!key || !recipe) return;
    const hit = peekPreview(recipe);
    if (hit) { setGot({ key, url: hit }); return; }
    const node = el.current;
    if (!node || typeof IntersectionObserver !== 'function') return;
    let cancel: (() => void) | null = null;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        cancel ??= requestPreview(recipe, prio, url => { cancel = null; if (url) setGot({ key, url }); });
      } else if (cancel) { cancel(); cancel = null; }
    }, { root: root?.current ?? null, rootMargin: '160px 0px' });
    io.observe(node);
    return () => { io.disconnect(); cancel?.(); };
    // the key stands for the recipe; the priority only orders the first request
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const url = thumb ?? (got && got.key === key ? got.url : null);
  return (
    <span ref={el} className={'rx-pic' + (className ? ' ' + className : '') + (url ? ' rx-pic-on' : '')} style={{ background: look.bg }} aria-hidden="true">
      <span className="rx-stand" style={{ color: look.ink }}>{look.chars}</span>
      {url && <img alt="" src={url} decoding="async" draggable={false} />}
    </span>
  );
}
