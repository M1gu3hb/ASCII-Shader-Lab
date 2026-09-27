import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Recipe } from '../engine/recipe';
import { ARCHETYPES } from '../random/archetypes';
import { cleanSeed, freshSeed } from '../random/seeds';
import { spaceById } from '../random/spaces';
import { recipeFile, shareUrl } from '../shared/share';
import { downloadText } from './download';
import { pickFile } from './files';
import { IClose, IDice } from './icons';
import { renderThumbs } from './offscreen';
import {
  applyRecipe, clearHistory, duplicateFavorite, openFavorite, removeFavorite, renameFavorite, rollDice, setArch, setUI,
  useStudio, variations,
} from './store';
import { toast } from './toast';

export function Sheet({ open, title, sub, onClose, children, wide }: { open: boolean; title: string; sub?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="sheet" style={wide ? { width: 'min(1040px, calc(100vw - 24px))' } : undefined} onClose={onClose}
      onClick={e => { if (e.target === ref.current) onClose(); }} aria-label={title}>
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

const close = () => setUI({ sheet: 'none' });

/* ------------------------------------------------------------------ */

export function CollectionSheet() {
  const open = useStudio(s => s.ui.sheet === 'collection');
  const favs = useStudio(s => s.favorites);
  const count = useStudio(s => s.entries.length);
  const exportAll = () => {
    const json = JSON.stringify({ monotrama: 'collection', version: 2, exported: new Date().toISOString(), items: favs.map(f => ({ name: f.name, space: f.space, recipe: f.recipe, thumb: f.thumb })) }, null, 2);
    downloadText(`monotrama-coleccion-${new Date().toISOString().slice(0, 10)}.json`, json, 'application/json');
  };
  return (
    <Sheet open={open} onClose={close} wide title="Tu colección" sub={`${favs.length} ${favs.length === 1 ? 'pieza guardada' : 'piezas guardadas'} en este navegador · historial: ${count} resultados`}>
      <div className="sheet-body">
        <div className="row" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          <button type="button" className="mini" onClick={exportAll} disabled={!favs.length}>Exportar colección (.json)</button>
          <button type="button" className="mini" onClick={() => pickFile('recipe')}>Importar receta o colección</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="mini" onClick={() => { if (confirm('¿Vaciar el historial? Tu colección no se toca.')) { clearHistory(); toast('Historial vaciado'); } }}>Vaciar historial</button>
        </div>
        {!favs.length ? (
          <div className="empty-state">
            <div className="big">{' .:-=+*#%@\n  aquí vivirán\n  tus piezas'}</div>
            <p>Pulsa <b>★</b> (o la tecla <b>S</b>) para guardar lo que te guste. Todo se queda en este navegador; exporta la colección para llevarla a otro equipo.</p>
          </div>
        ) : (
          <div className="card-grid">
            {favs.map(f => (
              <div key={f.id} className="fav-card">
                <button type="button" className="img" style={f.thumb ? { backgroundImage: `url(${f.thumb})` } : undefined} onClick={() => { openFavorite(f.id); close(); }} aria-label={`Abrir ${f.name}`} />
                <div className="meta">
                  <input defaultValue={f.name} aria-label="Nombre" onBlur={e => renameFavorite(f.id, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                  <small>{spaceById(f.space).name} · {new Date(f.updated).toLocaleDateString()}</small>
                </div>
                <div className="ops">
                  <button type="button" onClick={() => { openFavorite(f.id); close(); }}>Abrir</button>
                  <button type="button" onClick={() => duplicateFavorite(f.id)}>Duplicar</button>
                  <button type="button" onClick={() => downloadText(slug(f.name) + '.monotrama.json', recipeFile(f.recipe), 'application/json')}>.json</button>
                  <button type="button" onClick={async () => { const u = await shareUrl(f.recipe); try { await navigator.clipboard.writeText(u); toast('Enlace copiado'); } catch { prompt('Enlace:', u); } }}>Enlace</button>
                  <button type="button" onClick={() => { if (confirm(`¿Borrar «${f.name}» de tu colección?`)) removeFavorite(f.id); }} aria-label={`Borrar ${f.name}`}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}

export const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'monotrama';

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
  ['L', 'Copiar enlace'], ['?', 'Esta ayuda'], ['Esc', 'Cerrar'],
];

export function ShortcutsSheet() {
  const open = useStudio(s => s.ui.sheet === 'shortcuts');
  return (
    <Sheet open={open} onClose={close} title="Atajos de teclado" sub="Doble clic en el nombre de un ajuste lo devuelve a su valor inicial.">
      <div className="sheet-body"><div className="keys">{KEYS.map(([k, d]) => <div key={k}><span>{d}</span><kbd>{k}</kbd></div>)}</div></div>
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
