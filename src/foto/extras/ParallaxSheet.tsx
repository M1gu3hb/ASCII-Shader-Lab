/**
 * «Profundidad y paralaje»: the depth of each layer, the automatic split of subject and background (when
 * the project has a cut-out or a subject mask), and a camera move — «Paralaje suave», «Acercamiento»,
 * «Órbita» — whose effect on each layer scales with its depth. The move is previewed here (it plays both
 * ways) and applied as ordinary keyframes (one undo step), which the timeline shows and every export plays.
 */
import { useEffect, useMemo, useState } from 'react';
import { applyParallax, hasParallax, PARALLAX_PRESETS, removeParallax, type CameraMove } from '../../anim/parallax';
import { commitVersion, edit, updateLayer, useProject } from '../../project/store';
import type { Project } from '../../project/types';
import { Sheet } from '../../studio/Sheet';
import { thumbVersion, openCutout } from '../actions';
import { SegGroup, Slider } from '../controls';
import { KindIcon } from '../icons';
import { say } from '../ui';
import { splitDepth, subjectOf } from './depth';
import { Player } from './Player';
import { closeExtras, useExtras } from './state';

type Dir = 'h' | 'v' | 'd';
const DIRS: Record<Dir, number> = { h: 0, v: 90, d: 35 };

export function ParallaxSheet() {
  const open = useExtras(s => s.sheet === 'paralaje');
  const project = useProject(s => s.project);
  const [preset, setPreset] = useState(PARALLAX_PRESETS[0].id);
  const [amount, setAmount] = useState(1);
  const [dur, setDur] = useState(PARALLAX_PRESETS[0].move.dur);
  const [dir, setDir] = useState<Dir>('h');
  useEffect(() => { if (open) { const p = PARALLAX_PRESETS.find(x => x.id === preset)!; setDur(p.move.dur); } }, [open]);
  const def = PARALLAX_PRESETS.find(x => x.id === preset)!;
  const move: CameraMove = { ...def.move, amount: def.move.amount * amount, dur, ...(def.move.kind === 'pan' ? { dir: DIRS[dir] } : {}) };
  // the project as it would be with this move (what the preview plays)
  const candidate: Project | null = useMemo(() => {
    if (!project) return null;
    const d: Project = JSON.parse(JSON.stringify(project));
    applyParallax(d, move);
    return d;
  }, [project, preset, amount, dur, dir]);
  if (!project) return <Sheet open={open} title="Profundidad y paralaje" onClose={closeExtras}><div className="sheet-body"><p className="note">Abre un proyecto primero.</p></div></Sheet>;
  const subj = subjectOf(project);
  const deep = project.layers.some(l => (l.depth ?? 0) !== 0);
  const split = () => {
    const r = splitDepth(project);
    if (r.project === project) { say(r.notes.join(' ')); return; }
    edit(() => r.project);
    say(r.notes.join(' '), { keep: true });
  };
  const apply = () => {
    const parent = useProject.getState().versions.list[useProject.getState().versions.cursor]?.id;
    let res = { moved: 0, replaced: 0 };
    edit(d => { res = applyParallax(d, move); });
    thumbVersion(commitVersion('edición', { label: def.name, ...(parent ? { parent } : {}) }));
    closeExtras();
    say(res.moved ? `«${def.name}» aplicado a ${res.moved} ${res.moved === 1 ? 'capa' : 'capas'} (${dur.toFixed(1)} s)${res.replaced ? '; reemplazó las llaves de posición que tenían' : ''}. Reprodúcelo en la línea de tiempo.` : 'Ninguna capa tiene profundidad: dales profundidad (o separa sujeto y fondo) para que se muevan distinto.');
  };
  const layers = [...project.layers].reverse();
  return (
    <Sheet open={open} wide title="Profundidad y paralaje" onClose={closeExtras}
      sub="Cada capa a su distancia: al mover la cámara, lo cercano se desplaza más que lo lejano. El movimiento queda como llaves en la línea de tiempo.">
      {open && (
        <div className="sheet-body xd">
          <div className="xd-main">
            <Player project={candidate} label="Vista previa del movimiento de cámara" width={440} />
            <div className="xd-ctl">
              <h3 className="xp-h">Movimiento de cámara</h3>
              <div className="xd-presets" role="radiogroup" aria-label="Movimiento de cámara">
                {PARALLAX_PRESETS.map(p => (
                  <button key={p.id} type="button" role="radio" aria-checked={preset === p.id} className={'xd-preset' + (preset === p.id ? ' on' : '')}
                    onClick={() => { setPreset(p.id); setDur(p.move.dur); }}>
                    <b>{p.name}</b><span>{p.blurb}</span>
                  </button>
                ))}
              </div>
              <Slider label="Intensidad" value={amount} min={0.25} max={3} step={0.05} def={1} fmt={v => `${Math.round(v * 100)} %`} onChange={setAmount} />
              <Slider label="Duración" value={dur} min={1} max={20} step={0.5} def={def.move.dur} fmt={v => `${v.toFixed(1)} s`} onChange={setDur} />
              {def.move.kind === 'pan' && <SegGroup label="Dirección" value={dir} opts={[['h', 'Horizontal'], ['v', 'Vertical'], ['d', 'Diagonal']]} onPick={setDir} />}
              {!deep && <p className="warn">Ninguna capa tiene profundidad todavía: sepáralas abajo o dales profundidad a mano; si no, sólo el acercamiento mueve algo.</p>}
              <div className="xq-out">
                <button type="button" className="btn primary" onClick={apply}>Aplicar el movimiento</button>
                {hasParallax(project) && (
                  <button type="button" className="btn" onClick={() => { let n = 0; edit(d => { n = removeParallax(d); }); say(n ? 'Movimiento de cámara quitado.' : 'No había movimiento de cámara.'); }}>Quitar el movimiento</button>
                )}
              </div>
            </div>
          </div>
          <section className="xd-split" aria-labelledby="xd-split-h">
            <h3 id="xd-split-h" className="xp-h">Capas de profundidad</h3>
            {subj ? (
              <div className="xd-row">
                <p className="note">Hay {subj.cutout ? 'un recorte del sujeto' : 'una máscara del sujeto'}: el estudio puede ponerlo delante (+1) y la foto detrás (−1), con un relleno donde estaba el sujeto.</p>
                <button type="button" className="btn" onClick={split}>Separar sujeto y fondo</button>
              </div>
            ) : (
              <div className="xd-row">
                <p className="note">Para separar sujeto y fondo automáticamente hace falta recortar el sujeto primero (en tu equipo, con tu permiso para descargar el modelo).</p>
                <button type="button" className="btn" onClick={() => { closeExtras(); openCutout(); }}>Quitar fondo…</button>
              </div>
            )}
            <ul className="xd-layers" aria-label="Profundidad de cada capa, de arriba abajo">
              {layers.map(l => (
                <li key={l.id}>
                  <span className="xd-name"><KindIcon kind={l.kind} width={15} height={15} /> {l.name}</span>
                  <Slider label={`Profundidad de «${l.name}»`} value={l.depth ?? 0} min={-3} max={3} step={0.1} def={0} fmt={v => (v > 0 ? '+' : '') + v.toFixed(1)}
                    onChange={v => updateLayer(l.id, x => { x.depth = Math.round(v * 10) / 10; }, 'depth')} />
                </li>
              ))}
            </ul>
            <p className="note">0 es el plano del cuadro (no se mueve con la cámara); positivo, más cerca; negativo, más lejos.</p>
          </section>
        </div>
      )}
    </Sheet>
  );
}
