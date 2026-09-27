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
import './studio.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { hydrate } from './store';
import { bootFromUrl } from './boot';
import { DICE_HINT, openWelcome } from './guide/state';
import { toast } from './toast';

const first = await hydrate();
const opened = await bootFromUrl();
// first visit: «¿Qué quieres hacer?», unless the address already chose (a shared piece, a seed,
// a space or a guided path); set before the first render so the dialog opens with the page
if (first && !opened) openWelcome(true);
createRoot(document.getElementById('root')!).render(<App />);
if (first && opened === 'space') setTimeout(() => toast(DICE_HINT, undefined, 7000), 900);
