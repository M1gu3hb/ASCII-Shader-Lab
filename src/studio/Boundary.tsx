import { Component, type ReactNode } from 'react';
import { persistNow, useStudio } from './store';
import { stopCamera, pauseVideo } from './media';
import { stopMic } from './live';
import { buildSession, sessionFileName } from '../shared/session';
import { downloadBlob } from './download';
import { within } from './deadline';
import './css/fixes.css';

/**
 * Parts of the studio that load on demand (the sheets, Componentes, the guides) come in their own
 * files. If one cannot be fetched (the connection dropped, or a new version was published while this
 * tab was open and the old files are gone), React would take the whole studio down with it. This
 * keeps the rest mounted and says what happened, with the way out: reloading (after saving).
 */
export class LoadBoundary extends Component<{ children: ReactNode; onClose?: () => void; where?: string; hidden?: boolean }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(err: unknown) { console.warn('GLYPHOS: no se pudo cargar una parte del estudio', err); }

  /** A sheet opened again after failing: try again (not remounting it, so its dialog keeps returning focus). */
  componentDidUpdate(prev: { hidden?: boolean }) {
    if (prev.hidden && !this.props.hidden && this.state.failed) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    // a sheet that is closed says nothing (opening it again tries again)
    if (this.props.hidden) return null;
    const close = this.props.onClose;
    return (
      <div className="load-fail" role="alert">
        <p><b>No se pudo cargar {this.props.where ?? 'esta parte del estudio'}.</b> Quizá se cortó la conexión o hay una versión nueva de GLYPHOS. Recarga la página para seguir: tu historial y tu colección se quedan.</p>
        <div className="row2">
          <button type="button" className="btn primary" onClick={() => void reload()}>Recargar</button>
          {close && <button type="button" className="btn" onClick={close}>Cerrar</button>}
        </div>
      </div>
    );
  }
}

async function reload() {
  try { await within(persistNow(), 1500); } catch { /* reload anyway */ }
  location.reload();
}

/** Saving this copy needs neither the renderer nor IndexedDB. Media refs travel, local files do not. */
export async function saveRecoverySession() {
  const s = useStudio.getState();
  downloadBlob(sessionFileName(), await buildSession({ entries: s.entries, favorites: s.favorites, cursor: s.cursor }, []));
}

export class StudioBoundary extends Component<{ children: ReactNode; startupError?: string | null }, { failed: boolean; asyncError: boolean; saving: boolean; saveError: boolean }> {
  state = { failed: false, asyncError: false, saving: false, saveError: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) {
    stopCamera(); stopMic(); pauseVideo();
    console.warn('GLYPHOS: error del estudio', error);
  }
  private rejected = () => this.setState({ asyncError: true });
  componentDidMount() { addEventListener('unhandledrejection', this.rejected); }
  componentWillUnmount() { removeEventListener('unhandledrejection', this.rejected); }
  private save = async () => {
    this.setState({ saving: true, saveError: false });
    try { await saveRecoverySession(); } catch { this.setState({ saveError: true }); }
    finally { this.setState({ saving: false }); }
  };
  render() {
    const message = this.state.failed ? 'El estudio encontró un error al dibujar la interfaz.'
      : this.props.startupError ?? (this.state.asyncError ? 'Una operación del estudio no pudo completarse.' : null);
    return <>
      {!this.state.failed && this.props.children}
      {message && <div className="load-fail studio-recovery" role="alert">
        <p><b>{message}</b> Guarda una copia antes de recargar.</p>
        <p>La copia incluye las recetas de esta visita y sus referencias; las imágenes y videos locales no se incluyen.</p>
        <div className="row2">
          <button type="button" className="btn" disabled={this.state.saving} onClick={() => void this.save()}>Guardar sesión</button>
          <button type="button" className="btn primary" onClick={() => void reload()}>Recargar</button>
        </div>
        {this.state.saveError && <p>No se pudo descargar la copia. Vuelve a intentar antes de recargar.</p>}
      </div>}
    </>;
  }
}
