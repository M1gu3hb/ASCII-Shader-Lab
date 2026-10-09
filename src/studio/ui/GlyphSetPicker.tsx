import { useEffect, useId, useState } from 'react';
import { fontById } from '../../engine/catalog';
import { getGlyphSet, provideGlyphSet } from '../../glyphset/registry';
import { Note } from '../controls';
import { applySet, dropSet, glyphSetFile, importGlyphSet, listGlyphSets, missingSetNotice, recordLabUses, useGlyphSetStatus, type SetSummary } from '../glyphSets';
import { edit, useRecipe } from '../store';
import { Picker, type PickOpt } from './Picker';

const NONE = '';

/**
 * «Tus glifos»: a glyph set made in «Crea tus GLYPHOS» instead of (or over) the font. A symbol set brings
 * its ramp; a text set draws the characters it has and leaves the rest to the font, and says so.
 */
export function GlyphSetPicker() {
  const r = useRecipe();
  const current = r?.glyph.set;
  const status = useGlyphSetStatus(current);
  const [sets, setSets] = useState<SetSummary[] | null>(null);
  const labelId = useId();
  useEffect(() => {
    let live = true;
    const load = () => void listGlyphSets().then(s => { if (live) setSets(s); });
    load();
    // a set made in the other tab shows up when coming back here
    const back = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', back);
    return () => { live = false; document.removeEventListener('visibilitychange', back); };
  }, []);
  if (!r) return null;
  const opts: PickOpt<string>[] = [{ value: NONE, label: 'Ninguno', desc: 'Sólo la tipografía de abajo.' }];
  for (const s of sets ?? []) opts.push({ value: s.id, label: s.name, group: 'Tus glifos', desc: s.mode === 'ascii' ? 'Símbolos para celdas, con su rampa.' : 'Alfabeto: dibuja las letras que tiene; las demás, con la tipografía.' });
  if (current && !opts.some(o => o.value === current)) opts.push({ value: current, label: r.glyph.setName ?? 'Juego de esta pieza', group: 'Tus glifos', desc: status === 'missing' ? 'No está en este navegador.' : undefined });
  const pick = async (id: string) => {
    if (id === NONE) { edit(x => dropSet(x), 'glyph.set'); return; }
    // the engines ask the registry; reading it here first lets the ramp of a symbol set come with the change
    let s = getGlyphSet(id);
    if (!s) {
      const bytes = await glyphSetFile(id);
      if (bytes) await importGlyphSet(bytes, id);
      s = getGlyphSet(id);
    }
    if (!s) return;
    provideGlyphSet(id, s);
    edit(x => applySet(x, id, s!), 'glyph.set');
    // «Crea tus GLYPHOS» keeps a set a piece uses even if its project is deleted
    void recordLabUses(new Set([id]), true);
  };
  const set = current ? getGlyphSet(current) : undefined;
  return (
    <div className="ctl cx">
      <span className="lbl" id={labelId}>Tus glifos</span>
      <Picker value={current ?? NONE} options={opts} label="Tus glifos" labelId={labelId} minWidth={290} onChange={id => void pick(id)} />
      {status === 'missing' && <Note>{missingSetNotice(r, fontById(r.glyph.font).name)}</Note>}
      {set?.mode === 'texto' && <Note>Las letras que tu alfabeto no dibuja salen con la tipografía de abajo.</Note>}
      {sets && !sets.length && !current && <Note>Todavía no tienes glifos propios en este navegador.</Note>}
      <p className="note"><a href="/studio/glifos/" target="_blank" rel="noopener">{current ? 'Editar tus glifos en «Crea tus GLYPHOS»' : 'Crear tus glifos en «Crea tus GLYPHOS»'}</a> (se abre en otra pestaña)</p>
    </div>
  );
}
