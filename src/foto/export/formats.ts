/**
 * What can be exported and in which formats, decided from facts about the project and this browser (pure: the
 * facts are probed elsewhere, see facts.ts). Every format says, in one line, what it is good for and what it
 * cannot do; one that is not possible here says why and points to a useful alternative.
 */
import type { FormatInfo, MovieFormat } from '../../video/index';
import type { SvgDecision } from './svg';

/** What goes out: the composition, one part of it, or the project file. */
export type WhatKind = 'resultado' | 'capa' | 'mascara' | 'original' | 'recorte' | 'texto' | 'proyecto';

export type FormatId =
  // pictures of the composition (or of a part)
  | 'png' | 'jpeg' | 'webp' | 'svg' | 'svg-img'
  // moving pictures
  | MovieFormat
  // bundles
  | 'readme'
  // real characters
  | 'txt' | 'ansi' | 'html' | 'svg-text' | 'shell'
  | 'cast' | 'node' | 'python' | 'html-anim' | 'web'
  // parts
  | 'mask-grey' | 'mask-alpha' | 'file' | 'cutout-png' | 'matte'
  // the project
  | 'glyphos';

export type FormatGroup = 'Imagen' | 'Movimiento' | 'Vector' | 'Paquete' | 'Texto' | 'Terminal' | 'Web' | 'Archivo';

export interface FormatOption {
  id: FormatId;
  label: string;
  group: FormatGroup;
  /** One honest line: what it is for and what it cannot do. */
  limit: string;
  /** More detail, shown once chosen (may be ''). */
  more: string;
  available: boolean;
  /** Why not (when unavailable), and what to use instead. */
  why?: string;
  alt?: FormatId;
  /** It is a moving format (range, fps). */
  moving: boolean;
  /** It carries transparency here. */
  alpha: boolean;
  /** Extension of the file it gives. */
  ext: string;
}

export interface GlyphFact { id: string; name: string; moves: boolean; visible: boolean }

export interface Facts {
  /** The picture changes with time and the project has a duration. */
  moving: boolean;
  duration: number;
  /** Transparency asked for (the project's canvas or the sheet's switch). */
  transparent: boolean;
  stills: { jpeg: boolean; webp: boolean };
  /** movieFormats() of lane video (null while probing; [] when this version has no movie export). */
  movies: FormatInfo[] | null;
  /** Glyph layers (real characters). */
  glyphs: GlyphFact[];
  /** Shader ASCII layers present (for the honest «not text» sentence). */
  shaderAscii: number;
  /** The only visible layer, when it is a glyph layer (the whole piece is that text: it can run as code). */
  soloGlyph: string | null;
  /** The project's proportion (width / height), for destinations that pick a size. */
  aspect?: number;
  svg: SvgDecision;
}

const MOVIE_EXT: Record<MovieFormat, string> = { mp4: 'mp4', webm: 'webm', gif: 'gif', 'png-zip': 'zip' };
const MOVIE_LABEL: Record<MovieFormat, string> = { mp4: 'MP4', webm: 'WebM', gif: 'GIF', 'png-zip': 'Secuencia PNG (.zip)' };

/** The first sentence of a longer text (the one-line limit), and the rest. */
export function firstSentence(s: string): { line: string; rest: string } {
  const t = s.trim();
  const stops = (re: RegExp) => { const out: number[] = []; for (let m = re.exec(t); m; m = re.exec(t)) out.push(m.index); return out; };
  // the first full sentence, when it is not too long for one line of the list
  const dot = stops(/\.(?=\s)/g).find(i => i + 1 >= 24);
  if (dot !== undefined && dot < 170) return { line: t.slice(0, dot + 1), rest: t.slice(dot + 1).trim() };
  // else its first clause (a «MP4:» label is not a sentence), closed with a full stop
  const semi = stops(/;(?=\s)/g).find(i => i + 1 >= 24);
  if (semi !== undefined) return { line: t.slice(0, semi) + '.', rest: t.slice(semi + 1).trim() };
  return { line: t, rest: '' };
}

const opt = (o: Omit<FormatOption, 'more' | 'moving' | 'alpha'> & Partial<Pick<FormatOption, 'more' | 'moving' | 'alpha'>>): FormatOption =>
  ({ more: '', moving: false, alpha: false, ...o });

/** Formats of a still picture of the composition. */
function stillFormats(f: Facts): FormatOption[] {
  const out: FormatOption[] = [
    opt({ id: 'png', label: 'PNG', group: 'Imagen', ext: 'png', available: true, alpha: true,
      limit: 'Sin pérdida y con transparencia real; el archivo más pesado de los tres.' }),
    opt({ id: 'jpeg', label: 'JPEG', group: 'Imagen', ext: 'jpg', available: f.stills.jpeg, alt: 'png',
      limit: 'Ligero y aceptado en todas partes; con pérdida y sin transparencia (lo transparente va sobre el fondo del proyecto).',
      ...(f.stills.jpeg ? {} : { why: 'Este navegador no codifica JPEG: si se lo pidiéramos, entregaría un PNG con otro nombre.' }) }),
    opt({ id: 'webp', label: 'WebP', group: 'Imagen', ext: 'webp', available: f.stills.webp, alt: 'png', alpha: true,
      limit: 'Ligero y con transparencia, bueno para la web; algunos programas de edición antiguos no lo abren.',
      ...(f.stills.webp ? {} : { why: 'Este navegador no codifica WebP: si se lo pidiéramos, entregaría un PNG con otro nombre.' }) }),
  ];
  if (f.svg.vector) {
    out.push(opt({ id: 'svg', label: 'SVG (vector)', group: 'Vector', ext: 'svg', available: true, alpha: true,
      limit: 'Vector de verdad: caracteres y textos reales y formas como trazos; crece sin perder nitidez.', more: f.svg.notes.join(' ') }));
  } else {
    out.push(opt({ id: 'svg', label: 'SVG (vector)', group: 'Vector', ext: 'svg', available: false, alt: 'svg-img',
      limit: 'Sólo cuando la composición es de caracteres reales, textos y formas.',
      why: f.svg.summary, more: f.svg.reasons.join(' ') }));
    out.push(opt({ id: 'svg-img', label: 'SVG con imagen (no es vector)', group: 'Vector', ext: 'svg', available: true, alpha: true,
      limit: 'Un PNG metido en un SVG, para programas que sólo aceptan SVG; no gana nitidez al ampliarlo.',
      more: `Por qué no es vector: ${f.svg.reasons.join(' ')}` }));
  }
  return out;
}

/** Formats of a moving picture of the composition (lane video's FormatInfo when it has them). */
function movieFormats(f: Facts): FormatOption[] {
  const order: MovieFormat[] = ['mp4', 'webm', 'gif', 'png-zip'];
  if (!f.moving) {
    return order.map(id => opt({
      id, label: MOVIE_LABEL[id], group: 'Movimiento', ext: MOVIE_EXT[id], available: false, moving: true, alt: 'png',
      limit: id === 'gif' ? 'Animación de 256 colores, sin sonido.' : id === 'png-zip' ? 'Un PNG por cuadro.' : 'Video.',
      why: 'El proyecto no se mueve (no tiene video, animaciones ni capas que cambien con el tiempo): exporta una imagen.',
    }));
  }
  if (f.movies === null) {
    return order.map(id => opt({ id, label: MOVIE_LABEL[id], group: 'Movimiento', ext: MOVIE_EXT[id], available: false, moving: true, limit: 'Revisando qué puede escribir este navegador…', why: 'Revisando qué puede escribir este navegador…' }));
  }
  if (!f.movies.length) {
    return order.map(id => opt({
      id, label: MOVIE_LABEL[id], group: 'Movimiento', ext: MOVIE_EXT[id], available: false, moving: true, alt: 'png',
      limit: 'Video, GIF o cuadros sueltos del tramo.',
      why: 'Esta versión del estudio todavía no exporta video ni GIF: exporta imágenes fijas del instante que elijas.',
    }));
  }
  const byId = new Map(f.movies.map(m => [m.format, m]));
  const avail = (id: MovieFormat) => !!byId.get(id)?.available;
  return order.filter(id => byId.has(id)).map(id => {
    const m = byId.get(id)!;
    const { line, rest } = firstSentence(m.limits);
    // what to use instead: the other video, then GIF, then the frames
    const alt = (id === 'mp4' ? ['webm', 'gif', 'png-zip'] : id === 'webm' ? ['mp4', 'gif', 'png-zip'] : id === 'gif' ? ['webm', 'mp4', 'png-zip'] : ['gif', 'webm'])
      .find(x => avail(x as MovieFormat)) as FormatId | undefined;
    const alphaNote = f.transparent && m.available && !m.alpha && id !== 'gif'
      ? ' No guarda la transparencia aquí: sale sobre el fondo del proyecto; para transparencia, la secuencia PNG.' : '';
    return opt({
      id, label: m.label || MOVIE_LABEL[id], group: 'Movimiento', ext: MOVIE_EXT[id], available: m.available, moving: true, alpha: m.alpha,
      limit: line, more: (rest + alphaNote).trim(),
      ...(m.available ? {} : { why: m.why ?? 'Este navegador no puede escribirlo.' }),
      ...(alt ? { alt } : { alt: 'png' as FormatId }),
    });
  });
}

/** Formats of the characters of a glyph layer (real text). */
function textFormats(f: Facts, layer: GlyphFact | undefined): FormatOption[] {
  const noLayer = !layer
    ? f.shaderAscii
      ? 'Sólo las capas de caracteres reales son texto. Las capas ASCII de este proyecto son un render de shader (una imagen, no texto): añade una capa «Caracteres reales» o exporta imagen o video.'
      : 'Sólo las capas de caracteres reales son texto: añade una capa «Caracteres reales» o exporta imagen o video.'
    : '';
  const still = (id: FormatId, label: string, group: FormatGroup, ext: string, limit: string, more = ''): FormatOption =>
    opt({ id, label, group, ext, limit, more, available: !!layer, alt: 'png', ...(noLayer ? { why: noLayer } : {}) });
  const staticWhy = 'Esta capa no cambia con el tiempo (sin animaciones ni video debajo): usa TXT o ANSI.';
  const anim = (id: FormatId, label: string, group: FormatGroup, ext: string, limit: string, more = ''): FormatOption => {
    const ok = !!layer && layer.moves && f.moving;
    return opt({
      id, label, group, ext, limit, more, moving: true, available: ok, alt: layer ? 'txt' : 'png',
      ...(ok ? {} : { why: noLayer || staticWhy }),
    });
  };
  return [
    still('txt', 'Texto (TXT)', 'Texto', 'txt', 'Los caracteres tal cual, una línea por fila: se pega en cualquier editor, chat o terminal; sin color.'),
    still('ansi', 'ANSI (color de terminal)', 'Texto', 'ans', 'Con colores para terminales que los aceptan (cat archivo.ans); en un editor se ven los códigos.'),
    still('html', 'HTML', 'Texto', 'html', 'Una página con el texto coloreado; se abre en cualquier navegador y el texto se puede seleccionar.'),
    still('svg-text', 'SVG con texto', 'Vector', 'svg', 'Texto de verdad dentro de un SVG; la fuente la pone quien lo abre (puede verse algo distinto sin ella).'),
    still('shell', 'Saludo de la terminal', 'Terminal', 'sh', 'Para pegar al final de ~/.bashrc o ~/.zshrc: aparece al abrir una terminal (sólo en sesiones interactivas).'),
    anim('cast', 'Grabación de terminal (.cast)', 'Terminal', 'cast', 'Se reproduce con asciinema (asciinema play) o su reproductor web; texto con color, sin sonido.'),
    anim('node', 'Reproductor Node.js', 'Terminal', 'mjs', 'Un archivo que anima el texto en la terminal con node (18 o más), sin dependencias; Ctrl+C para salir.'),
    anim('python', 'Reproductor Python', 'Terminal', 'py', 'Lo mismo con python3 y la biblioteca estándar; en Windows necesita una terminal con colores ANSI.'),
    anim('html-anim', 'HTML animado', 'Web', 'html', 'Una página con los cuadros de texto y un reproductor pequeño; el texto se puede seleccionar. Pesa más cuantos más cuadros.'),
    anim('web', 'Código para tu web', 'Web', 'html', 'Un bloque para pegar en tu página: texto animado real con sus colores, sin dependencias ni peticiones a otros sitios.'),
  ];
}

/** The formats offered for a choice of what to export. */
export function formatsFor(what: WhatKind, f: Facts, o: { layer?: string; hasMask?: boolean } = {}): FormatOption[] {
  switch (what) {
    case 'resultado':
      return [
        ...stillFormats(f),
        ...movieFormats(f),
        opt({ id: 'readme', label: 'Paquete README (.zip)', group: 'Paquete', ext: 'zip', available: true,
          limit: f.moving
            ? 'README.md con la pieza como GIF (o PNG si aquí no hay GIF) y el texto de una capa de caracteres, listo para GitHub.'
            : 'README.md con la pieza como PNG y el texto de una capa de caracteres, listo para GitHub.' }),
      ];
    case 'capa':
      return [opt({ id: 'png', label: 'PNG con transparencia', group: 'Imagen', ext: 'png', available: true, alpha: true,
        limit: 'La capa sola, con su máscara y acabados, sobre transparencia: para montarla en otro programa.' })];
    case 'mascara':
      return [
        opt({ id: 'mask-grey', label: 'PNG en grises', group: 'Imagen', ext: 'png', available: !!o.hasMask, alt: 'png',
          limit: 'Blanco muestra, negro oculta: lo que esperan Photoshop, GIMP o un editor de video.', ...(o.hasMask ? {} : { why: 'Esta capa no tiene máscara.' }) }),
        opt({ id: 'mask-alpha', label: 'PNG con transparencia', group: 'Imagen', ext: 'png', available: !!o.hasMask, alt: 'png', alpha: true,
          limit: 'Blanco con la máscara como transparencia: se superpone directamente.', ...(o.hasMask ? {} : { why: 'Esta capa no tiene máscara.' }) }),
      ];
    case 'original':
      return [opt({ id: 'file', label: 'El archivo tal cual', group: 'Archivo', ext: '', available: true,
        limit: 'Tu foto o video original, sin tocar (una secuencia da todas sus fotos).' })];
    case 'recorte':
      return [
        opt({ id: 'cutout-png', label: 'Recorte (PNG con transparencia)', group: 'Imagen', ext: 'png', available: true, alpha: true,
          limit: 'El sujeto con fondo transparente, como se guardó al recortarlo.' }),
        opt({ id: 'matte', label: 'Mate (PNG en grises)', group: 'Imagen', ext: 'png', available: true,
          limit: 'La máscara del recorte: blanco es el sujeto. Para refinar el borde en otro programa.' }),
      ];
    case 'texto':
      return textFormats(f, f.glyphs.find(g => g.id === o.layer) ?? f.glyphs[0]);
    case 'proyecto':
      return [opt({ id: 'glyphos', label: 'Proyecto GLYPHOS (.glyphos.zip)', group: 'Archivo', ext: 'zip', available: true,
        limit: 'Todo para reabrirlo tal cual: capas, máscaras, animaciones, recortes y tus archivos originales.' })];
  }
}

/** The format to fall back to when the chosen one is not possible (its alternative, else the first available). */
export function usableFormat(list: FormatOption[], id: FormatId | null | undefined): FormatId | null {
  const cur = list.find(x => x.id === id);
  if (cur?.available) return cur.id;
  if (cur?.alt && list.find(x => x.id === cur.alt)?.available) return cur.alt;
  return list.find(x => x.available)?.id ?? null;
}
