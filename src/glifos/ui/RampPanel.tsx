import { useMemo } from 'react';
import { proposeRamp, usable } from '../compile';
import { cpLabel, hasDrawing } from '../doc';
import { edit, useGlifos } from '../state';
import { GlyphThumb } from './Board';

/**
 * The ramp of a set of ASCII symbols: from empty to full, the order the lab uses to map brightness to
 * characters. GLYPHOS proposes it from the measured ink of each symbol in its cell; the person can type an
 * ink value or move a symbol, and then the order is theirs (manual) until they ask for the measured one again.
 * An alphabet has no ramp: the meaning of its letters is not reordered.
 */
export function RampPanel() {
  const doc = useGlifos(s => s.doc);
  const readOnly = useGlifos(s => !!s.readOnly);
  const measured = useMemo(() => (doc ? proposeRamp(doc, doc.chars.filter(c => c === ' ' || (hasDrawing(doc.glyphs[c]) && usable(doc.glyphs[c]))), usable) : []), [doc]);
  if (!doc) return null;
  if (doc.mode !== 'ascii') {
    return <p className="note">Un alfabeto no tiene rampa: sus letras significan lo que son y no se reordenan por tinta. La rampa es de los juegos de símbolos ASCII, donde cada símbolo ocupa una celda y su densidad decide qué tono representa.</p>;
  }
  const inkOf = new Map(measured.map(m => [m.ch, m]));
  const order = doc.ramp.manual ? doc.ramp.order.filter(c => inkOf.has(c)).concat(measured.map(m => m.ch).filter(c => !doc.ramp.order.includes(c))) : measured.map(m => m.ch);
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    edit(x => { x.ramp = { order: next, manual: true }; }, 'Reordenar la rampa');
  };
  const typeInk = (ch: string, v: string) => {
    const n = v.trim() === '' ? undefined : Number(v.replace(',', '.')) / 100;
    if (n !== undefined && (!Number.isFinite(n) || n < 0 || n > 1)) return;
    edit(x => { if (n === undefined) delete x.glyphs[ch].ink; else x.glyphs[ch].ink = n; }, `Tinta de ${ch}`, { glyphs: [ch], key: 'ink-' + ch });
  };
  return (
    <div className="gl-ramp">
      <p className="note">De vacío a lleno: el laboratorio pone los símbolos de la izquierda en las zonas oscuras y los de la derecha en las claras. {doc.ramp.manual ? <b>Orden tuyo.</b> : <b>Orden medido por la tinta de cada símbolo en su celda.</b>}</p>
      <div className="gl-ramp-strip" aria-label="Rampa">
        {order.map(c => <span key={c} className="gl-ramp-cell" title={`${c} ${cpLabel(c)}`}>{c === ' ' ? '␠' : <GlyphThumb doc={doc} g={doc.glyphs[c]} />}</span>)}
      </div>
      {doc.ramp.manual && !readOnly && <button type="button" className="btn small" onClick={() => edit(x => { x.ramp = { order: [], manual: false }; }, 'Usar el orden medido')}>Volver al orden medido</button>}
      <ol className="gl-ramp-list">
        {order.map((c, i) => {
          const m = inkOf.get(c)!;
          return (
            <li key={c}>
              <span className="gl-ramp-glyph" aria-hidden="true">{c === ' ' ? '␠' : <GlyphThumb doc={doc} g={doc.glyphs[c]} />}</span>
              <span className="gl-ramp-name">{c === ' ' ? 'Espacio' : c} <small>{cpLabel(c)}</small></span>
              <span className="gl-ramp-ink">medida {(m.measured * 100).toFixed(1)} %</span>
              <label className="sr-only" htmlFor={'ink-' + i}>Tinta de {c} en por ciento</label>
              <input id={'ink-' + i} className="field gl-ramp-input" inputMode="decimal" placeholder="auto" disabled={readOnly || c === ' '}
                defaultValue={doc.glyphs[c]?.ink !== undefined ? String(Math.round(doc.glyphs[c].ink! * 1000) / 10) : ''}
                onBlur={e => typeInk(c, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') typeInk(c, (e.target as HTMLInputElement).value); }} />
              <span className="row">
                <button type="button" className="btn small" aria-label={`Mover ${c} hacia vacío`} disabled={readOnly || i === 0} onClick={() => move(i, -1)}>←</button>
                <button type="button" className="btn small" aria-label={`Mover ${c} hacia lleno`} disabled={readOnly || i === order.length - 1} onClick={() => move(i, 1)}>→</button>
              </span>
            </li>
          );
        })}
      </ol>
      {!measured.length && <p className="note">Dibuja y acepta algunos símbolos para ver su rampa.</p>}
    </div>
  );
}
