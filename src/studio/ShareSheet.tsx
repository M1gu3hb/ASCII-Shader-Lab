import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { sameRecipe, type Recipe } from '../engine/recipe';
import { archById } from '../random/archetypes';
import { spaceById, type SpaceId } from '../random/spaces';
import { describeFrame, frameFor, frameRecipe, gridOf, reduceFrame, type Frame } from '../shared/frame';
import { provideShareView, recipeFile, viewerUrl, type ShareView } from '../shared/share';
import { copyText, downloadBlob, downloadText, shareFile, useSaved } from './download';
import { getEngine } from './engineBridge';
import { exportImage } from './exporting';
import { openExport } from './exportTab';
import { canvasUrl, snapshotCanvas, withOffscreen } from './offscreen';
import { exportProject, pieceFileBase } from './packages';
import { Sheet } from './Sheet';
import { useStudio } from './store';
import { toast } from './toast';
import './css/data.css';
import './css/export-notes.css';
import './css/share.css';

/**
 * Sharing a piece. «Compartir» (top bar) opens a sheet with the four ways a piece leaves the studio, each
 * said plainly: the public link (the piece full screen in the viewer, /ver/, exactly as it is seen here),
 * the seed (the dice's word, to weave the same result again), the editable recipe (a file) and an exported
 * file (image, video, GIF, code). The link carries the recipe and the frame the piece is seen in
 * (src/shared/frame.ts), never a person's image, video or camera: pieces made with one say so and offer a
 * file instead. Nothing is uploaded anywhere; the link's contents travel after the «#».
 */

/* ------------------------------------------------------------------ */
/* The frame a link carries                                            */
/* ------------------------------------------------------------------ */

/**
 * The pixel ratio a link's frame is drawn at: the screen's, up to the stage's own limit of 2 (engineBridge.ts),
 * as the stage draws at full quality. The preview's «Calidad», and the moments a slow device lowers the WebGL
 * stage's resolution, only change how this screen draws: like an export, a link keeps the piece at full
 * resolution, and the same piece on the same screen always gives the same link.
 */
const fullRatio = () => Math.min(2, Math.max(1, window.devicePixelRatio || 1));

/** Frames of pieces opened from a link in this tab: shared again unedited, they keep the frame they came in. */
const linkFrames: Array<{ recipe: Recipe; frame: Frame }> = [];
export function rememberLinkFrame(recipe: Recipe, frame: Frame) {
  linkFrames.unshift({ recipe, frame });
  linkFrames.length = Math.min(linkFrames.length, 20);
}
const linkFrameOf = (r: Recipe) => linkFrames.find(x => sameRecipe(x.recipe, r))?.frame ?? null;

/**
 * How a piece is seen right now on this stage: the live canvas's size, at the stage's pixel ratio, with the
 * piece's own cells; the moment of its motion and whether it is paused. Null with no stage on screen.
 */
export function stageView(r: Recipe): (ShareView & { frame: Frame; fromLink: boolean }) | null {
  const e = getEngine();
  const c = e?.canvas;
  if (!e || !c || !c.clientWidth || !c.clientHeight) return null;
  const came = linkFrameOf(r);
  const frame = came ?? frameFor(c.clientWidth, c.clientHeight, fullRatio(), r.glyph.cell, r.glyph.aspect);
  return { frame, t: e.time, paused: !useStudio.getState().playing, fromLink: !!came };
}

// every link the studio makes (this sheet, the export sheet's «Receta» tab, «L») carries the stage's frame
provideShareView(r => stageView(r));

/* ------------------------------------------------------------------ */
/* What is being shared                                                */
/* ------------------------------------------------------------------ */

interface Target {
  recipe: Recipe;
  space: SpaceId;
  name?: string;
  seed?: string;
  arch?: string;
  edited?: boolean;
}

/** `opened` counts openings: each one prepares its link and preview afresh. */
const useShare = create<{ target: Target | null; opened: number }>(() => ({ target: null, opened: 0 }));

/**
 * What leaves the studio records the space, so it reopens where it was made, and the name of the starting
 * point it came from («Bermellón»), which the viewer shows. Names that may be personal (a file's, a piece's
 * in the collection) stay here unless the recipe itself carries one.
 */
const withSpace = (r: Recipe, space: SpaceId, name?: string): Recipe =>
  ({ ...r, meta: { ...r.meta, space, ...(name && !r.meta.name ? { name } : {}) } });
const ownMedia = (r: Recipe) => (r.source === 'image' || r.source === 'video') && !!r.media.ref;

/** Opens the share sheet for a piece (the one on stage by default). */
export function openShare(target?: Target) {
  let t = target;
  if (!t) {
    const s = useStudio.getState();
    const e = s.entries[s.cursor];
    if (!e) return;
    t = { recipe: e.recipe, space: e.space, name: e.kind === 'receta' ? e.label : undefined, seed: e.seed, arch: e.arch, edited: e.edited };
  }
  useShare.setState(s => ({ target: { ...t, recipe: withSpace(t.recipe, t.space, t.name) }, opened: s.opened + 1 }));
}

/**
 * Copies the link to a piece at once («L», the collection, the export sheet). A piece made with a local image
 * or video opens the sheet instead: its file does not travel, and the sheet says what to send.
 */
export async function shareLink(recipe: Recipe, space: SpaceId) {
  const s = useStudio.getState();
  const e = s.entries[s.cursor];
  const name = e && e.recipe === recipe && e.kind === 'receta' ? e.label : undefined;
  const r = withSpace(recipe, space, name);
  if (ownMedia(r)) { openShare({ recipe: r, space, name, seed: r.meta.seed, arch: r.meta.arch }); return; }
  const url = await viewerUrl(r, stageView(r));
  const copied = await copyText(url, r.source === 'camera'
    ? 'Enlace copiado: abre la pieza a pantalla completa; la cámara es de quien la mira'
    : 'Enlace copiado: abre la pieza a pantalla completa, tal como la ves');
  if (!copied) openShare({ recipe: r, space, name, seed: r.meta.seed, arch: r.meta.arch });
}

/** The top bar's «Compartir». */
export function ShareButton() {
  return (
    <button type="button" className="ib share-btn" onClick={() => openShare()} aria-haspopup="dialog"
      title="Compartir: enlace público, WhatsApp y más, semilla, receta o archivo (L copia el enlace)">
      <IShare /><span className="lbl">Compartir</span>
    </button>
  );
}

/** Phones: «Compartir» in the dock, beside Exportar. */
export function ShareDockButton() {
  return (
    <button type="button" className="act ghost ph-share" onClick={() => openShare()} aria-haspopup="dialog" title="Compartir: enlace público, WhatsApp y más, semilla, receta o archivo">
      <IShare /><span className="ph-lbl">Compartir</span>
    </button>
  );
}

export const IShare = (p: { width?: number; height?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <path d="M12 15V4M8 8l4-4 4 4M7 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" />
  </svg>
);

/**
 * What travels with a link and with a project, side by side (the export sheet's «Receta» tab).
 * `word`: «la imagen» or «el video» when the piece uses one.
 */
export function ShareKinds({ word }: { word?: string }) {
  const file = word ?? 'tu imagen o tu video';
  return (
    <div className="share-kinds">
      <div className="share-kind">
        <b>Enlace público</b>
        <span className="k-yes">Lleva la receta completa y el encuadre: se abre a pantalla completa, igual que en tu pantalla.</span>
        <span className="k-no">No lleva {file}, ni su nombre.</span>
        <span className="k-note">La receta va dentro del propio enlace y no pasa por ningún servidor. Quien lo abra puede llevarla al estudio para editarla.</span>
      </div>
      <div className="share-kind">
        <b>Proyecto (.zip)</b>
        <span className="k-yes">Lleva la receta completa.</span>
        <span className="k-yes">Lleva {file} original.</span>
        <span className="k-note">Un archivo que se envía como cualquier otro y se abre arrastrándolo al estudio.</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The sheet                                                           */
/* ------------------------------------------------------------------ */

const TEXT = 'Una pieza de arte ASCII hecha con GLYPHOS';
const canNativeShare = (url: string) => {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
      && (typeof navigator.canShare !== 'function' || navigator.canShare({ url }));
  } catch { return false; }
};

/** The places a link can be sent from the web itself (each opens that app or site with the text written). */
function apps(url: string, title: string): Array<{ id: string; name: string; href: string }> {
  const e = encodeURIComponent;
  return [
    { id: 'whatsapp', name: 'WhatsApp', href: `https://wa.me/?text=${e(`${title}: ${url}`)}` },
    { id: 'telegram', name: 'Telegram', href: `https://t.me/share/url?url=${e(url)}&text=${e(title)}` },
    { id: 'x', name: 'X', href: `https://twitter.com/intent/tweet?text=${e(title)}&url=${e(url)}` },
    { id: 'correo', name: 'Correo', href: `mailto:?subject=${e(title)}&body=${e(`${title}:\n\n${url}`)}` },
  ];
}

/** «1 234» (thin groups, as the studio writes numbers). */
const n = (x: number) => x.toLocaleString('es-MX');

export function ShareSheet() {
  const target = useShare(s => s.target);
  const opened = useShare(s => s.opened);
  const close = () => useShare.setState({ target: null });
  return (
    <Sheet open={!!target} onClose={close} title="Compartir"
      sub={target && ownMedia(target.recipe)
        ? `Esta pieza usa ${target.recipe.source === 'video' ? 'tu video' : 'tu imagen'}: el enlace abre su estilo a pantalla completa, sin ${target.recipe.source === 'video' ? 'el video' : 'la imagen'}.`
        : 'Un enlace público abre esta pieza a pantalla completa, tal como la ves aquí.'}>
      {target && <ShareBody key={opened} target={target} onClose={close} />}
    </Sheet>
  );
}

function ShareBody({ target, onClose }: { target: Target; onClose: () => void }) {
  const r = target.recipe;
  const [view] = useState(() => stageView(r));
  const [url, setUrl] = useState('');
  const [pic, setPic] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const said = useRef<HTMLParagraphElement>(null);
  const savedFrom = useRef(useSaved.getState().n);
  const saved = useSaved();
  useEffect(() => { let alive = true; void viewerUrl(r, view).then(u => { if (alive) setUrl(u); }); return () => { alive = false; }; }, [r, view]);
  useEffect(() => {
    if (!view) return;
    let alive = true;
    void preview(r, view).then(p => { if (alive) setPic(p); }).catch(() => undefined);
    return () => { alive = false; };
  }, [r, view]);

  const media = ownMedia(r) ? r.media.ref! : null;
  const video = r.source === 'video';
  const word = video ? 'tu video' : 'tu imagen';
  const frame = view?.frame;
  const grid = frame ? gridOf(frame) : null;
  const title = target.name || r.meta.name || TEXT;
  const shareTitle = target.name || r.meta.name ? `«${target.name || r.meta.name}», ${TEXT.charAt(0).toLowerCase() + TEXT.slice(1)}` : TEXT;
  const native = !!url && canNativeShare(url);
  const arch = archById(target.arch ?? r.meta.arch ?? '')?.name;
  const say = (text: string) => { if (said.current) said.current.textContent = text; };

  const copy = async () => {
    if (!url) return false;
    const ok = await copyText(url, 'Enlace copiado');
    if (ok) { setCopied(true); say('Enlace copiado'); setTimeout(() => setCopied(false), 2200); }
    return ok;
  };
  const nativeShare = async () => {
    try {
      await navigator.share({ title, text: shareTitle, url });
    } catch (e) {
      if ((e as { name?: string } | null)?.name === 'AbortError') return;
      const copied = await copy();
      toast(copied ? 'Este navegador no pudo abrir su menú de compartir: el enlace quedó copiado.' : 'No se pudo compartir ni copiar. Selecciona el enlace de esta ventana y cópialo manualmente.');
    }
  };
  const recipeDownload = () => downloadText(pieceFileBase(r) + '.glyphos.json', recipeFile(r), 'application/json');
  const toExport = (tab: 'imagen' | 'video') => { onClose(); openExport(tab); };
  const pngWithMedia = async () => {
    setBusy('png');
    try {
      const blob = await exportImage(r, { kind: 'view', scale: Math.min(2, Math.max(1, window.devicePixelRatio || 1)) }, { transparent: false, format: 'png' });
      downloadBlob(pieceFileBase(r) + '.png', blob);
    } catch (e) {
      toast('No se pudo crear la imagen: ' + (e as Error).message);
    } finally { setBusy(null); }
  };
  const fresh = saved.n > savedFrom.current ? saved : null;

  return (
    <div className="sheet-body shr-body">
      {/* what does not travel, said first: before anything is copied or sent */}
      {media && (
        <section className="shr-media" aria-labelledby="shr-media-h">
          <h3 className="shr-h" id="shr-media-h">{video ? 'Tu video no viaja en el enlace' : 'Tu imagen no viaja en el enlace'}</h3>
          <p>
            {media.name ? <>«{media.name}» </> : video ? 'Tu video ' : 'Tu imagen '}se queda en tu navegador: nada se sube a ningún servidor.
            {' '}Quien abra el enlace verá el estilo con el patrón de fondo, como en la vista previa. Para que vea {word}, envíale un archivo:
          </p>
          <div className="shr-media-acts">
            {video
              ? <button type="button" className="btn" onClick={() => toExport('video')}>Video o GIF…</button>
              : <button type="button" className="btn" onClick={() => void pngWithMedia()} disabled={busy === 'png'}>{busy === 'png' ? 'Creando la imagen…' : 'Imagen PNG con tu imagen'}</button>}
            <button type="button" className="btn" onClick={() => void exportProject(r, pieceFileBase(r))}>Proyecto (.zip) con {video ? 'el video' : 'la imagen'}</button>
          </div>
          {fresh?.file
            ? <p className="shr-saved">Guardado: <b>{fresh.name}</b> <button type="button" className="btn primary" onClick={() => { if (fresh.file) void shareFile(fresh.file); }}>Compartir archivo</button></p>
            : fresh ? <p className="note">Guardado en tus descargas: <b>{fresh.name}</b>. Envíalo desde ahí con la app que quieras.</p>
              : <p className="note">Donde tu navegador lo permite, después eliges la app con «Compartir archivo»; si no, el archivo queda en tus descargas para enviarlo tú.</p>}
        </section>
      )}
      {r.source === 'camera' && (
        <p className="note shr-cam">Tu cámara nunca se comparte: quien abra el enlace verá el patrón de fondo, y en el estudio podrá usar su propia cámara.</p>
      )}
      <div className="shr-main">
        <figure className="shr-prev" style={frame ? { aspectRatio: `${frame.w} / ${frame.h}` } : undefined}>
          {pic ? <img src={pic} alt={`Vista previa de lo que verá quien abra el enlace${media ? `, sin ${word}` : ''}`} /> : <span className="shr-prev-wait mt-spin" role="status">Preparando la vista previa…</span>}
        </figure>
        <div className="shr-link">
          <h3 className="shr-h">Enlace público</h3>
          <p className="shr-lead">
            Quien lo abra ve la pieza a pantalla completa, con el mismo encuadre, movimiento y ediciones, escalada para caber en su pantalla.
            {' '}Puede llevarla al estudio para editarla.
          </p>
          <input className="shr-url mono" type="text" readOnly value={url || 'Preparando el enlace…'} aria-label="Enlace público a esta pieza" onFocus={e => e.currentTarget.select()} />
          <div className="shr-acts">
            <button type="button" className="btn primary" onClick={() => void copy()} disabled={!url}>{copied ? 'Enlace copiado ✓' : 'Copiar enlace'}</button>
            {native && <button type="button" className="btn" onClick={() => void nativeShare()}>Compartir…</button>}
          </div>
          <p className="shr-apps-h" id="shr-apps-h">Enviar por</p>
          <ul className="shr-apps" aria-labelledby="shr-apps-h">
            {apps(url, shareTitle).map(a => (
              <li key={a.id}>
                <a className={'shr-app ' + a.id} href={url ? a.href : undefined} aria-disabled={!url || undefined} target={a.id === 'correo' ? undefined : '_blank'} rel="noopener noreferrer"
                  title={a.id === 'correo' ? 'Abre tu programa de correo con el enlace escrito' : `Abre ${a.name} con el enlace escrito; tú eliges a quién`}>{a.name}</a>
              </li>
            ))}
          </ul>
          <p className="note shr-facts">
            {frame && <>Encuadre {view?.fromLink ? 'del enlace que abriste' : 'de tu pantalla'}: {describeFrame(frame)}{grid ? `, ${n(grid.cols)} × ${n(grid.rows)} caracteres` : ''}. </>}
            {url && <>El enlace mide {n(url.length)} caracteres: la receta viaja dentro de él, tras el «#», y nunca pasa por un servidor.</>}
            {!frame && ' Sin el escenario a la vista, el enlace usa un encuadre horizontal de 1280 × 720.'}
          </p>
          <p className="sr-only" role="status" ref={said} />
        </div>
      </div>

      <h3 className="shr-h shr-more-h">Otras formas</h3>
      <div className="shr-cards">
        <div className="shr-card">
          <h4>Semilla <small>para reproducir el resultado del azar</small></h4>
          {target.seed ? (
            <>
              <p className="shr-seed"><b>{target.seed}</b><span>{spaceById(target.space).name}{arch ? ` · ${arch}` : ''} · generador v{r.meta.gen ?? 1}</span></p>
              <p>Con la misma semilla, espacio, estilo y versión, el dado teje la misma pieza.{target.edited ? ' No lleva tus ediciones: esta pieza está editada.' : ' No lleva ediciones.'}</p>
              <button type="button" className="btn" onClick={() => void copyText(target.seed!, 'Semilla copiada')}>Copiar semilla</button>
            </>
          ) : <p>Esta pieza no salió del dado (es un punto de partida, o vino de un enlace o de un archivo): no tiene semilla.</p>}
        </div>
        <div className="shr-card">
          <h4>Receta editable <small>un archivo .json</small></h4>
          <p>Todos los ajustes en un archivo, para abrirla en el estudio y seguir editándola.{media ? ` No lleva ${word}.` : ''}</p>
          <button type="button" className="btn" onClick={recipeDownload}>Descargar receta</button>
        </div>
        <div className="shr-card">
          <h4>Archivo exportado <small>imagen, video, GIF o código</small></h4>
          <p>Un archivo que se ve sin GLYPHOS: para redes, presentaciones o tu web.</p>
          <button type="button" className="btn" onClick={() => toExport('imagen')}>Exportar archivo…</button>
        </div>
      </div>
    </div>
  );
}

/**
 * The picture of what the link shows: the piece rendered in its frame (as the viewer draws it), without the
 * person's image, video or camera (they do not travel), at the moment it is seen now.
 */
async function preview(r: Recipe, view: ShareView & { frame: Frame }): Promise<string | null> {
  const width = 560;
  const { frame } = reduceFrame(view.frame, width, 600_000);
  const fr = frameRecipe(r, frame);
  const h = Math.max(1, Math.round((width * frame.h) / frame.w));
  const c = await withOffscreen({ cssW: frame.w, cssH: frame.h, pixelRatio: 1 }, fr, async eng => {
    for (const k of ['image', 'video', 'camera'] as const) eng.setMedia(k, null);
    eng.set(fr);
    await eng.ready();
    eng.renderAt(view.t ?? 0);
    return snapshotCanvas(eng, 0, 0, eng.canvas.width, eng.canvas.height, width, h);
  });
  return c ? canvasUrl(c, 0.86) : null;
}
