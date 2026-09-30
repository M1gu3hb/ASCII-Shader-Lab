/**
 * The public site: canonical origin, every page (title, description, share image) and the brand credit.
 * Pure data, no DOM: the build (scripts/seo-plugin.ts) turns it into head tags, JSON-LD, the sitemap,
 * robots.txt, the shared header and footer, and the Vite inputs.
 */

/** Canonical origin. Other hosts (e.g. ascii-shader-lab.vercel.app) redirect here (vercel.json). */
export const SITE_URL = 'https://glyphos-ascii.vercel.app';
export const SITE_NAME = 'GLYPHOS';
export const SITE_LOCALE = 'es_MX';
export const REPO_URL = 'https://github.com/M1gu3hb/ASCII-Shader-Lab';

export interface ShareImage { path: string; width: number; height: number; alt: string }

/** viewer: the public page that shows a shared piece (/ver/): its own canonical and share image, never indexed. */
export type PageKind = 'home' | 'app' | 'guide' | 'doc' | 'error' | 'viewer';

export interface SitePage {
  /** Vite input name. */
  id: string;
  /** HTML source, relative to the project root. */
  file: string;
  /** Public path with trailing slash: the canonical URL is SITE_URL + path. */
  path: string;
  kind: PageKind;
  title: string;
  description: string;
  image: ShareImage;
  /** Short name for breadcrumbs. */
  crumb: string;
  sitemap: boolean;
}

export interface Guide {
  id: 'imagen' | 'video' | 'fondos' | 'texto' | 'terminal';
  path: string;
  /** Label in the header nav. */
  short: string;
  /** Card and footer name. */
  name: string;
  /** One line for cards. */
  blurb: string;
  /** Primary call to action: the studio entry for this job. */
  cta: { href: string; label: string };
  /** Poster base path in public/ (…-640.webp, ….webp and …-og.jpg exist). */
  poster: string;
  posterAlt: string;
}

const og = (slug: string, alt: string): ShareImage => ({ path: `/ex/${slug}-og.jpg`, width: 1200, height: 630, alt });
const SITE_IMAGE: ShareImage = { path: '/og.jpg', width: 1200, height: 630, alt: 'GLYPHOS: «Haz arte ASCII», sobre ondas azules hechas de caracteres' };

export const GUIDES: Guide[] = [
  {
    id: 'imagen', path: '/imagen-a-ascii/', short: 'Imagen', name: 'Imagen a ASCII',
    blurb: 'Tu foto tejida con letras, con su color o con tu paleta.',
    cta: { href: '/studio/?camino=foto', label: 'Convertir mi foto' },
    poster: '/ex/imagen-a-ascii', posterAlt: 'Paisaje al atardecer convertido en caracteres de colores con el estilo Retrato',
  },
  {
    id: 'video', path: '/video-a-ascii/', short: 'Video', name: 'Video y cámara a ASCII',
    blurb: 'Un video o tu cámara en caracteres, en tiempo real.',
    cta: { href: '/studio/#space=media&source=video', label: 'Convertir un video' },
    poster: '/ex/video-a-ascii', posterAlt: 'Fotograma de un paisaje en movimiento convertido en caracteres verdes de fósforo, con líneas de barrido',
  },
  {
    id: 'fondos', path: '/fondos-ascii/', short: 'Fondos', name: 'Fondos ASCII para web',
    blurb: 'Fondos animados que se copian como HTML, Web Component o React.',
    cta: { href: '/studio/?camino=fondo', label: 'Crear un fondo' },
    poster: '/ex/fondos-ascii', posterAlt: 'Fondo de ondas azules hecho de caracteres',
  },
  {
    id: 'texto', path: '/texto-animado-ascii/', short: 'Texto', name: 'Texto animado en ASCII',
    blurb: 'Palabras rellenas de patrón y mensajes que se escriben solos.',
    cta: { href: '/studio/?camino=palabra', label: 'Animar una palabra' },
    poster: '/ex/texto-animado-ascii', posterAlt: 'La palabra SEÑAL rellena de un patrón de plasma en caracteres rosas y cian',
  },
  {
    id: 'terminal', path: '/arte-ascii-terminal/', short: 'Terminal', name: 'Arte ASCII para terminal',
    blurb: 'Texto, ANSI y animaciones que corren con Node o Python.',
    cta: { href: '/studio/#space=terminal', label: 'Abrir el espacio Terminal' },
    poster: '/ex/arte-ascii-terminal', posterAlt: 'Una dona girando dibujada con caracteres ASCII blancos sobre negro, al estilo de donut.c',
  },
];

export const guideById = (id: Guide['id']) => GUIDES.find(g => g.id === id)!;

const guidePage = (id: Guide['id'], file: string, title: string, description: string): SitePage => {
  const g = guideById(id);
  return { id, file, path: g.path, kind: 'guide', title, description, image: og(g.path.slice(1, -1), g.posterAlt), crumb: g.name, sitemap: true };
};

export const PAGES: SitePage[] = [
  {
    id: 'main', file: 'index.html', path: '/', kind: 'home', crumb: 'GLYPHOS', sitemap: true, image: SITE_IMAGE,
    title: 'GLYPHOS — Generador de arte ASCII online y animado',
    description: 'Crea arte ASCII animado en tu navegador: fondos para web, foto, video y cámara a ASCII, texto y piezas para terminal. Exporta PNG, SVG, MP4, ANSI o código.',
  },
  {
    id: 'studio', file: 'studio/index.html', path: '/studio/', kind: 'app', crumb: 'Estudio', sitemap: true, image: SITE_IMAGE,
    title: 'Estudio GLYPHOS — Generador ASCII en tu navegador',
    description: 'Genera arte ASCII en tiempo real: tira el dado, ajusta patrón, color y glifos, usa tu foto, video o cámara y exporta a PNG, SVG, MP4, GIF, ANSI o código.',
  },
  {
    id: 'foto', file: 'studio/foto/index.html', path: '/studio/foto/', kind: 'app', crumb: 'Estudio de foto y video', sitemap: true,
    image: og('imagen-a-ascii', 'Paisaje al atardecer convertido en caracteres de colores con el estilo Retrato'),
    title: 'Estudio de foto y video GLYPHOS — tu foto en capas de ASCII',
    description: 'Sólo las partes que elijas de tu foto o video, en ASCII: capas, máscaras, recorte en tu navegador y animación. Exporta PNG transparente, texto, GIF o video.',
  },
  guidePage('imagen', 'imagen-a-ascii/index.html',
    'Imagen a ASCII: convierte tu foto en arte ASCII · GLYPHOS',
    'Convierte una foto en arte ASCII en tu navegador, sin subirla a ningún servidor. Ajusta glifos y color, y descarga PNG, SVG, texto o video.'),
  guidePage('video', 'video-a-ascii/index.html',
    'Video y cámara a ASCII en tiempo real · GLYPHOS',
    'Convierte un video o tu cámara en arte ASCII en tiempo real, en tu navegador. Exporta WebM, o MP4 si tu navegador lo codifica, fotograma a fotograma.'),
  guidePage('fondos', 'fondos-ascii/index.html',
    'Fondos ASCII animados para tu web · GLYPHOS',
    'Crea un fondo animado hecho de caracteres y pégalo en tu web como HTML, Web Component o React. Motor incluido; se pausa cuando no está a la vista.'),
  guidePage('texto', 'texto-animado-ascii/index.html',
    'Texto animado en ASCII: palabras hechas de letras · GLYPHOS',
    'Rellena una palabra con un patrón ASCII animado o haz que un mensaje se escriba, se descifre o desfile. Exporta PNG, SVG, video, GIF o código web.'),
  guidePage('terminal', 'arte-ascii-terminal/index.html',
    'Arte ASCII para terminal: ANSI, Node y Python · GLYPHOS',
    'Crea arte ASCII para tu terminal: texto plano, ANSI en 16 o 256 colores o color real, y animaciones que corren con Node o Python sin instalar nada.'),
  {
    id: 'licencia', file: 'licencia/index.html', path: '/licencia/', kind: 'doc', crumb: 'Licencia y uso', sitemap: true, image: SITE_IMAGE,
    title: 'Licencia y uso · GLYPHOS',
    description: 'Lo que creas con GLYPHOS es tuyo. El código exportado es MIT-0 y el del editor, MIT. La marca no se licencia. Terceros, tipografías y tus archivos.',
  },
  {
    // a shared piece travels in the address's fragment, which crawlers never see: the page is the same shell
    // for every piece (brand image, never indexed), and the piece is drawn in the visitor's browser
    id: 'ver', file: 'ver/index.html', path: '/ver/', kind: 'viewer', crumb: 'Pieza compartida', sitemap: false, image: SITE_IMAGE,
    title: 'Una pieza de arte ASCII · GLYPHOS',
    description: 'Una pieza de arte ASCII hecha con GLYPHOS, a pantalla completa y tal como se compartió. Ábrela en el estudio para editarla o crear la tuya.',
  },
  {
    id: 'notfound', file: '404.html', path: '/404.html', kind: 'error', crumb: 'Página no encontrada', sitemap: false, image: SITE_IMAGE,
    title: 'Página no encontrada · GLYPHOS',
    description: 'Esta dirección no existe en GLYPHOS. Vuelve al inicio, abre el estudio o elige una guía.',
  },
];

export const pageByFile = (file: string) => PAGES.find(p => p.file === file.replace(/\\/g, '/').replace(/^\/+/, ''));
export const absUrl = (path: string) => SITE_URL + path;

/** Brand credit shown in the footer of every public page. Logo: public/brand/morphiq (original 1536×444, RGBA). */
export const MORPHIQ = {
  name: 'Morphiq',
  alternateName: 'Astral Morphiq Systems',
  url: 'https://morphiq.com.mx',
  alt: 'Morphiq — Astral Morphiq Systems',
  logo: { path: '/brand/morphiq/morphiq-logo.png', width: 1536, height: 444 },
  /** Displayed size in CSS px (exactly 1536:444); 1x/2x/3x files exist as PNG and lossless WebP. */
  display: { width: 128, height: 37, files: [128, 256, 384] as const },
};
