/**
 * The WAI-ARIA tabs pattern for the landing's tab rows (spaces, destinations): roving tabindex, arrow keys
 * in both axes (the rows wrap into a grid on phones), Home and End, and activation when a tab takes focus.
 * The state changes at once; `onSelect` adds the motion on top of it.
 */
export interface TabSet { select(i: number, o?: { focus?: boolean; user?: boolean }): void; readonly index: number; readonly tabs: HTMLElement[] }

export function tabset(list: HTMLElement, onSelect: (i: number, tab: HTMLElement, user: boolean) => void): TabSet {
  const tabs = Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]'));
  let index = Math.max(0, tabs.findIndex(t => t.getAttribute('aria-selected') === 'true'));
  const paint = () => tabs.forEach((t, i) => {
    t.setAttribute('aria-selected', String(i === index));
    t.tabIndex = i === index ? 0 : -1;
  });
  const set: TabSet = {
    get index() { return index; },
    tabs,
    select(i, o = {}) {
      const next = (i + tabs.length) % tabs.length;
      const changed = next !== index;
      index = next;
      paint();
      if (o.focus) tabs[index].focus();
      if (changed || !o.user) onSelect(index, tabs[index], !!o.user);
    },
  };
  tabs.forEach((t, i) => t.addEventListener('click', () => set.select(i, { user: true })));
  list.addEventListener('keydown', e => {
    const k = e.key;
    let to = -1;
    if (k === 'ArrowRight' || k === 'ArrowDown') to = index + 1;
    else if (k === 'ArrowLeft' || k === 'ArrowUp') to = index - 1;
    else if (k === 'Home') to = 0;
    else if (k === 'End') to = tabs.length - 1;
    if (to < 0 && k !== 'ArrowLeft' && k !== 'ArrowUp') return;
    e.preventDefault();
    set.select(to, { focus: true, user: true });
  });
  paint();
  return set;
}
