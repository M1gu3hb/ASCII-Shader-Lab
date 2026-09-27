import { create } from 'zustand';

export interface Toast { id: number; msg: string; action?: { label: string; run: () => void } }

export const useToasts = create<{ list: Toast[]; live: string }>(() => ({ list: [], live: '' }));

let n = 0;
export function toast(msg: string, action?: Toast['action'], ms = 3200) {
  const id = ++n;
  useToasts.setState(s => ({ list: [...s.list.slice(-2), { id, msg, action }] }));
  setTimeout(() => useToasts.setState(s => ({ list: s.list.filter(t => t.id !== id) })), action ? ms + 2500 : ms);
}

/** Screen-reader only announcement. */
export function announce(msg: string) {
  useToasts.setState({ live: '' });
  requestAnimationFrame(() => useToasts.setState({ live: msg }));
}
