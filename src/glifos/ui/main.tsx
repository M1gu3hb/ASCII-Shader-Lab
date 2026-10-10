import '../../landing/fonts';
import '../../shared/fonts.css';
import './glifos.css';
import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { GlifosApp } from './App';

/** A failure in the studio says so and keeps the work: what was saved stays in this browser. */
class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="gl-home" role="alert">
        <h1 className="sub">Algo falló en el estudio de glifos</h1>
        <p className="note">Lo que ya estaba guardado sigue en este navegador. Recarga la página para seguir; si vuelve a pasar, descarga una copia del proyecto desde la lista de proyectos.</p>
        <p className="note"><code>{this.state.error.message}</code></p>
        <button type="button" className="btn" onClick={() => location.reload()}>Recargar</button>
      </main>
    );
  }
}

createRoot(document.getElementById('root')!).render(<Boundary><GlifosApp /></Boundary>);
