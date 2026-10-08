/**
 * The examples of «Qué puedes hacer» (the guide cards of the landing, the guide pages and the 404): one short
 * loop per guide, made with the studio's own engine by scripts/ejemplos.mjs (dev/ejemplos.ts) and committed
 * to public/ex/guias/. Pure data: scripts/seo.ts writes the cards from it, src/landing/guias.ts plays them.
 *
 *   <id>.webp   the first frame (720 × 450, twice the largest size it is shown at): what the card shows
 *   <id>.webm   the loop, VP9 · <id>.mp4 the same loop, H.264 (Safari and older browsers)
 */
import type { Guide } from '../shared/site.ts';

export const GUIDE_MEDIA_DIR = '/ex/guias/';
/** Pixel size of the committed media (16:10). */
export const GUIDE_MEDIA_PX = { width: 720, height: 450 };

export interface GuideMedia {
  /** What the example shows, for the image's alt text (the loop is the same example, moving). */
  alt: string;
}

export const GUIDE_MEDIA: Record<Guide['id'], GuideMedia> = {
  // «Guitar on patterned blankets», Junior Pereira (2016), CC0 1.0: tests/fixtures/photos/CREDITS.md
  imagen: { alt: 'Ejemplo: la foto de una guitarra sobre mantas tejidas y, más allá de una línea que la recorre, la misma foto hecha de caracteres de colores' },
  video: { alt: 'Ejemplo: un paisaje al atardecer en movimiento, con el sol, las nubes y el agua, convertido en caracteres verdes de monitor antiguo' },
  fondos: { alt: 'Ejemplo: un fondo de ondas azules hecho de caracteres, con un titular, un párrafo y un botón de ejemplo encima' },
  texto: { alt: 'Ejemplo: la palabra GLYPHOS hecha de caracteres que van del rosa al cian, con las letras moviéndose en ola' },
  terminal: { alt: 'Ejemplo: una dona que gira dibujada con caracteres ASCII blancos, en una ventana de terminal que ejecuta node donut.mjs' },
};

export const guidePoster = (id: Guide['id']) => `${GUIDE_MEDIA_DIR}${id}.webp`;
export const guideLoop = (id: Guide['id']) => `${GUIDE_MEDIA_DIR}${id}`;
