/**
 * The document's metrics (shared by every glyph): ascender, descender, x-height, cap height, the ASCII
 * cell and the default side bearings. Each field is one undoable edit (`metrics-*`, so arrow presses
 * coalesce).
 */
import { useContext } from 'react';
import type { GlyphDoc, Metrics } from '../../doc';
import { edit, useGlifos } from '../../state';
import { EditorApiCtx } from './editorStore';
import { NumField } from './NumField';

/** Inside the editor it edits through the editor; elsewhere (the Documento panel) straight on the document. */
export function MetricsPanel({ doc }: { doc: GlyphDoc }) {
  const api = useContext(EditorApiCtx);
  const readOnly = useGlifos(s => !!s.readOnly);
  const m = doc.metrics, u = m.upm;
  const ro = api ? !api.docEditable : readOnly;
  const editDoc = (fn: (d: GlyphDoc) => void, label: string, key?: string) => (api ? api.editDoc(fn, label, key) : edit(fn, label, { key }));
  const set = (k: keyof Metrics, name: string) => (v: number) => editDoc(d => { d.metrics[k] = Math.round(v * 10) / 10; }, `Métrica: ${name}`, `metrics-${k}`);
  const fields: Array<[keyof Metrics, string, number, number]> = [
    ['asc', 'Ascendente', 0, u * 4], ['cap', 'Mayúsculas', 0, u * 4], ['xh', 'Altura x', 0, u * 4], ['desc', 'Descendente', -u * 4, 0],
  ];
  return (
    <div className="ge-metrics">
      <p className="ge-kv"><span>Unidades por eme</span><output className="ge-val">{u}</output></p>
      <div className="ge-grid2">
        {fields.map(([k, name, min, max]) => <NumField key={k} label={name} value={m[k]} min={min} max={max} disabled={ro} onCommit={set(k, name)} />)}
        {doc.mode === 'ascii' && <NumField label="Celda" value={m.cell} min={1} max={u * 8} disabled={ro} onCommit={set('cell', 'celda')} hint="Avance de cada símbolo" />}
      </div>
      <p className="ge-sub">Márgenes de los glifos nuevos</p>
      <div className="ge-grid2">
        <NumField label="Margen izquierdo" value={m.lsb} min={-u} max={u} disabled={ro} onCommit={set('lsb', 'margen izquierdo')} />
        <NumField label="Margen derecho" value={m.rsb} min={-u} max={u} disabled={ro} onCommit={set('rsb', 'margen derecho')} />
      </div>
    </div>
  );
}
