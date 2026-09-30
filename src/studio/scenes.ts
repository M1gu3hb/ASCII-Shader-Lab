import { charsetById } from '../engine/catalog';
import { DEFAULT_LAYER, defaultRecipe, normalizeRecipe, type Layer, type Recipe } from '../engine/recipe';
import { CURATED } from '../random/palettes';
import { PALETTE_GALLERY, type PaletteMood } from '../random/palette-gallery';
import type { SpaceId } from '../random/spaces';

type SceneSpace = Exclude<SpaceId, 'componentes'>;
export interface SceneSpec {
  id: string;
  name: string;
  space: SceneSpace;
  mood: PaletteMood;
  palette: string;
  charset: string;
  layers: Array<Partial<Layer> & Pick<Layer, 'pattern'>>;
  cell?: number;
  speed?: number;
  glow?: number;
  bloom?: number;
  grain?: number;
  text?: string;
  message?: string;
  interaction?: Recipe['interact']['mode'];
}

const L = (pattern: string, other: Partial<Layer> = {}): SceneSpec['layers'][number] => ({ pattern, ...other });
/** Named compositions are data, not raster captures: each remains fully editable. */
export const SCENES: SceneSpec[] = [
  { id:'enjambre-atlas', name:'Atlas del enjambre', space:'arte', mood:'cosmos', palette:'Frontera estelar', charset:'detallado', cell:8, speed:.55, glow:.3, layers:[L('enjambre_vivo',{a:.65,b:.55}),L('constelacion_dinamica',{blend:'screen',mix:.42,scale:1.2,speed:.38,phase:7})], interaction:'swirl' },
  { id:'bruma-estelar', name:'Bruma estelar', space:'fondos', mood:'calma', palette:'Mar de estrellas', charset:'media_luna', cell:11, speed:.28, layers:[L('bruma_lejana',{a:.35,b:.7,mix:.65}),L('nieve_orbital',{blend:'screen',mix:.58,speed:.45,phase:12})] },
  { id:'jardin-de-fotones', name:'Jardín de fotones', space:'arte', mood:'naturaleza', palette:'Helechos', charset:'pincel', cell:8, speed:.45, glow:.17, layers:[L('bambu',{a:.28,b:.55,mix:.55}),L('floracion_luz',{blend:'screen',mix:.85,scale:1.15,speed:.78})], interaction:'light' },
  { id:'rio-de-cometas', name:'Río de cometas', space:'fondos', mood:'cosmos', palette:'Púlsar', charset:'puntuacion', cell:10, speed:.55, glow:.26, layers:[L('mareas_lentas',{a:.35,b:.7,mix:.32,scale:1.1}),L('estela_cometas',{blend:'screen',mix:.88,speed:.9,phase:6})] },
  { id:'impresion-viva', name:'Impresión viva', space:'arte', mood:'tinta', palette:'Prensa azul', charset:'puntos', cell:7, speed:.33, grain:.12, layers:[L('catenaria',{a:.42,b:.35,mix:.65}),L('lluvia_ascendente',{blend:'multiply',mix:.55,scale:1.05,speed:.72})] },
  { id:'constelacion-de-tinta', name:'Constelación de tinta', space:'arte', mood:'tinta', palette:'Índigo impreso', charset:'marcos', cell:8, speed:.3, grain:.08, layers:[L('constelacion_dinamica',{a:.6,b:.63}),L('apolonio',{blend:'multiply',mix:.3,scale:1.1,speed:.13})], interaction:'lens' },
  { id:'dos-orbitas', name:'Dos órbitas', space:'arte', mood:'cosmos', palette:'Obsidiana lunar', charset:'detallado', cell:8, speed:.65, glow:.22, layers:[L('orbitas_gemelas',{b:.85}),L('esferas_orbita',{blend:'screen',mix:.48,scale:.88,speed:.4,phase:4})], interaction:'swirl' },
  { id:'mariposa-neon', name:'Mariposa eléctrica', space:'arte', mood:'energia', palette:'Voltaje', charset:'diagonales', cell:7, speed:.64, bloom:.38, layers:[L('mariposa_puntos',{a:.55,b:.82,scale:1.2}),L('campo_flujo',{blend:'screen',mix:.23,scale:.73,speed:-.28})], interaction:'light' },
  { id:'polvo-y-jade', name:'Polvo y jade', space:'arte', mood:'naturaleza', palette:'Musgo profundo', charset:'suave', cell:8, speed:.48, glow:.21, layers:[L('jade_vivo',{a:.48,b:.63,speed:.48}),L('vortice_polvo',{blend:'screen',mix:.65,scale:1.4,speed:1.2})], interaction:'swirl' },
  { id:'cielo-respirando', name:'Cielo que respira', space:'fondos', mood:'calma', palette:'Lago al alba', charset:'media_luna', cell:11, speed:.28, layers:[L('respiracion',{a:.48,b:.55,mix:.6,scale:1.2}),L('ondas_estelares',{blend:'screen',mix:.46,scale:1.4,speed:.6})] },
  { id:'lluvia-de-sal', name:'Lluvia de sal', space:'fondos', mood:'calma', palette:'Sal marina', charset:'puntos', cell:12, speed:.27, layers:[L('nieve_orbital',{a:.6,b:.55,mix:.7}),L('bruma_lejana',{blend:'screen',mix:.35,scale:1.25,speed:.4,phase:10})] },
  { id:'espiral-de-fuego', name:'Espiral de fuego', space:'arte', mood:'energia', palette:'Magma azul', charset:'barras_ascii', cell:8, speed:.68, bloom:.35, layers:[L('vortice_polvo',{a:.82,b:.67}),L('simbiosis',{blend:'screen',mix:.35,scale:.9,speed:.35})], interaction:'repel' },
  { id:'coral-luminoso', name:'Coral luminoso', space:'arte', mood:'naturaleza', palette:'Arrecife', charset:'pincel', cell:8, speed:.42, glow:.2, layers:[L('cardumen_luz',{a:.42,b:.7}),L('giroide',{blend:'screen',mix:.32,scale:.88,speed:.45,phase:9})], interaction:'light' },
  { id:'ondas-de-cobre', name:'Ondas de cobre', space:'fondos', mood:'naturaleza', palette:'Cobre húmedo', charset:'tejido_fino', cell:12, speed:.3, layers:[L('estuario',{a:.52,b:.43,mix:.6}),L('ondas_estelares',{blend:'screen',mix:.43,scale:1.2,speed:.7})] },
  { id:'semillas-del-viento', name:'Semillas del viento', space:'fondos', mood:'naturaleza', palette:'Bosque brumoso', charset:'puntuacion', cell:11, speed:.29, layers:[L('campo_flujo',{a:.23,b:.45,mix:.37}),L('cardumen_luz',{blend:'screen',mix:.7,scale:1.3,speed:.65})] },
  { id:'porcelana-dinamica', name:'Porcelana dinámica', space:'fondos', mood:'calma', palette:'Cielo de porcelana', charset:'lineas', cell:12, speed:.26, layers:[L('jardin_zen',{a:.25,b:.5,mix:.7}),L('nieve_orbital',{blend:'multiply',mix:.34,speed:.65})] },
  { id:'pulso-coral', name:'Pulso coral', space:'arte', mood:'energia', palette:'Fósforo coral', charset:'detallado', cell:8, speed:.62, glow:.35, layers:[L('corazon_particulas',{b:.9}),L('respiracion',{blend:'screen',mix:.4,scale:1.35,speed:.52})], interaction:'ripple' },
  { id:'eclipse-fragmentado', name:'Eclipse fragmentado', space:'arte', mood:'cosmos', palette:'Eclipse', charset:'geometria', cell:8, speed:.38, bloom:.24, layers:[L('caliz',{a:.45,b:.4,mix:.85}),L('constelacion_dinamica',{blend:'screen',mix:.48,scale:1.45,speed:.72})], interaction:'lens' },
  { id:'postal-de-arena', name:'Postal de arena', space:'tipo', mood:'tinta', palette:'Papel quemado', charset:'puntos', cell:7, speed:.24, grain:.13, text:'MAREA', message:'una postal de movimiento', layers:[L('mareas_lentas',{a:.3,b:.53,mix:.45}),L('nieve_orbital',{blend:'multiply',mix:.26,scale:1.1,speed:.5})] },
  { id:'senal-entre-estrellas', name:'Señal entre estrellas', space:'tipo', mood:'cosmos', palette:'Púlsar', charset:'terminal_densa', cell:8, speed:.42, glow:.22, text:'SEÑAL', message:'recibida desde otro cielo', layers:[L('constelacion_dinamica',{mix:.55}),L('orbitas_gemelas',{blend:'screen',mix:.36,speed:.4})] },
  { id:'florece', name:'Florece', space:'tipo', mood:'naturaleza', palette:'Helechos', charset:'pincel', cell:8, speed:.36, text:'FLORECE', layers:[L('floracion_luz',{mix:.72}),L('bambu',{blend:'screen',mix:.22,scale:1.35,speed:.4})] },
  { id:'luz-que-llega', name:'Luz que llega', space:'tipo', mood:'energia', palette:'Láser granate', charset:'barras_ascii', cell:8, speed:.55, glow:.36, text:'LUZ', message:'algo está a punto de aparecer', layers:[L('enjambre_vivo',{a:.75,b:.6,mix:.62}),L('estela_cometas',{blend:'screen',mix:.5,scale:1.2,speed:.8})] },
  { id:'consola-celeste', name:'Consola celeste', space:'terminal', mood:'cosmos', palette:'Mar de estrellas', charset:'clasico', cell:10, speed:.3, message:'> buscando constelaciones...', layers:[L('constelacion_dinamica',{b:.55,mix:.75}),L('orbitas_gemelas',{blend:'screen',mix:.3,scale:1.1,speed:.4})] },
  { id:'consola-meteoros', name:'Consola de meteoros', space:'terminal', mood:'energia', palette:'Ácido azul', charset:'clasico', cell:10, speed:.55, message:'> meteoros activos', layers:[L('lluvia_ascendente',{b:.55,mix:.75}),L('estela_cometas',{blend:'screen',mix:.35,speed:.6})] },
  { id:'retrato-estelar', name:'Retrato estelar', space:'media', mood:'cosmos', palette:'Frontera estelar', charset:'detallado', cell:7, speed:.35, glow:.25, layers:[L('constelacion_dinamica',{mix:.4}),L('orbitas_gemelas',{blend:'screen',mix:.25,speed:.4})] },
  { id:'retrato-riso', name:'Retrato risográfico', space:'media', mood:'tinta', palette:'Riso mandarina', charset:'puntos', cell:7, speed:.28, grain:.15, layers:[L('floracion_luz',{mix:.3}),L('catenaria',{blend:'multiply',mix:.32,speed:.25})] },
  { id:'retrato-bruma', name:'Retrato entre brumas', space:'media', mood:'calma', palette:'Niebla de perla', charset:'suave', cell:8, speed:.3, layers:[L('bruma_lejana',{mix:.3}),L('nieve_orbital',{blend:'screen',mix:.36,speed:.52})] },
  { id:'retrato-electrico', name:'Retrato eléctrico', space:'media', mood:'energia', palette:'Cromo eléctrico', charset:'diagonales', cell:7, speed:.48, glow:.3, layers:[L('campo_flujo',{mix:.26}),L('enjambre_vivo',{blend:'screen',mix:.38,speed:.7})] },
];

const palettes = [...CURATED, ...PALETTE_GALLERY];
export function makeScene(scene: SceneSpec, base?: Recipe): Recipe {
  const r = defaultRecipe();
  const palette = palettes.find(p => p.name === scene.palette);
  if (palette) { r.color.bg = palette.bg; r.color.stops = [...palette.stops]; }
  r.glyph.charset = charsetById(scene.charset)?.chars ?? r.glyph.charset;
  r.glyph.cell = scene.cell ?? 9;
  r.layers = scene.layers.map(l => ({ ...DEFAULT_LAYER, ...l }));
  r.motion.speed = scene.speed ?? .5;
  r.fx.glow = scene.glow ?? 0;
  r.fx.bloom = scene.bloom ?? 0;
  r.fx.grain = scene.grain ?? 0;
  r.interact.mode = scene.interaction ?? 'none';
  if (scene.text) { r.source = 'text'; r.text.content = base?.source === 'text' && base.text.content.trim() ? base.text.content : scene.text; r.text.font = 'martian'; r.text.weight = 800; r.media.mix = .55; }
  if (scene.message) { r.msg.on = true; r.msg.text = scene.message; r.msg.mode = 'type'; r.msg.speed = 12; r.msg.y = scene.space === 'terminal' ? .88 : .91; r.msg.box = .9; }
  if (scene.space === 'terminal') { r.glyph.aspect = 2; r.glyph.font = 'jetbrains'; r.fx.scan = .2; }
  if (scene.space === 'media' && base && ['image','video','camera'].includes(base.source)) {
    r.source = base.source;
    r.media = { ...base.media, mix: .5, blend: 'screen' };
  }
  return normalizeRecipe(r);
}
