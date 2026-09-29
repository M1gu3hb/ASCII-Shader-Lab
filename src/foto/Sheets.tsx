/**
 * The photo studio's sheets: help and shortcuts, the lab's styles, versions (tree of variants, compare
 * two, restore), settings (view quality, downloaded models), the camera and «Guardar como».
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Compositor } from '../project/compositor';
import { evaluate } from '../project/evaluate';
import { useProject, toggleFavorite } from '../project/store';
import type { Version } from '../project/versions';
import { Sheet } from '../studio/Sheet';
import { ICamera, IStar } from '../studio/icons';
import { goVersion, saveVersion, thumbVersion } from './actions';
import { applyLabStyle, readLabStyles, type LabStyle } from './bridge';
import { captureFrame, cameraCount, cameraProblem, loadOverrides, mirrorFor, openCamera, saveOverride, stopStream, type Facing } from './camera';
import { KIND_NAMES, orderVersions } from './Chrome';
import { SegGroup, Toggle } from './controls';
import { putMedia } from '../project/persist';
import { downloadProjectFile, newFromRef, saveAs } from './session';
import { TOOLS } from './tools/index';
import { closeSheet, say, setQuality, setUI, useFoto } from './ui';

/* ------------------------------------------------------------------ help */

/**
 * The keyboard map (it is also what keys.ts does): the active tool first, then the studio; the timeline and
 * the layer list use their own keys while they have the focus. No letter is used twice at the same level:
 * tools V M O P L K W J T G B E R, the studio H F C Z (+ digits and symbols). K is «Contorno preciso» in the
 * studio and «llave» inside the timeline; Espacio rolls the dice in the studio and plays inside the timeline.
 */
export const STUDIO_KEYS: Array<[string, string]> = [
  ['Espacio (toque) · →', 'Azar (→ va primero a la versión siguiente si la hay)'],
  ['←', 'Versión anterior'],
  ['F', 'Favorita ★'],
  ['Z · Ctrl/⌘ Z', 'Deshacer'],
  ['⇧ Z · ⇧ Ctrl/⌘ Z · Ctrl Y', 'Rehacer'],
  ['H · Espacio + arrastrar', 'Mano: mover la vista'],
  ['Rueda · pellizco', 'Acercar y alejar donde está el cursor'],
  ['0 · 1 · + · −', 'Ajustar · 100 % · acercar · alejar'],
  ['C', 'Antes y después (← → mueven el divisor)'],
  ['Esc', 'Cancela el gesto o suelta la herramienta'],
  ['?', 'Esta ayuda'],
];

export const TOOL_KEYS: Array<[string, string]> = [
  ['⇧ · ⌥ al empezar', 'Sumar · restar la zona (⇧⌥ intersecar); sin teclas, lo que diga la barra de opciones'],
  ['⇧ · ⌥ al arrastrar', 'Cuadrado o círculo · desde el centro'],
  ['[ ]', 'Tamaño del pincel; con «Editar partes», girar la parte'],
  ['Flechas · Intro', 'Dibujar rectángulos, elipses, degradados y polígonos con el teclado'],
];

export const TIMELINE_KEYS: Array<[string, string]> = [
  ['← →', 'Un cuadro (⇧: un segundo)'],
  ['Inicio · Fin', 'Al principio · al final'],
  ['Espacio · ⇧ Espacio', 'Reproducir o pausar · reproducir al revés'],
  ['K', 'Llave de la propiedad elegida en el cabezal'],
  ['Supr', 'Borrar el clip o las llaves elegidas'],
  ['Alt ← →', 'Mover lo elegido un cuadro (⇧: un segundo)'],
  ['+ −', 'Acercar y alejar el tiempo'],
];

const LAYER_KEYS: Array<[string, string]> = [
  ['↑ ↓', 'Elegir la capa de arriba o de abajo'],
  ['Alt ↑ ↓', 'Subir o bajar la capa'],
  ['F2 · Supr', 'Renombrar · eliminar'],
];

const GROUPS: Array<[string, string]> = [['seleccion', 'Selección'], ['pincel', 'Pinceles'], ['objeto', 'Objeto'], ['dibujo', 'Dibujo']];

const KeyList = ({ list }: { list: Array<[string, string]> }) => <div className="keys">{list.map(([k, v]) => <div key={k}><span>{v}</span><kbd>{k}</kbd></div>)}</div>;

export function HelpSheet() {
  const open = useFoto(s => s.sheet === 'help');
  return (
    <Sheet open={open} title="Atajos y gestos" sub="El teclado va primero a la herramienta activa; lo que ella no usa, lo usa el estudio. La línea de tiempo y la lista de capas tienen sus teclas mientras tienen el foco." onClose={closeSheet}>
      {/* (a long list with nothing to press: the list itself takes the focus, so the keyboard can scroll it) */}
      <div className="sheet-body" tabIndex={0} role="region" aria-label="Lista de atajos">
        <h3 className="data-h">Estudio</h3>
        <KeyList list={STUDIO_KEYS} />
        <h3 className="data-h">Herramientas</h3>
        <KeyList list={GROUPS.flatMap(([g, name]) => TOOLS.filter(t => t.group === g).map(t => [t.shortcut?.toUpperCase() ?? '—', `${t.name}${t.name.toLowerCase() === name.toLowerCase() ? '' : ` · ${name.toLowerCase()}`}`] as [string, string]))} />
        <h3 className="data-h">Al dibujar</h3>
        <KeyList list={TOOL_KEYS} />
        <h3 className="data-h">Línea de tiempo (con el foco en ella)</h3>
        <KeyList list={TIMELINE_KEYS} />
        <h3 className="data-h">Lista de capas</h3>
        <KeyList list={LAYER_KEYS} />
        <h3 className="data-h">En el teléfono</h3>
        <ul className="fhelp-list">
          <li>Un dedo dibuja con la herramienta activa; dos dedos mueven y acercan la vista (y cancelan el trazo en curso).</li>
          <li>Sin herramienta, un dedo mueve la vista.</li>
          <li>«Herramientas» abre la hoja de abajo: arrástrala para verla a medias o entera, o hacia abajo para cerrarla. «Tiempo» tiene la línea de tiempo.</li>
          <li>El botón ± cambia entre sumar y restar zonas sin teclas.</li>
          <li>En la línea de tiempo, un dedo la desplaza, dos la acercan y mantener pulsado un clip o una llave abre sus opciones.</li>
        </ul>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ lab styles */

export function StylesSheet() {
  const open = useFoto(s => s.sheet === 'styles');
  const [list, setList] = useState<LabStyle[] | null>(null);
  useEffect(() => { if (open) { setList(null); void readLabStyles().then(setList); } }, [open]);
  const sel = useProject(s => s.project?.layers.find(l => l.id === s.selection[0]));
  const favs = list?.filter(x => x.fav) ?? [];
  const hist = list?.filter(x => !x.fav) ?? [];
  const pick = (st: LabStyle) => { applyLabStyle(st); closeSheet(); };
  const grid = (items: LabStyle[]) => (
    <ul className="lab-grid">
      {items.map(st => (
        <li key={st.id}>
          <button type="button" className="lab-card" onClick={() => pick(st)}>
            <span className="lab-img" style={st.thumb ? { backgroundImage: `url(${JSON.stringify(st.thumb)})` } : undefined} aria-hidden="true" />
            <span className="lab-name">{st.fav && <IStar filled width={12} height={12} />} {st.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
  return (
    <Sheet open={open} wide title="Usar estilo del laboratorio"
      sub={sel?.kind === 'ascii' ? `Se aplica a «${sel.name}»; la capa sigue leyendo su foto.` : 'Se añade como una capa ASCII nueva sobre tu foto.'} onClose={closeSheet}>
      <div className="sheet-body">
        {list === null && <p className="note mt-spin">Leyendo tu colección y tu historial del laboratorio…</p>}
        {list && !list.length && <p className="note">No hay piezas del laboratorio en este navegador todavía. <a href="/studio/">Abre el laboratorio</a>, tira el dado y guarda las que te gusten con ★.</p>}
        {favs.length > 0 && <><h3 className="data-h">Tu colección ★</h3>{grid(favs)}</>}
        {hist.length > 0 && <><h3 className="data-h">Historial reciente</h3>{grid(hist)}</>}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ versions */

export function VersionsSheet() {
  const open = useFoto(s => s.sheet === 'versions');
  const versions = useProject(s => s.versions);
  const withId = useFoto(s => s.compareWith);
  const cur = versions.list[versions.cursor];
  const other = versions.list.find(v => v.id === withId) ?? null;
  const ordered = orderVersions(versions.list);
  useEffect(() => { if (open) for (const v of versions.list) if (!v.thumb) thumbVersion(v); }, [open]);
  return (
    <Sheet open={open} wide title="Versiones" sub="Cada tirada, variación o versión guardada, con las variantes bajo la versión de la que salieron. Restaurar devuelve el proyecto exacto." onClose={() => { setUI({ compareWith: null }); closeSheet(); }}>
      <div className="sheet-body fvers">
        <div className="fv-tree" role="list" aria-label="Árbol de versiones">
          {ordered.map(({ v, depth }) => {
            const i = versions.list.indexOf(v);
            return (
              <div role="listitem" key={v.id} className={'fvt-row' + (depth ? ' child' : '') + (i === versions.cursor ? ' cur' : '')}>
                <span className="fvt-img" style={v.thumb ? { backgroundImage: `url(${JSON.stringify(v.thumb)})` } : undefined} aria-hidden="true" />
                <span className="fvt-txt"><b>{i + 1}</b> {KIND_NAMES[v.kind] ?? v.kind}{v.label ? ` · ${v.label}` : ''}{v.parent ? <small> · de la {versions.list.findIndex(x => x.id === v.parent) + 1}</small> : null}{i === versions.cursor ? <small> · actual</small> : null}</span>
                <button type="button" className="icon-btn" aria-pressed={v.fav} aria-label={v.fav ? `Quitar la versión ${i + 1} de favoritas` : `Marcar la versión ${i + 1} como favorita`} onClick={() => toggleFavorite(v.id)}><IStar filled={v.fav} /></button>
                <button type="button" className="mini" onClick={() => goVersion(v.id)} disabled={i === versions.cursor}>Restaurar</button>
                <button type="button" className="mini" aria-pressed={withId === v.id} disabled={i === versions.cursor} onClick={() => setUI({ compareWith: withId === v.id ? null : v.id })}>Comparar</button>
              </div>
            );
          })}
          {!versions.list.length && <p className="note">Todavía no hay versiones: tira el dado o pulsa «Guardar versión».</p>}
          <button type="button" className="btn" onClick={() => saveVersion()}>Guardar el estado actual como versión</button>
        </div>
        {other && cur ? <CompareVersions a={cur} b={other} ia={versions.cursor + 1} ib={versions.list.indexOf(other) + 1} /> : (
          <div className="fcmp-empty">
            <p className="note">Pulsa «Comparar» en una versión para verla junto a la actual, con un divisor o lado a lado. «Restaurar» la vuelve la actual, exacta; la que tenías sigue en la lista.</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function CompareVersions({ a, b, ia, ib }: { a: Version; b: Version; ia: number; ib: number }) {
  const [mode, setMode] = useState<'split' | 'side'>('split');
  const [split, setSplit] = useState(0.5);
  const ca = useRef<HTMLCanvasElement>(null), cb = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const comp = new Compositor({ maxEngines: 3 });
    let gone = false;
    void (async () => {
      const w = 560;
      for (const [v, c] of [[a, ca.current], [b, cb.current]] as const) {
        if (gone || !c) return;
        await comp.render(evaluate(v.project, 0), c, { scale: Math.min(1, w / v.project.canvas.w), quality: 'final' });
      }
    })();
    return () => { gone = true; void Promise.resolve().then(() => comp.destroy()); };
  }, [a, b]);
  return (
    <div className="fcmp">
      <SegGroup label="Cómo comparar" value={mode} opts={[['split', 'Divisor'], ['side', 'Lado a lado']]} onPick={setMode} />
      <div className={'fcmp-view ' + mode} style={{ '--s': split } as CSSProperties}>
        <figure><canvas ref={ca} /><figcaption>Actual (versión {ia})</figcaption></figure>
        <figure className="b"><canvas ref={cb} /><figcaption>Versión {ib}</figcaption></figure>
      </div>
      {mode === 'split' && (
        <input type="range" min={0} max={1} step={0.01} value={split} onChange={e => setSplit(parseFloat(e.target.value))} aria-label={`Divisor: izquierda versión ${ia}, derecha versión ${ib}`} className="fcmp-range" />
      )}
      <div className="row2 btns">
        <button type="button" className="btn" onClick={() => goVersion(b.id)}>Restaurar la versión {ib}</button>
        <button type="button" className="btn ghost" onClick={() => setUI({ compareWith: null })}>Cerrar la comparación</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ settings */

export function SettingsSheet() {
  const open = useFoto(s => s.sheet === 'settings');
  const quality = useFoto(s => s.quality);
  const render = useFoto(s => s.render);
  const [bytes, setBytes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setBytes(null);
    void import('../cutout/index').then(m => m.storedModelBytes()).then(setBytes).catch(() => setBytes(0));
  }, [open]);
  const forget = async () => {
    if (!confirm('¿Borrar los modelos de recorte descargados? Se volverán a descargar (con tu permiso) la próxima vez que quites un fondo.')) return;
    setBusy(true);
    try { const m = await import('../cutout/index'); await m.forgetAllModels(); setBytes(await m.storedModelBytes()); say('Modelos borrados de este navegador.'); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} title="Ajustes" onClose={closeSheet}>
      <div className="sheet-body">
        <h3 className="data-h">Calidad de la vista</h3>
        <SegGroup label="Mientras editas" value={quality} opts={[['auto', 'Automática'], ['ligera', 'Siempre ligera']]} onPick={setQuality} />
        <p className="note">Automática: si la composición tarda en dibujarse, mientras mueves algo se ve a menor escala («Vista ligera») y al soltar vuelve la calidad final; si es rápida, siempre se ve final. «Siempre ligera» ayuda en equipos lentos. Las exportaciones salen siempre a calidad final. Último cuadro: {render.ms} ms a {Math.round(render.scale * 100)} %.</p>
        {render.warnings.map(w => <p key={w} className="warn">{w}</p>)}
        <h3 className="data-h">Modelos descargados</h3>
        <p className="note">Los modelos que quitan fondos se descargan una vez (con tu permiso) y quedan guardados en este navegador. Tus fotos nunca se suben.</p>
        <p className="fmodels"><b>{bytes === null ? '…' : bytes ? `${(bytes / 1048576).toFixed(1)} MB` : 'Ninguno'}</b> guardados en este navegador.</p>
        <button type="button" className="btn" disabled={!bytes || busy} onClick={() => void forget()}>Borrar los modelos descargados</button>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ camera */

export function CameraSheet() {
  const open = useFoto(s => s.sheet === 'camera');
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facing, setFacing] = useState<Facing | 'unknown'>('user');
  const [want, setWant] = useState<Facing>('user');
  const [overrides, setOverrides] = useState(loadOverrides);
  const [error, setError] = useState('');
  const [cams, setCams] = useState(0);
  const [busy, setBusy] = useState(false);
  /** The video shows a frame (a stream can take a moment to give its first one). */
  const [ready, setReady] = useState(false);
  const mirror = mirrorFor(facing, overrides);
  useEffect(() => {
    if (!open) return;
    let gone = false, s: MediaStream | null = null;
    setError('');
    setReady(false);
    void openCamera(want).then(async c => {
      if (gone) { stopStream(c.stream); return; }
      s = c.stream;
      setStream(c.stream);
      // a camera that does not say which way it faces is taken as the one asked for (a webcam faces you)
      setFacing(c.facing === 'unknown' ? want : c.facing);
      if (video.current) { video.current.srcObject = c.stream; await video.current.play().catch(() => undefined); }
      setCams(await cameraCount());
    }).catch(e => { if (!gone) setError(cameraProblem(e)); });
    return () => { gone = true; stopStream(s); setStream(null); };
  }, [open, want]);
  const take = async () => {
    const v = video.current;
    if (!v || !v.videoWidth) { say('La cámara aún no da imagen: espera un momento.'); return; }
    setBusy(true);
    const c = captureFrame(v, mirror);
    const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', 0.92));
    if (!blob) { setBusy(false); return; }
    const d = new Date();
    const name = `camara-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.jpg`;
    const { stored: _s, ...ref } = await putMedia(blob, { kind: 'image', name, w: c.width, h: c.height });
    setBusy(false);
    closeSheet();
    newFromRef(ref, 'Foto de la cámara');
    say('Foto tomada: se guardó tal como la veías.');
  };
  const f: Facing = facing === 'environment' ? 'environment' : 'user';
  return (
    <Sheet open={open} title="Tomar una foto" sub="Lo que ves es lo que se guarda: el espejo también va en la foto." onClose={closeSheet}>
      <div className="sheet-body fcam">
        {error ? <p className="warn" role="alert">{error}</p> : (
          <div className="fcam-view">
            <video ref={video} muted playsInline style={mirror ? { transform: 'scaleX(-1)' } : undefined} aria-label="Vista de la cámara"
              onLoadedData={() => setReady(true)} onEmptied={() => setReady(false)} />
            {!stream && <p className="note mt-spin">Pidiendo la cámara…</p>}
          </div>
        )}
        <div className="fcam-ctl">
          <Toggle label="Espejo: como te ves en un espejo" checked={mirror} onChange={v => setOverrides(saveOverride(f, v))}
            hint={f === 'user' ? 'La cámara frontal empieza en espejo, como la app de cámara del teléfono.' : 'La cámara trasera empieza sin espejo.'} />
          {cams !== 1 && (
            <SegGroup label="Cámara" value={want} opts={[['user', 'Frontal'], ['environment', 'Trasera']]} onPick={v => setWant(v)} />
          )}
          <button type="button" className="btn primary" disabled={!stream || !ready || busy} onClick={() => void take()}><ICamera width={18} height={18} /> {busy ? 'Guardando…' : 'Tomar la foto'}</button>
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ save as */

export function SaveAsSheet() {
  const open = useFoto(s => s.sheet === 'saveas');
  const name = useProject(s => s.project?.name ?? '');
  const storage = useProject(s => s.storage);
  const [v, setV] = useState('');
  useEffect(() => { if (open) setV(`${name} (copia)`); }, [open]);
  return (
    <Sheet open={open} title="Guardar" sub="El proyecto se guarda solo en este navegador mientras trabajas." onClose={closeSheet}>
      <div className="sheet-body">
        <p className="note">Estado: <b>{storage === 'ok' ? 'guardado en este navegador' : storage === 'full' ? 'sin espacio: descarga el proyecto' : storage === 'unavailable' ? 'el navegador no deja guardar: descarga el proyecto' : 'se guardará al primer cambio'}</b>.</p>
        <h3 className="data-h">Guardar como</h3>
        <form className="fsaveas" onSubmit={e => { e.preventDefault(); closeSheet(); void saveAs(v); }}>
          <label className="lbl" htmlFor="fsaveas-n">Nombre de la copia</label>
          <input id="fsaveas-n" value={v} onChange={e => setV(e.target.value)} maxLength={120} />
          <button type="submit" className="btn">Guardar como copia nueva</button>
        </form>
        <h3 className="data-h">Archivo del proyecto</h3>
        <p className="note">Un .glyphos.zip con las capas, las máscaras, las versiones actuales y tus fotos originales: se abre aquí o en otro navegador con «Abrir un proyecto».</p>
        <button type="button" className="btn" onClick={() => void downloadProjectFile()}>Descargar el proyecto (.glyphos.zip)</button>
      </div>
    </Sheet>
  );
}
