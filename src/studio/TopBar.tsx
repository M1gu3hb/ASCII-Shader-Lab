import type { CSSProperties } from 'react';
import { logoMark, wordmark } from '../shared/brand';
import { SPACES, type SpaceId } from '../random/spaces';
import { IDownload, IFull, IGrid, IKeys, IPause, IPlay, ISliders, SPACE_ICON } from './icons';
import { setPlaying, setSpace, setUI, useStudio } from './store';
import { IGuide } from './guide/Welcome';
import { openWelcome, useGuide } from './guide/state';
import { Picker } from './ui/Picker';
import { QualityReadout } from './Quality';
import { FotoSwitch } from './FotoSwitch';
import { ShareButton } from './ShareSheet';
import { SPACE_LOOK } from './ui/sections';

export function toggleFullscreen() {
  const d = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen ?? d.webkitExitFullscreen)?.call(d); return; }
    const p = (el.requestFullscreen ?? el.webkitRequestFullscreen)?.call(el) as Promise<void> | undefined;
    p?.catch?.(() => setUI({ hideUI: true }));
  } catch { setUI({ hideUI: true }); }
}

/**
 * The studio's top bar: the brand, the six spaces (icon and name; a picker where they do not fit), and
 * on the right three groups: the preview's instruments (readout and quality, play, full screen, keys),
 * the places you go (Guías, Colección, the settings panel) and the one primary action, Exportar.
 * Another place to go (e.g. a switch to another studio) fits as a sibling of `.tb-go`, before Exportar;
 * on phones the bar keeps room for it, since Exportar moves to the dock.
 */
export function TopBar() {
  const space = useStudio(s => s.space);
  const playing = useStudio(s => s.playing);
  const favs = useStudio(s => s.favorites.length);
  const panel = useStudio(s => s.ui.panel);
  const guiding = useGuide(s => s.path !== null);
  const stage = space !== 'componentes';
  return (
    <header className="topbar" style={{ '--sp-acc': SPACE_LOOK[space].accent } as CSSProperties}>
      <a className="brand" href="/" aria-label="GLYPHOS, volver a la portada" dangerouslySetInnerHTML={{ __html: logoMark(24) + wordmark(14, { className: 'brand-word' }) + '<span class="brand-sub">estudio</span>' }} />
      <FotoSwitch />
      <nav className="spaces" aria-label="Espacios del estudio">
        {SPACES.map((s, i) => {
          const Ic = SPACE_ICON[s.id];
          return (
            <button key={s.id} type="button" aria-pressed={space === s.id} title={`${s.blurb} (${i + 1})`} onClick={() => setSpace(s.id)}
              style={{ '--acc': SPACE_LOOK[s.id].accent } as CSSProperties}>
              <Ic className="sp-ic" /><span className="sp-name">{s.name}</span>
            </button>
          );
        })}
      </nav>
      <Picker<SpaceId> className="space-select" value={space} label="Espacio" minWidth={280} onChange={setSpace}
        options={SPACES.map(s => { const Ic = SPACE_ICON[s.id]; return { value: s.id, label: s.name, desc: s.blurb, icon: <Ic width={16} height={16} style={{ color: SPACE_LOOK[s.id].accent }} /> }; })} />
      <div className="tb-right">
        {stage && (
          <div className="tb-group tb-tools">
            <QualityReadout />
            <button type="button" className="ib ghost hide-sm" onClick={() => setPlaying(!playing)} title={playing ? 'Pausar (espacio)' : 'Reproducir (espacio)'} aria-label={playing ? 'Pausar animación' : 'Reproducir animación'}>
              {playing ? <IPause /> : <IPlay />}
            </button>
            <button type="button" className="ib ghost hide-sm" onClick={toggleFullscreen} title="Pantalla completa (F)" aria-label="Pantalla completa"><IFull /></button>
            <button type="button" className="ib ghost hide-sm hide-md" onClick={() => setUI({ sheet: 'shortcuts' })} title="Atajos de teclado (?)" aria-label="Atajos de teclado"><IKeys /></button>
          </div>
        )}
        {!stage && (
          <div className="tb-group tb-tools">
            <button type="button" className="ib ghost hide-sm" onClick={toggleFullscreen} title="Pantalla completa (F)" aria-label="Pantalla completa"><IFull /></button>
            <button type="button" className="ib ghost hide-sm hide-md" onClick={() => setUI({ sheet: 'shortcuts' })} title="Atajos de teclado (?)" aria-label="Atajos de teclado"><IKeys /></button>
          </div>
        )}
        <span className="tb-sep" aria-hidden="true" />
        <div className="tb-group tb-go">
          <button type="button" className="ib guides-btn" onClick={() => openWelcome()} data-on={guiding || undefined} aria-label="Guías" title="Guías: una foto en ASCII, un fondo para tu web o una palabra animada (G)">
            <IGuide /><span className="lbl">Guías</span>
          </button>
          <button type="button" className="ib coll-btn" onClick={() => setUI({ sheet: 'collection' })} title="Tu colección y tu historial" aria-label={`Colección, ${favs} ${favs === 1 ? 'pieza' : 'piezas'}`}>
            <IGrid /><span className="lbl">Colección</span>{favs > 0 && <span className="count">{favs}</span>}
          </button>
          {stage && (
            <button type="button" className="ib ghost panel-btn hide-md" onClick={() => setUI({ panel: !panel })} title="Mostrar u ocultar los ajustes (H oculta toda la interfaz)" aria-pressed={panel} aria-label="Ajustes">
              <ISliders />
            </button>
          )}
        </div>
        {/* «Compartir» (lane compartir's one mount point in the bar): every size, the phone's bar included */}
        {stage && <ShareButton />}
        {/* phones: Exportar lives in the dock at the bottom, within reach of the thumb (Deck.tsx) */}
        {stage && (
          <button type="button" className="ib primary tb-export" onClick={() => setUI({ sheet: 'export' })} title="Exportar: imagen, video, texto, código… (E)">
            <IDownload /><span className="lbl">Exportar</span>
          </button>
        )}
      </div>
    </header>
  );
}
