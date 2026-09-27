import { logoMark } from '../shared/brand';
import { SPACES, type SpaceId } from '../random/spaces';
import { IDownload, IFull, IGrid, IKeys, IPause, IPlay, ISliders } from './icons';
import { setPlaying, setSpace, setUI, useStudio } from './store';
import { IGuide } from './guide/Welcome';
import { openWelcome, useGuide } from './guide/state';
import { Picker } from './ui/Picker';

export function toggleFullscreen() {
  const d = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen ?? d.webkitExitFullscreen)?.call(d); return; }
    const p = (el.requestFullscreen ?? el.webkitRequestFullscreen)?.call(el) as Promise<void> | undefined;
    p?.catch?.(() => setUI({ hideUI: true }));
  } catch { setUI({ hideUI: true }); }
}

export function TopBar() {
  const space = useStudio(s => s.space);
  const playing = useStudio(s => s.playing);
  const stats = useStudio(s => s.stats);
  const favs = useStudio(s => s.favorites.length);
  const panel = useStudio(s => s.ui.panel);
  const guiding = useGuide(s => s.path !== null);
  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="Monotrama, volver a la portada" dangerouslySetInnerHTML={{ __html: logoMark(26) + '<span class="brand-word">monotrama</span><span class="brand-sub">estudio</span>' }} />
      <nav className="spaces" aria-label="Espacios del estudio">
        {SPACES.map(s => (
          <button key={s.id} type="button" aria-pressed={space === s.id} title={s.blurb} onClick={() => setSpace(s.id)}>{s.name}</button>
        ))}
      </nav>
      <Picker<SpaceId> className="space-select" value={space} label="Espacio" minWidth={260} onChange={setSpace}
        options={SPACES.map(s => ({ value: s.id, label: s.name, desc: s.blurb }))} />
      <div className="tb-right">
        {space !== 'componentes' && <span className="stats" aria-hidden="true">{stats.cols}×{stats.rows} · {stats.fps} fps</span>}
        {space !== 'componentes' && (
          <button type="button" className="ib hide-sm" onClick={() => setPlaying(!playing)} title={playing ? 'Pausar (espacio)' : 'Reproducir (espacio)'} aria-label={playing ? 'Pausar animación' : 'Reproducir animación'}>
            {playing ? <IPause /> : <IPlay />}
          </button>
        )}
        <button type="button" className="ib hide-sm" onClick={toggleFullscreen} title="Pantalla completa (F)" aria-label="Pantalla completa"><IFull /></button>
        <button type="button" className="ib hide-sm" onClick={() => setUI({ sheet: 'shortcuts' })} title="Atajos de teclado (?)" aria-label="Atajos de teclado"><IKeys /></button>
        <button type="button" className="ib guides-btn" onClick={() => openWelcome()} data-on={guiding || undefined} aria-label="Guías" title="Guías: una foto en ASCII, un fondo para tu web o una palabra animada (G)">
          <IGuide /><span className="lbl">Guías</span>
        </button>
        <button type="button" className="ib" onClick={() => setUI({ sheet: 'collection' })} title="Tu colección" aria-label={`Colección, ${favs} piezas`}>
          <IGrid /><span className="lbl">Colección</span>{favs > 0 && <span className="count">{favs}</span>}
        </button>
        {space !== 'componentes' && (
          <button type="button" className="ib hide-md" onClick={() => setUI({ panel: !panel })} title="Mostrar u ocultar ajustes (H oculta todo)" aria-pressed={panel} aria-label="Ajustes">
            <ISliders /><span className="lbl">Ajustes</span>
          </button>
        )}
        {space !== 'componentes' && (
          <button type="button" className="ib primary" onClick={() => setUI({ sheet: 'export' })} title="Exportar (E)">
            <IDownload /><span className="lbl">Exportar</span>
          </button>
        )}
      </div>
    </header>
  );
}
