/**
 * «Animar»: the animation library for one layer (lane «anim»'s LibraryPicker, loaded on demand) in a
 * sheet big enough for its animated previews. A pick adds the clip at the playhead (or lays out a
 * choreography), closes the sheet and shows the timeline where it went.
 */
import { Suspense, lazy } from 'react';
import { useProject } from '../project/store';
import { Sheet } from '../studio/Sheet';
import { showTimeline } from './inspect/AnimSection';
import { previewPicture } from './TimeSlot';
import { say, setUI, useFoto } from './ui';

const LibraryPicker = lazy(() => import('./timeline/LibraryPicker').then(m => ({ default: m.LibraryPicker })));
const actions = () => import('./timeline/actions');

export function AnimSheet() {
  const req = useFoto(s => s.anim);
  const basic = useFoto(s => s.render.basic);
  const layer = useProject(s => (req ? s.project?.layers.find(l => l.id === req.layer) ?? null : null));
  const open = !!req && !!layer;
  const close = () => setUI({ anim: null });
  const done = (r: { ok: boolean; msg: string }) => {
    say(r.msg);
    if (!r.ok) return;
    close();
    showTimeline();
  };
  return (
    <Sheet open={open} wide title={layer ? `Animar «${layer.name}»` : 'Animar'}
      sub="Solo lo que funciona en esta capa. Se añade en el cabezal de la línea de tiempo; después ajustas su duración, su curva y sus parámetros." onClose={close}>
      {open && layer && req && (
        <div className="tl fanim-pick">
          <Suspense fallback={<p className="note mt-spin">Cargando la biblioteca de animaciones…</p>}>
            <LibraryPicker kind={layer.kind} initialTab={req.tab} picture={previewPicture} basic={basic} onClose={close}
              onPick={item => void actions().then(a => done(a.addLibraryItem(item, layer.id)))}
              onChoreo={c => void actions().then(a => done(a.addChoreography(c, layer.id)))} />
          </Suspense>
        </div>
      )}
    </Sheet>
  );
}
