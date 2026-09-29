/**
 * «Tus palabras forman la figura», a guided flow: 1 · the words, 2 · the figure (the subject of a cut-out,
 * or the light or dark zones of the photo), 3 · the look (density, type, colour, background), 4 · whether
 * they arrive flying («Palabras que forman la figura») — previewed as it will export, then «Listo» (a new
 * project from the start screen, or the open project) and the export sheet.
 */
import { useEffect, useMemo, useState } from 'react';
import type { MediaRef } from '../../engine/recipe';
import { projectFromImage } from '../../project/normalize';
import { commitVersion, edit, select, useProject } from '../../project/store';
import { Sheet } from '../../studio/Sheet';
import { openCutout, thumbVersion } from '../actions';
import { SegGroup, Select, Slider, TextField, Toggle } from '../controls';
import { importMedia, pickFiles } from '../media';
import { startEditing } from '../session';
import { sampleRef } from '../templates';
import { openSheet, say } from '../ui';
import { Player } from './Player';
import { closeExtras, useExtras } from './state';
import { applyWords, DEFAULT_WORDS, WORDS_FONTS, wordsSpecOf, type WordsSpec } from './words';

export function WordsSheet() {
  const open = useExtras(s => s.sheet === 'palabras');
  const mode = useExtras(s => s.mode);
  const project = useProject(s => s.project);
  const [spec, setSpec] = useState<WordsSpec>(DEFAULT_WORDS);
  const [photo, setPhoto] = useState<MediaRef | null>(null);
  useEffect(() => {
    if (!open) return;
    const own = mode === 'open' && project ? wordsSpecOf(project) : null;
    const cut = mode === 'open' && project?.sources.some(s => s.kind === 'cutout');
    setSpec(own ?? { ...DEFAULT_WORDS, figure: cut ? 'sujeto' : DEFAULT_WORDS.figure });
    if (mode === 'new' && !photo) void sampleRef().then(r => setPhoto(p => p ?? r));
  }, [open]);
  const base = useMemo(() => (mode === 'open' ? project : photo ? projectFromImage(photo, { name: 'Tus palabras' }) : null), [mode, project, photo]);
  const result = useMemo(() => (base ? applyWords(base, spec) : null), [base, JSON.stringify(spec)]);
  const set = (p: Partial<WordsSpec>) => setSpec(s => ({ ...s, ...p }));
  const hasCut = !!base?.sources.some(s => s.kind === 'cutout');
  const pick = async () => {
    const [f] = await pickFiles('image/*');
    if (!f) return;
    const r = await importMedia(f);
    if (!r.ok || r.kind !== 'image') { say(r.ok ? 'Elige una foto (no un video).' : r.message); return; }
    setPhoto(r.ref);
  };
  const done = (thenExport: boolean) => {
    if (!result) return;
    if (mode === 'new' || !project) {
      const p = result.project;
      p.name = `Tus palabras · ${spec.words.slice(0, 40)}`;
      closeExtras();
      startEditing(p, { fresh: true });
    } else {
      const parent = useProject.getState().versions.list[useProject.getState().versions.cursor]?.id;
      edit(() => result.project);
      thumbVersion(commitVersion('edición', { label: 'Tus palabras', ...(parent ? { parent } : {}) }));
      select([result.layer]);
      closeExtras();
    }
    say(`Tus palabras llenan la figura${spec.animate ? ` y llegan en ${spec.dur.toFixed(1)} s` : ''}. Son caracteres reales: «Exportar» también los da como texto.${result.notes.length ? ' ' + result.notes.join(' ') : ''}`, { keep: result.notes.length > 0 });
    if (thenExport) openSheet('export');
  };
  return (
    <Sheet open={open} wide title="Tus palabras forman la figura" onClose={closeExtras}
      sub="Escribe, elige la figura y el aspecto: tu texto recorre la figura en orden de lectura y se repite hasta llenarla.">
      {open && (
        <div className="sheet-body xw">
          <div className="xw-main">
            <Player project={result?.project ?? null} label="Vista previa de tus palabras" width={440} />
            <ol className="xw-steps">
              <li>
                <h3 className="xp-h">1 · Tus palabras</h3>
                <TextField label="Palabras" value={spec.words} area rows={3} max={2000} placeholder="Un verso, un nombre, una frase…" onChange={v => set({ words: v })} />
                <Toggle label="Sin cortar palabras" checked={spec.wholeWords} onChange={v => set({ wholeWords: v })} hint="Las palabras pasan enteras a la línea siguiente; si no, el texto corre letra a letra y llena más." />
              </li>
              <li>
                <h3 className="xp-h">2 · La figura</h3>
                {mode === 'new' && (
                  <div className="xp-photo"><span className="lbl">Foto</span><span className="xp-photo-name">{photo?.name ?? '…'}</span><button type="button" className="mini" onClick={() => void pick()}>Elegir mi foto</button></div>
                )}
                <SegGroup label="Qué llenan" value={spec.figure} onPick={v => set({ figure: v })}
                  opts={[['sujeto', 'El sujeto recortado', hasCut ? 'Sólo el sujeto del recorte' : 'Hace falta un recorte («Quitar fondo»)'], ['claros', 'Las zonas claras'], ['oscuros', 'Las zonas oscuras']]} />
                {spec.figure === 'sujeto' && !hasCut && (
                  <p className="warn">{mode === 'open' ? <>Este proyecto no tiene recorte: <button type="button" className="linkish" onClick={() => { closeExtras(); openCutout(); }}>Quitar fondo…</button> y vuelve aquí. Mientras, se usan las zonas claras.</> : 'Crea el proyecto y recorta el sujeto con «Quitar fondo»; después vuelve aquí desde «Más». Mientras, se usan las zonas claras.'}</p>
                )}
              </li>
              <li>
                <h3 className="xp-h">3 · Aspecto</h3>
                <Slider label="Densidad" value={spec.columns} min={30} max={200} step={2} def={90} fmt={v => `${Math.round(v)} columnas`} onChange={v => set({ columns: v })} />
                <Select label="Tipografía" value={spec.font} options={WORDS_FONTS.map(([v, l]) => ({ value: v, label: l }))} onChange={v => set({ font: v })} />
                <SegGroup label="Color" value={spec.color} opts={[['tinta', 'Tinta'], ['foto', 'De la foto'], ['acento', 'Bermellón']]} onPick={v => set({ color: v })} />
                <SegGroup label="Fondo" value={spec.background} opts={[['oscuro', 'Oscuro'], ['papel', 'Papel'], ['tenue', 'La foto, tenue']]} onPick={v => set({ background: v })} />
              </li>
              <li>
                <h3 className="xp-h">4 · Animación</h3>
                <Toggle label="Palabras que forman la figura" checked={spec.animate} onChange={v => set({ animate: v })} hint="Las palabras salen de un punto como un chorro de texto y ocupan la figura en orden de lectura." />
                {spec.animate && (
                  <>
                    <SegGroup label="Salen desde" value={spec.origin} opts={[['izquierda', 'Izquierda'], ['derecha', 'Derecha'], ['arriba', 'Arriba'], ['abajo', 'Abajo'], ['centro', 'Centro']]} onPick={v => set({ origin: v })} />
                    <Slider label="Duración" value={spec.dur} min={1} max={12} step={0.5} def={4} fmt={v => `${v.toFixed(1)} s`} onChange={v => set({ dur: v })} />
                  </>
                )}
              </li>
              <li className="xw-go">
                {result?.notes.map(n => <p key={n} className="note">{n}</p>)}
                <button type="button" className="btn primary" disabled={!result} onClick={() => done(false)}>{mode === 'new' ? 'Crear' : 'Listo'}</button>
                <button type="button" className="btn" disabled={!result} onClick={() => done(true)}>{mode === 'new' ? 'Crear y exportar…' : 'Listo y exportar…'}</button>
              </li>
            </ol>
          </div>
        </div>
      )}
    </Sheet>
  );
}
