import type { SpaceId } from '../../random/spaces';

/**
 * The identity of each space and each group of settings: a subtle colour of its own (its icon, the tint
 * and thread of its selected tab) and one line that says what is in it. The colours are quiet tints
 * that read on the studio's ink; vermilion stays for the primary action and the active state.
 */
export interface Look {
  /** The group's or space's own colour (on the dark panel, 7:1 at least against it). */
  accent: string;
  /** One line: what is in it (first-visit words, no jargon). */
  line: string;
}

export const SPACE_LOOK: Record<SpaceId, Look> = {
  fondos: { accent: '#8fc4b1', line: 'Fondos animados para poner detrás de tu web' },
  arte: { accent: '#e8ad78', line: 'Capas, objetos en 3D, fractales y efectos' },
  media: { accent: '#9db4e6', line: 'Tu foto, video o cámara, en caracteres' },
  tipo: { accent: '#eba5b9', line: 'Palabras grandes y mensajes que se escriben' },
  terminal: { accent: '#afd98a', line: 'Piezas para la consola: ASCII y ANSI' },
  componentes: { accent: '#c4aae8', line: 'Piezas de interfaz listas para copiar' },
};

const G = {
  forma: '#8fc4b1', color: '#f0b27a', glifos: '#e9d27f', mov: '#86cfdc', fx: '#c4aae8', fuente: '#9db4e6',
  msg: '#eba5b9', term: '#afd98a', xform: '#e8ad78', recetas: '#ede6da',
};

/** A colour at `alpha` (for tints over the panel): #rrggbb → rgba(). */
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** The CSS variables of a look: its colour and its tint. */
export const lookVars = (accent: string) => ({ '--acc': accent, '--acc-t': tint(accent, 0.13) });

/** A settings group's look; a few say something different in a given space. */
export function groupLook(id: string, space: SpaceId): Look {
  const accent = G[id as keyof typeof G] ?? '#ede6da';
  return { accent, line: groupLine(id, space) };
}

function groupLine(id: string, space: SpaceId): string {
  switch (id) {
    case 'forma':
      if (space === 'arte') return 'Los dibujos que se vuelven caracteres, en capas que se mezclan.';
      if (space === 'media') return 'Un patrón que se mezcla con tu imagen.';
      if (space === 'tipo') return 'El patrón que rellena las letras.';
      if (space === 'terminal') return 'El dibujo que llena la terminal.';
      return 'El dibujo del fondo: patrón, escala y su propio movimiento.';
    case 'color': return 'La paleta de la pieza y cómo se reparte.';
    case 'glifos': return 'Qué caracteres dibujan la pieza, su tamaño y su letra.';
    case 'mov':
      if (space === 'media') return 'Lo que hacen el cursor o el dedo sobre la pieza.';
      return 'Velocidad, ritmo y lo que hacen el cursor o el dedo.';
    case 'fx': return 'Luz y pantalla: halo, líneas de monitor, grano.';
    case 'fuente':
      if (space === 'media') return 'Tu imagen, video o cámara, y cómo se encuadra.';
      if (space === 'tipo') return 'Lo que dice la pieza: el texto, su letra y su tamaño.';
      return 'Qué se convierte en caracteres: un patrón, un texto, una foto…';
    case 'msg': return 'Un texto que se escribe, se borra o desfila sobre la pieza.';
    case 'term': return 'El tamaño de la terminal y cómo llevarla a la consola.';
    case 'xform': return 'Deforma la imagen o el texto antes de volverlos caracteres.';
    default: return '';
  }
}
