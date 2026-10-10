/**
 * The glyph outline editor of «Crea tus GLYPHOS»: toolbar, canvas and inspector for one character.
 *
 * It reads the document from useGlifos and writes only through edit / editGlyph (state.ts): every
 * gesture or action is one undoable step. An edit by the person marks an assistant's proposal as
 * corrected and an empty glyph as drawn (status.ts). Locked glyphs and read-only documents are shown,
 * not edited.
 */
import './editor.css';
import { useEffect, useId, useMemo, useRef, useState, type JSX } from 'react';
import { edit, editGlyph, redo, undo, useGlifos } from '../../state';
import type { Glyph, GlyphDoc } from '../../doc';
import { actionsFor } from './editorActions';
import { EditorCanvas } from './EditorCanvas';
import { EdStoreCtx, EditorApiCtx, TOOLS, createEdStore, type CanvasApi, type EditorApi } from './editorStore';
import { Inspector } from './Inspector';
import { OptionsBar, Toolbar } from './Toolbar';
import { ICONS } from './icons';
import { componentContours } from './components';
import { fmtNum } from './NumField';
import { markEdited } from './status';
import { movedNodes, parseKey, sanitizeSel, selIsEmpty, selectionBox, wholeContours, type Selection } from './selection';

export interface GlyphEditorProps {
  ch: string;
  /** Decoded pictures of raster layers by content id (the shell decodes them). */
  image?: (id: string) => (CanvasImageSource & { width: number; height: number }) | undefined;
  /** Raster ink for vectorising: crop of the picture as 0..255 per pixel (the shell computes it). */
  inkOf?: (id: string, crop: { x: number; y: number; w: number; h: number }, read: 'transparencia' | 'oscuro') => { w: number; h: number; ink: Uint8Array } | undefined;
}

const isTyping = (t: Element | null) => !!t?.closest('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select, [contenteditable="true"]');

/** What the live region says about a selection. */
function describeSel(raw: Selection, g: Glyph, doc: GlyphDoc): string {
  const sel = sanitizeSel(raw, { contours: g.contours, components: g.components, anchors: g.anchors });
  if (selIsEmpty(sel)) return 'Nada seleccionado';
  const moved = movedNodes(sel, g.contours);
  const whole = wholeContours(sel, g.contours);
  const box = selectionBox({ contours: g.contours, components: g.components, anchors: g.anchors }, sel, i => (g.components[i] ? componentContours(doc, g.components[i]) : []));
  const at = box ? ` en x ${fmtNum(box.x0)}, y ${fmtNum(box.y0)}` : '';
  if (moved.size === 1 && sel.nodes.length === 1 && !sel.contours.length && !sel.components.length && !sel.anchors.length) {
    const [ci, ni] = parseKey(sel.nodes[0]);
    const n = g.contours[ci]?.nodes[ni];
    if (n) return `Nodo ${ni + 1} de ${g.contours[ci].nodes.length}, contorno ${ci + 1}, ${n.smooth ? 'suave' : 'esquina'}, en x ${fmtNum(n.x)}, y ${fmtNum(n.y)}`;
  }
  const parts: string[] = [];
  if (whole.length && whole.length * 1 === sel.contours.length && !sel.nodes.length) parts.push(`${whole.length} ${whole.length === 1 ? 'contorno seleccionado' : 'contornos seleccionados'} (${moved.size} nodos)`);
  else if (moved.size) parts.push(`${moved.size} ${moved.size === 1 ? 'nodo seleccionado' : 'nodos seleccionados'}`);
  if (sel.components.length) parts.push(sel.components.map(i => `componente «${g.components[i]?.of ?? '?'}»`).join(', '));
  if (sel.anchors.length) parts.push(sel.anchors.map(i => `ancla ${g.anchors[i]?.name ?? '?'}`).join(', '));
  return parts.join(', ') + at;
}

export function GlyphEditor(p: GlyphEditorProps): JSX.Element {
  const { ch } = p;
  const doc = useGlifos(s => s.doc);
  const readOnly = useGlifos(s => s.readOnly);
  const [store] = useState(createEdStore);
  const canvasRef = useRef<CanvasApi | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const helpId = useId();
  const [said, setSaid] = useState({ text: '', n: 0 });
  const g = doc?.glyphs[ch];
  const locked = g?.status === 'bloqueado';
  const docEditable = !!doc && !readOnly;
  const editable = docEditable && !!g && !locked;

  const latest = useRef({ ch, editable, docEditable });
  latest.current = { ch, editable, docEditable };

  const api: EditorApi = useMemo(() => {
    const say = (text: string) => setSaid(s => ({ text, n: s.n + 1 }));
    const a: EditorApi = {
      ch, editable, docEditable, canvas: canvasRef, say,
      editPart: (fn, label, key) => {
        const l = latest.current;
        if (!l.editable) return false;
        return editGlyph(l.ch, (gg, d) => { fn(gg, d); markEdited(gg); }, label, key);
      },
      editDoc: (fn, label, key) => (latest.current.docEditable ? edit(fn, label, { key }) : false),
      run: () => {},
      rotate: () => {},
      scale: () => {},
      nudge: () => {},
    };
    Object.assign(a, actionsFor(a, store));
    return a;
  }, [ch, editable, docEditable, store]);

  // tell what is selected (after the gesture settles)
  useEffect(() => {
    let t = 0;
    let last = '';
    const unsub = store.subscribe((s, prev) => {
      if (s.sel === prev.sel) return;
      clearTimeout(t);
      t = window.setTimeout(() => {
        const d = useGlifos.getState().doc, gg = d?.glyphs[latest.current.ch];
        if (!d || !gg) return;
        const text = describeSel(store.getState().sel, gg, d);
        if (text !== last) { last = text; setSaid(x => ({ text, n: x.n + 1 })); }
      }, 350);
    });
    return () => { clearTimeout(t); unsub(); };
  }, [store]);

  // keyboard: only when the focus is in the editor (or nowhere), never while typing in a field
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const t = e.target as Element | null;
      const root = rootRef.current;
      const onBody = t === document.body || t === document.documentElement;
      if (!root || (!onBody && !(t && root.contains(t)))) return;
      const typing = isTyping(t);
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (mod && !e.altKey && k === 'z') { if (typing) return; e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && k === 'y') { if (typing) return; e.preventDefault(); redo(); return; }
      if (typing) return;
      const onCanvas = onBody || !!t?.classList.contains('ge-canvas');
      const inBar = !!t?.closest('[role=toolbar]');
      const cv = canvasRef.current;
      if (mod && !e.altKey) {
        if (k === 'd') { e.preventDefault(); api.run('duplicar'); return; }
        if (k === 'a' && onCanvas) { e.preventDefault(); api.run('todo'); return; }
        if (k === '=' || k === '+') { e.preventDefault(); cv?.zoomBy(1); return; }
        if (k === '-') { e.preventDefault(); cv?.zoomBy(-1); return; }
        if (k === '0') { e.preventDefault(); cv?.fit(); return; }
        return;
      }
      if (e.key === 'Escape') {
        if (cv?.endPen()) { e.preventDefault(); return; }
        if (!selIsEmpty(store.getState().sel) && (onCanvas || !t?.closest('details'))) { e.preventDefault(); api.run('nada'); }
        return;
      }
      if (e.key === 'Enter' && onCanvas) { if (cv?.endPen()) e.preventDefault(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.altKey) {
        if (selIsEmpty(store.getState().sel)) return;
        e.preventDefault(); api.run('eliminar'); return;
      }
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
      if (arrows[e.key] && !e.altKey && (onCanvas || (t?.tagName === 'BUTTON' && !inBar))) {
        if (selIsEmpty(store.getState().sel)) return;
        e.preventDefault();
        const st = e.shiftKey ? 10 : 1;
        api.nudge(arrows[e.key][0] * st, arrows[e.key][1] * st);
        return;
      }
      if (e.altKey || e.repeat) return;
      const tool = TOOLS.find(x => x.key.toLowerCase() === k);
      if (tool) {
        const ok = tool.id === 'seleccionar' || (tool.id === 'guia' ? latest.current.docEditable : latest.current.editable);
        e.preventDefault();
        if (ok) store.setState({ tool: tool.id }); else api.say(latest.current.docEditable ? 'Este glifo está bloqueado: desbloquéalo para editar.' : 'Solo lectura: no se puede editar.');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [api, store]);

  // a locked or read-only glyph keeps only the tools that look (and guides, which are the document's)
  useEffect(() => {
    const t = store.getState().tool;
    if (!editable && t !== 'seleccionar' && !(t === 'guia' && docEditable)) store.setState({ tool: 'seleccionar' });
  }, [editable, docEditable, store]);

  if (!doc) return <div className="ge ge-none"><p>Abre un proyecto de glifos para editar.</p></div>;
  if (!g) return <div className="ge ge-none"><p>El carácter «{ch}» no está en este proyecto.</p></div>;

  const name = ch === ' ' ? 'espacio' : ch;
  return (
    <EdStoreCtx.Provider value={store}>
      <EditorApiCtx.Provider value={api}>
        <div className="ge" ref={rootRef}>
          <div className="ge-in">
            <div className="ge-top">
              <Toolbar contours={g.contours} />
              <OptionsBar doc={doc} hasRaster={!!g.raster} />
              {readOnly && (
                <p className="ge-notice ge-notice-ro" role="note">{ICONS.candado}<span><b>Solo lectura.</b> {readOnly}</span></p>
              )}
              {!readOnly && locked && (
                <div className="ge-notice ge-notice-lock" role="note">
                  {ICONS.candado}<span><b>Bloqueado:</b> desbloquéalo para editar.</span>
                  <button type="button" className="ge-btn" onClick={() => { editGlyph(ch, gg => { gg.status = 'dibujado'; }, 'Desbloquear'); api.say(`«${name}» desbloqueado`); }}>Desbloquear</button>
                </div>
              )}
            </div>
            <div className="ge-stage">
              <EditorCanvas doc={doc} g={g} ch={ch} image={p.image} label={`Editor del glifo ${name}`} describedBy={helpId} />
              <p id={helpId} className="sr-only">
                Tab y Mayús+Tab eligen el nodo siguiente o anterior; las flechas lo mueven 1 unidad (con Mayús, 10). Supr borra lo seleccionado, Ctrl+D lo duplica, Esc deselecciona. Atajos de herramienta: {TOOLS.map(x => `${x.key} ${x.name}`).join(', ')}.
              </p>
            </div>
            <aside className="ge-side" aria-label={`Inspector del glifo ${name}`}>
              <Inspector doc={doc} g={g} inkOf={p.inkOf} />
            </aside>
            <div className="sr-only" aria-live="polite" aria-atomic="true">{said.text}{said.n % 2 ? '​' : ''}</div>
          </div>
        </div>
      </EditorApiCtx.Provider>
    </EdStoreCtx.Provider>
  );
}

