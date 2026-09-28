/**
 * The «Azar» contact sheet: one real draw of the dice per style (archetype), in the order the sheet shows
 * them. Pure data, read by the build (scripts/seo.ts writes the sheet into index.html), by the landing
 * (src/landing/azar.ts weaves the same piece live) and by scripts/posters.mjs (the pre-rendered images).
 * Chosen by looking at the renders; never retouched. `name` is the style's name (checked by a unit test).
 */
export interface Contact { seed: string; arch: string; name: string }

export const CONTACTS: Contact[] = [
  { seed: 'glifo-organico-174', arch: 'organico', name: 'Orgánico' },
  { seed: 'telar-neon-211', arch: 'neon', name: 'Neón' },
  { seed: 'telar-tinta-211', arch: 'tinta', name: 'Tinta y papel' },
  { seed: 'faro-cosmico-100', arch: 'cosmico', name: 'Cósmico' },
  { seed: 'coral-solidos-285', arch: 'solidos', name: 'Sólidos' },
  { seed: 'marea-brutal-137', arch: 'brutal', name: 'Brutalista' },
  { seed: 'marea-leve-082', arch: 'minimal', name: 'Minimal' },
  { seed: 'vibra-fina-203', arch: 'op', name: 'Op-art' },
  { seed: 'glifo-retro-174', arch: 'retro', name: 'Terminal retro' },
  { seed: 'senal-geometrico-322', arch: 'geometrico', name: 'Geométrico' },
  { seed: 'tinta-honda-941', arch: 'grabado', name: 'Grabado 3D' },
  { seed: 'faro-vapor-100', arch: 'vapor', name: 'Vapor' },
  { seed: 'eco-glitch-248', arch: 'glitch', name: 'Glitch' },
  { seed: 'marea-fractal-137', arch: 'fractal', name: 'Matemático' },
];

export const contactSrc = (seed: string) => `/ex/azar/${seed}.webp`;
/** Pixel size of the pre-rendered images; they are composed like a stage of CONTACT_CSS. */
export const CONTACT_PX = { width: 480, height: 300 };
export const CONTACT_CSS = { width: 800, height: 500 };
