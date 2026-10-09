import { useEffect, useReducer, useState } from 'react';
import { installLocalGlyphSets } from '../../glyphset/local';
import { installAutosave, flushSave } from '../autosave';
import { closeDoc, edit, redo, undo, useGlifos, type SaveState } from '../state';
import { AssistantPanel } from './AssistantPanel';
import { Board } from './Board';
import { DocPanel } from './DocPanel';
import { GlyphEditor } from './editor/GlyphEditor';
import { ExportPanel } from './ExportPanel';
import { ImportPanel } from './ImportPanel';
import { bitmapOf, inkOf, onPictures, pictureOf } from './pictures';
import { Preview } from './Preview';
import { Projects } from './Projects';
import { RampPanel } from './RampPanel';

/**
 * «Crea tus GLYPHOS»: the projects of this browser, and an open project as a workshop — the board of
 * characters on the left, the editor in the middle, the panels (assistant, import, preview, ramp, export,
 * document) on the right. On a phone the three take turns.
 */

type PanelId = 'asistente' | 'importar' | 'vista' | 'rampa' | 'exportar' | 'documento';
const PANELS: Array<[PanelId, string]> = [['asistente', 'Asistente'], ['importar', 'Importar'], ['vista', 'Vista previa'], ['rampa', 'Rampa'], ['exportar', 'Exportar'], ['documento', 'Documento']];
type MobileView = 'tablero' | 'editor' | 'panel';

const SAVE_TEXT: Record<SaveState, string> = {
  guardado: 'Guardado en este navegador', pendiente: 'Cambios sin guardar…', guardando: 'Guardando…', conflicto: 'Otra pestaña lo guardó: aquí no se guarda',
  lleno: 'Sin espacio: no se guardó', 'sin-almacenamiento': 'Sin almacenamiento: no se guarda', 'solo-lectura': 'Sólo lectura', error: 'No se pudo guardar',
};

export function GlifosApp() {
  const doc = useGlifos(s => s.doc);
  const current = useGlifos(s => s.current);
  const readOnly = useGlifos(s => s.readOnly);
  const save = useGlifos(s => s.save);
  const saveNote = useGlifos(s => s.saveNote);
  const canUndo = useGlifos(s => s.canUndo), canRedo = useGlifos(s => s.canRedo);
  const undoLabel = useGlifos(s => s.undoLabel), redoLabel = useGlifos(s => s.redoLabel);
  const [panel, setPanel] = useState<PanelId>('asistente');
  const [view, setView] = useState<MobileView>('editor');
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => { installAutosave(); installLocalGlyphSets(); return onPictures(redraw); }, []);
  useEffect(() => { document.title = doc ? `${doc.name} · Crea tus GLYPHOS` : 'Crea tus GLYPHOS — diseña tus letras y símbolos ASCII'; }, [doc?.name]);
  // the images a document uses start decoding as soon as it opens
  useEffect(() => { if (doc) for (const id of Object.keys(doc.images)) pictureOf(id); }, [doc?.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      // the editor handles its own shortcuts first (and marks them handled)
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { if (undo()) e.preventDefault(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { if (redo()) e.preventDefault(); }
      else if (k === 's') { e.preventDefault(); void flushSave(); }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);
  // on a phone, picking a character on the board opens it in the editor
  useEffect(() => {
    if (current && view === 'tablero' && matchMedia('(max-width: 1080px)').matches) setView('editor');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);
  const panels = PANELS.filter(([id]) => id !== 'rampa' || doc?.mode === 'ascii');

  return (
    <div className="gl-app" data-view={view}>
      <header className="gl-top">
        <a className="gl-back" href="/studio/" title="Volver al laboratorio">← GLYPHOS</a>
        <span className="gl-brand">Crea tus GLYPHOS</span>
        {doc && (
          <>
            <label className="sr-only" htmlFor="gl-name">Nombre del proyecto</label>
            <input id="gl-name" className="gl-name" value={doc.name} disabled={!!readOnly} maxLength={60}
              onChange={e => edit(d => { d.name = e.target.value.slice(0, 60); }, 'Nombre', { key: 'name' })}
              onBlur={e => { if (!e.target.value.trim()) edit(d => { d.name = 'Sin nombre'; }, 'Nombre'); }} />
            <span className="chip gl-mode" title={doc.mode === 'ascii' ? 'Símbolos de celda fija, con rampa' : 'Alfabeto proporcional, con kerning'}>{doc.mode === 'ascii' ? 'Símbolos ASCII' : 'Alfabeto'}</span>
            <span className={'gl-save s-' + save} role="status" title={saveNote || undefined}>{SAVE_TEXT[save]}</span>
            <span className="gl-top-acts">
              <button type="button" className="btn small" disabled={!canUndo || !!readOnly} onClick={() => undo()} title={undoLabel ? `Deshacer: ${undoLabel} (Ctrl+Z)` : 'Deshacer (Ctrl+Z)'}>Deshacer</button>
              <button type="button" className="btn small" disabled={!canRedo || !!readOnly} onClick={() => redo()} title={redoLabel ? `Rehacer: ${redoLabel} (Ctrl+Mayús+Z)` : 'Rehacer'}>Rehacer</button>
              <button type="button" className="btn small" onClick={() => { void flushSave().then(() => closeDoc()); }}>Proyectos</button>
            </span>
          </>
        )}
      </header>
      {(readOnly || (saveNote && save !== 'guardado')) && doc && <p className="gl-banner" role="alert">{readOnly ?? saveNote}</p>}
      {!doc ? (
        <main className="gl-home"><Projects onOpened={() => setView('editor')} /></main>
      ) : (
        <>
          <main className="gl-main">
            <aside className="gl-left" aria-label="Caracteres"><Board /></aside>
            <section className="gl-center" aria-label="Editor">
              {current ? <GlyphEditor key={doc.id} ch={current} image={bitmapOf} inkOf={inkOf} /> : <p className="note">Elige un carácter del tablero.</p>}
            </section>
            <aside className="gl-right" aria-label="Paneles">
              <div className="gl-tabs" role="tablist" aria-label="Paneles">
                {panels.map(([id, name]) => (
                  <button key={id} type="button" role="tab" id={'tab-' + id} aria-selected={panel === id} aria-controls={'pane-' + id} className="gl-tab" onClick={() => setPanel(id)}>{name}</button>
                ))}
              </div>
              <div className="gl-pane" role="tabpanel" id={'pane-' + panel} aria-labelledby={'tab-' + panel}>
                {panel === 'asistente' && <AssistantPanel />}
                {panel === 'importar' && <ImportPanel />}
                {panel === 'vista' && <Preview pictures={pictureOf} />}
                {panel === 'rampa' && <RampPanel />}
                {panel === 'exportar' && <ExportPanel />}
                {panel === 'documento' && <DocPanel />}
              </div>
            </aside>
          </main>
          <nav className="gl-mobile-nav" aria-label="Vista">
            {([['tablero', 'Tablero'], ['editor', 'Editor'], ['panel', 'Paneles']] as Array<[MobileView, string]>).map(([v, n]) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{n}</button>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
