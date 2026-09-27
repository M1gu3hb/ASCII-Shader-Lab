import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Recipe } from '../engine/recipe';
import { ARCHETYPES } from '../random/archetypes';
import { cleanSeed, freshSeed } from '../random/seeds';
import { spaceById } from '../random/spaces';
import { recipeFile } from '../shared/share';
import { downloadText } from './download';
import { pickFile } from './files';
import { Glossary } from './Glossary';
import { HISTORY_WARN, historyLabel } from './history';
import { IClose, IDice } from './icons';
import { mediaUsage } from './mediaStore';
import { renderThumbs } from './offscreen';
import { fmtSize, saveSession, sessionMediaSize, slug } from './packages';
import { shareLink } from './ShareSheet';
import {
  applyRecipe, clearHistory, duplicateFavorite, openFavorite, removeFavorite, renameFavorite, rollDice, setArch, setUI,
  useStudio, variations,
} from './store';
import { toast } from './toast';
import { openWelcome } from './guide/state';
import './css/data.css';

export function Sheet({ open, title, sub, onClose, children, wide }: { open: boolean; title: string; sub?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={'sheet' + (wide ? ' wide' : '')} onClose={onClose}
      onClick={e => { if (e.target === ref.current) onClose(); }} onKeyDown={e => trapTab(e, ref.current)} aria-label={title}>
      {open && (
        <>
          <div className="sheet-head">
            <div className="grow"><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
            <button type="button" className="close" onClick={onClose} aria-label="Cerrar"><IClose /></button>
          </div>
          {children}
        </>
      )}
    </dialog>
  );
}

/**
 * Tab and Shift+Tab wrap around inside an open sheet: a modal dialog already makes the page behind
 * inert, but past its last control the browser would send focus to its own toolbar.
 */
export function trapTab(e: React.KeyboardEvent, d: HTMLElement | null) {
  if (e.key !== 'Tab' || !d) return;
  const all = [...d.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(el => !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0 && !el.closest('[inert]'));
  if (!all.length) return;
  const first = all[0], last = all[all.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

const close = () => setUI({ sheet: 'none' });

/* ------------------------------------------------------------------ */

export function CollectionSheet() {
  const open = useStudio(s => s.ui.sheet === 'collection');
  const favs = useStudio(s => s.favorites);
  const exportAll = () => {
    const json = JSON.stringify({ monotrama: 'collection', version: 2, exported: new Date().toISOString(), items: favs.map(f => ({ name: f.name, space: f.space, recipe: f.recipe, thumb: f.thumb })) }, null, 2);
    downloadText(`monotrama-coleccion-${new Date().toISOString().slice(0, 10)}.json`, json, 'application/json');
  };
  return (
    <Sheet open={open} onClose={close} wide title="Colección e historial" sub={`${favs.length} ${favs.length === 1 ? 'pieza guardada' : 'piezas guardadas'} con ★ · todo se queda en este navegador`}>
      <div className="sheet-body">
        {open && <HistoryBox />}
        <h3 className="data-h">Tu colección</h3>
        <div className="row" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          <button type="button" className="mini" onClick={exportAll} disabled={!favs.length}>Exportar colección (.json)</button>
          <button type="button" className="mini" onClick={() => pickFile('recipe')}>Importar receta, colección o proyecto</button>
        </div>
        {!favs.length ? (
          <div className="empty-state">
            <div className="big">{' .:-=+*#%@\n  aquí vivirán\n  tus piezas'}</div>
            <p>Pulsa <b>★</b> (o la tecla <b>S</b>) para guardar lo que te guste. Todo se queda en este navegador; guarda la sesión o exporta la colección para llevarla a otro equipo.</p>
          </div>
        ) : (
          <div className="card-grid">
            {favs.map(f => (
              <div key={f.id} className="fav-card">
                <button type="button" className="img" style={f.thumb ? { backgroundImage: `url(${f.thumb})` } : undefined} onClick={() => { openFavorite(f.id); close(); }} aria-label={`Abrir ${f.name}`} />
                <div className="meta">
                  <input defaultValue={f.name} aria-label="Nombre" onBlur={e => renameFavorite(f.id, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                  <small>{spaceById(f.space).name} · {new Date(f.updated).toLocaleDateString()}{f.recipe.media.ref && (f.recipe.source === 'image' || f.recipe.source === 'video') ? ` · con ${f.recipe.source === 'video' ? 'video' : 'imagen'}` : ''}</small>
                </div>
                <div className="ops">
                  <button type="button" onClick={() => { openFavorite(f.id); close(); }}>Abrir</button>
                  <button type="button" onClick={() => duplicateFavorite(f.id)}>Duplicar</button>
                  <button type="button" onClick={() => downloadText(slug(f.name) + '.monotrama.json', recipeFile(f.recipe), 'application/json')}>.json</button>
                  <button type="button" onClick={() => void shareLink(f.recipe, f.space)}>Enlace</button>
                  <button type="button" onClick={() => { if (confirm(`¿Borrar «${f.name}» de tu colección?`)) removeFavorite(f.id); }} aria-label={`Borrar ${f.name}`}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {open && (
          <div className="data-foot">
            <StorageBox />
            <Glossary />
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** History counter, session file and clearing. */
function HistoryBox() {
  const count = useStudio(s => s.entries.length);
  const limit = useStudio(s => s.histLimit);
  const pruned = useStudio(s => s.pruned);
  const [withMedia, setWithMedia] = useState(true);
  const [media, setMedia] = useState<{ count: number; bytes: number; missing: number } | null>(null);
  useEffect(() => { let alive = true; void sessionMediaSize().then(m => { if (alive) setMedia(m); }); return () => { alive = false; }; }, [count]);
  const pct = Math.min(100, Math.round((count / limit) * 100));
  return (
    <section className="data-hist" aria-labelledby="data-hist-h">
      <div className="data-count">
        <h3 id="data-hist-h">Historial</h3>
        <p className="count-line" role="status">{historyLabel(count, limit)}</p>
        <div className={'data-meter' + (count >= limit * HISTORY_WARN ? ' near' : '')} aria-hidden="true"><i style={{ '--v': pct + '%' } as React.CSSProperties} /></div>
        <p className="note">
          Guarda tus últimos {limit} resultados; al pasar de ahí se descartan los más antiguos.
          {pruned > 0 && <> En esta sesión {pruned === 1 ? 'se descartó 1 resultado' : `se descartaron ${pruned} resultados`}.</>}
        </p>
      </div>
      <div className="data-acts">
        <button type="button" className="mini" onClick={() => void saveSession(withMedia)}>Guardar sesión</button>
        <button type="button" className="mini" onClick={() => pickFile('session')}>Abrir sesión</button>
        <button type="button" className="mini" onClick={() => { if (confirm('¿Vaciar el historial? Se queda sólo la pieza actual. Tu colección no se toca; las imágenes y videos que sólo usaba el historial se borran de este navegador.')) { clearHistory(); toast('Historial vaciado'); } }}>Vaciar historial</button>
      </div>
      {media && media.count > 0 && (
        <label className="toggle">
          <span>Incluir en la sesión las imágenes y videos ({media.count}, {fmtSize(media.bytes)})</span>
          <span className="switch"><input type="checkbox" role="switch" checked={withMedia} onChange={e => setWithMedia(e.target.checked)} /><span /></span>
        </label>
      )}
      {media && media.missing > 0 && (
        <p className="note" style={{ gridColumn: '1 / -1', margin: 0 }}>
          {media.missing === 1 ? 'Una imagen o video del historial ya no está' : `${media.missing} imágenes o videos del historial ya no están`} en este navegador: esas piezas pedirán el archivo al abrirlas.
        </p>
      )}
    </section>
  );
}

/** How much this browser holds, and the plain truth about clearing it. */
function StorageBox() {
  const [info, setInfo] = useState<{ usage?: number; quota?: number; persisted?: boolean; media: { count: number; bytes: number } } | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const st = typeof navigator !== 'undefined' ? navigator.storage : undefined;
      const [est, persisted, media] = await Promise.all([
        st?.estimate?.().catch(() => undefined), st?.persisted?.().catch(() => undefined), mediaUsage(),
      ]);
      if (alive) setInfo({ usage: est?.usage, quota: est?.quota, persisted, media });
    })();
    return () => { alive = false; };
  }, []);
  return (
    <section className="data-storage" aria-labelledby="data-storage-h">
      <h3 id="data-storage-h">En este navegador</h3>
      {info && (
        <p>
          {info.usage != null ? <>Monotrama ocupa <b>{fmtSize(info.usage)}</b>{info.quota ? <> de {fmtSize(info.quota)} disponibles</> : null}</> : 'Este navegador no informa del espacio que usa'}
          {info.media.count > 0 ? <>, de ellos {fmtSize(info.media.bytes)} en {info.media.count} {info.media.count === 1 ? 'imagen o video' : 'imágenes y videos'}.</> : '.'}
          {' '}{info.persisted ? 'El navegador aceptó no borrarlo por su cuenta si le falta espacio.' : 'Si al navegador le falta espacio, podría borrarlo por su cuenta.'}
        </p>
      )}
      <p className="plain">Si borras los datos de navegación de este sitio, se borran el historial, la colección y las imágenes y videos guardados. Guarda la sesión para tener una copia.</p>
    </section>
  );
}

export { slug };

/* ------------------------------------------------------------------ */

export function ExploreSheet() {
  const open = useStudio(s => s.ui.sheet === 'explore');
  const amount0 = useStudio(s => s.amount);
  const [amount, setAmount] = useState(amount0);
  const [cands, setCands] = useState<Array<{ r: Recipe; url?: string }>>([]);
  const [gen, setGen] = useState(0);
  useEffect(() => {
    if (!open) return;
    const sig = { cancelled: false };
    const list = variations(8, amount);
    setCands(list.map(r => ({ r })));
    void renderThumbs(list, 320, (i, url) => { if (!sig.cancelled) setCands(c => c.map((x, j) => (j === i ? { ...x, url } : x))); }, sig);
    return () => { sig.cancelled = true; };
  }, [open, gen]);
  return (
    <Sheet open={open} onClose={close} wide title="Explorar variaciones" sub="Ocho mutaciones del resultado actual. Elige una para añadirla al historial y seguir desde ahí.">
      <div className="sheet-body">
        <div className="row" style={{ marginBottom: 14, gap: 14, flexWrap: 'wrap' }}>
          <label className="ctl" style={{ flex: 1, minWidth: 220, margin: 0 }}>
            <span className="lbl">Distancia</span>
            <output>{amount < 0.25 ? 'sutil' : amount < 0.6 ? 'media' : 'salvaje'}</output>
            <input type="range" min={0.05} max={1} step={0.01} value={amount} onChange={e => setAmount(parseFloat(e.target.value))} style={{ '--p': ((amount - 0.05) / 0.95) * 100 + '%' } as React.CSSProperties} />
          </label>
          <button type="button" className="mini" onClick={() => setGen(g => g + 1)}><IDice width={14} /> Otras ocho</button>
        </div>
        <div className="explore-grid">
          {cands.map((c, i) => (
            <button key={i} type="button" style={c.url ? { backgroundImage: `url(${c.url})` } : undefined} aria-label={`Variación ${i + 1}`}
              onClick={() => { applyRecipe(c.r, 'variación', 'Variación'); close(); }}>
              <span>{c.url ? `variación ${i + 1}` : 'tejiendo…'}</span>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */

const KEYS: Array<[string, string]> = [
  ['R', 'Nueva combinación al azar'], ['→', 'Siguiente (o nueva al llegar al final)'], ['←', 'Resultado anterior'], ['V', 'Variar el actual'],
  ['X', 'Explorar variaciones'], ['S', 'Guardar en la colección'], ['E', 'Exportar'], ['Espacio', 'Pausar / reproducir'],
  ['Ctrl Z', 'Deshacer'], ['Ctrl Mayús Z', 'Rehacer'], ['H', 'Ocultar la interfaz'], ['F', 'Pantalla completa'], ['1 – 6', 'Cambiar de espacio'],
  ['L', 'Copiar enlace'], ['G', 'Guías: empezar por un camino'], ['?', 'Esta ayuda'], ['Esc', 'Cerrar'],
];

export function ShortcutsSheet() {
  const open = useStudio(s => s.ui.sheet === 'shortcuts');
  return (
    <Sheet open={open} onClose={close} title="Atajos de teclado" sub="Doble clic en el nombre de un ajuste lo devuelve a su valor inicial.">
      <div className="sheet-body">
        <div className="keys">{KEYS.map(([k, d]) => <div key={k}><span>{d}</span><kbd>{k}</kbd></div>)}</div>
        <p className="note" style={{ margin: '16px 0 0' }}>
          ¿Empiezas? <button type="button" className="mini" onClick={() => { close(); setTimeout(() => openWelcome(), 60); }}>Abrir las guías</button> y convierte una foto, crea un fondo para tu web o anima una palabra, paso a paso.
        </p>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */

export function SeedSheet() {
  const open = useStudio(s => s.ui.sheet === 'seed');
  const cur = useStudio(s => s.entries[s.cursor]?.seed ?? '');
  const arch = useStudio(s => s.arch);
  const space = useStudio(s => s.space);
  const [v, setV] = useState('');
  useEffect(() => { if (open) setV(cur); }, [open, cur]);
  const go = () => { const s = cleanSeed(v); if (!s) return; rollDice(s); close(); toast(`Semilla «${s}» en ${spaceById(space).name}`); };
  return (
    <Sheet open={open} onClose={close} title="Semilla" sub="Cualquier palabra o frase sirve. La misma semilla, en el mismo espacio y con el mismo estilo, da siempre la misma pieza.">
      <div className="sheet-body">
        <div className="ctl">
          <label className="lbl" htmlFor="seed-in">Semilla</label>
          <input id="seed-in" type="text" className="mono" value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') go(); }} autoFocus placeholder="faro-lunar-417" />
        </div>
        <div className="ctl">
          <label className="lbl" htmlFor="seed-arch">Estilo</label>
          <select id="seed-arch" value={arch ?? ''} onChange={e => setArch(e.target.value || null)}>
            <option value="">Cualquiera (según el espacio)</option>
            {ARCHETYPES.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="row2">
          <button type="button" className="btn" onClick={() => setV(freshSeed())}>Inventar una</button>
          <button type="button" className="btn primary" onClick={go}>Tejer esta semilla</button>
        </div>
        <p className="note">Los bloqueos del dado también se aplican: con «Color» bloqueado, la semilla sólo cambia lo demás.</p>
      </div>
    </Sheet>
  );
}
