/**
 * QA of the landing's headline (src/landing/titulo.ts): the same heading at several moments of its score,
 * one row each, with the landing's own styles — the frame strip the screenshots are taken from.
 *   /dev/titulo.html?t=2.7,3.1,…   the moments (seconds); default: steps of the first cycle
 *   /dev/titulo.html?en=vivo        one heading running as on the landing
 */
import '../src/shared/fonts.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/martian-mono/latin-700.css';
import '@fontsource/martian-mono/latin-800.css';
import '../src/landing/landing.css';
import { frameAt } from '../src/landing/titulo-plan';
import { mountTitle } from '../src/landing/titulo';

const q = new URLSearchParams(location.search);
const css = document.createElement('style');
css.textContent = `
  body.qa-titulo { background: #0c0b0a; color: #ede6da; margin: 0; }
  .qa-note { font: 12px/1.4 system-ui, sans-serif; opacity: .6; margin: 10px 16px; }
  .qa-rows { display: grid; }
  .qa-row { position: relative; padding: 22px 16px 12px; border-top: 1px solid #2a2723; }
  .qa-row .hero-title { margin: 0; }
  .qa-t { position: absolute; right: 16px; top: 6px; font: 11px ui-monospace, monospace; opacity: .55; }
`;
document.head.append(css);

const rows = document.querySelector<HTMLElement>('.qa-rows')!;
const noop = () => undefined;
const DEFAULT = '2.5,2.8,3.05,3.4,3.8,4.2,4.6,5.2,5.9,6.2,6.6,7.0,7.5,8.2,8.7,9.2';
const moments = (q.get('t') ?? DEFAULT).split(',').map(Number);

function heading(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'qa-row';
  const h1 = document.createElement('h1');
  h1.className = 'hero-title';
  h1.textContent = 'Haz arte ASCII';
  row.append(h1);
  rows.append(row);
  return h1;
}

async function strip() {
  for (const t of moments) {
    const h1 = heading();
    const label = document.createElement('span');
    label.className = 'qa-t';
    const f = frameAt(t, 12);
    label.textContent = `t = ${t.toFixed(2)} s · ${f.legible ? 'legible' : f.phase}`;
    h1.parentElement!.append(label);
    const c = await mountTitle(h1, { isPaused: () => true, onPause: noop, manual: true });
    c?.drawAt(t);
  }
  document.body.dataset.ready = '1';
}

async function vivo() {
  await mountTitle(heading(), { isPaused: () => false, onPause: noop });
  document.body.dataset.ready = '1';
}

void (q.get('en') === 'vivo' ? vivo() : strip());
