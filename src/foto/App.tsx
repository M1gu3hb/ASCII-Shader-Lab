/**
 * The photo studio's shell: the start screen or the editor. Desktop: top bar, tool rail, the viewport
 * (options bar above it, dice and versions under it, the timeline slot at the bottom) and the panel with
 * the layers and the inspector. Phones: immersive by default, the four actions, the tools sheet.
 */
import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { useProject } from '../project/store';
import { holdToast, useToasts } from '../studio/toast';
import { IMore, IClose } from '../studio/icons';
import { Deck, OptionsBar, ToolRail, TopBar, ViewTools } from './Chrome';
import { openCutout } from './actions';
import { host } from './host';
import { Inspector } from './inspect/Inspector';
import { Layers } from './Layers';
import { importMedia, isProjectFile, kindOfFile } from './media';
import { ImmersiveExit, PhoneBar, PlusMinus, ToolSheet } from './Phone';
import { addPhotoSource } from './layerOps';
import { CameraSheet, HelpSheet, SaveAsSheet, SettingsSheet, StylesSheet, VersionsSheet } from './Sheets';
import { newFromFile, openFile } from './session';
import { Start } from './Start';
import { MiniTransport, TimeSlot } from './TimeSlot';
import { say, setUI, useFoto } from './ui';
import { Viewport, type Insets } from './Viewport';
import { dismissHint, holdHint, useSuggestion } from './suggest';
import { AnimSheet } from './AnimSheet';
import { loadAnim } from './anim';
import { ExtrasRoot } from './extras/ExtrasRoot';

const ExportSheet = lazy(() => import('./ExportSheet').then(m => ({ default: m.ExportSheet })));
const CutoutPanel = lazy(() => import('./cutout/index').then(m => ({ default: m.CutoutPanel })));

type Layout = 'desk' | 'phone' | 'land';
const PHONE = '(max-width: 760px)';
const LAND = '(max-height: 500px) and (orientation: landscape) and (max-width: 1000px)';

function useLayout(): Layout {
  const get = (): Layout => (matchMedia(LAND).matches ? 'land' : matchMedia(PHONE).matches ? 'phone' : 'desk');
  const [l, setL] = useState<Layout>(get);
  useEffect(() => {
    const on = () => setL(get());
    const a = matchMedia(PHONE), b = matchMedia(LAND);
    a.addEventListener('change', on); b.addEventListener('change', on);
    return () => { a.removeEventListener('change', on); b.removeEventListener('change', on); };
  }, []);
  return l;
}

export function App() {
  const screen = useFoto(s => s.screen);
  const layout = useLayout();
  const sideSheet = useFoto(s => s.snap !== 'closed') && layout === 'land' && screen === 'edit';
  const cutOpen = useFoto(s => s.cutout) && screen === 'edit';
  useDrop();
  return (
    <div className={`app foto foto-${layout}` + (screen === 'edit' ? ' editing' : ' starting') + (sideSheet ? ' land-sheet' : '') + (cutOpen ? ' fcut-open' : '')}>
      {screen === 'start' ? (
        <>
          <TopBar editing={false} />
          <div className="fstart-wrap"><Start /></div>
        </>
      ) : <Editor layout={layout} />}
      <Notices layout={layout} editing={screen === 'edit'} />
      <HelpSheet />
      <StylesSheet />
      <VersionsSheet />
      <SettingsSheet />
      <CameraSheet />
      <SaveAsSheet />
      <AnimSheet />
      <OnDemand sheet="export"><ExportSheet /></OnDemand>
      <ExtrasRoot />
      <LiveLine />
    </div>
  );
}

function Editor({ layout }: { layout: Layout }) {
  const immersive = useFoto(s => s.immersive);
  const cutout = useFoto(s => s.cutout);
  const sheetH = useFoto(s => s.sheetH);
  const snap = useFoto(s => s.snap);
  const project = useProject(s => s.project);

  useSuggestion();
  // the animation library comes while the person looks at the art (the timeline and «Animar» use it)
  useEffect(() => { const t = window.setTimeout(() => void loadAnim().catch(() => undefined), 1200); return () => clearTimeout(t); }, []);
  if (!project) return null;
  const phone = layout !== 'desk';
  const top = !phone || !immersive;
  const inset: Insets = phone
    ? { top: 6, left: 6, right: layout === 'land' && snap !== 'closed' ? Math.min(420, Math.round(window.innerWidth * 0.5)) + 6 : 6, bottom: 6 + (layout === 'phone' ? sheetH : 0) }
    : { top: 8, left: 8, right: 8, bottom: 8 };
  const cutoutPanel = cutout && (
    <aside className="fcut" aria-labelledby="fcut-t">
      <div className="fcut-h">
        <h2 id="fcut-t">Recorte</h2>
        <button type="button" className="close" onClick={() => setUI({ cutout: false })} aria-label="Cerrar el recorte"><IClose /></button>
      </div>
      <div className="fcut-b">
        <Suspense fallback={<p className="note mt-spin">Cargando el recorte…</p>}>
          <CutoutBody onClose={() => setUI({ cutout: false })} />
        </Suspense>
      </div>
    </aside>
  );
  return (
    <>
      {top && <TopBar editing />}
      <div className="fedit">
        {!phone && <ToolRail onCutout={openCutout} />}
        <main className="fmain" id="contenido" aria-label="Lienzo">
          <h1 className="sr-only">Estudio de foto y video GLYPHOS: {project.name}</h1>
          {!phone && <OptionsBar />}
          <div className="fstage">
            <Viewport inset={inset} compact={phone} />
            {!phone && <ViewTools />}
            {phone && <PlusMinus />}
            {phone && immersive && <ImmersiveExit><IMore /></ImmersiveExit>}
            {!phone && <HintCard />}
            {phone && <ViewToolsPhone />}
          </div>
          {!phone && <Deck />}
          {/* (phones: the timeline is the sheet's «Tiempo» tab, and play rides with the view tools) */}
          {!phone && <TimeSlot />}
        </main>
        {!phone && (
          <aside className="fpanel" aria-label="Capas y ajustes">
            {cutoutPanel || (
              <>
                <Layers onOpenMask={() => requestAnimationFrame(() => document.querySelector<HTMLElement>('.finsp .fmask')?.scrollIntoView({ block: 'start', behavior: 'smooth' }))} />
                <Inspector />
              </>
            )}
          </aside>
        )}
      </div>
      {phone && cutoutPanel && <div className="fcut-phone">{cutoutPanel}</div>}
      {phone && <ToolSheet land={layout === 'land'} onCutout={openCutout} />}
      {phone && <PhoneBar />}
    </>
  );
}

/** Phones: play (when the project moves), the compare button and the hold-to-see-original, small, at the top of the art. */
function ViewToolsPhone() {
  return <div className="fvt-phone"><MiniTransport phone /><ViewTools /></div>;
}

function CutoutBody({ onClose }: { onClose: () => void }) {
  const sel = useProject(s => s.project?.layers.find(l => l.id === s.selection[0]));
  const source = sel && 'source' in sel && typeof (sel as { source?: unknown }).source === 'string' && !['below', 'style'].includes((sel as { source: string }).source) ? (sel as { source: string }).source : undefined;
  return (
    <>
      <CutoutPanel host={host} {...(source ? { source } : {})} onClose={onClose} />
    </>
  );
}

/* ------------------------------------------------------------------ files dropped anywhere */

function useDrop() {
  useEffect(() => {
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); document.documentElement.dataset.drop = '1'; } };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) delete document.documentElement.dataset.drop; };
    const drop = async (e: DragEvent) => {
      delete document.documentElement.dataset.drop;
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      e.preventDefault();
      const editing = useFoto.getState().screen === 'edit' && useProject.getState().project;
      if (isProjectFile(f)) { await openFile(f); return; }
      if (!editing) { await newFromFile(f); return; }
      if (!kindOfFile(f)) { say('Usa una foto (JPG, PNG, WebP, AVIF) o un video (MP4, WebM, MOV).'); return; }
      // in the editor: a dropped photo becomes a new photo layer of this project
      const r = await importMedia(f);
      if (!r.ok) { say(r.message); return; }
      addPhotoSource(r.ref, r.kind === 'video' ? { duration: r.duration, fps: r.fps } : {});
    };
    addEventListener('dragover', over);
    addEventListener('dragleave', leave);
    addEventListener('drop', drop);
    return () => { removeEventListener('dragover', over); removeEventListener('dragleave', leave); removeEventListener('drop', drop); };
  }, []);
}

/* ------------------------------------------------------------------ notices */

/** The «Quitar fondo» recommendation on the desktop: a small card in the stage's corner, away from the notices. */
function HintCard() {
  const hint = useFoto(s => s.hint);
  if (!hint) return null;
  return (
    <div className="fsuggest" role="status" onPointerEnter={() => holdHint(true)} onPointerLeave={() => holdHint(false)} onFocus={() => holdHint(true)} onBlur={() => holdHint(false)}>
      <span>{hint.text}</span>
      <button type="button" className="mini" onClick={() => { dismissHint(); openCutout(); }}>Quitar fondo</button>
      <button type="button" className="fsg-x" aria-label="Descartar la sugerencia" onClick={dismissHint}><IClose /></button>
    </div>
  );
}

/**
 * What the studio says: the status line (say), the toasts (with an action, e.g. undo) and, on phones, the
 * «Quitar fondo» recommendation. Never two over the art at once: the most useful one shows (a toast with an
 * action, then the recommendation, then the latest line), in one line on phones (a tap shows it whole);
 * the status line goes by itself after a few seconds, a toast with an action stays while it is used.
 */
function Notices({ layout, editing }: { layout: Layout; editing: boolean }) {
  const list = useToasts(s => s.list);
  const status = useFoto(s => s.status);
  const hint = useFoto(s => s.hint);
  const [full, setFull] = useState(false);
  const phone = layout !== 'desk' && editing;
  const acted = [...list].reverse().find(t => t.action);
  const latest = list[list.length - 1];
  useEffect(() => setFull(false), [status, latest?.id, hint?.id]);
  const toastEl = (t: (typeof list)[number]) => (
    <div key={t.id} className="toast" onPointerEnter={() => holdToast(t.id, true)} onPointerLeave={() => holdToast(t.id, false)}
      onFocus={() => holdToast(t.id, true)} onBlur={() => holdToast(t.id, false)}>
      <span className="toast-msg">{t.msg}</span>{t.action && <button type="button" onClick={t.action.run}>{t.action.label}</button>}
    </div>
  );
  let one: ReactNode = null;
  if (acted) one = toastEl(acted);
  else if (phone && hint) {
    one = (
      <div className="toast fhint" onPointerEnter={() => holdHint(true)} onPointerLeave={() => holdHint(false)} onFocus={() => holdHint(true)} onBlur={() => holdHint(false)}>
        <span className="toast-msg">¿Quitar el fondo? <small>{hint.text}</small></span>
        <button type="button" onClick={() => { dismissHint(); openCutout(); }}>Quitar fondo</button>
        <button type="button" className="fsg-x" aria-label="Descartar la sugerencia" onClick={dismissHint}><IClose /></button>
      </div>
    );
  } else if (latest && !status) one = toastEl(latest);
  else if (status) one = <p className={'fstatus' + (full ? ' full' : '')} onClick={() => setFull(!full)}>{status}</p>;
  return (
    <div className={'fnotes' + (phone ? ' one-line' : '')}>
      <div className="toasts" role="status" aria-live="polite">{one}</div>
    </div>
  );
}

function LiveLine() {
  const live = useFoto(s => s.live);
  return <div className="sr-only" aria-live="polite" data-testid="live">{live}</div>;
}

function OnDemand({ sheet, children }: { sheet: 'export'; children: ReactNode }) {
  const open = useFoto(s => s.sheet === sheet);
  const [wanted, setWanted] = useState(open);
  if (open && !wanted) setWanted(true);
  if (!wanted) return null;
  return <Suspense fallback={open ? <p className="lazy-wait mt-spin" role="status">Cargando la exportación…</p> : null}>{children}</Suspense>;
}
