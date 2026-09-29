/**
 * Keyboard routing of the photo studio: the active tool first (Tool.onKey), then the studio's shortcuts.
 *   espacio (tap) / →  azar (→ goes to the next version first when there is one)   ←  versión anterior
 *   espacio + arrastrar  mover la vista                                             F  favorita
 *   Z · ⌘Z / Ctrl+Z  deshacer        ⇧Z · ⇧⌘Z · Ctrl+Y  rehacer                     [ ]  tamaño del pincel (herramientas)
 *   tools (Tool.shortcut): V M O P L K W J G B E R  ·  H  mano                      C  antes y después
 *   0  ajustar  ·  1  100 %  ·  + −  zoom  ·  ?  atajos  ·  Esc  cancela el gesto o suelta la herramienta
 * The timeline (focused) and the layer list keep their own keys (they stop them here): the map, in Spanish,
 * is the help sheet's (Sheets.tsx STUDIO_KEYS, TOOL_KEYS, TIMELINE_KEYS); tests/unit/foto-keys.test.ts keeps
 * the tools' letters apart from the studio's.
 * Nothing here while typing in a field or while a dialog is open.
 */
import { azar, favorite, next, prev, redo, toggleCompare, undo, zoomFit, zoomStep, zoomTo } from './actions';
import { activeTool, host } from './host';
import { TOOLS } from './tools/index';
import { say, setUI, ui, useFoto } from './ui';

/** Letters and signs the studio itself uses (no tool may take them). */
export const STUDIO_LETTERS = ['h', 'f', 'z', 'c', '0', '1', '+', '=', '-', '_', '?', '[', ']', ' '];

let space = false;
let spaceUsed = false;
let overView = false;
/** The pointer is over the viewport: the space bar belongs to the studio even when a button has the focus. */
export const setOverViewport = (v: boolean) => { overView = v; };

/** The space bar is held (space-drag pans). */
export const spaceHeld = () => space;
/** A drag used the held space bar: releasing it does not roll the dice. */
export const markSpaceUsed = () => { spaceUsed = true; };

const isField = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  const f = el?.closest?.('input, textarea, select, [contenteditable="true"]') as HTMLInputElement | null;
  return !!f && !['range', 'checkbox', 'radio', 'color', 'button'].includes(f.type);
};

/** Selects a tool (or drops it when it is already active), telling it and the screen reader. */
export function selectTool(id: string | null) {
  const cur = ui().tool;
  const prevTool = activeTool();
  const nextId = id === cur ? null : id;
  if (prevTool) { try { prevTool.cancel?.(host); prevTool.deactivate?.(host); } catch (e) { console.warn(e); } host.preview(null); }
  setUI({ tool: nextId });
  const t = activeTool();
  // the options bar shows the tool and its hint: the status line stays free, the screen reader hears it
  if (t) { try { t.activate?.(host); } catch (e) { console.warn(e); } say(`${t.name}: ${t.hint}`, { quiet: true }); }
  else if (nextId === 'mano') say('Mano: arrastra para mover la vista.', { quiet: true });
  host.redrawOverlay();
}

export function startKeys(): () => void {
  const down = (e: KeyboardEvent) => {
    if (ui().screen !== 'edit') return;
    if (isField(e.target) && e.key !== 'Escape') return;
    if (document.querySelector('dialog[open]')) return;
    // the tool first
    const t = activeTool();
    if (t?.onKey) {
      let used = false;
      try { used = t.onKey(e, host); } catch (err) { console.warn('foto: tool key', err); }
      if (used) { e.preventDefault(); host.redrawOverlay(); return; }
    }
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); redo(); return; }
    if (mod && k === '0') { e.preventDefault(); zoomFit(); return; }
    if (mod && k === '1') { e.preventDefault(); zoomTo(1); return; }
    if (mod || e.altKey) return;
    const inButton = !!(e.target as HTMLElement | null)?.closest?.('button, [role="slider"], [role="option"], [role="tab"], [role="radio"], a');
    if (k === ' ') {
      if (inButton && !overView) return;
      if (inButton) (document.activeElement as HTMLElement | null)?.blur();
      e.preventDefault();
      if (!e.repeat) { space = true; spaceUsed = false; document.documentElement.dataset.space = '1'; }
      return;
    }
    if (k === 'Escape') {
      if (t) { try { t.cancel?.(host); } catch { /* ignore */ } host.preview(null); selectTool(null); return; }
      if (ui().compare) { setUI({ compare: false }); return; }
      if (ui().snap !== 'closed') { setUI({ snap: 'closed' }); return; }
      return;
    }
    if (k === 'ArrowRight' || k === 'ArrowLeft') {
      // controls that use the arrows themselves keep them (sliders, radio groups, tabs, lists)
      if ((e.target as HTMLElement | null)?.closest?.('input, [role="slider"], [role="radio"], [role="tab"], [role="option"], [role="menuitem"], [role="combobox"], .fl-list, .fsheet-grab')) return;
      e.preventDefault();
      if (k === 'ArrowRight') next(); else prev();
      return;
    }
    const low = k.length === 1 ? k.toLowerCase() : k;
    // tool letters (their own letters win over the studio's)
    const tool = TOOLS.find(x => x.shortcut && x.shortcut.toLowerCase() === low && !e.shiftKey)
      ?? TOOLS.find(x => x.shortcut && x.shortcut.toLowerCase() === low);
    if (tool) { e.preventDefault(); selectTool(tool.id); return; }
    switch (low) {
      case 'f': e.preventDefault(); favorite(); return;
      case 'z': e.preventDefault(); if (e.shiftKey) redo(); else undo(); return;
      case 'h': e.preventDefault(); selectTool('mano'); return;
      case 'c': e.preventDefault(); toggleCompare(); return;
      case '0': e.preventDefault(); zoomFit(); return;
      case '1': e.preventDefault(); zoomTo(1); return;
      case '+': case '=': e.preventDefault(); zoomStep(1, ui().zk); return;
      case '-': case '_': e.preventDefault(); zoomStep(-1, ui().zk); return;
      case '?': e.preventDefault(); setUI({ sheet: 'help' }); return;
      case '[': case ']': say(t ? 'Esta herramienta no tiene tamaño de pincel.' : 'Elige un pincel para cambiar su tamaño con [ y ].'); return;
      default: break;
    }
  };
  const up = (e: KeyboardEvent) => {
    if (e.key !== ' ') return;
    if (!space) return;
    space = false;
    delete document.documentElement.dataset.space;
    if (ui().screen !== 'edit' || isField(e.target) || document.querySelector('dialog[open]')) return;
    // a tap of the space bar rolls; a held one that dragged the view does not
    if (!spaceUsed) { e.preventDefault(); azar(); }
    spaceUsed = false;
  };
  const blur = () => { space = false; delete document.documentElement.dataset.space; };
  addEventListener('keydown', down);
  addEventListener('keyup', up);
  addEventListener('blur', blur);
  const unsub = useFoto.subscribe((s, p) => { if (s.screen !== p.screen) blur(); });
  return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('blur', blur); unsub(); };
}
