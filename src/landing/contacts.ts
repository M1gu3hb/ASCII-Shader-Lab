/**
 * The «Azar» contact sheet: one real draw of the dice (generator version 5, AZAR_GEN) per style (archetype), in the
 * order the sheet shows them. Pure data, read by the build (scripts/seo.ts writes the sheet into index.html), by the landing
 * (src/landing/azar.ts weaves the same piece live) and by scripts/posters.mjs (the pre-rendered images).
 * Chosen by looking at the renders; never retouched. `name` is the style's name (checked by a unit test).
 */
export interface Contact { seed: string; arch: string; name: string }

export const CONTACTS: Contact[] = [
  { seed: 'coral-escena-285', arch: 'escena', name: 'Escenas' },
  { seed: 'telar-neon-211', arch: 'neon', name: 'Neón' },
  { seed: 'nube-cartel-433', arch: 'cartel', name: 'Cartel' },
  { seed: 'faro-cosmico-100', arch: 'cosmico', name: 'Cósmico' },
  { seed: 'faro-particulas-100', arch: 'particulas', name: 'Partículas' },
  { seed: 'rombo-op-359', arch: 'op', name: 'Op-art' },
  { seed: 'telar-solidos-211', arch: 'solidos', name: 'Sólidos' },
  { seed: 'glifo-curvas-174', arch: 'curvas', name: 'Curvas' },
  { seed: 'rombo-tinta-359', arch: 'tinta', name: 'Tinta y papel' },
  { seed: 'marea-geometrico-137', arch: 'geometrico', name: 'Geométrico' },
  { seed: 'coral-retro-285', arch: 'retro', name: 'Terminal retro' },
  { seed: 'bosque-organico-548', arch: 'organico', name: 'Orgánico' },
  { seed: 'telar-calma-211', arch: 'calma', name: 'Calma' },
  { seed: 'telar-brutal-211', arch: 'brutal', name: 'Brutalista' },
  { seed: 'senal-vapor-322', arch: 'vapor', name: 'Vapor' },
  { seed: 'glifo-glitch-174', arch: 'glitch', name: 'Glitch' },
  { seed: 'coral-fractal-285', arch: 'fractal', name: 'Matemático' },
  { seed: 'rombo-grabado-359', arch: 'grabado', name: 'Grabado 3D' },
  { seed: 'eco-minimal-248', arch: 'minimal', name: 'Minimal' },
];

export const contactSrc = (seed: string) => `/ex/azar/${seed}.webp`;
/** Pixel size of the pre-rendered images; they are composed like a stage of CONTACT_CSS. */
export const CONTACT_PX = { width: 480, height: 300 };
export const CONTACT_CSS = { width: 800, height: 500 };
