import { useEffect, useRef, useState } from 'react';
import { DOC_FUTURE, emptyGlyph, newDoc } from '../doc';
import { labUses } from '../autosave';
import { deleteDoc, discardBroken, listDocs, loadDoc, saveDoc } from '../storage';
import { openDoc, setCurrent } from '../state';

/**
 * The projects of this browser and the ways to start: a new alphabet, a new set of ASCII symbols, a single
 * letter the assistant will grow from, or a project file. A project that cannot be read is listed as damaged
 * and kept untouched (it can be downloaded as it is); one from a newer GLYPHOS opens read-only.
 */

type Row = Awaited<ReturnType<typeof listDocs>>[number];

const fmtDate = (t: number) => new Date(t).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function Projects({ onOpened }: { onOpened?: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState<{ text: string; warn?: boolean } | null>(null);
  const [letter, setLetter] = useState('a');
  const file = useRef<HTMLInputElement>(null);
  const refresh = () => void listDocs().then(setRows).catch(() => setRows([]));
  useEffect(refresh, []);

  const open = async (id: string) => {
    const r = await loadDoc(id);
    if ('broken' in r) { setMsg({ text: r.broken, warn: true }); refresh(); return; }
    openDoc(r.doc, r.future ? DOC_FUTURE : null);
    onOpened?.();
  };
  const create = async (mode: 'texto' | 'ascii', from?: string) => {
    const d = newDoc({ mode });
    if (from) d.name = `Desde «${from}»`;
    if (from && !d.chars.includes(from)) { d.chars.unshift(from); d.glyphs[from] = emptyGlyph(from, d); }
    const saved = await saveDoc(d);
    openDoc(d);
    if (from) setCurrent(from);
    if (saved !== 'ok') setMsg({ text: saved === 'full' ? 'No queda espacio en este navegador: el proyecto vive en esta pestaña hasta que liberes espacio.' : 'Este navegador no deja guardar: el proyecto vive en esta pestaña. Descarga una copia antes de cerrarla.', warn: true });
    onOpened?.();
  };
  const remove = async (row: Row) => {
    if (!confirm(`¿Borrar «${row.name}» de este navegador? Los juegos de glifos que usan tus piezas del laboratorio se conservan. No se puede deshacer: descarga antes una copia si la quieres.`)) return;
    const uses = await labUses();
    const r = await deleteDoc(row.id, id => uses.has(id));
    setMsg({ text: r.deleted ? `«${row.name}» borrado.${r.keptSets.length ? ` Se conservan ${r.keptSets.length} juegos que usan piezas del laboratorio.` : ''}` : 'No se pudo borrar.', warn: !r.deleted });
    refresh();
  };
  const importFile = async (f: File) => {
    try {
      const { readPackage, planMerge } = await import('../export/package');
      const { importPackage } = await import('../storage');
      const pkg = await readPackage(f);
      const local = (rows ?? []).filter(r => !r.broken).map(r => ({ id: r.id, rev: r.rev, updated: r.updated, name: r.name }));
      const plan = planMerge(local, { id: pkg.doc.id, rev: pkg.doc.rev, updated: pkg.doc.updated, name: pkg.doc.name });
      let mode: 'reemplazar' | 'copia' | 'auto' = 'auto';
      if (plan.action === 'igual') { setMsg({ text: plan.message }); await open(pkg.doc.id); return; }
      if (plan.action === 'mas-nuevo') mode = confirm(`${plan.message}\n\nAceptar: reemplazar el de este navegador. Cancelar: guardar una copia aparte.`) ? 'reemplazar' : 'copia';
      if (plan.action === 'mas-viejo' || plan.action === 'divergente') mode = 'copia';
      const r = await importPackage(pkg, mode);
      setMsg({ text: [plan.message, ...pkg.warnings].join(' '), warn: pkg.warnings.length > 0 });
      refresh();
      // a document from a newer GLYPHOS is not stored: it opens read-only, from the file
      if (r.action === 'futuro') { openDoc(pkg.doc, DOC_FUTURE); onOpened?.(); return; }
      await open(r.docId);
    } catch (e) { setMsg({ text: (e as Error).message, warn: true }); }
  };

  return (
    <div className="gl-projects">
      <div className="gl-start">
        <button type="button" className="gl-start-card" onClick={() => void create('texto')}>
          <b>Nuevo alfabeto</b><span>Letras para palabras: mayúsculas, minúsculas, español, cifras y puntuación, con espaciado y kerning.</span>
        </button>
        <button type="button" className="gl-start-card" onClick={() => void create('ascii')}>
          <b>Nuevos símbolos ASCII</b><span>Símbolos de celda fija para piezas del laboratorio, con su rampa de vacío a lleno.</span>
        </button>
        <div className="gl-start-card">
          <b>Empezar desde una letra</b><span>Dibuja o importa una sola letra y deja que el asistente proponga las demás con su estilo.</span>
          <div className="row">
            <label className="sr-only" htmlFor="gl-from">Letra</label>
            <input id="gl-from" className="field" value={letter} maxLength={2} onChange={e => setLetter(Array.from(e.target.value).slice(-1).join('') || 'a')} style={{ width: 64 }} />
            <button type="button" className="btn small" onClick={() => void create('texto', letter)}>Empezar</button>
          </div>
        </div>
        <button type="button" className="gl-start-card" onClick={() => file.current?.click()}>
          <b>Abrir proyecto</b><span>Un archivo .glyphos-glifos (o su documento .json): no se duplica si ya lo tienes.</span>
        </button>
        <input ref={file} type="file" hidden accept=".glyphos-glifos,.zip,.json,application/zip,application/json" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} />
      </div>
      {msg && <p className={'note gl-line' + (msg.warn ? ' warn' : '')} role="status">{msg.text}</p>}
      <h2 className="sub">En este navegador</h2>
      {rows === null && <p className="note">Leyendo…</p>}
      {rows?.length === 0 && <p className="note">Todavía no hay proyectos de glifos aquí.</p>}
      <ul className="gl-proj-list">
        {rows?.map(r => (
          <li key={r.id} className={r.broken ? 'broken' : ''}>
            <div>
              <b>{r.name}</b>
              <span className="note">{r.broken ? `Dañado: ${r.broken}` : `${r.mode === 'ascii' ? 'Símbolos ASCII' : 'Alfabeto'} · ${r.glyphs} con dibujo · ${fmtDate(r.updated)}${r.future ? ' · de una versión más nueva (sólo lectura)' : ''}`}</span>
            </div>
            <div className="row">
              {!r.broken && <button type="button" className="btn small" onClick={() => void open(r.id)}>Abrir</button>}
              {r.broken && (
                <>
                  <button type="button" className="btn small" onClick={() => void loadDoc(r.id).then(x => { if ('raw' in x) download(`glifos-danado-${r.id}.json`, JSON.stringify(x.raw)); })}>Descargar el original</button>
                  <button type="button" className="btn small ghost" onClick={() => { if (confirm('¿Descartar la copia dañada? Descárgala antes si quieres intentar recuperarla.')) void discardBroken(r.id).then(refresh); }}>Descartar</button>
                </>
              )}
              {!r.broken && <button type="button" className="btn small ghost" onClick={() => void remove(r)} aria-label={`Borrar ${r.name}`}>Borrar</button>}
            </div>
          </li>
        ))}
      </ul>
      <p className="note">Tus proyectos viven en este navegador: nada se sube. Descarga una copia (Exportar → Proyecto) para llevarlos a otro equipo o por si el navegador borra sus datos.</p>
    </div>
  );
}

