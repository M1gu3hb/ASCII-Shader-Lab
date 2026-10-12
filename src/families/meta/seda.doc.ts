import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Las mareas lentas convertidas en tela iluminada: seda con brillo, cascadas de velos con vetas, o un mar facetado en perspectiva.',
  mechanism: 'Una altura de pliegues dirigidos (tres ondas a través de una dirección cuyas fases se doblan despacio a lo largo de ella, que serpentean con un ruido, más detalle fractal) se ilumina por su normal. «Seda» usa el modelo de Blinn–Phong: un brillo nítido y un velo ancho, como la seda. «Cascada» usa el brillo anisótropo de Kajiya–Kay: la luz se refleja en los hilos que cruzan los pliegues, y un ruido de fibra los desplaza, así que el brillo sale en vetas; además apila hasta tres capas translúcidas (las de delante son cintas sobre la sábana), cada una más grande y más rápida que la de detrás (paralaje). «Olas facetadas» mira un mar desde una cámara en perspectiva: el rayo de cada celda encuentra la superficie desplazada y la sombrea triángulo a triángulo con la reflexión de Phong, con bruma hacia el horizonte. «Facetas» corta cualquiera de las tres en triángulos planos. Los colores salen de la paleta de la pieza; el carácter, de la luz.',
  time: 'Una función del tiempo: las ondas, el serpenteo y la deriva de las capas avanzan a ritmos sin proporción entre sí, así que la tela sigue moviéndose sin reinicio y no es periódica. «Bucle perfecto» la funde con su inicio, como cualquier patrón.',
  limits: 'Hasta tres capas; cada una evalúa la altura tres veces (para la normal o el triángulo). El mar busca la superficie con tres pasos de punto fijo (sin oclusión entre olas) y no proyecta sombras.',
  sources: [
    { label: 'Radiant · static/silk-groove.html y static/silk-cascade.html, de Paul Bakaus (MIT, «Copyright (c) 2025 Paul Bakaus»; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Vanta · src/vanta.waves.js, de Teng Bao (MIT, «Copyright 2020 Teng Bao»; referencia de la idea, no se copió código)', url: 'https://github.com/tengbao/vanta' },
    { label: 'Kajiya y Kay (1989), «Rendering fur with three dimensional textures»: brillo anisótropo de fibras', url: 'https://doi.org/10.1145/74334.74361' },
    { label: 'Modelo de reflexión de Blinn–Phong', url: 'https://en.wikipedia.org/wiki/Blinn%E2%80%93Phong_reflection_model' },
  ],
  hints: {
    mode: 'Qué superficie: seda con brillo, cascada de velos con vetas, o un mar facetado visto en perspectiva.',
    scale: 'Cuántos pliegues u olas caben: pocos y anchos o muchos y finos.',
    angle: 'Hacia dónde corren los pliegues (o las olas).',
    relief: 'Altura del relieve: de tela tensa a pliegues hondos.',
    speed: 'Velocidad a la que se mueven los pliegues.',
    detail: 'Arrugas finas sobre los pliegues; en la cascada, también la fuerza de las vetas.',
    shine: 'Intensidad del brillo especular.',
    gloss: 'Lustre: un brillo ancho y suave o uno fino y nítido.',
    light: 'Desde dónde llega la luz.',
    layers: 'Capas translúcidas de la cascada (con «Seda» y «Olas» hay una).',
    parallax: 'Cuánto más grandes y rápidas son las capas de delante.',
    facets: 'Corta la superficie en triángulos planos; a cero, lisa.',
    tilt: 'Inclinación de la mirada: en el mar, cuánto mira hacia abajo la cámara.',
    meander: 'Cuánto serpentean los pliegues.',
  },
  presets: {
    seda: 'Una sábana de seda granate con un brillo nítido que resbala por los pliegues.',
    cascada: 'Tres velos verdes que caen con vetas de brillo anisótropo y paralaje.',
    olas: 'Un mar azul de triángulos planos visto desde arriba, con bruma al fondo.',
    saten: 'Seda violeta cortada en facetas: un satén de bajo poligonaje.',
    velos: 'Dos capas doradas en horizontal, muy lentas, con vetas finas.',
  },
};
