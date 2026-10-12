import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Una gramática que se reescribe y una tortuga que la dibuja: plantas, raíces y curvas recursivas; un jardín que se renueva o un dragón que se pliega.',
  mechanism: 'Un axioma se reescribe con reglas durante varias generaciones (sistema de Lindenmayer). Después una tortuga lee cada símbolo: F avanza dibujando, G avanza sin dibujar, + y − giran, [ y ] guardan y recuperan la posición; &, ^, \\ y / giran en 3D. En el jardín, cada planta tiene su semilla, su tamaño y su edad. En el pliegue, la curva del dragón es una tira de papel doblada por la mitad una y otra vez: cada doblez se abre y se cierra en una onda que va de los grandes a los pequeños.',
  time: '«Crece y se queda» es una construcción: crece trazo a trazo y después sólo se mece con el viento (la curva del dragón, sin viento, queda quieta). «Jardín que se renueva» es continuo: las plantas nacen, crecen, se mecen y se marchitan desde las ramas finas hasta el tronco, y otras nacen en su sitio. «Se pliega en ciclo» es un bucle exacto de «Crecimiento» segundos: la figura vuelve a su forma de partida sin salto.',
  limits: 'Hasta 200 000 símbolos tras la reescritura y 40 000 trazos por planta; generaciones acotadas a 9; 7 plantas en el jardín; en el pliegue, 2^generaciones tramos (hasta 512).',
  sources: [
    { label: 'Prusinkiewicz y Lindenmayer: The Algorithmic Beauty of Plants', url: 'http://algorithmicbotany.org/papers/#abop' },
    { label: 'msiric: Procedural Plants', url: 'https://github.com/msiric/procedural-plants' },
    { label: 'Davis y Knuth (1970): Number Representations and Dragon Curves', url: 'https://en.wikipedia.org/wiki/Dragon_curve' },
  ],
  hints: {
    'axiom': 'Sólo con «Mi gramática».',
    'rules': 'Sólo con «Mi gramática». Ejemplo: F=F[+F]F[-F]F',
    'decay': 'Cuánto se acorta cada rama en cada nivel.',
    'jitter': 'Desorden de ángulos y largos (con la semilla).',
    'grow': 'Segundos que tarda en dibujarse entera; en el jardín, lo que tarda cada planta; en el pliegue, lo que dura un ciclo.',
    'wind': 'Balanceo de las ramas, más en las puntas (no actúa en el pliegue).',
    'turn': 'Vueltas por minuto alrededor del eje vertical (modelos 3D).',
    'mode': 'Crece y se queda; un jardín de varias plantas que nacen y se marchitan; o la figura que se pliega y se despliega en ciclo.',
  },
  presets: {
    'helecho': 'Frondas que se ramifican en ángulos agudos.',
    'arbol3d': 'Árbol en 3D que gira despacio; las ramas se acortan con la altura.',
    'raices': 'Crecen hacia abajo y se abren en muchas puntas finas.',
    'dragon': 'Una sola línea que se pliega sobre sí misma sin cruzarse.',
    'jardin': 'Una fila de helechos de varias alturas y edades: unos brotan, otros se mecen y otros se marchitan.',
    'raices_vivas': 'Raíces que cuelgan del borde de arriba, crecen hacia abajo, se secan y dejan sitio a otras.',
    'dragon_pliegue': 'La curva del dragón se dobla y se desdobla como una tira de papel: espirales, meandros y el dragón entero, en un ciclo de 24 s.',
  },
};
