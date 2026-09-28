import { useCallback, useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { itemsOf, nextIndex, reduced, revealLeft } from './rowMath';
import '../css/controls.css';

/**
 * A row whose content can be wider than the row. When it is, the row says so: edge fades and chevron
 * buttons appear only on the side where more content waits (with a «más» cue on the right), the mouse
 * wheel scrolls it sideways while the pointer is over it (only while it can still move that way, so
 * the panel and the page keep their own scrolling), trackpads and touch scroll it natively (with a
 * light snap on touch), and whatever takes focus or is selected is scrolled into view.
 *
 * Tablists and radiogroups get a roving tabindex: one Tab stop, Arrow keys, Home and End.
 * A row can also wrap (CSS, e.g. on wide screens): then nothing overflows and no affordance shows.
 *
 * The chevrons are a pointer affordance (hidden from assistive tech and out of the Tab order): every
 * item is reachable on its own with the keyboard, and a screen reader reads the whole row.
 */
export interface ScrollRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'children'> {
  children: ReactNode;
  /** Role of the element that holds the items. */
  role?: 'tablist' | 'radiogroup' | 'group' | 'toolbar' | 'list';
  /** Roving tabindex with Arrow keys, Home and End (default: on for tablist and radiogroup). */
  roving?: boolean;
  /** Arrow keys select the item they reach (tabs and radios) or only move focus (toolbars). */
  activate?: 'auto' | 'manual';
  /** Class of the outer box (the row's own look goes on `className`, the scroller). */
  boxClassName?: string;
  /** Word shown with the right chevron when more content waits there. */
  more?: string;
  /** The scrolling element itself (for callers that watch its scroll position). */
  listRef?: RefObject<HTMLDivElement | null>;
}

export function ScrollRow({ children, role = 'group', roving, activate = 'auto', boxClassName, className, more = 'más', listRef, ...rest }: ScrollRowProps) {
  const own = useRef<HTMLDivElement>(null);
  const ref = listRef ?? own;
  const [edge, setEdge] = useState({ prev: false, next: false });
  const rove = roving ?? (role === 'tablist' || role === 'radiogroup');
  const lastSel = useRef<Element | null>(null);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const prev = max > 1 && el.scrollLeft > 1;
    const next = max > 1 && el.scrollLeft < max - 1;
    setEdge(e => (e.prev === prev && e.next === next ? e : { prev, next }));
  }, []);

  /** Scrolls an item fully into view (clear of the fades), smoothly unless motion is reduced. */
  const reveal = useCallback((item: HTMLElement, smooth = true) => {
    const el = ref.current;
    if (!el || !el.contains(item)) return;
    const left = revealLeft(el, item);
    if (left === null) return;
    el.scrollTo({ left, behavior: smooth && !reduced() ? 'smooth' : 'auto' });
  }, []);

  // after every render: overflow may have changed (other items, other labels), roving stops follow the selection
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    // and once more on the next frame: layout that other components settle in their own effects (a
    // panel turning into a sheet, labels that drop out) lands after this one
    const again = requestAnimationFrame(measure);
    const items = itemsOf(el);
    const sel = items.find(isSelected) ?? null;
    if (rove) {
      const focusable = items.filter(i => !isDisabled(i));
      // the Tab stop: where the focus is inside the row, else the chosen item, else the first
      const stop = focusable.find(i => i === document.activeElement) ?? (sel && !isDisabled(sel) ? sel : focusable[0]);
      for (const i of items) i.tabIndex = i === stop ? 0 : -1;
    }
    // a newly selected item (a click, a key, a change elsewhere) comes into view
    if (sel && sel !== lastSel.current) {
      reveal(sel, lastSel.current !== null);
      lastSel.current = sel;
    }
    return () => cancelAnimationFrame(again);
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    // the row's own box can keep its size while its content grows (labels, swatches, items added by a
    // child that re-renders alone): watch the items too, and new items as they arrive
    const watchItems = () => { for (const c of Array.from(el.children)) ro?.observe(c); };
    watchItems();
    const mo = typeof MutationObserver === 'function'
      ? new MutationObserver(() => { watchItems(); cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); })
      : null;
    mo?.observe(el, { childList: true });
    // web fonts change the width of labels after the first layout
    void document.fonts?.ready.then(measure);
    // the wheel scrolls the row sideways only while it can still go that way: at either end the
    // event is left alone and the panel (or page) scrolls as usual
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return; // zoom, or a horizontal trackpad swipe (native)
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 1) return;
      const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? el.clientWidth : 1;
      const d = e.deltaY * unit;
      if ((d < 0 && el.scrollLeft <= 0.5) || (d > 0 && el.scrollLeft >= max - 0.5)) return;
      e.preventDefault();
      el.scrollLeft += d;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onWheel);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [measure]);

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    // a page is the visible width less the fades: the item cut at the edge becomes the first one seen
    const step = Math.max(40, el.clientWidth - 72);
    el.scrollBy({ left: dir * step, behavior: reduced() ? 'auto' : 'smooth' });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    rest.onKeyDown?.(e);
    if (!rove || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const el = ref.current;
    if (!el) return;
    const items = itemsOf(el).filter(i => !isDisabled(i));
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    const vertical = role === 'radiogroup';
    const n = nextIndex(e.key, at, items.length, vertical);
    if (n === null) return;
    e.preventDefault();
    // the studio's shortcuts use ← → for the history: not while moving inside a row
    e.stopPropagation();
    const target = items[n];
    for (const i of items) i.tabIndex = i === target ? 0 : -1;
    target.focus({ preventScroll: true });
    reveal(target);
    if (activate === 'auto' && !isSelected(target)) target.click();
  };

  return (
    <div className={'srow' + (edge.prev ? ' at-prev' : '') + (edge.next ? ' at-next' : '') + (boxClassName ? ' ' + boxClassName : '')} data-scrollrow="">
      <div
        {...rest}
        ref={ref}
        role={role}
        className={'srow-list' + (className ? ' ' + className : '')}
        onKeyDown={onKeyDown}
        onFocus={e => { rest.onFocus?.(e); if (e.target !== e.currentTarget) reveal(e.target as HTMLElement); }}
      >
        {children}
      </div>
      {/* pointer affordances: every item is reachable on its own with the keyboard */}
      <button type="button" className="srow-btn srow-prev" tabIndex={-1} aria-hidden="true" hidden={!edge.prev} onClick={() => page(-1)}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5" /></svg>
      </button>
      <button type="button" className="srow-btn srow-next" tabIndex={-1} aria-hidden="true" hidden={!edge.next} onClick={() => page(1)}>
        <span className="srow-more">{more}</span>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5" /></svg>
      </button>
    </div>
  );
}

const isSelected = (el: Element) => el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-current') === 'true';
const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true';
