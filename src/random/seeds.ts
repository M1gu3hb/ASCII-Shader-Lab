import { Rng } from './prng';

/**
 * Human-friendly seeds: "sustantivo-adjetivo-000". Adjectives are invariable in gender
 * so any pair reads naturally in Spanish ("marea leve", "faro lunar").
 * 128 × 96 × 1000 ≈ 12 millones de combinaciones; cualquier texto sirve también como semilla.
 */
const NOUNS = [
  'faro', 'marea', 'niebla', 'cometa', 'eco', 'señal', 'trama', 'telar', 'hilo', 'aguja', 'tinta', 'papel', 'grano', 'polvo',
  'ceniza', 'brasa', 'chispa', 'rayo', 'trueno', 'lluvia', 'nube', 'bruma', 'escarcha', 'hielo', 'glaciar', 'volcán', 'lava', 'roca',
  'duna', 'oasis', 'desierto', 'bosque', 'raíz', 'musgo', 'helecho', 'semilla', 'flor', 'pétalo', 'polen', 'abeja', 'colmena', 'enjambre',
  'coral', 'arrecife', 'medusa', 'ballena', 'sirena', 'ancla', 'brújula', 'mapa', 'isla', 'puerto', 'muelle', 'ola', 'río', 'delta',
  'cauce', 'lago', 'pozo', 'fuente', 'espejo', 'prisma', 'lente', 'cristal', 'vidrio', 'neón', 'pixel', 'glifo', 'letra', 'verso',
  'rima', 'poema', 'canción', 'ritmo', 'pulso', 'latido', 'tambor', 'campana', 'órgano', 'piano', 'violín', 'antena', 'radio', 'onda',
  'frecuencia', 'estática', 'módem', 'circuito', 'chip', 'código', 'terminal', 'cursor', 'teclado', 'pantalla', 'monitor', 'satélite',
  'órbita', 'luna', 'eclipse', 'galaxia', 'nebulosa', 'estrella', 'cosmos', 'planeta', 'aurora', 'ocaso', 'alba', 'reloj', 'péndulo',
  'engranaje', 'espiral', 'laberinto', 'mosaico', 'tapiz', 'bordado', 'nudo', 'red', 'jardín', 'patio', 'ventana', 'puerta', 'umbral',
  'farol', 'vela', 'linterna', 'sombra',
];
const ADJS = [
  'leve', 'breve', 'azul', 'gris', 'verde', 'doble', 'veloz', 'feliz', 'fugaz', 'lunar', 'solar', 'polar', 'astral', 'boreal', 'austral',
  'sideral', 'tenue', 'sutil', 'frágil', 'fértil', 'dulce', 'libre', 'salvaje', 'audaz', 'voraz', 'tenaz', 'fiel', 'triste', 'alegre',
  'grave', 'suave', 'humilde', 'noble', 'sereno', 'digital', 'analógico', 'binario', 'lineal', 'radial', 'modular', 'tonal', 'modal',
  'total', 'central', 'lateral', 'oriental', 'occidental', 'tropical', 'glacial', 'mineral', 'vegetal', 'animal', 'celeste', 'terrestre',
  'silvestre', 'nocturno', 'diurno', 'eterno', 'moderno', 'antiguo', 'urbano', 'rural', 'real', 'irreal', 'fractal', 'cuántico',
  'magnético', 'eléctrico', 'térmico', 'sónico', 'óptico', 'lírico', 'épico', 'mágico', 'lógico', 'rítmico', 'cíclico', 'cósmico',
  'onírico', 'poético', 'caótico', 'estable', 'variable', 'visible', 'invisible', 'posible', 'amable', 'dócil', 'hábil', 'útil',
  'ágil', 'firme', 'simple', 'enorme', 'mínimo', 'máximo', 'óptimo', 'último',
];

// Adjectives ending in -o/-a need agreement; only keep those that are invariable.
const INVARIABLE = ADJS.filter(a => !/[oa]$/.test(a));

export function randomSeed(rng: Rng): string {
  return `${rng.pick(NOUNS)}-${rng.pick(INVARIABLE)}-${String(rng.int(0, 999)).padStart(3, '0')}`;
}

/** Session RNG for producing new seeds (not itself reproducible, and doesn't need to be). */
export function freshSeed(): string {
  const bytes = new Uint32Array(2);
  (globalThis.crypto ?? { getRandomValues: (a: Uint32Array) => a.map(() => Math.random() * 2 ** 32) }).getRandomValues(bytes);
  return randomSeed(new Rng(bytes[0] + ':' + bytes[1] + ':' + Date.now()));
}

export function cleanSeed(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 64);
}
