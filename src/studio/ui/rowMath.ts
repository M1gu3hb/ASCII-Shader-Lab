/**
 * Small helpers shared by the studio's rows and pickers: keyboard index math (pure, unit-tested),
 * type-ahead matching and where to scroll so an item is clear of a row's edge fades.
 */

/** Room kept clear at each edge of a scrolling row (the fade and its chevron). */
export const EDGE = 40;

/**
 * Index the key moves to in a list of `n` items (wrapping), or null when the key does not move.
 * Horizontal rows use ← →; `vertical` adds ↑ ↓ (radio groups, listboxes).
 */
export function nextIndex(key: string, at: number, n: number, vertical = false): number | null {
  if (n <= 0) return null;
  switch (key) {
    case 'ArrowRight': return (at + 1) % n;
    case 'ArrowLeft': return (at - 1 + n) % n;
    case 'ArrowDown': return vertical ? (at + 1) % n : null;
    case 'ArrowUp': return vertical ? (at - 1 + n) % n : null;
    case 'Home': return 0;
    case 'End': return n - 1;
    default: return null;
  }
}

/** Letters compared without case or accents («á» finds «Ámbar»). */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Type-ahead: the first label after `from` (wrapping) that starts with `typed`; a single repeated
 * letter cycles through the labels that start with it, as native selects do.
 */
export function typeAhead(labels: string[], typed: string, from: number, disabled: (i: number) => boolean = () => false): number {
  const n = labels.length;
  if (!n || !typed) return -1;
  const q = fold(typed);
  const same = q.length > 1 && [...q].every(c => c === q[0]);
  const needle = same ? q[0] : q;
  // a longer query keeps the current match if it still fits; a single letter moves on
  const start = needle.length > 1 ? from : from + 1;
  for (let k = 0; k < n; k++) {
    const i = (((start + k) % n) + n) % n;
    if (!disabled(i) && fold(labels[i]).startsWith(needle)) return i;
  }
  return -1;
}

/** Items of a row: its direct interactive children (or, when they are wrapped, its interactive descendants). */
export function itemsOf(el: HTMLElement): HTMLElement[] {
  const sel = 'button, a[href], [role="tab"], [role="radio"], [role="option"], [tabindex]';
  const direct = [...el.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.matches(sel));
  return direct.length ? direct : [...el.querySelectorAll<HTMLElement>('button, [role="tab"], [role="radio"]')];
}

/** Scroll position that brings `item` fully into view inside `row`, clear of the fades (null: already is). */
export function revealLeft(row: HTMLElement, item: HTMLElement, pad = EDGE): number | null {
  const max = row.scrollWidth - row.clientWidth;
  if (max <= 1) return null;
  const r = row.getBoundingClientRect(), b = item.getBoundingClientRect();
  const left = b.left - r.left + row.scrollLeft, right = left + b.width;
  if (left - pad < row.scrollLeft) return Math.max(0, left - pad);
  if (right + pad > row.scrollLeft + row.clientWidth) return Math.min(max, right + pad - row.clientWidth);
  return null;
}

export const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
