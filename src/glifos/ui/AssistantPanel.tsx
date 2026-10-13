import { useMemo, useState } from 'react';
import { compareVariants, proposeGlyphs } from '../assist/generate';
import { estimateStyle } from '../assist/style';
import { acceptGlyphs, composeAccents, describeResult, discardProposals, toggleReference } from '../actions';
import { CHAR_GROUPS, hasDrawing, type Corner, type GlyphDoc, type StyleKey, type StyleModel, type Terminal } from '../doc';
import { edit, useGlifos } from '../state';
import { GlyphThumb } from './Board';

/**
 * The local assistant: it learns a style from reference letters (measured, with where every value comes
 * from), proposes the missing characters from skeletons drawn in that style, and never replaces what the
 * person drew, accepted, locked or corrected. Everything runs here, in this browser: nothing is sent.
 */

const STYLE_ROWS: Array<{ k: StyleKey; name: string; kind: 'num' | 'terminal' | 'corner'; min?: number; max?: number; step?: number; unit?: string }> = [
  { k: 'weight', name: 'Grosor de asta', kind: 'num', min: 10, max: 300, step: 1, unit: 'u' },
  { k: 'contrast', name: 'Contraste (fino ÷ grueso)', kind: 'num', min: 0.15, max: 1, step: 0.01 },
  { k: 'angle', name: 'Ángulo de la pluma', kind: 'num', min: -60, max: 60, step: 1, unit: '°' },
  { k: 'slant', name: 'Inclinación', kind: 'num', min: -20, max: 20, step: 0.5, unit: '°' },
  { k: 'width', name: 'Anchura', kind: 'num', min: 0.6, max: 1.6, step: 0.01, unit: '×' },
  { k: 'round', name: 'Redondez de las curvas', kind: 'num', min: 0, max: 1, step: 0.01 },
  { k: 'xh', name: 'Altura x', kind: 'num', min: 200, max: 800, step: 1, unit: 'u' },
  { k: 'cap', name: 'Altura de mayúsculas', kind: 'num', min: 300, max: 950, step: 1, unit: 'u' },
  { k: 'terminal', name: 'Remates', kind: 'terminal' },
  { k: 'corner', name: 'Esquinas', kind: 'corner' },
];
const TERMINALS: Array<[Terminal, string]> = [['recto', 'Rectos'], ['redondo', 'Redondos'], ['cuna', 'En cuña']];
const CORNERS: Array<[Corner, string]> = [['vivo', 'Vivas'], ['redondo', 'Redondeadas']];
const ROLES: Record<string, string> = { H: 'astas y altura de mayúsculas', O: 'curvas y contraste', n: 'altura x y arcos', o: 'curvas minúsculas' };

const pending = (d: GlyphDoc) => d.chars.filter(c => c !== ' ' && (d.glyphs[c].status === 'vacio' || (d.glyphs[c].status === 'propuesto' && !d.glyphs[c].corrected)));

export function AssistantPanel() {
  const doc = useGlifos(s => s.doc);
  const current = useGlifos(s => s.current);
  const picked = useGlifos(s => s.picked);
  const readOnly = useGlifos(s => !!s.readOnly);
  const [variant, setVariant] = useState(0);
  const [target, setTarget] = useState<string>('pendientes');
  const [line, setLine] = useState('');
  const [busy, setBusy] = useState(false);
  const [variants, setVariants] = useState<{ ch: string; list: ReturnType<typeof compareVariants> } | null>(null);
  const refs = doc?.refs ?? [];
  const groupTargets = useMemo(() => CHAR_GROUPS.filter(g => doc && g.chars.some(c => doc.chars.includes(c))), [doc]);
  if (!doc) return null;
  const cur = current ? doc.glyphs[current] : undefined;

  const analyse = () => {
    const r = estimateStyle(doc, refs);
    edit(d => { d.style = r.style; }, 'Analizar el estilo');
    setLine(r.notes.join(' ') || 'Estilo medido en tus referencias.');
  };
  const setStyle = (k: StyleKey, v: number | string) => edit(d => {
    (d.style as unknown as Record<string, unknown>)[k] = v;
    d.style.source = { ...d.style.source, [k]: 'ajustado por ti' };
  }, 'Ajustar el estilo', { key: 'style-' + k });

  const targetChars = (): string[] => {
    if (target === 'pendientes') return pending(doc);
    if (target === 'elegidos') return picked;
    if (target === 'actual') return current ? [current] : [];
    return CHAR_GROUPS.find(g => g.id === target)?.chars.filter(c => doc.chars.includes(c)) ?? [];
  };
  const propose = () => {
    const chars = targetChars();
    if (!chars.length) { setLine('No hay caracteres que proponer en esa selección.'); return; }
    setBusy(true);
    // a frame to show «Proponiendo…» before the work (it takes a moment for a hundred letters)
    requestAnimationFrame(() => {
      try {
        const r = proposeGlyphs(doc, chars, { variant });
        edit(d => { for (const ch of r.changed) d.glyphs[ch] = r.doc.glyphs[ch]; }, `Proponer ${r.changed.length} caracteres`);
        setLine(describeResult('Propuestos', { changed: r.changed, kept: r.kept }));
      } catch (e) { setLine('El asistente no pudo proponer: ' + (e as Error).message); }
      setBusy(false);
    });
  };
  const compare = () => {
    if (!current) return;
    try { setVariants({ ch: current, list: compareVariants(doc, current, 3) }); } catch (e) { setLine('No se pudieron comparar variantes: ' + (e as Error).message); }
  };
  const choose = (i: number) => {
    if (!variants) return;
    const g = doc.glyphs[variants.ch];
    const mayReplace = g.status === 'vacio' || (g.status === 'propuesto' && !g.corrected);
    if (!mayReplace && !confirm(`«${variants.ch}» ${g.status === 'bloqueado' ? 'está bloqueado' : g.corrected ? 'tiene tus correcciones' : 'es un dibujo tuyo'}. ¿Reemplazarlo por esta variante? (Puedes deshacerlo.)`)) return;
    if (g.status === 'bloqueado') { setLine('Desbloquéalo primero: un glifo bloqueado no se reemplaza.'); return; }
    const v = variants.list[i];
    edit(d => { d.glyphs[variants.ch] = { ...v, status: 'propuesto' }; }, `Elegir la variante ${i + 1} de ${variants.ch}`);
    setVariants(null);
  };

  const n = { pend: pending(doc).length, prop: doc.chars.filter(c => doc.glyphs[c].status === 'propuesto').length };
  return (
    <div className="gl-assist">
      <p className="note"><b>Asistente local.</b> Mide tus letras de referencia y dibuja las que faltan con esqueletos propios en tu estilo. Todo ocurre en este navegador: no se envía nada.</p>

      <h3 className="sub">1 · Referencias</h3>
      <p className="note">Dibuja o importa una letra (mejor H, O, n u o) y márcala como referencia: queda bloqueada para que nada la cambie. Con una sola se puede empezar.</p>
      <div className="gl-refs">
        {refs.map(c => (
          <button key={c} type="button" className="gl-ref" onClick={() => toggleReference(c)} disabled={readOnly} aria-label={`Quitar ${c} de las referencias`} title={`Quitar ${c} de las referencias${ROLES[c] ? ` (muestra ${ROLES[c]})` : ''}`}>
            <GlyphThumb doc={doc} g={doc.glyphs[c]} /><span>{c}</span>
          </button>
        ))}
        {!refs.length && <span className="note">Sin referencias todavía.</span>}
      </div>
      {cur && !refs.includes(cur.ch) && (
        <button type="button" className="btn small" disabled={readOnly || !hasDrawing(cur)} onClick={() => { const r = toggleReference(cur.ch); if (r.kept.length) setLine(`${cur.ch}: ${r.kept[0].why}`); }}>
          Usar «{cur.ch}» como referencia{ROLES[cur.ch] ? ` (${ROLES[cur.ch]})` : ''}
        </button>
      )}

      <h3 className="sub">2 · Estilo</h3>
      <button type="button" className="btn wide" disabled={readOnly || !refs.length} onClick={analyse}>Medir el estilo de mis referencias</button>
      <table className="gl-style">
        <caption className="sr-only">Modelo de estilo: valor y de dónde sale</caption>
        <tbody>
          {STYLE_ROWS.map(row => (
            <tr key={row.k}>
              <th scope="row"><label htmlFor={'st-' + row.k}>{row.name}</label></th>
              <td>
                {row.kind === 'num' && (
                  <input id={'st-' + row.k} className="field" type="number" min={row.min} max={row.max} step={row.step} disabled={readOnly}
                    value={Math.round((doc.style[row.k] as number) * 100) / 100}
                    onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) setStyle(row.k, Math.min(row.max!, Math.max(row.min!, v))); }} />
                )}
                {row.kind === 'terminal' && (
                  <select id={'st-' + row.k} className="field" value={doc.style.terminal} disabled={readOnly} onChange={e => setStyle('terminal', e.target.value)}>
                    {TERMINALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                )}
                {row.kind === 'corner' && (
                  <select id={'st-' + row.k} className="field" value={doc.style.corner} disabled={readOnly} onChange={e => setStyle('corner', e.target.value)}>
                    {CORNERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                )}
              </td>
              <td className={'gl-src' + (/no estimado/.test(doc.style.source[row.k]) ? ' none' : '')}>{doc.style.source[row.k]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="sub">3 · Proponer</h3>
      <div className="ctl">
        <label className="lbl" htmlFor="gl-target">Qué caracteres</label>
        <select id="gl-target" value={target} onChange={e => setTarget(e.target.value)}>
          <option value="pendientes">Todo lo pendiente ({n.pend})</option>
          {current && <option value="actual">Sólo «{current}»</option>}
          {picked.length > 0 && <option value="elegidos">Los elegidos en el tablero ({picked.length})</option>}
          {groupTargets.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>
      <div className="ctl"><span className="lbl">Variante de diseño</span>
        <div className="seg" role="group" aria-label="Variante">{['Base', 'Suave', 'Estrecha'].map((l, i) => <button key={i} type="button" aria-pressed={variant === i} onClick={() => setVariant(i)}>{l}</button>)}</div>
      </div>
      <button type="button" className="btn primary wide" disabled={readOnly || busy} onClick={propose}>{busy ? 'Proponiendo…' : 'Proponer'}</button>
      <p className="note">Sólo cambia caracteres vacíos y propuestas que no corregiste. Lo dibujado, aceptado, bloqueado o corregido se queda igual.</p>
      <div className="row">
        <button type="button" className="btn small" disabled={readOnly} onClick={() => setLine(describeResult('Compuestos', composeAccents()))}>Componer acentos (á é ñ…)</button>
        {current && <button type="button" className="btn small" disabled={readOnly} onClick={compare}>Comparar variantes de «{current}»</button>}
      </div>
      {variants && (
        <div className="gl-variants" role="group" aria-label={`Variantes de ${variants.ch}`}>
          {variants.list.map((g, i) => (
            <button key={i} type="button" className="gl-variant" onClick={() => choose(i)} disabled={readOnly}>
              <GlyphThumb doc={{ ...doc, glyphs: { ...doc.glyphs, [variants.ch]: g } }} g={g} />
              <span>{['Base', 'Suave', 'Estrecha'][i] ?? `Variante ${i + 1}`}</span>
            </button>
          ))}
          <button type="button" className="btn small ghost" onClick={() => setVariants(null)}>Cerrar</button>
        </div>
      )}

      <h3 className="sub">4 · Revisar y aceptar</h3>
      <p className="note">{n.prop} {n.prop === 1 ? 'propuesta espera' : 'propuestas esperan'} tu revisión. Corrige en el editor lo que quieras: lo corregido ya no se regenera.</p>
      <div className="row">
        {cur && <button type="button" className="btn small" disabled={readOnly} onClick={() => setLine(describeResult('Aceptados', acceptGlyphs([cur.ch])))}>Aceptar «{cur.ch}»</button>}
        {picked.length > 0 && <button type="button" className="btn small" disabled={readOnly} onClick={() => setLine(describeResult('Aceptados', acceptGlyphs(picked)))}>Aceptar elegidos</button>}
        <button type="button" className="btn small" disabled={readOnly || !n.prop} onClick={() => setLine(describeResult('Aceptados', acceptGlyphs(doc.chars.filter(c => doc.glyphs[c].status === 'propuesto'))))}>Aceptar todas las propuestas</button>
        <button type="button" className="btn small ghost" disabled={readOnly || !n.prop} onClick={() => setLine(describeResult('Descartados', discardProposals(doc.chars)))}>Descartar propuestas sin corregir</button>
      </div>
      {line && <p className="note gl-line" role="status">{line}</p>}

      <details className="gl-neural">
        <summary>¿Y un modelo neuronal?</summary>
        <p>Este asistente es geométrico y local. Un modelo que genera fuentes vectoriales desde una referencia, como VecGlypher, necesita unos 27 000 millones de parámetros (≈55 GB de pesos), una GPU de servidor con CUDA y licencias propias (Gemma). GLYPHOS no tiene ese servidor ni lo contrata, así que no hay botón de «IA»: nada de tus letras sale de este navegador. Lo que haría falta está en <a href="https://github.com/M1gu3hb/ASCII-Shader-Lab/blob/main/docs/propuestas/ESTUDIO-GLIFOS.md" target="_blank" rel="noopener">la propuesta del estudio de glifos</a>.</p>
      </details>
    </div>
  );
}

export type { StyleModel };
