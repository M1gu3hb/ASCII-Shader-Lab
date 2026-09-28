import { create } from 'zustand';

export interface Toast { id: number; msg: string; action?: { label: string; run: () => void } }

/** `held`: toasts that stay while the pointer or the keyboard is on them (their action must stay reachable). */
export const useToasts = create<{ list: Toast[]; live: string; held: number[] }>(() => ({ list: [], live: '', held: [] }));

let n = 0;
export function toast(msg: string, action?: Toast['action'], ms = 3200) {
  const id = ++n;
  useToasts.setState(s => ({ list: [...s.list.slice(-2), { id, msg, action }] }));
  const expire = () => {
    // a toast being read or used stays until it is left
    if (useToasts.getState().held.includes(id)) { setTimeout(expire, 1500); return; }
    useToasts.setState(s => ({ list: s.list.filter(t => t.id !== id) }));
  };
  setTimeout(expire, action ? ms + 2500 : ms);
}

/** Keeps a toast on screen while it is hovered or focused (`on`), and lets it go after. */
export function holdToast(id: number, on: boolean) {
  useToasts.setState(s => ({ held: on ? [...s.held.filter(x => x !== id), id] : s.held.filter(x => x !== id) }));
}

let clearT = 0;
/**
 * Screen-reader only announcement. The message is cleared a few seconds later, so the live region never
 * keeps saying something that is no longer true (a guide step after the guide ended).
 */
export function announce(msg: string) {
  clearTimeout(clearT);
  useToasts.setState({ live: '' });
  requestAnimationFrame(() => {
    useToasts.setState({ live: msg });
    clearT = window.setTimeout(() => useToasts.setState({ live: '' }), 7000);
  });
}

/** Empties the live region at once (what it said is no longer true, and something else is said: a focused step title). */
export function quiet() {
  clearTimeout(clearT);
  useToasts.setState({ live: '' });
}
