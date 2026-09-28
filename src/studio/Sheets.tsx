import { useEffect, useRef, useState } from 'react';
import type { Recipe } from '../engine/recipe';
import { ARCHETYPES } from '../random/archetypes';
import { GEN_VERSION, GEN_VERSIONS } from '../random/generator';
import { cleanSeed, freshSeed } from '../random/seeds';
import { spaceById } from '../random/spaces';
import { recipeFile } from '../shared/share';
import { downloadText } from './download';
import { pickFile } from './files';
import { Glossary } from './Glossary';
import { HISTORY_WARN, historyLabel, thumbBg } from './history';
import { IDice } from './icons';
import { mediaUsage } from './mediaStore';
import { renderThumbs } from './offscreen';
import { collectionMediaSize, exportProject, fmtSize, saveCollection, saveSession, sessionMediaSize, slug } from './packages';
import { shareLink } from './ShareSheet';
import {
  applyRecipe, clearHistory, duplicateFavorite, openFavorite, removeFavorite, renameFavorite, rollDice, setArch, setUI,
  useStudio, variations,
} from './store';
import { toast } from './toast';
import { openWelcome } from './guide/state';
import { storageProblem } from './Keeping';
import { Sheet, trapTab } from './Sheet';
import { Picker } from './ui/Picker';
import './css/data.css';
import { useSwap } from './motion/hooks';

export { Sheet, trapTab };


const close = () => setUI({ sheet: 'none' });

/* ------------------------------------------------------------------ */

export function CollectionSheet() {
  const open = useStudio(s => s.ui.sheet === 'collection');
  const favs = useStudio(s => s.favorites);
  const storage = useStudio(s => s.storage);
  const [cm, setCm] = useState<{ count: number; bytes: number; missing: number } | null>(null);
  useEffect(() => { if (!open) return; let alive = true; void collectionMediaSize().then(m => { if (alive) setCm(m); }); return () => { alive = false; }; }, [open, favs]);
  const usage = useStorageEstimate(open);
  const exportAll = () => {
    const json = JSON.stringify({ glyphos: 'collection', version: 2, exported: new Date().toISOString(), items: favs.map(f => ({ name: f.name, space: f.space, recipe: f.recipe, thumb: f.thumb })) }, null, 2);
    downloadText(`glyphos-coleccion-${new Date().toISOString().slice(0, 10)}.json`, json, 'application/json');
    // the .json carries recipes only: say so when some piece needs its own image or video
    const media = favs.filter(f => (f.recipe.source === 'image' || f.recipe.source === 'video') && f.recipe.media.ref).length;
    if (media) {
      toast(`Las recetas (.json) no llevan las imágenes ni los videos: ${media === 1 ? '1 pieza pedirá su archivo' : `${media} piezas pedirán su archivo`} en otro equipo. Para llevarlos, guarda la colección (.zip).`,
        { label: 'Guardar colección', run: () => void saveCollection() }, 9000);
    }
  };
  const kept = storage === 'ok';
  return (
    <Sheet open={open} onClose={close} wide title="Colección e historial" sub={`${favs.length} ${favs.length === 1 ? 'pieza guardada' : 'piezas guardadas'} con ★ · ${kept ? 'todo se queda en este navegador' : 'sólo mientras no cierres la pestaña'}`}>
      <div className="sheet-body">
        {!kept && (
          <div className="keep-warn" role="status">
            {storageProblem(storage)} Guarda la sesión para tener una copia.
            <div><button type="button" className="mini" onClick={() => void saveSession(true)}>Guardar sesión</button></div>
          </div>
        )}
        {open && <HistoryBox />}
        <section className="data-coll" aria-labelledby="data-coll-h">
          <h3 className="data-h" id="data-coll-h">Tu colección</h3>
          <p className="note">
            Lo que guardas con ★ no se descarta nunca y no tiene un número fijo: lo limita el espacio que este navegador da a GLYPHOS
            {usage?.usage != null && usage.quota ? <> (ahora usa {fmtSize(usage.usage)} de {fmtSize(usage.quota)})</> : null}.
          </p>
          <div className="data-acts data-coll-acts">
            <button type="button" className="mini" onClick={() => void saveCollection()} disabled={!favs.length}>
              Guardar colección (.zip, con sus imágenes y videos){cm && cm.count > 0 ? ` · ${fmtSize(cm.bytes)}` : ''}
            </button>
            <button type="button" className="mini" onClick={exportAll} disabled={!favs.length}>Sólo las recetas (.json)</button>
            <button type="button" className="mini" onClick={() => pickFile('recipe')}>Importar receta, colección o proyecto</button>
          </div>
          {cm && cm.missing > 0 && (
            <p className="note">{cm.missing === 1 ? 'Una imagen o video de tu colección ya no está' : `${cm.missing} imágenes o videos de tu colección ya no están`} en este navegador: esas piezas pedirán el archivo al abrirlas.</p>
          )}
        </section>
        {!favs.length ? (
          <div className="empty-state">
            <div className="big">{' .:-=+*#%@\n  aquí vivirán\n  tus piezas'}</div>
            <p>Pulsa <b>★</b> (o la tecla <b>S</b>) para guardar lo que te guste. Todo se queda en este navegador; para llevarlo a otro equipo, guarda la colección o la sesión (.zip): llevan también tus imágenes y videos.</p>
          </div>
        ) : (
          <div className="card-grid">
            {favs.map(f => (
              <div key={f.id} className="fav-card">
                <button type="button" className="img" style={f.thumb ? thumbBg(f.thumb) : undefined} onClick={() => { openFavorite(f.id); close(); }} aria-label={`Abrir ${f.name}`} />
                <div className="meta">
                  <input defaultValue={f.name} aria-label="Nombre" onBlur={e => renameFavorite(f.id, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                  <small>{spaceById(f.space).name} · {new Date(f.updated).toLocaleDateString()}{f.recipe.media.ref && (f.recipe.source === 'image' || f.recipe.source === 'video') ? ` · con ${f.recipe.source === 'video' ? 'video' : 'imagen'}` : ''}</small>
                </div>
                <div className="ops">
                  <button type="button" onClick={() => { openFavorite(f.id); close(); }}>Abrir</button>
                  <button type="button" onClick={() => duplicateFavorite(f.id)}>Duplicar</button>
                  <button type="button" onClick={() => downloadText(slug(f.name) + '.glyphos.json', recipeFile({ ...f.recipe, meta: { ...f.recipe.meta, space: f.space } }), 'application/json')}>.json</button>
                  <button type="button" onClick={() => void shareLink(f.recipe, f.space)} title="Un enlace con la receta: sin tu imagen ni tu video"
                    aria-label={`Copiar enlace a ${f.name} (sólo la receta${usesMedia(f.recipe) ? ', sin su archivo' : ''})`}>Enlace</button>
                  {usesMedia(f.recipe) && (
                    <button type="button" onClick={() => void exportProject({ ...f.recipe, meta: { ...f.recipe.meta, space: f.space } }, 'glyphos-' + slug(f.name))}
                      title="Un .zip con la receta y su imagen o video original" aria-label={`Exportar proyecto de ${f.name} (.zip con su archivo)`}>.zip</button>
                  )}
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
          Guarda tus últimos {limit} resultados; al pasar de ahí se descartan los más antiguos, salvo los que están en tu colección (★) y el actual.
          {pruned > 0 && <> En esta visita {pruned === 1 ? 'se descartó 1 resultado' : `se descartaron ${pruned} resultados`}.</>}
          {' '}Un favorito cuyo resultado se descartó sigue en tu colección y se abre igual.
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

/** What this browser says it lets the site use (StorageManager.estimate; not every browser answers). */
function useStorageEstimate(on: boolean) {
  const [est, setEst] = useState<{ usage?: number; quota?: number } | null>(null);
  const favs = useStudio(s => s.favorites.length);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    const st = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    void st?.estimate?.().then(e => { if (alive) setEst({ usage: e.usage, quota: e.quota }); }).catch(() => undefined);
    return () => { alive = false; };
  }, [on, favs]);
  return est;
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
          {info.usage != null ? <>GLYPHOS ocupa <b>{fmtSize(info.usage)}</b>{info.quota ? <> de {fmtSize(info.quota)} disponibles</> : null}</> : 'Este navegador no informa del espacio que usa'}
          {info.media.count > 0 ? <>, de ellos {fmtSize(info.media.bytes)} en {info.media.count} {info.media.count === 1 ? 'imagen o video' : 'imágenes y videos'}.</> : '.'}
          {' '}{info.persisted ? 'El navegador aceptó no borrarlo por su cuenta si le falta espacio.' : 'Si al navegador le falta espacio, podría borrarlo por su cuenta.'}
        </p>
      )}
      <p className="plain">Si borras los datos de navegación de este sitio, se borran el historial, la colección y las imágenes y videos guardados. Guarda la colección o la sesión (.zip) para tener una copia.</p>
    </section>
  );
}

export { slug };

const usesMedia = (r: Recipe) => (r.source === 'image' || r.source === 'video') && !!r.media.ref;

/* ------------------------------------------------------------------ */

export function ExploreSheet() {
  const open = useStudio(s => s.ui.sheet === 'explore');
  const amount0 = useStudio(s => s.amount);
  const [amount, setAmount] = useState(amount0);
  const [cands, setCands] = useState<Array<{ r: Recipe; url?: string }>>([]);
  const [gen, setGen] = useState(0);
  // «Otras ocho»: the grid recomposes
  const grid = useRef<HTMLDivElement>(null);
  useSwap(grid, gen, 'tab');
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
        <div className="explore-grid" ref={grid}>
          {cands.map((c, i) => (
            <button key={i} type="button" style={c.url ? thumbBg(c.url) : undefined} aria-label={`Variación ${i + 1}`}
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

/** What each generator version is, for the person choosing one (newest first). */
const GEN_INFO: Record<number, { label: string; desc: string }> = {
  4: { label: 'Versión 4', desc: 'La actual: las mismas piezas que la versión 3, con el nombre nuevo (GLYPHOS) cuando el azar rellena con palabras.' },
  3: { label: 'Versión 3', desc: 'Las piezas de la versión 2 y, en Imagen, Tipo y Terminal, transformaciones y letras que se mueven.' },
  2: { label: 'Versión 2', desc: 'Trece objetos 3D y un azar que rara vez repite lo que acabas de ver.' },
  1: { label: 'Versión 1', desc: 'La primera: repite las semillas que anotaste con ella.' },
};
const genLabel = (g: number) => (GEN_INFO[g]?.label ?? `Versión ${g}`) + (g === GEN_VERSION ? ' (actual)' : '');

export function SeedSheet() {
  const open = useStudio(s => s.ui.sheet === 'seed');
  const cur = useStudio(s => s.entries[s.cursor]?.seed ?? '');
  // the version that wove the current piece (pieces from before versions were recorded are version 1)
  const curGen = useStudio(s => { const e = s.entries[s.cursor]; return e?.seed ? e.recipe.meta.gen ?? 1 : GEN_VERSION; });
  const arch = useStudio(s => s.arch);
  const space = useStudio(s => s.space);
  const [v, setV] = useState('');
  // the version: the one that made the seed on screen, until another is chosen or another seed is written
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => { if (open) { setV(cur); setPicked(null); } }, [open, cur]);
  const gen = picked ?? (cleanSeed(v) === cur ? curGen : GEN_VERSION);
  const go = () => {
    const s = cleanSeed(v);
    if (!s) return;
    rollDice(s, gen);
    close();
    toast(`Semilla «${s}» en ${spaceById(space).name}${gen !== GEN_VERSION ? ` · ${GEN_INFO[gen]?.label.toLowerCase() ?? 'versión ' + gen}` : ''}`);
  };
  return (
    <Sheet open={open} onClose={close} title="Semilla" sub="Cualquier palabra o frase sirve. La misma semilla, en el mismo espacio, con el mismo estilo y la misma versión del generador, da la misma pieza.">
      <div className="sheet-body">
        <div className="ctl">
          <label className="lbl" htmlFor="seed-in">Semilla</label>
          <input id="seed-in" type="text" className="mono" value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') go(); }} autoFocus placeholder="faro-lunar-417" />
        </div>
        <div className="ctl cx">
          <span className="lbl" id="seed-arch-l">Estilo</span>
          <Picker id="seed-arch" value={arch ?? ''} label="Estilo" labelId="seed-arch-l" minWidth={280} onChange={v => setArch(v || null)}
            options={[{ value: '', label: 'Cualquiera (según el espacio)', desc: 'El dado elige entre los estilos de este espacio.' }, ...ARCHETYPES.map(a => ({ value: a.id, label: a.name, desc: a.blurb }))]} />
        </div>
        <div className="ctl cx">
          <span className="lbl" id="seed-gen-l">Versión del generador</span>
          <Picker id="seed-gen" value={gen} label="Versión del generador" labelId="seed-gen-l" describedBy="seed-gen-note" minWidth={280} onChange={g => setPicked(g)}
            options={[...GEN_VERSIONS].reverse().map(g => ({ value: g, label: genLabel(g), desc: GEN_INFO[g]?.desc }))} />
        </div>
        <p className="note" id="seed-gen-note">
          {cur && curGen !== GEN_VERSION
            ? `La pieza en pantalla salió de la versión ${curGen} del generador: con esa versión, su semilla la repite. Con la actual, la misma semilla teje otra.`
            : 'Cada versión del generador teje distinto la misma semilla. Tu historial y tu colección guardan la receta completa: no dependen de la versión.'}
        </p>
        <div className="row2">
          <button type="button" className="btn" onClick={() => setV(freshSeed())}>Inventar una</button>
          <button type="button" className="btn primary" onClick={go}>Tejer esta semilla</button>
        </div>
        <p className="note">Los bloqueos del dado también se aplican: con «Color» bloqueado, la semilla sólo cambia lo demás.</p>
      </div>
    </Sheet>
  );
}
