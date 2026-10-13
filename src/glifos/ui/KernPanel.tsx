import { useMemo, useState } from 'react';
import { keyCodePoint } from '../../glyphset/set';
import { compileDoc } from '../compile';
import { layoutText } from '../layout';
import { edit, useGlifos } from '../state';
import { paintGlyph, placeGlyph } from '../../glyphset/paint';

/**
 * Kerning of an alphabet: pairs of characters and how much closer (negative) or further apart they sit, in
 * font units. It goes into the preview, the lab's words and the OTF (a «kern» table). Symbol sets have fixed
 * cells and no kerning.
 */
export function KernPanel() {
  const doc = useGlifos(s => s.doc);
  const readOnly = useGlifos(s => !!s.readOnly);
  const [pair, setPair] = useState('AV');
  const [err, setErr] = useState('');
  const set = useMemo(() => (doc ? compileDoc(doc, undefined, { all: true }).set : null), [doc]);
  if (!doc || !set) return null;
  if (doc.mode !== 'texto') return <p className="note">Los símbolos ASCII ocupan celdas fijas: no llevan kerning.</p>;
  const pairs = Object.entries(doc.kern).sort((a, b) => a[0].localeCompare(b[0]));
  const add = () => {
    const cs = Array.from(pair.trim());
    if (cs.length !== 2 || cs.some(c => keyCodePoint(c) < 0)) { setErr('Escribe exactamente dos caracteres, por ejemplo AV.'); return; }
    const k = cs.join('');
    if (doc.kern[k] === undefined) edit(d => { d.kern = { ...d.kern, [k]: -Math.round(d.metrics.upm * 0.05) }; }, `Kerning ${k}`);
    setErr('');
  };
  const setValue = (k: string, v: number) => edit(d => { const n = { ...d.kern }; if (v) n[k] = Math.round(v); else delete n[k]; d.kern = n; }, `Kerning ${k}`, { key: 'kern-' + k });
  return (
    <div className="gl-kern">
      <p className="note">Pares que se acercan (negativo) o se separan (positivo), en unidades de fuente. Van a la vista previa, a las palabras del laboratorio y a la OTF.</p>
      <form className="row" onSubmit={e => { e.preventDefault(); add(); }}>
        <label className="sr-only" htmlFor="kern-pair">Par de caracteres</label>
        <input id="kern-pair" className="field" style={{ width: 80 }} value={pair} disabled={readOnly} onChange={e => { setPair(e.target.value); setErr(''); }} />
        <button type="submit" className="btn small" disabled={readOnly}>Añadir par</button>
      </form>
      {err && <p className="note warn" role="alert">{err}</p>}
      <ul className="gl-kern-list">
        {pairs.map(([k, v]) => (
          <li key={k}>
            <KernSample set={set} pair={k} />
            <label htmlFor={'kern-' + k} className="sr-only">Kerning de {k}</label>
            <input id={'kern-' + k} className="field" type="number" step={5} value={v} disabled={readOnly} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n)) setValue(k, Math.max(-doc.metrics.upm, Math.min(doc.metrics.upm, n))); }} />
            <button type="button" className="btn small ghost" disabled={readOnly} onClick={() => setValue(k, 0)} aria-label={`Quitar el par ${k}`}>Quitar</button>
          </li>
        ))}
      </ul>
      {!pairs.length && <p className="note">Sin pares todavía.</p>}
    </div>
  );
}

function KernSample({ set, pair }: { set: ReturnType<typeof compileDoc>['set']; pair: string }) {
  const draw = (c: HTMLCanvasElement | null) => {
    if (!c) return;
    const fs = 36, dpr = Math.min(2, devicePixelRatio || 1);
    const lay = layoutText(set, pair, fs);
    const w = Math.max(40, Math.ceil(lay.width) + 8), h = Math.ceil(fs * (set.asc - set.desc) / set.upm) + 6;
    c.width = w * dpr; c.height = h * dpr; c.style.width = w + 'px'; c.style.height = h + 'px';
    const cx = c.getContext('2d')!;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.fillStyle = '#ede6da';
    const k = fs / set.upm;
    for (const p of lay.chars) {
      const shape = set.glyphs[p.ch];
      if (!shape) continue;
      const base = 3 + set.asc * k;
      paintGlyph(cx, set, p.ch, 4 + p.x + (shape.a * k) / 2, base - placeGlyph(set, shape, fs).y, fs);
    }
  };
  return <canvas ref={draw} aria-label={`El par ${pair} con su kerning`} role="img" />;
}
