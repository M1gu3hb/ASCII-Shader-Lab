/**
 * The names of the dice's styles today (generator version 5 onwards), apart from their definitions (v5.ts,
 * archetypes.ts): the studio names and lists them in its first view, while the dice load on first use
 * (studio/store.ts). tests/unit/random-styles.test.ts checks this list against the definitions.
 */
export interface StyleName { id: string; name: string; blurb: string }

export const STYLES: readonly StyleName[] = [
  { id: "minimal", name: "Minimal", blurb: "Pocos caracteres, movimiento lento, mucho aire." },
  { id: "neon", name: "Neón", blurb: "Colores saturados que brillan sobre negro." },
  { id: "organico", name: "Orgánico", blurb: "Materia viva: nubes, mármol, cáusticas, lava." },
  { id: "geometrico", name: "Geométrico", blurb: "Retículas, laberintos, panales y figuras." },
  { id: "glitch", name: "Glitch", blurb: "Señal corrupta, saltos, estática y caos." },
  { id: "retro", name: "Terminal retro", blurb: "Fósforo, tubo de rayos catódicos y 80 columnas." },
  { id: "cosmico", name: "Cósmico", blurb: "Túneles, galaxias, polvo de estrellas." },
  { id: "tinta", name: "Tinta y papel", blurb: "Impresión: tinta oscura sobre papel, tramas y serifas." },
  { id: "brutal", name: "Brutalista", blurb: "Bloques enormes, alto contraste, sin concesiones." },
  { id: "vapor", name: "Vapor", blurb: "Rejillas infinitas, soles partidos y pasteles eléctricos." },
  { id: "solidos", name: "Sólidos", blurb: "Objetos en 3D iluminados con caracteres: nudos, poliedros, cristales, planetas…" },
  { id: "op", name: "Op-art", blurb: "Vibración óptica: moiré, franjas y espirales." },
  { id: "fractal", name: "Matemático", blurb: "Julia, rosas polares, Lissajous, nudos, cintas y simetrías." },
  { id: "grabado", name: "Grabado 3D", blurb: "Objetos en 3D impresos en tinta sobre papel, con contorno y trama." },
  { id: "particulas", name: "Partículas", blurb: "Enjambres, cometas, nieve y constelaciones que se mueven solos sobre un fondo con color." },
  { id: "curvas", name: "Curvas", blurb: "Armonógrafos, espirógrafos, lemniscatas y flores: líneas que se dibujan solas." },
  { id: "calma", name: "Calma", blurb: "Bruma, mareas y respiraciones lentas: fondos serenos que no apagan el color." },
  { id: "cartel", name: "Cartel", blurb: "Colores planos a todo volumen: tinta sobre papel de color, bloques grandes y mucho contraste." },
  { id: "escena", name: "Escenas", blurb: "Un campo y un enjambre que se mueven cada uno a su ritmo, como las escenas compuestas del estudio." },
];

/** A style by id (every older version's styles are among today's: archetypes.ts archById). */
export const styleById = (id?: string): StyleName | undefined => STYLES.find(s => s.id === id);
