import '../shared/fonts.css';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource/jetbrains-mono/latin-300.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/jetbrains-mono/latin-800.css';
import '@fontsource/ibm-plex-mono/latin-300.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-700.css';
import '@fontsource/martian-mono/latin-300.css';
import '@fontsource/martian-mono/latin-400.css';
import '@fontsource/martian-mono/latin-700.css';
import '@fontsource/martian-mono/latin-800.css';
import '@fontsource/space-mono/latin-400.css';
import '@fontsource/space-mono/latin-700.css';
import '@fontsource/fira-code/latin-400.css';
import '@fontsource/fira-code/latin-600.css';
import '@fontsource/vt323/latin-400.css';
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/silkscreen/latin-400.css';
import '@fontsource/silkscreen/latin-700.css';
import '../studio/studio.css';
import '../studio/css/controls.css';
import '../studio/css/loom.css';
import './foto.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { projectFromLab } from './bridge';
import { startKeys } from './keys';
import { startScheduler } from './scheduler';
import { openSavedProject, startEditing } from './session';
import { startFotoAutosave } from './autosave';
import { say, setUI } from './ui';
import { refreshSaved } from '../project/store';
import { installQA } from './qa';
import { startPlayback } from './playback';

startScheduler();
startKeys();
// one playback clock for the editor (the timeline's own until lane «video» gives its video clock)
startPlayback();
// the open project saves itself a moment after each change (with a small picture for the list)
startFotoAutosave();

async function boot() {
  const h = new URLSearchParams(location.hash.slice(1));
  const lab = h.get('lab');
  const id = h.get('p');
  if (lab) {
    const p = await projectFromLab(lab);
    if (p) { startEditing(p, { fresh: true }); say('Pieza del laboratorio abierta como proyecto: la foto abajo, el estilo en una capa ASCII encima.'); return; }
    history.replaceState(null, '', location.pathname + location.search);
    say('Esa pieza del laboratorio ya no estaba esperando (se abre una sola vez y caduca en una hora).');
  } else if (id && /^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    if (await openSavedProject(id)) return;
    history.replaceState(null, '', location.pathname + location.search);
  }
  setUI({ screen: 'start' });
  await refreshSaved();
}

await boot();
if (new URLSearchParams(location.search).has('qa')) installQA();
createRoot(document.getElementById('root')!).render(<App />);
