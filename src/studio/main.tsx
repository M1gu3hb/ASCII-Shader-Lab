import '../landing/fonts';
import '../shared/fonts.css';
import './studio.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startStudio } from './startup';
import { StudioBoundary } from './Boundary';
import { diceHint, openWelcome } from './guide/state';
import { prefetchLater } from './lazy';

// one tab at a time keeps the history and the collection: the newest takes over (tabs.ts)
const { first, opened, error } = await startStudio(() => {
  const line = document.querySelector('.boot-load');
  if (line) line.lastChild!.textContent = 'GLYPHOS está abierto en otra pestaña: esperando a que guarde lo suyo…';
});
// first visit: «¿Qué quieres hacer?», unless the address already chose (a shared piece, a seed,
// a space or a guided path); set before the first render so the dialog opens with the page
if (first && !opened) openWelcome(true);
createRoot(document.getElementById('root')!).render(<StudioBoundary startupError={error}><App /></StudioBoundary>);
// the export sheet, the other sheets and the Componentes space: fetched once the studio is idle
prefetchLater();
if (first && opened === 'space') diceHint(900);
