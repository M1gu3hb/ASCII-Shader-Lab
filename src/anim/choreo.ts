/**
 * Choreographies: an entry, a central state and an exit placed around each other on one layer. The
 * helper lays out the clips (entry at the start, the central clip in between, the exit at the end, with an
 * optional overlap so one hands over to the next), and CHOREOS are combinations that work well —
 * including the de-fragmentation / resolution / recomposition sequences.
 */
import { templateById, type ParamValue } from '../project/clips';
import type { AnimClip, Ease, Id, LayerKind, Project } from '../project/types';
import { easeFromPreset } from './ease';
import { newClip } from './library';

export interface ClipSpec {
  template: string;
  params?: Record<string, ParamValue>;
  reverse?: boolean;
  /** Seconds (entry and exit); the central clip takes the rest. */
  dur?: number;
  ease?: Ease;
  repeat?: number;
  pingpong?: boolean;
}

export interface Choreo {
  id: string;
  name: string;
  blurb: string;
  /** Kinds of layer every part of it works on. */
  kinds: LayerKind[];
  entry?: ClipSpec;
  hold?: ClipSpec;
  exit?: ClipSpec;
}

export const CHOREOS: Choreo[] = [
  {
    id: 'terminal', name: 'Terminal', blurb: 'Se escribe, el cursor espera y se borra con retroceso.', kinds: ['glyphs', 'text'],
    entry: { template: 'escritura', params: { irregular: 0.4, puntuacion: 0.4 }, dur: 2.5 }, hold: { template: 'cursor', params: { ciclos: 4 } }, exit: { template: 'borrado', dur: 1.2 },
  },
  {
    id: 'foto-ascii-foto', name: 'Foto → ASCII → foto', blurb: 'Los caracteres cubren la foto por manchas, respiran y se retiran por luces.', kinds: ['ascii', 'glyphs'],
    entry: { template: 'foto-a-ascii', params: { modo: 'ruido' }, dur: 1.6 }, hold: { template: 'respirar', params: { modo: 'celdas', amplitud: 0.04 } }, exit: { template: 'foto-a-ascii', params: { modo: 'brillo' }, reverse: true, dur: 1.6 },
  },
  {
    id: 'fragmentos', name: 'Se arma y se rompe', blurb: 'Fragmentos que llegan de fuera, una onda suave y una explosión.', kinds: ['glyphs', 'ascii', 'photo'],
    entry: { template: 'recomponer', params: { modo: 'implosion' }, dur: 2 }, hold: { template: 'onda', params: { amplitud: 6 } }, exit: { template: 'dispersar', params: { modo: 'explosion' }, dur: 1.8 },
  },
  {
    id: 'resolucion', name: 'Afinar y plegar', blurb: 'De celdas enormes a finas; al final todo se pliega en un solo glifo.', kinds: ['glyphs', 'ascii'],
    entry: { template: 'resolucion', params: { modo: 'pasos', pasos: 5 }, dur: 2 }, exit: { template: 'un-glifo', dur: 2.2 },
  },
  {
    id: 'desfragmentar', name: 'Desfragmentar, afinar, recomponer', blurb: 'La secuencia completa: de la foto a caracteres dispersos, que se recomponen gruesos y se afinan; al final se van con el viento.', kinds: ['glyphs', 'ascii'],
    hold: { template: 'secuencia', params: { estados: 'foto,disperso,grueso,medio,ascii', quieto: 0.3 } }, exit: { template: 'dispersar', params: { modo: 'desintegrar', orden: 'izquierda' }, dur: 1.6 },
  },
  {
    id: 'neon', name: 'Neón', blurb: 'Se enciende titilando, late con resplandor y se apaga como un televisor.', kinds: ['glyphs', 'ascii', 'photo', 'text', 'shape'],
    entry: { template: 'neon', dur: 1.4 }, hold: { template: 'pulso-brillo', params: { latidos: 3, forma: 'suave' } }, exit: { template: 'apagado', dur: 1 },
  },
  {
    id: 'codigo', name: 'Código', blurb: 'Lluvia de matriz, un glitch en medio y se desintegra.', kinds: ['glyphs', 'ascii'],
    entry: { template: 'lluvia', dur: 2.4 }, hold: { template: 'glitch', params: { rafagas: 2 } }, exit: { template: 'dispersar', params: { modo: 'desintegrar' }, dur: 1.6 },
  },
  {
    id: 'mensaje', name: 'Mensaje cifrado', blurb: 'Se descifra, una luz lo recorre y vuelve a cifrarse.', kinds: ['glyphs', 'text'],
    entry: { template: 'descifrar', dur: 2 }, hold: { template: 'resaltado' }, exit: { template: 'descifrar', reverse: true, dur: 1.6 },
  },
  {
    id: 'iris', name: 'Iris', blurb: 'Se abre en círculo, flota y se cierra.', kinds: ['glyphs', 'ascii', 'photo', 'text', 'shape'],
    entry: { template: 'iris', dur: 1.2, ease: easeFromPreset('frena') }, hold: { template: 'flotar', params: { amplitud: 8 } }, exit: { template: 'iris', reverse: true, dur: 1.2, ease: easeFromPreset('acelera') },
  },
  {
    id: 'estilos', name: 'Paseo de estilos', blurb: 'Llega en bloques de píxel, recorre varios estilos y sale en cortina.', kinds: ['glyphs', 'ascii'],
    entry: { template: 'pixelado', dur: 1.2 }, hold: { template: 'recorrido-estilos' }, exit: { template: 'cortina', dur: 1.2 },
  },
];

export const choreoById = (id: string) => CHOREOS.find(c => c.id === id);
/** Choreographies whose every part works on this kind of layer. */
export const choreosFor = (kind: LayerKind) => CHOREOS.filter(c => c.kinds.includes(kind));

function clipOf(spec: ClipSpec, start: number, dur: number): AnimClip {
  const c = newClip(spec.template, start, { dur, ...(spec.ease ? { ease: spec.ease } : {}) });
  if (spec.params) c.params = { ...spec.params };
  c.reverse = !!spec.reverse;
  c.repeat = spec.repeat ?? 1;
  c.pingpong = !!spec.pingpong;
  return c;
}

/**
 * The clips of an entry + central state + exit over [start, start + total]: the entry and exit keep their
 * own durations (shrunk to fit when the total is short), the central clip fills the rest; `overlap`
 * seconds make neighbours overlap (a hand-over). Parts left out are skipped.
 */
export function choreograph(parts: { entry?: ClipSpec; hold?: ClipSpec; exit?: ClipSpec }, start: number, total: number, overlap = 0): AnimClip[] {
  const T = Math.max(0.1, total);
  let a = parts.entry ? parts.entry.dur ?? templateById(parts.entry.template)?.dur ?? 1 : 0;
  let b = parts.exit ? parts.exit.dur ?? templateById(parts.exit.template)?.dur ?? 1 : 0;
  // entry and exit leave at least a third for the centre (when there is one)
  const room = parts.hold ? T * (2 / 3) : T;
  if (a + b > room) { const k = room / (a + b); a *= k; b *= k; }
  const ov = Math.max(0, Math.min(overlap, a / 2, b / 2 || a / 2));
  const out: AnimClip[] = [];
  if (parts.entry) out.push(clipOf(parts.entry, start, a));
  if (parts.hold) {
    const s = start + Math.max(0, a - ov), e = start + T - Math.max(0, b - ov);
    out.push(clipOf(parts.hold, s, Math.max(0.05, e - s)));
  }
  if (parts.exit) out.push(clipOf(parts.exit, start + T - b, b));
  return out;
}

/** Puts a choreography on a layer (its clips are added after the layer's own). Returns the new clips. */
export function applyChoreo(d: Project, layer: Id, id: string, start: number, total: number, overlap = 0): AnimClip[] {
  const c = choreoById(id), l = d.layers.find(x => x.id === layer);
  if (!c || !l) return [];
  const clips = choreograph(c, start, total, overlap).filter(cl => templateById(cl.template)?.kinds.includes(l.kind));
  l.clips.push(...clips);
  return clips;
}
