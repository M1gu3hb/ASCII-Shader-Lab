/**
 * The photo studio's shell: the start screen or the editor. Desktop: top bar, tool rail, the viewport
 * (options bar above it, dice and versions under it, the timeline slot at the bottom) and the panel with
 * the layers and the inspector. Phones: immersive by default, the four actions, the tools sheet.
 */
import { Suspense, lazy, useCallback, useEffect, useState, type ReactNode } from 'react';
import { useProject } from '../project/store';
import { holdToast, useToasts } from '../studio/toast';
import { IMore, IClose } from '../studio/icons';
import { Deck, OptionsBar, ToolRail, TopBar, ViewTools } from './Chrome';
import { host } from './host';
import { Inspector } from './inspect/Inspector';
import { Layers } from './Layers';
import { importMedia, isProjectFile, kindOfFile } from './media';
import { ImmersiveExit, PhoneBar, PlusMinus, ToolSheet } from './Phone';
import { addPhotoSource } from './layerOps';
import { CameraSheet, HelpSheet, SaveAsSheet, SettingsSheet, StylesSheet, VersionsSheet } from './Sheets';
import { newFromFile, openFile } from './session';
import { Start } from './Start';
import { TimeSlot } from './TimeSlot';
import { say, setUI, useFoto } from './ui';
import { Viewport, type Insets } from './Viewport';
import { useSuggestion } from './suggest';

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
  useDrop();
  return (
    <div className={`app foto foto-${layout}` + (screen === 'edit' ? ' editing' : ' starting') + (sideSheet ? ' land-sheet' : '')}>
      {screen === 'start' ? (
        <>
          <TopBar editing={false} />
          <div className="fstart-wrap"><Start /></div>
        </>
      ) : <Editor layout={layout} />}
      <Notices />
      <HelpSheet />
      <StylesSheet />
      <VersionsSheet />
      <SettingsSheet />
      <CameraSheet />
      <SaveAsSheet />
      <OnDemand sheet="export"><ExportSheet /></OnDemand>
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
  const openCutout = useCallback(() => {
    if (!project?.sources.length) { say('Primero añade una foto: el recorte trabaja sobre ella.'); return; }
    setUI({ cutout: true, snap: 'closed' });
  }, [project]);
  const suggestion = useSuggestion(openCutout);
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
            {suggestion}
            {phone && <ViewToolsPhone />}
          </div>
          {!phone && <Deck />}
          <TimeSlot />
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

/** Phones: the compare button and the hold-to-see-original, small, at the top of the art. */
function ViewToolsPhone() {
  return <div className="fvt-phone"><ViewTools /></div>;
}

function CutoutBody({ onClose }: { onClose: () => void }) {
  const sel = useProject(s => s.project?.layers.find(l => l.id === s.selection[0]));
  const source = sel && 'source' in sel && typeof (sel as { source?: unknown }).source === 'string' && !['below', 'style'].includes((sel as { source: string }).source) ? (sel as { source: string }).source : undefined;
  return (
    <>
      <CutoutPanel host={host} {...(source ? { source } : {})} onClose={onClose} />
      <p className="note fcut-soon">Quitar el fondo ocurre en tu equipo: el modelo se descarga una vez, con tu permiso. Si este panel está vacío, el recorte llega con la próxima actualización del estudio; mientras tanto, «Máscara» en los ajustes de la capa delimita zonas a mano.</p>
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

function Notices() {
  const list = useToasts(s => s.list);
  const status = useFoto(s => s.status);
  return (
    <div className="fnotes">
      {status && <p className="fstatus">{status}</p>}
      <div className="toasts" role="status" aria-live="polite">
        {list.map(t => (
          <div key={t.id} className="toast" onPointerEnter={() => holdToast(t.id, true)} onPointerLeave={() => holdToast(t.id, false)}
            onFocus={() => holdToast(t.id, true)} onBlur={() => holdToast(t.id, false)}>
            <span className="toast-msg">{t.msg}</span>{t.action && <button type="button" onClick={t.action.run}>{t.action.label}</button>}
          </div>
        ))}
      </div>
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
