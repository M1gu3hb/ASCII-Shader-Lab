/**
 * «Animación» in the layer inspector: the clips of the selected layer (a tap moves the playhead to one and
 * opens the timeline), «Animar…» (the library, only what works on this kind of layer) and «Coreografía…»
 * (an entry, a centre and an exit at once). The clips are edited in the timeline.
 */
import { templateById } from '../../project/clips';
import { edit, setTime } from '../../project/store';
import type { Layer } from '../../project/types';
import { useAnimReady } from '../anim';
import { studioClock } from '../playback';
import { Note, Section } from '../controls';
import { say, setUI } from '../ui';

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const phone = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 760px), (max-height: 500px) and (orientation: landscape) and (max-width: 1000px)').matches;

/** Opens the library for a layer (the sheet «Animar»). */
export function openAnim(layer: string, tab: 'plantillas' | 'coreografias' = 'plantillas') {
  setUI({ anim: { layer, tab } });
}

/** Shows the timeline (desktop: the slot under the viewport; phone: the sheet's «Tiempo» tab). */
export function showTimeline() {
  if (phone()) setUI({ mtab: 'tiempo', snap: 'half' });
  else setUI({ tlOpen: true });
}

export function AnimSection({ l }: { l: Layer }) {
  const ready = useAnimReady();
  const clips = [...l.clips].sort((a, b) => a.start - b.start);
  const nameOf = (id: string) => templateById(id)?.name ?? (ready ? `${id} (no disponible)` : '…');
  return (
    <Section title="Animación" className="fanim" count={clips.length || undefined}>
      {clips.length ? (
        <ol className="fanim-list" aria-label={`Animaciones de «${l.name}»`}>
          {clips.map(c => (
            <li key={c.id}>
              <button type="button" className="fanim-clip" onClick={() => { studioClock().pause(); setTime(c.start); showTimeline(); say(`«${nameOf(c.template)}»: el cabezal está en su inicio. Ajústalo en la línea de tiempo.`); }}
                title="Ir a esta animación en la línea de tiempo">
                <span>{nameOf(c.template)}{c.reverse ? ' · al revés' : ''}{c.repeat > 1 ? ` · ×${c.repeat}` : ''}</span>
                <small>{fmt(c.start)} – {fmt(c.start + c.dur * Math.max(1, c.repeat) * (c.pingpong ? 2 : 1))}</small>
              </button>
              <button type="button" className="icon-btn fanim-x" aria-label={`Quitar «${nameOf(c.template)}»`} title="Quitar esta animación"
                onClick={() => { edit(d => { const x = d.layers.find(y => y.id === l.id); if (x) x.clips = x.clips.filter(y => y.id !== c.id); }); say('Animación quitada.'); }}>×</button>
            </li>
          ))}
        </ol>
      ) : (
        <Note>Sin animación. Elige una entrada, una salida, una transformación o un bucle: se añade en el cabezal de la línea de tiempo.</Note>
      )}
      <div className="row2 btns">
        <button type="button" className="btn" onClick={() => openAnim(l.id, 'plantillas')}>Animar…</button>
        <button type="button" className="btn ghost" onClick={() => openAnim(l.id, 'coreografias')} title="Una entrada, un estado central y una salida, ya colocados">Coreografía…</button>
      </div>
    </Section>
  );
}
