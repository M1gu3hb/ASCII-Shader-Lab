import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'sistema_l',
  name: 'Sistemas L',
  group: 'forma',
  kind: 'geometry',
  version: 1,
  blurb: 'Una gramática que se reescribe y una tortuga que la dibuja: plantas, raíces y curvas recursivas.',
  mechanism: 'Un axioma se reescribe con reglas durante varias generaciones (sistema de Lindenmayer). Después una tortuga lee cada símbolo: F avanza dibujando, G avanza sin dibujar, + y − giran, [ y ] guardan y recuperan la posición; &, ^, \\ y / giran en 3D.',
  time: 'Primero crece trazo a trazo; después se mece con el viento. El crecimiento no es un bucle: termina y la forma queda viva.',
  params: [
    { key: 'model', label: 'Modelo', type: 'choice', def: 'helecho', rebuild: true, options: [
      { id: 'helecho', label: 'Helecho' }, { id: 'arbusto', label: 'Arbusto' }, { id: 'arbol3d', label: 'Árbol 3D' },
      { id: 'raices', label: 'Raíces' }, { id: 'koch', label: 'Copo de Koch' }, { id: 'dragon', label: 'Curva del dragón' },
      { id: 'propio', label: 'Mi gramática' },
    ] },
    { key: 'axiom', label: 'Axioma', type: 'text', def: 'X', max: 24, allowed: 'FGXYAB+-[]&^\\/|', rebuild: true, hint: 'Sólo con «Mi gramática».', advanced: true },
    { key: 'rules', label: 'Reglas', type: 'text', def: 'X=F+[[X]-X]-F[-FX]+X;F=FF', max: 160, allowed: 'FGXYAB+-[]&^\\/|=;', rebuild: true, hint: 'Sólo con «Mi gramática». Ejemplo: F=F[+F]F[-F]F', advanced: true },
    { key: 'gens', label: 'Generaciones', type: 'int', min: 1, max: 9, def: 5, rebuild: true },
    { key: 'angle', label: 'Ángulo', type: 'number', min: 5, max: 120, def: 25, step: 0.5, unit: '°', rebuild: true },
    { key: 'decay', label: 'Acortar', type: 'number', min: 0.5, max: 1, def: 1, step: 0.01, rebuild: true, hint: 'Cuánto se acorta cada rama en cada nivel.' },
    { key: 'jitter', label: 'Variación', type: 'number', min: 0, max: 1, def: 0.15, step: 0.01, rebuild: true, hint: 'Desorden de ángulos y largos (con la semilla).' },
    { key: 'grow', label: 'Crecimiento', type: 'number', min: 1, max: 40, def: 8, step: 0.5, unit: 's', hint: 'Segundos que tarda en dibujarse entera.' },
    { key: 'wind', label: 'Viento', type: 'number', min: 0, max: 1, def: 0.25, step: 0.01, hint: 'Balanceo de las ramas, más en las puntas.' },
    { key: 'turn', label: 'Giro 3D', type: 'number', min: -1, max: 1, def: 0.15, step: 0.01, hint: 'Vueltas por minuto alrededor del eje vertical (modelos 3D).' },
    { key: 'width', label: 'Grosor', type: 'number', min: 0.5, max: 4, def: 1.4, step: 0.05 },
  ],
  presets: [
    { id: 'helecho', name: 'Helecho recursivo', desc: 'Frondas que se ramifican en ángulos agudos.', params: { model: 'helecho', gens: 5, angle: 25, decay: 1, jitter: 0.12, grow: 8, wind: 0.25, width: 1.2 }, look: { stops: ['#07110a', '#b9f2a6'], bg: '#040905', charset: " .'`|/\\#" } },
    { id: 'arbol3d', name: 'Bosque de símbolos', desc: 'Árbol en 3D que gira despacio; las ramas se acortan con la altura.', params: { model: 'arbol3d', gens: 6, angle: 28, decay: 0.78, jitter: 0.2, grow: 10, wind: 0.2, turn: 0.25, width: 1.8 }, look: { stops: ['#100c08', '#f2d7a6'], bg: '#080604', charset: ' .:;|+*#' } },
    { id: 'raices', name: 'Raíces', desc: 'Crecen hacia abajo y se abren en muchas puntas finas.', params: { model: 'raices', gens: 6, angle: 18, decay: 0.92, jitter: 0.45, grow: 12, wind: 0.05, width: 1 }, look: { stops: ['#120a06', '#e8b07c'], bg: '#090503', charset: ' .,:;!|' } },
    { id: 'dragon', name: 'Curva del dragón', desc: 'Una sola línea que se pliega sobre sí misma sin cruzarse.', params: { model: 'dragon', gens: 9, angle: 90, decay: 1, jitter: 0, grow: 14, wind: 0, width: 1.2 }, look: { stops: ['#0a0816', '#c6b6ff'], bg: '#05040c', charset: ' .-=+#' } },
  ],
  caps: { loop: false, basic: 'full', checkpoint: true },
  budget: { res: [48, 256, 96], rate: 30, warmup: 0, limits: 'Hasta 200 000 símbolos tras la reescritura y 40 000 trazos; generaciones acotadas a 9.' },
  sources: [
    { label: 'Prusinkiewicz y Lindenmayer: The Algorithmic Beauty of Plants', url: 'http://algorithmicbotany.org/papers/#abop' },
    { label: 'msiric: Procedural Plants', url: 'https://github.com/msiric/procedural-plants' },
  ],
  wrap: 'clamp',
  figure: true,
};
