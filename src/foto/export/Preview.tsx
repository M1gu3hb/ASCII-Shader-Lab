/**
 * The sheet's preview: what the file will hold, drawn by the same code at the chosen size and instant
 * (a smaller copy), inside a frame that shows where it goes (a browser, a terminal, a phone with the apps'
 * bands, a sheet of paper, a README, a slide). Text previews are text: the characters of the frame itself.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { GlyphGrid } from '../../glyphs/index';
import { resolveFont } from '../../glyphs/font';
import { charWidth } from '../../exporters/text';
import { SAFE_BOTTOM, SAFE_RIGHT, SAFE_TOP } from '../../studio/views/views';
import type { GlyphStyle } from '../../project/types';
import type { DestId } from './plan';

export type PreviewData =
  | { kind: 'picture'; canvas: HTMLCanvasElement; alpha: boolean }
  | { kind: 'image'; url: string; w: number; h: number; alpha: boolean; label: string }
  | { kind: 'text'; grid: GlyphGrid; style: GlyphStyle; bg: string }
  | { kind: 'files'; items: Array<{ name: string; detail: string }>; thumb?: string }
  | { kind: 'none'; message: string };

/** A canvas shown as it is (the preview render), fitted to its box by CSS. */
function CanvasView({ canvas, alpha }: { canvas: HTMLCanvasElement; alpha: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    canvas.className = 'xp-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Vista previa de la exportación');
    el.replaceChildren(canvas);
  }, [canvas]);
  return <div className="xp-fit"><div ref={ref} className={'xp-pic' + (alpha ? ' alpha' : '')} style={{ '--r': canvas.width / canvas.height } as CSSProperties} /></div>;
}

/** The characters of a frame, as text with their colours (every column one cell wide, fitted to the box). */
export function TextView({ grid, style, bg }: { grid: GlyphGrid; style: GlyphStyle; bg: string }) {
  const box = useRef<HTMLDivElement>(null);
  const pre = useRef<HTMLPreElement>(null);
  const [k, setK] = useState(0);
  const f = resolveFont(style.font, style.weight);
  const W = grid.cols * grid.cw, H = grid.rows * grid.ch;
  useLayoutEffect(() => {
    const el = box.current, p = pre.current;
    if (!el || !p) return;
    const fit = () => {
      const kk = Math.min(1, el.clientWidth / W, (el.clientHeight || Infinity) / H);
      // font size for the scaled cell, then letter spacing so each column is exactly one cell
      const fs = Math.min(grid.ch * 0.9, grid.cw / 0.6) * kk;
      p.style.fontSize = fs + 'px';
      p.style.lineHeight = grid.ch * kk + 'px';
      p.style.letterSpacing = '0px';
      const probe = document.createElement('span');
      probe.textContent = '0000000000';
      p.appendChild(probe);
      const adv = probe.getBoundingClientRect().width / 10;
      probe.remove();
      p.style.letterSpacing = (grid.cw * kk - adv).toFixed(3) + 'px';
      setK(kk);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [grid.cols, grid.rows, grid.cw, grid.ch, W, H]); // (a new frame of the same size keeps the fit)
  const rows: ReactNode[] = [];
  for (let y = 0; y < grid.rows; y++) {
    const spans: ReactNode[] = [];
    let run = '', col = '';
    const flush = (key: number) => { if (run) spans.push(col ? <span key={key} style={{ color: col }}>{run}</span> : run); run = ''; };
    for (let x = 0; x < grid.cols; x++) {
      const i = y * grid.cols + x;
      let c = Math.round(grid.alpha[i] * 255) > 40 ? grid.chars[i] : ' ';
      const w = charWidth(c);
      if (w === 0) c = ' ';
      const cc = c === ' ' ? col : '#' + [0, 1, 2].map(j => grid.rgb[i * 3 + j].toString(16).padStart(2, '0')).join('');
      if (cc !== col) { flush(x); col = cc; }
      run += c;
      if (w === 2) x++;
    }
    flush(grid.cols);
    rows.push(<span key={y}>{spans}{y < grid.rows - 1 ? '\n' : ''}</span>);
  }
  return (
    <div ref={box} className="xp-textbox" style={{ background: bg, '--r': W / H } as CSSProperties}>
      <pre ref={pre} className="xp-text" style={{ fontFamily: `${f.stack}, ui-monospace, monospace`, fontWeight: f.weight, width: k ? W * k : undefined }}
        aria-label={`Vista previa del texto: ${grid.cols} columnas por ${grid.rows} filas`}>{rows}</pre>
    </div>
  );
}

function Body({ data }: { data: PreviewData }) {
  switch (data.kind) {
    case 'picture': return <CanvasView canvas={data.canvas} alpha={data.alpha} />;
    case 'image': return <div className="xp-fit"><div className={'xp-pic' + (data.alpha ? ' alpha' : '')} style={{ '--r': data.w / data.h } as CSSProperties}><img className="xp-canvas" src={data.url} alt={data.label} /></div></div>;
    case 'text': return <TextView grid={data.grid} style={data.style} bg={data.bg} />;
    case 'files': return (
      <div className="xp-files">
        {data.thumb && <img src={data.thumb} alt="" className="xp-thumb" />}
        <ul>{data.items.map((f, i) => <li key={i}><span>{f.name}</span><small>{f.detail}</small></li>)}</ul>
      </div>
    );
    case 'none': return <p className="xp-empty">{data.message}</p>;
  }
}

/** The preview inside the frame of its destination. */
export function Preview({ data, dest, busy, caption, zones, readme }: {
  data: PreviewData | null; dest: DestId; busy: boolean; caption: ReactNode; zones?: boolean;
  /** README: the text block under the picture. */
  readme?: { title: string; text: string | null };
}) {
  const body = data ? <Body data={data} /> : <p className="xp-empty mt-spin">Dibujando la vista previa…</p>;
  let framed: ReactNode;
  switch (dest) {
    case 'web':
      framed = (
        <div className="xp-browser">
          <div className="xp-browser-bar" aria-hidden="true"><i /><i /><i /><span>tu-sitio.com</span></div>
          <div className="xp-browser-page">{body}</div>
        </div>
      );
      break;
    case 'terminal':
      framed = (
        <div className="xp-term">
          <div className="xp-term-bar" aria-hidden="true"><i /><i /><i /><span>terminal</span></div>
          <div className="xp-term-screen">{body}</div>
        </div>
      );
      break;
    case 'vertical':
      framed = (
        <div className="xp-phone">
          <div className="xp-phone-screen">
            {body}
            {zones && (
              <div className="xp-zones" aria-hidden="true">
                <i style={{ height: SAFE_TOP * 100 + '%' }} />
                <i style={{ height: SAFE_BOTTOM * 100 + '%', bottom: 0, top: 'auto' }} />
                <i style={{ width: SAFE_RIGHT * 100 + '%', left: 'auto', right: 0, top: SAFE_TOP * 100 + '%', bottom: SAFE_BOTTOM * 100 + '%', height: 'auto' }} />
              </div>
            )}
          </div>
        </div>
      );
      break;
    case 'cartel':
      framed = <div className="xp-paper">{body}</div>;
      break;
    case 'readme':
      framed = (
        <div className="xp-readme">
          <div className="xp-readme-h" aria-hidden="true">README.md</div>
          <div className="xp-readme-b">
            <h4>{readme?.title ?? ''}</h4>
            {body}
            {readme?.text && <pre className="xp-readme-code" aria-label="Texto del README">{readme.text}</pre>}
          </div>
        </div>
      );
      break;
    case 'presentacion':
      framed = <div className="xp-slide"><div className="xp-slide-in">{body}</div></div>;
      break;
    default:
      framed = <div className="xp-plain">{body}</div>;
  }
  return (
    <figure className={'xp-view xp-in-' + dest + (busy ? ' busy' : '')} aria-busy={busy}>
      {framed}
      <figcaption className="xp-cap">{caption}</figcaption>
    </figure>
  );
}
