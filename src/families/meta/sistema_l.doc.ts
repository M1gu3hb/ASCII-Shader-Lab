import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Una gramática que se reescribe y una tortuga que la dibuja: plantas, raíces y curvas recursivas.',
  mechanism: 'Un axioma se reescribe con reglas durante varias generaciones (sistema de Lindenmayer). Después una tortuga lee cada símbolo: F avanza dibujando, G avanza sin dibujar, + y − giran, [ y ] guardan y recuperan la posición; &, ^, \\ y / giran en 3D.',
  time: 'Primero crece trazo a trazo; después se mece con el viento. El crecimiento no es un bucle: termina y la forma queda viva.',
  limits: 'Hasta 200 000 símbolos tras la reescritura y 40 000 trazos; generaciones acotadas a 9.',
  sources: [
    { label: 'Prusinkiewicz y Lindenmayer: The Algorithmic Beauty of Plants', url: 'http://algorithmicbotany.org/papers/#abop' },
    { label: 'msiric: Procedural Plants', url: 'https://github.com/msiric/procedural-plants' },
  ],
  hints: {
    'axiom': 'Sólo con «Mi gramática».',
    'rules': 'Sólo con «Mi gramática». Ejemplo: F=F[+F]F[-F]F',
    'decay': 'Cuánto se acorta cada rama en cada nivel.',
    'jitter': 'Desorden de ángulos y largos (con la semilla).',
    'grow': 'Segundos que tarda en dibujarse entera.',
    'wind': 'Balanceo de las ramas, más en las puntas.',
    'turn': 'Vueltas por minuto alrededor del eje vertical (modelos 3D).',
  },
  presets: {
    'helecho': 'Frondas que se ramifican en ángulos agudos.',
    'arbol3d': 'Árbol en 3D que gira despacio; las ramas se acortan con la altura.',
    'raices': 'Crecen hacia abajo y se abren en muchas puntas finas.',
    'dragon': 'Una sola línea que se pliega sobre sí misma sin cruzarse.',
  },
};
