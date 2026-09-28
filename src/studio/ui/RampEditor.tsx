import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { measureDensity, uniqueChars } from '../../engine/atlas';
import { CHARSETS, fontById } from '../../engine/catalog';
import type { GlyphMode } from '../../engine/recipe';
import { F, Note, Text, Toggle, useField } from '../controls';
import { studioFonts } from '../engineBridge';
import { ITrash } from '../icons';
import { edit } from '../store';
import { toast } from '../toast';
import { ramp } from './options';
import { RAMPS_MAX, removeRamp, saveRamp, useRamps } from './ramps';
import '../css/creative.css';

/** Glyphs shown with a bar each; longer ramps show every glyph but in a denser strip. */
const DENSE = 36;
const NAMES: Record<string, string> = { ' ': 'espacio', ' ': 'espacio' };

/**
 * «Tu rampa»: the characters of the piece, typed freely (single characters or whole words: each different
 * one counts once). Under the field, every glyph with a bar of the ink it leaves in the piece's font,
 * in the order the piece uses them (measured and sorted, or as typed when sorting is off, where a bar out
 * of place shows it). Ramps can be saved in this browser and reused; the recipe always carries the
 * characters themselves, so a link or a project needs nothing saved.
 */
export function RampEditor({ ascii }: { ascii: boolean }) {
  const charset = useField(F<string>('glyph.charset')) ?? '';
  const sort = !!useField(F<boolean>('glyph.sort'));
  const fontId = useField(F<string>('glyph.font')) ?? 'jetbrains';
  const weight = useField(F<number>('glyph.weight')) ?? 500;
  const aspect = useField(F<number>('glyph.aspect')) ?? 1.4;
  const mode = useField(F<GlyphMode>('glyph.mode'));
  const ramps = useRamps(s => s.list);
  const storageOk = useRamps(s => s.saved);
  const glyphs = useMemo(() => uniqueChars(charset), [charset]);
  const key = `${charset}\u0001${fontId}\u0001${weight}\u0001${aspect.toFixed(2)}`;
  const [dens, setDens] = useState<{ key: string; v: number[] } | null>(null);
  useEffect(() => {
    let alive = true;
    // measured once the piece's font is there (a fallback font would give other numbers)
    void studioFonts.ensure(fontId, weight, false, glyphs.join('').slice(0, 200) || 'Aa').then(() => {
      if (alive) setDens({ key, v: measureDensity(glyphs, { stack: fontById(fontId).stack, weight }, aspect) });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const v = dens?.key === key ? dens.v : null;
  const order = useMemo(() => {
    const idx = glyphs.map((_, i) => i);
    return v && sort ? idx.sort((a, b) => v[a] - v[b] || a - b) : idx;
  }, [glyphs, v, sort]);
  // glyphs typed out of order (sorting off): a fuller one before an emptier one
  const outOfOrder = !!v && !sort && order.some((g, i) => i > 0 && v[g] + 0.004 < v[order[i - 1]]);
  const max = v ? Math.max(0.001, ...v) : 1;
  // whole words (letters only): they can also fill the piece as text (the «Palabras» mode)
  const words = charset.trim().split(/\s+/).filter(w => /^\p{L}{3,}$/u.test(w));
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const nameId = useId();
  const builtin = CHARSETS.find(c => c.chars === charset);
  const saved = ramps.find(r => r.chars === charset);
  const startSave = () => { setName(saved?.name ?? (builtin ? `${builtin.name} (mía)` : `Rampa ${ramps.length + 1}`)); setNaming(true); };
  // the control pressed goes away (the form closes, the reorder button is no longer needed): the keyboard
  // stays nearby instead of falling to the page
  const root = useRef<HTMLDivElement>(null);
  const saveBtn = useRef<HTMLButtonElement>(null);
  const refocus = (to: () => HTMLElement | null | undefined) => requestAnimationFrame(() => to()?.focus());
  const closeForm = () => { setNaming(false); refocus(() => saveBtn.current); };
  const save = () => {
    const kept = saveRamp(name, charset);
    closeForm();
    if (!kept) { toast(`Ya tienes ${RAMPS_MAX} rampas guardadas: borra alguna de «Tus rampas» para guardar esta.`, undefined, 6000); return; }
    toast(useRamps.getState().saved ? `Rampa «${name.trim() || 'Mi rampa'}» guardada en este navegador` : 'No se pudo guardar: este navegador no deja guardar datos del sitio');
  };
  return (
    <div className="ramp-ed" ref={root}>
      <Text f={F('glyph.charset')} helpKey="glyph.charsetText" label="Tus caracteres (del vacío al lleno)" mono />
      <div className="ramp-meter" aria-busy={!v}>
        <p className="ramp-cap" id={nameId + 'c'}>
          <span>{sort ? 'Como los usa la pieza: medidos y ordenados' : 'En el orden en que los escribiste'}</span>
          <span className="ramp-n">{glyphs.length} {glyphs.length === 1 ? 'carácter' : 'caracteres'}</span>
        </p>
        <ol className={'ramp-bars' + (glyphs.length > DENSE ? ' dense' : '')} aria-labelledby={nameId + 'c'}
          style={{ fontFamily: fontById(fontId).stack, fontWeight: weight }}>
          {order.map((g, i) => {
            const c = glyphs[g];
            const d = v ? v[g] : 0;
            const bad = !!v && !sort && i > 0 && d + 0.004 < v[order[i - 1]];
            return (
              <li key={c} className={bad ? 'bad' : undefined}>
                <i style={{ height: v ? Math.max(2, Math.round((d / max) * 100)) + '%' : '0' }} aria-hidden="true" />
                <b aria-hidden="true">{c === ' ' ? '␠' : c}</b>
                <span className="sr-only">{NAMES[c] ?? c}: {v ? Math.round(d * 100) + ' % de tinta' : 'midiendo'}{bad ? ', menos que el anterior' : ''}</span>
              </li>
            );
          })}
        </ol>
      </div>
      {outOfOrder && <Note>Los marcados tienen menos tinta que el anterior: la pieza los usará en este orden. Ordénalos si quieres un degradado suave.</Note>}
      {outOfOrder && (
        <button type="button" className="btn" onClick={() => {
          edit(r => { r.glyph.charset = order.slice().sort((a, b) => v![a] - v![b] || a - b).map(i => glyphs[i]).join(''); }, 'glyph.charset:order');
          refocus(() => root.current?.querySelector<HTMLElement>('input[type="text"], textarea'));
        }}>
          Reordenar el texto por tinta
        </button>
      )}
      <Toggle f={F('glyph.sort')} label="Ordenar por cuánta tinta tienen" />
      {ascii && /[^\x20-\x7e]/.test(charset) && <Note><b>Aviso:</b> hay caracteres fuera de ASCII; algunas terminales antiguas no los mostrarán.</Note>}
      {words.length > 0 && mode !== 'words' && (
        <button type="button" className="btn" onClick={() => edit(r => { r.glyph.mode = 'words'; r.glyph.words = charset.trim().replace(/\s+/g, ' ') + ' · '; }, 'glyph.words:ramp')}>
          Rellenar la pieza con «{words.slice(0, 3).join(' ')}{words.length > 3 ? '…' : ''}» (modo Palabras)
        </button>
      )}
      {naming ? (
        <form className="ramp-save" onSubmit={e => { e.preventDefault(); save(); }}>
          <label className="lbl" htmlFor={nameId}>Nombre de la rampa</label>
          <input id={nameId} type="text" value={name} maxLength={40} autoFocus autoComplete="off" onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); closeForm(); } }} />
          <div className="row2">
            <button type="submit" className="btn primary">Guardar</button>
            <button type="button" className="btn ghost" onClick={closeForm}>Cancelar</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn" ref={saveBtn} onClick={startSave} disabled={!glyphs.length}>
          {saved ? `Guardada como «${saved.name}» · renombrar` : 'Guardar esta rampa en este navegador'}
        </button>
      )}
      {!storageOk && <p className="warn">Este navegador no deja guardar datos del sitio: tus rampas duran lo que esta pestaña.</p>}
      {ramps.length > 0 && (
        <div className="ramp-mine">
          <p className="ramp-cap"><span>Tus rampas</span><span className="ramp-n">{ramps.length} de {RAMPS_MAX} · en este navegador</span></p>
          <ul>
            {ramps.map(r => (
              <li key={r.id}>
                <button type="button" className="ramp-chip" aria-pressed={r.chars === charset}
                  onClick={() => edit(x => { x.glyph.charset = r.chars; }, 'glyph.charset')}>
                  <span className="ramp-name">{r.name}</span>
                  <span className="ramp-sample" aria-hidden="true" style={{ fontFamily: fontById(fontId).stack }}>{ramp(r.chars, 12)}</span>
                </button>
                <button type="button" className="icon-btn" aria-label={`Borrar la rampa «${r.name}»`} title="Borrar de este navegador"
                  onClick={() => { removeRamp(r.id); toast(`Rampa «${r.name}» borrada`, { label: 'Deshacer', run: () => saveRamp(r.name, r.chars) }); }}><ITrash /></button>
              </li>
            ))}
          </ul>
          <Note>Una pieza lleva sus caracteres dentro: los enlaces, favoritos y proyectos no dependen de que guardes la rampa.</Note>
        </div>
      )}
    </div>
  );
}
