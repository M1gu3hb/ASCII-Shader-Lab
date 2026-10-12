# Revisión de familias: crecimiento y construcción

Grupo: `dla` (Agregación), `crecimiento` (Crecimiento diferencial), `sistema_l` (Sistemas L), `wfc` (Arquitectura por restricciones) y `campos_em` (Líneas de campo). Rama `familias-crecimiento`, desde `6702598`.

Hallazgos que se resuelven: A-04 (construcciones que terminan y se quedan quietas), A-05 (la resolución cambia el régimen), A-09 (nombres técnicos), A-10 (coste) y A-06 (usos de biblioteca).

## Qué cambió, en una frase por familia

- **Agregación (DLA).** Nuevo «Renovación». Con «Sí», puntos y anillo crecen en un baño: los caminantes salen de cualquier sitio con hueco y cada cristal tiene identidad y vida. Cuando el campo se llena, el más viejo se funde grano a grano y nacen cristales en los huecos. Desde una línea, el campo avanza con el frente.
- **Crecimiento diferencial.** Nuevo «Renovación». Las curvas pasan a ser una población: ninguna ocupa más de una parte del espacio, la más vieja se corta y se deshace por sus dos extremos, y nacen anillos nuevos en los huecos.
- **Sistemas L.** Nuevo «Tiempo» con dos modos: «Jardín que se renueva», continuo (7 plantas de edades distintas que crecen, se mecen, se marchitan y se reemplazan), y «Se pliega en ciclo», un bucle exacto (la curva del dragón como tira de papel que se dobla y se desdobla).
- **WFC.** Nuevo «Flujo» con dos modos continuos: «Avanza sin fin» (la vista se desliza y cada columna que entra se decide a su paso) y «Se rehace por zonas» (manchas que se apagan y se vuelven a decidir con lo que las rodea).
- **Líneas de campo.** Nuevo «Movimiento». Las fuentes recorren caminos periódicos y las líneas se vuelven a trazar sin parar, de forma escalonada.

En todas las familias el valor por defecto del parámetro nuevo reproduce exactamente el camino anterior: `families-compat` pasa con los 86 presets. Los presets finitos se conservan como «construcción» y su texto de tiempo lo explica. Los contratos de tiempo dependen ahora del parámetro nuevo:

| Familia | Regla de `caps.time` |
| --- | --- |
| dla | `renew`: `si` → continuo; si no → construcción |
| crecimiento | `renew`: `si` → continuo; si no → construcción |
| sistema_l | `mode`: `jardin` → continuo, `pliegue` → bucle; si no → construcción |
| wfc | `flow`: `avanza`, `zonas` → continuo; si no → construcción |
| campos_em | `move`: `0` → construcción; si no → continuo |

## Decisiones de diseño (y lo que se descartó, medido)

### DLA
- **Primer intento descartado: ciclo de vida por cristal con caminantes alrededor de cada uno** (crece → se mantiene → se funde). Daba un lienzo escaso (2–8 % de celdas), con cristales sincronizados y vacíos largos. Se descartó tras mirar el raster.
- **Segundo intento descartado: baño sin identidad de cristal**, donde cada partícula se sublima a su edad. Rellena los fiordos y acaba en polvo uniforme: ni dendritas ni contraste. También se descartó.
- **Versión final.** Los caminantes del baño sólo se sueltan donde no hay ninguna partícula a menos de 6 % de las filas, así que nunca rellenan fiordos y las ramas siguen dendríticas. Cada cristal tiene una vida (con «Vida» como máximo) y un tope de tamaño. Al llegar al tope deja de atrapar: el caminante sigue andando. Cuando el campo supera su cobertura objetivo (14 % de celdas en «punto», 16 % en «varios», 10 % en el anillo), empieza a sublimarse el cristal más viejo. Cada celda se va en un momento fijado por su grano, a lo largo de 2,5 s, con un fundido de 1 s. La nucleación busca el hueco más amplio. En el anillo (fijo), cada caminante que lo toca empieza un rayo propio, que vive, se funde y deja sitio a otros.
- **Línea (suelo o techo).** El campo avanza una fracción de fila por paso, más deprisa cuanto más se acerca el frente al otro lado. El raster mezcla dos filas, así que el desplazamiento es suave. Las ramas viejas salen por abajo (o por arriba).
- **Resolución (A-05).** En renovación, los caminantes escalan con la rejilla: ×(filas/64)^1,7 desde una línea y ×6·(filas/64)² en el baño, con más movimientos por paso en rejillas finas. El aspecto se mantiene a 48, 64 y 160 filas. El camino anterior (sin renovación) no cambia, por compatibilidad: ver «Pendiente».

### Crecimiento diferencial
- **Descartado 1: poda con hueco que cicatriza.** Se cortaba una arista, los extremos retrocedían y luego se atraían. La curva volvía a crecer alrededor de los extremos y nunca se tocaban: según la traza, `coral_vivo` quedó atascado desde los 34 s.
- **Descartado 2: estrangulamiento de pliegues.** Dos nodos enfrentados se unían y el lazo se retraía. Cambiaba, pero la curva acababa pegada al límite (un disco relleno sin pliegues) y las colonias se extinguían en 5 min.
- **Versión final: población de curvas.** Ninguna curva pasa del 22 % de lo que cabe en el contenedor; una línea anclada llega al 50 %. Los brotes al azar sólo caen donde la curva no está apretada: con brotes en todas partes se compactaban franjas finas. Cuando ya no cabe más, la curva más vieja con «Vida» cumplida se corta en un nodo sembrado y se deshace, un nodo por extremo y paso. «No cabe más» significa llegar al 97 % de los nodos del contenedor, o tres intentos seguidos sin hueco para un anillo. Quitar nodos nunca cruza curvas. Mientras tanto nacen anillos donde hay un hueco de unos tres pliegues.

### Sistemas L
- **Jardín.** La geometría de cada planta se construye con el mismo `build()` del modo normal y su propia semilla; una de cada tres plantas tiene una generación menos. Se marchita por profundidad, de las ramas finas al tronco, y no al revés del crecimiento: el crecimiento va de la raíz por la distancia del camino. Al marchitarse se dobla hacia el suelo y se apaga.
- **Pliegue.** La tira de papel doblada N veces sigue la sucesión de plegado regular. Cada doblez sigue una onda que va de los grandes a los pequeños y se mueve entre 36° y 90°. El raster sólo depende del paso dentro del ciclo: bucle exacto de «Crecimiento» segundos, 24 s en el preset (`period: 24`). No es una reversa de la construcción: es un plegado que pasa por espirales, meandros y el dragón. Las demás gramáticas «respiran» igual por niveles.
- **Grosor de los presets existentes** de 1–1,8 a 2–2,6, para que las líneas midan una celda.

### WFC
- **Avanza.** El tablero tiene una columna más que la vista y la vista se desliza en fracciones de pieza. La columna que entra se decide a su paso, de abajo arriba, para que los pilares del acueducto nazcan del suelo. Al desplazarse una columna, los soportes de la nueva se cuentan desde la anterior. Izquierda y derecha no son marco.
- **Zonas.** Un disco se reabre: sus piezas se siguen viendo 0,8 s mientras se desvanecen. Se recuentan sólo los soportes del disco y su borde, y se decide de nuevo desde el centro. La siguiente zona llega «Espera» segundos después y no antes de que la anterior esté decidida en un 70 %. Una zona que su entorno obliga a dejar igual se salta. En la primera versión había ventanas de 1,4 s sin cambio (`model` 0,00 a 90 s): se corrigió.
- **Ambos modos continuos** arrancan con el tablero completo y reparan las contradicciones en su sitio, con radio máximo de 6 casillas. Tras 12 reparaciones fallidas seguidas, reabren todo el tablero con fundido; no ocurrió en las sondas.

### Líneas de campo
- **Movimiento.** Fuentes en caminos periódicos: las cargas orbitan y respiran, las espiras se deslizan y la corriente de la segunda se invierte (pasa por anti-Helmholtz), y los imanes giran uno alrededor del otro. Cada línea, con sus semillas de siempre, se vuelve a trazar cada 2, 3 o 10 pasos, escalonadas. Las líneas son función del paso, y `restore()` las vuelve a trazar igual.
- **Coste.** En movimiento, las espiras se trazan con 16 tramos de Biot–Savart en lugar de 32, con pasos un 50 % más largos y cada 10 pasos. Sin eso costaban unos 440 ms por segundo simulado; en la sonda final, como mucho 122 ms.

## Matriz por familia y preset

Columnas cualitativas. Las cifras de actividad y coste están en la sección siguiente.

### dla — Agregación (DLA)

| ID | Apariencia y mecanismo | Contrato | Cómo llena el lienzo | Glifos (legibilidad) | Paleta, escala, detalle, profundidad | Controles efectivos | Resoluciones y semillas; fallos y pausas | Usos | Cambio o razón para conservar |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cristal «Cristalización» | Copo dendrítico desde el centro (DLA clásico) | construcción | Hasta los lados (39–41 % a 64 filas) | Ramas de 1–2 celdas | Azul hielo; brillo por edad (puntas) | Todos | A 160 filas crece muy despacio (5 % a 30 s); se detiene al llegar al borde, como decía su texto | arte/organicas | Se conserva como construcción |
| coral «Arrecife» | Desde el suelo, ramas gruesas | construcción | Mitad inferior (30–34 %) | Bien | Coral; núcleo brillante | Todos | Igual (lento a 160) | arte/organicas | Se conserva |
| raices «Raíces eléctricas» | Desde arriba, descargas | construcción | 42–47 % | Bien | Violeta, plano | Todos | Igual | arte/organicas | Se conserva |
| corona «Corona» | Anillo con rayos | construcción | 38–40 % | Bien | Ámbar | Todos | Igual | arte/organicas | Se conserva |
| colonias «Colonias» | Varias semillas | construcción | 46–60 % | Bien | Verde lima | Todos | Igual | arte/organicas, tipo/texturas | Se conserva |
| escarcha «Escarcha viva» (nuevo) | Baño: cristales que nacen en los huecos, se ramifican y se funden | continuo | Todo el campo (23–63 %) | Ramas de 1–2 celdas | Azul hielo; puntas brillantes; fundido grano a grano | Adherencia, Caminantes, Grosor, Brillo, Vida | Estable a 48, 64 y 160 filas, 3 semillas; los cristales se relevan (prueba: menos del 50 % de las celdas siguen tras 1 min) | fondos/organicas, arte/organicas, tipo/texturas | Nuevo: fondo continuo |
| arrecife «Arrecife sin fin» (nuevo) | Bosque que sube mientras el campo avanza con el frente | continuo | Dos tercios inferiores (13–37 %) | Ramas gruesas | Coral; núcleo brillante; avance suave entre filas | Adherencia, Deriva, Caminantes, Grosor | Estable en las 3 resoluciones; con el tiempo quedan pocos árboles grandes (selección natural del DLA desde una línea) | fondos/organicas, arte/organicas | Nuevo |
| corona_viva «Corona que respira» (nuevo) | Anillo fijo del que brotan rayos que se funden y rebrotan | continuo | Centro y alrededores (14–32 %) | Bien | Ámbar | Adherencia, Deriva (hacia el anillo), Caminantes, Vida | Estable | arte/organicas (figura centrada) | Nuevo |

### crecimiento — Crecimiento diferencial

| ID | Apariencia y mecanismo | Contrato | Cómo llena el lienzo | Glifos | Paleta, escala, detalle, profundidad | Controles efectivos | Resoluciones y semillas; fallos y pausas | Usos | Cambio o razón |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| coral «Coral plegado» | Un círculo que se pliega hasta llenar su disco, relleno | construcción | Disco (29 %) | Trazo de 1,6 celdas y relleno a media tinta | Salmón | Todos | Se congela a los ~50 s; su texto lo dice (A-04) | arte/organicas | Se conserva |
| corteza «Corteza» | Línea anclada en meandros, con estela | construcción | Marco (50–58 %) | Bien | Arena | Todos | Se congela hacia los 3–4 min | arte/organicas, tipo/texturas | Se conserva |
| colonia «Colonia de pliegues» | Varias semillas que se empujan | construcción | Marco (44 %) | Bien | Verde | Todos | Se congela hacia los 2 min | arte/organicas, tipo/texturas | Se conserva |
| medusa «Tentáculos radiales» | Estrella que se expande en rayos | construcción | Disco (18 %) | Bien | Lila | Todos | Se congela a los ~10 s | arte/organicas | Se conserva |
| coral_vivo «Arrecife que se renueva» (nuevo) | Corales anchos rellenos en todo el marco; uno se deshace y brotan otros | continuo | Marco (28–64 %) | Trazo y relleno anchos (separación 0,085) | Salmón | Separación, Atracción, Alineación, Arista, Brotes, Vida | Estable en las 3 resoluciones, 3 semillas | fondos/organicas, tipo/texturas | Nuevo |
| meandros «Meandros sin fin» (nuevo) | Línea que se arruga con estela; se deshace y la relevan anillos | continuo | Marco (29–57 %) | Estela gris y trazo | Arena | Ídem | Estable | fondos/organicas, arte/organicas | Nuevo |
| colonia_viva «Pliegues que se relevan» (nuevo) | Laberinto fino en todo el marco que no se queda quieto | continuo | Marco (14–51 %; baja cuando se deshace una curva grande) | Trazo fino (separación 0,06) | Verde | Ídem | Estable; vacíos parciales temporales (ver «Pendiente») | fondos/organicas, arte/organicas | Nuevo |

### sistema_l — Sistemas L

| ID | Apariencia y mecanismo | Contrato | Cómo llena el lienzo | Glifos | Paleta, escala, detalle, profundidad | Controles efectivos | Resoluciones y semillas; fallos y pausas | Usos | Cambio o razón |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| helecho «Helecho recursivo» | Fronda que crece y se mece | construcción | Figura centrada (6–10 %) | Grosor 1,2 → 2,2: líneas de una celda | Verde | Todos | Crece 8 s y después sólo se mece (`visible` > 0, `model` 0) | arte/organicas, arte/curvas | Grosor ajustado |
| arbol3d «Bosque de símbolos» | Árbol 3D que gira | construcción | Figura (11–13 %) | Grosor 1,8 → 2,6 | Ámbar | Todos (Giro 3D) | Crece y gira | arte/organicas, arte/figuras | Grosor ajustado |
| raices «Raíces» | Raíces hacia abajo | construcción | Figura (4–8 %) | Grosor 1 → 2 | Cobre | Todos | Crece; casi no se mece (viento 0,05) | arte/organicas | Grosor ajustado |
| dragon «Curva del dragón» | Curva del dragón dibujada por la tortuga | construcción | Figura (16–22 %) | Grosor 1,2 → 2,2 | Lila | Todos menos Viento | Sin viento queda quieta a los 14 s (A-04, ahora dicho en su texto) | arte/geometricas, arte/curvas | Grosor ajustado; su versión viva es `dragon_pliegue` |
| jardin «Jardín que se renueva» (nuevo) | 7 helechos de varias alturas y edades | continuo | Banda inferior a todo lo ancho (18–32 %) | Grosor 2,6 | Verde | Generaciones, Ángulo, Acortar, Variación, Crecimiento, Viento, Grosor | Estable en 48, 96 y 256 filas, 3 semillas; todas las plantas se relevan en 3 min (prueba) | arte/organicas (no fondos: ver cambios compartidos) | Nuevo |
| raices_vivas «Raíces que cuelgan» (nuevo) | 7 raíces que cuelgan del borde de arriba | continuo | Banda superior (9–25 %) | Grosor 2,2 | Cobre | Ídem | Estable; momentos tranquilos con `model` bajo (mínimo 0,19 %) pero mayor que 0 | arte/organicas | Nuevo |
| dragon_pliegue «Dragón que se pliega» (nuevo) | Tira doblada 8 veces que se pliega y despliega en onda | bucle de 24 s | Figura (4–8 % desde 30 s; hasta 21 % en la fase plegada a 48 filas) | Grosor 3,4, 256 tramos | Lila; más brillo hacia el extremo libre | Generaciones, Crecimiento (= periodo), Grosor | Bucle exacto (prueba: raster en s y s + 720 pasos idénticos) | arte/geometricas, arte/curvas | Nuevo |

### wfc — Arquitectura por restricciones

| ID | Apariencia y mecanismo | Contrato | Cómo llena el lienzo | Glifos | Paleta, escala, detalle, profundidad | Controles efectivos | Resoluciones y semillas; fallos y pausas | Usos | Cambio o razón |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| placa «Placa base» | Pistas y chips casilla a casilla | construcción | Marco (11–20 %) | Piezas de 5 × 5 a 96 filas | Verde | Todos | Pausa deliberada de 6 s y reconstrucción | arte/geometricas | Se conserva |
| plano «Plano de planta» | Habitaciones y muros | construcción | Marco (hasta 76 %) | Bien | Hueso | Todos | Pausa de 8 s | arte/geometricas | Se conserva |
| acueducto «Acueducto» | Arcadas con gravedad | construcción | Marco | Bien | Ámbar | Todos | Pausa de 8 s | arte/geometricas | Se conserva |
| laberinto «Ciudad densa» | Muros densos sólo en líneas | construcción | 47–61 % | Denso | Azul | Todos | Pausa de 5 s (las sondas a 60, 120 y 600 s caen en pausas: comprobado con traza, ciclo de 10,5 s) | arte/geometricas, tipo/texturas | Se conserva |
| onda «La onda que colapsa» | Mapa de entropía | construcción | 21–38 % | Bien | Rosa | Todos | Pausa de 4 s | arte/geometricas | Se conserva (nombre evocador; «mapa de entropía» en aka) |
| placa_sin_fin «Placa sin fin» (nuevo) | Placa de circuitos que se desliza; las pistas nuevas se deciden al entrar | continuo | Marco (15–32 %) | Bien | Verde | Densidad, Avance, Vista | Estable en 3 resoluciones y 3 semillas; todas las adyacencias se cumplen siempre (prueba) | fondos/geometricas, terminal/consola | Nuevo |
| viaducto «Viaducto en marcha» (nuevo) | Paisaje lateral de arcadas en varios niveles | continuo | Marco (18–34 %) | Bien | Ámbar | Densidad, Avance | Estable | fondos/geometricas | Nuevo |
| ciudad_viva «Ciudad que se rehace» (nuevo) | Plano denso con manchas que se apagan y se reconstruyen desde su centro | continuo | Marco (57–72 %) | Bien | Hueso | Densidad, Ritmo, Espera, Vista | Estable; sin ventanas quietas tras la corrección | fondos/geometricas, tipo/texturas | Nuevo |

### campos_em — Líneas de campo

| ID | Apariencia y mecanismo | Contrato | Cómo llena el lienzo | Glifos | Paleta, escala, detalle, profundidad | Controles efectivos | Resoluciones y semillas; fallos y pausas | Usos | Cambio o razón |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dipolo «Arcos entre dos cargas» (antes «Dipolo eléctrico») | Líneas de Coulomb de + a − en 3D, con cámara que gira | construcción | Figura (15–17 %) | Líneas de 2,4 px a 96 filas | Azul; profundidad por brillo | Todos | Crece 2–3 s; después sólo cámara y partículas | arte/figuras | Nombre visual (A-09) |
| repulsion «Cargas que se repelen» | Dos cargas positivas sobre bandas equipotenciales | construcción | Lleno (83 %, bandas) | Bien | Rojo | Todos | Ídem | arte/figuras | Se conserva |
| helmholtz «Dos anillos y su flujo» (antes «Espiras de Helmholtz») | Dos espiras, vista de flujo | construcción | Figura (19 %) | Bien | Verde | Todos | Ídem | arte/figuras | Nombre visual |
| cuadrupolo «Cuatro polos cruzados» (antes «Cuadrupolo») | Cuatro cargas alternas | construcción | Figura (13 %) | Bien | Lila | Todos | Ídem | arte/figuras | Nombre visual |
| iman «Imán» | Dipolo magnético | construcción | Figura (11–13 %) | Bien | Ámbar | Todos | Ídem | arte/figuras | Se conserva |
| dipolo_vivo «Cargas que giran» (nuevo) | Las cargas orbitan y respiran; los arcos se estiran y se recogen | continuo | Figura (12–19 %) | Bien | Azul | Todos (Movimiento) | Estable en 48, 96 y 192 filas, 3 semillas | arte/figuras, arte/curvas | Nuevo |
| espiras_vivas «Espiras que laten» (nuevo) | Espiras que se acercan y separan mientras una corriente se invierte | continuo | Figura (18–26 %) | Bien | Verde; vista de flujo | Ídem | Estable; el coste más alto del grupo | arte/figuras | Nuevo |
| imanes «Imanes que bailan» (nuevo) | Dos imanes que giran uno alrededor del otro y reconectan sus lazos | continuo | Figura (12–16 %) | Bien | Ámbar | Ídem | Estable | arte/figuras, arte/curvas | Nuevo |

## Sonda temporal antes y después

`scripts/families-time.ts`. Antes: 2 semillas, `--res=min,def,max --long=600`, sobre `6702598`. Después: 3 semillas, misma configuración, sobre esta rama. `model`: cambio medio del raster en medio segundo con la cámara quieta (%). `lit`: celdas con tinta (%). En las cifras siguientes, «def» es la resolución por defecto del preset (64 filas en DLA y 96 en el resto). Los JSON quedan en `.cache/` del worktree: `antes-a.json` y `antes-b.json` (antes), `final-a.json` y `final-b.json` (después), sin subir.

#### dla

| Preset | Antes (def, semilla base): 0 / 30 / 60 / 120 / 600 s, model % · lit % | Después (def, misma semilla) | Después: model mínimo desde 30 s (todas las semillas y resoluciones) | Después: lit desde 30 s, mín–máx (%) | Coste máx. (ms por s simulado, def) |
| --- | --- | --- | --- | --- | --- |
| cristal (Cristalización) | 0,48 · 5 / 0,00 · 41 / 0,00 · 41 / 0,00 · 41 / 0,00 · 41 | 0,48 · 5 / 0,00 · 41 / 0,00 · 41 / 0,00 · 41 / 0,00 · 41 | 0,00 | 5–41 | 11 |
| coral (Arrecife) | 0,24 · 6 / 0,09 · 18 / 0,03 · 25 / 0,00 · 34 / 0,00 · 34 | 0,24 · 6 / 0,09 · 18 / 0,03 · 25 / 0,00 · 34 / 0,00 · 34 | 0,00 | 4–39 | 0 |
| raices (Raíces eléctricas) | 0,48 · 11 / 0,00 · 42 / 0,00 · 42 / 0,00 · 42 / 0,00 · 42 | 0,48 · 11 / 0,00 · 42 / 0,00 · 42 / 0,00 · 42 / 0,00 · 42 | 0,00 | 10–49 | 0 |
| corona (Corona) | 1,0 · 10 / 0,00 · 40 / 0,00 · 40 / 0,00 · 40 / 0,00 · 40 | 1,0 · 10 / 0,00 · 40 / 0,00 · 40 / 0,00 · 40 / 0,00 · 40 | 0,00 | 7–46 | 5 |
| colonias (Colonias) | 0,89 · 11 / 0,00 · 46 / 0,00 · 46 / 0,00 · 46 / 0,00 · 46 | 0,89 · 11 / 0,00 · 46 / 0,00 · 46 / 0,00 · 46 / 0,00 · 46 | 0,00 | 11–61 | 0 |
| escarcha (Escarcha viva) | nuevo | 2,7 · 10 / 5,1 · 53 / 2,0 · 51 / 2,8 · 42 / 0,41 · 36 | 0,40 | 23–63 | 31 |
| arrecife (Arrecife sin fin) | nuevo | 0,52 · 15 / 4,0 · 36 / 4,9 · 37 / 4,1 · 28 / 2,3 · 23 | 0,77 | 13–37 | 1 |
| corona_viva (Corona que respira) | nuevo | 1,5 · 13 / 2,2 · 19 / 2,1 · 18 / 1,2 · 23 / 1,6 · 14 | 1,1 | 14–32 | 18 |

#### crecimiento

| Preset | Antes (def, semilla base): 0 / 30 / 60 / 120 / 600 s, model % · lit % | Después (def, misma semilla) | Después: model mínimo desde 30 s (todas las semillas y resoluciones) | Después: lit desde 30 s, mín–máx (%) | Coste máx. (ms por s simulado, def) |
| --- | --- | --- | --- | --- | --- |
| coral (Coral plegado) | 1,5 · 8 / 0,47 · 29 / 0,00 · 29 / 0,00 · 29 / 0,00 · 29 | 1,5 · 8 / 0,47 · 29 / 0,00 · 29 / 0,00 · 29 / 0,00 · 29 | 0,00 | 27–33 | 15 |
| corteza (Corteza) | 0,82 · 10 / 1,1 · 31 / 1,3 · 46 / 1,3 · 58 / 0,00 · 52 | 0,82 · 10 / 1,1 · 31 / 1,3 · 46 / 1,3 · 58 / 0,00 · 52 | 0,00 | 29–75 | 16 |
| colonia (Colonia de pliegues) | 2,8 · 7 / 2,6 · 26 / 2,5 · 38 / 0,00 · 44 / 0,00 · 44 | 2,8 · 7 / 2,6 · 26 / 2,5 · 38 / 0,00 · 44 / 0,00 · 44 | 0,00 | 21–56 | 11 |
| medusa (Tentáculos radiales) | 0,73 · 18 / 0,00 · 18 / 0,00 · 18 / 0,00 · 18 / 0,00 · 18 | 0,73 · 18 / 0,00 · 18 / 0,00 · 18 / 0,00 · 18 / 0,00 · 18 | 0,00 | 14–26 | 16 |
| coral_vivo (Arrecife que se renueva) | nuevo | 2,0 · 11 / 2,8 · 32 / 4,8 · 45 / 4,0 · 51 / 3,8 · 53 | 1,8 | 28–62 | 32 |
| meandros (Meandros sin fin) | nuevo | 0,67 · 9 / 0,97 · 31 / 1,7 · 48 / 0,91 · 36 / 0,86 · 35 | 0,86 | 29–57 | 10 |
| colonia_viva (Pliegues que se relevan) | nuevo | 1,8 · 7 / 2,9 · 30 / 1,5 · 35 / 3,3 · 26 / 2,6 · 27 | 1,5 | 14–51 | 18 |

#### sistema_l

| Preset | Antes (def, semilla base): 0 / 30 / 60 / 120 / 600 s, model % · lit % | Después (def, misma semilla) | Después: model mínimo desde 30 s (todas las semillas y resoluciones) | Después: lit desde 30 s, mín–máx (%) | Coste máx. (ms por s simulado, def) |
| --- | --- | --- | --- | --- | --- |
| helecho (Helecho recursivo) | 0,04 · 0 / 0,00 · 7 / 0,00 · 7 / 0,00 · 7 / 0,00 · 7 | 0,06 · 0 / 0,00 · 8 / 0,00 · 7 / 0,00 · 7 / 0,00 · 8 | 0,00 | 6–10 | 0 |
| arbol3d (Bosque de símbolos) | 0,02 · 0 / 0,00 · 10 / 0,00 · 11 / 0,00 · 11 / 0,00 · 11 | 0,03 · 0 / 0,00 · 11 / 0,00 · 11 / 0,00 · 12 / 0,00 · 12 | 0,00 | 10–13 | 0 |
| raices (Raíces) | 0,02 · 0 / 0,00 · 5 / 0,00 · 5 / 0,00 · 5 / 0,00 · 5 | 0,03 · 0 / 0,00 · 6 / 0,00 · 6 / 0,00 · 5 / 0,00 · 6 | 0,00 | 4–8 | 0 |
| dragon (Curva del dragón) | 0,32 · 1 / 0,00 · 14 / 0,00 · 14 / 0,00 · 14 / 0,00 · 14 | 0,56 · 1 / 0,00 · 18 / 0,00 · 18 / 0,00 · 18 / 0,00 · 18 | 0,00 | 16–22 | 0 |
| jardin (Jardín que se renueva) | nuevo | 1,5 · 24 / 1,6 · 21 / 0,63 · 19 / 2,5 · 20 / 2,2 · 18 | 0,16 | 18–32 | 11 |
| raices_vivas (Raíces que cuelgan) | nuevo | 0,79 · 13 / 1,6 · 18 / 1,4 · 16 / 0,87 · 9 / 0,25 · 13 | 0,19 | 9–25 | 0 |
| dragon_pliegue (Dragón que se pliega) | nuevo | 3,3 · 4 / 3,9 · 4 / 4,1 · 5 / 3,3 · 4 / 3,3 · 4 | 3,3 | 4–8 | 0 |

#### wfc

| Preset | Antes (def, semilla base): 0 / 30 / 60 / 120 / 600 s, model % · lit % | Después (def, misma semilla) | Después: model mínimo desde 30 s (todas las semillas y resoluciones) | Después: lit desde 30 s, mín–máx (%) | Coste máx. (ms por s simulado, def) |
| --- | --- | --- | --- | --- | --- |
| placa (Placa base) | 4,3 · 10 / 0,00 · 14 / 0,00 · 18 / 3,7 · 13 / 0,00 · 14 | 4,3 · 10 / 0,00 · 14 / 0,00 · 18 / 3,7 · 13 / 0,00 · 14 | 0,00 | 2–28 | 59 |
| plano (Plano de planta) | 4,5 · 8 / 4,1 · 28 / 4,6 · 47 / 0,00 · 76 / 4,5 · 38 | 4,5 · 8 / 4,1 · 28 / 4,6 · 47 / 0,00 · 76 / 4,5 · 38 | 0,00 | 24–76 | 10 |
| acueducto (Acueducto) | 6,0 · 19 / 0,00 · 34 / 6,2 · 19 / 3,5 · 8 / 0,00 · 22 | 6,0 · 19 / 0,00 · 34 / 6,2 · 19 / 3,5 · 8 / 0,00 · 22 | 0,00 | 8–37 | 1 |
| laberinto (Ciudad densa) | 4,5 · 16 / 31,8 · 5 / 0,00 · 47 / 0,00 · 47 / 0,00 · 46 | 4,5 · 16 / 31,8 · 5 / 0,00 · 47 / 0,00 · 47 / 0,00 · 46 | 0,00 | 4–61 | 57 |
| placa_sin_fin (Placa sin fin) | nuevo | 9,8 · 25 / 9,6 · 19 / 8,1 · 17 / 8,2 · 15 / 11,1 · 22 | 5,4 | 15–32 | 0 |
| viaducto (Viaducto en marcha) | nuevo | 13,0 · 25 / 6,6 · 26 / 6,3 · 29 / 6,6 · 30 / 6,6 · 22 | 3,3 | 18–34 | 0 |
| ciudad_viva (Ciudad que se rehace) | nuevo | 0,46 · 71 / 1,3 · 67 / 1,3 · 65 / 2,3 · 68 / 1,9 · 66 | 0,99 | 57–72 | 4 |
| onda (La onda que colapsa) | 1,8 · 9 / 0,00 · 30 / 1,7 · 27 / 1,6 · 23 / 1,5 · 30 | 1,8 · 9 / 0,00 · 30 / 1,7 · 27 / 1,6 · 23 / 1,5 · 30 | 0,00 | 10–38 | 1 |

#### campos_em

| Preset | Antes (def, semilla base): 0 / 30 / 60 / 120 / 600 s, model % · lit % | Después (def, misma semilla) | Después: model mínimo desde 30 s (todas las semillas y resoluciones) | Después: lit desde 30 s, mín–máx (%) | Coste máx. (ms por s simulado, def) |
| --- | --- | --- | --- | --- | --- |
| dipolo (Arcos entre dos cargas) | 2,5 · 5 / 0,00 · 16 / 0,00 · 15 / 0,00 · 15 / 0,00 · 17 | 2,5 · 5 / 0,00 · 16 / 0,00 · 15 / 0,00 · 15 / 0,00 · 17 | 0,00 | 15–21 | 0 |
| repulsion (Cargas que se repelen) | 1,7 · 78 / 0,00 · 83 / 0,00 · 84 / 0,00 · 85 / 0,00 · 83 | 1,7 · 78 / 0,00 · 83 / 0,00 · 84 / 0,00 · 85 / 0,00 · 83 | 0,00 | 83–86 | 0 |
| helmholtz (Dos anillos y su flujo) | 1,3 · 7 / 0,00 · 19 / 0,00 · 21 / 0,00 · 18 / 0,00 · 19 | 1,3 · 7 / 0,00 · 19 / 0,00 · 21 / 0,00 · 18 / 0,00 · 19 | 0,00 | 18–23 | 0 |
| cuadrupolo (Cuatro polos cruzados) | 3,2 · 6 / 0,00 · 14 / 0,00 · 13 / 0,00 · 12 / 0,00 · 14 | 3,2 · 6 / 0,00 · 14 / 0,00 · 13 / 0,00 · 12 / 0,00 · 14 | 0,00 | 12–18 | 0 |
| iman (Imán) | 1,8 · 3 / 0,00 · 13 / 0,00 · 11 / 0,00 · 13 / 0,00 · 12 | 1,8 · 3 / 0,00 · 13 / 0,00 · 11 / 0,00 · 13 / 0,00 · 12 | 0,00 | 11–16 | 0 |
| dipolo_vivo (Cargas que giran) | nuevo | 2,4 · 4 / 8,1 · 15 / 10,4 · 15 / 8,6 · 15 / 5,9 · 14 | 4,9 | 12–19 | 111 |
| espiras_vivas (Espiras que laten) | nuevo | 1,9 · 7 / 4,1 · 19 / 6,5 · 23 / 6,7 · 19 / 5,0 · 20 | 3,1 | 18–26 | 122 |
| imanes (Imanes que bailan) | nuevo | 2,8 · 5 / 6,8 · 13 / 5,6 · 13 / 7,1 · 14 / 7,5 · 15 | 5,4 | 12–16 | 39 |

Lectura: todos los presets continuos y el bucle tienen `model` > 0 en todas las muestras desde 30 s, con 3 semillas a la resolución por defecto (hasta 600 s) y 1 semilla a la mínima y a la máxima. El mínimo es 0,16 % (`jardin`). `lit` queda entre el 4 % (`dragon_pliegue`, una curva fina centrada, no un fondo) y el 72 % (`ciudad_viva`). Los presets de construcción muestran 0,00 después de terminar, y así lo dicen sus textos: las pausas de WFC tablero a tablero son deliberadas (6–8 s), y la de «Ciudad densa» a 60, 120 y 600 s cae en su espera, según la traza. Coste: el más alto es el de las líneas de campo en movimiento, con picos de 111–122 ms por segundo simulado a 96 filas. La sonda mide sólo `step()`; el coste de `render()` (jardín, líneas de campo) no está en la columna.

## Verificación

- `npx tsc --noEmit -p .`: sin errores.
- `npx vitest run tests/unit/families.test.ts tests/unit/families-compat.test.ts tests/unit/family-dla.test.ts tests/unit/family-crecimiento.test.ts tests/unit/family-sistema_l.test.ts tests/unit/family-wfc.test.ts tests/unit/family-campos.test.ts`: 7 archivos, 287 pruebas en verde (además, `family-host` y `runtime-families`: 38 en verde).
- `families-compat`: los 86 presets originales dibujan exactamente lo mismo. No se subió ninguna versión de familia.
- `INERT` en `tests/unit/families.test.ts`: `dla.life` y `crecimiento.life` sólo cuentan con «Renovación: sí»; `wfc.drift` sólo con «Flujo: avanza sin fin».
- Pruebas propias de cada preset continuo, cortas y a resolución mínima: el raster sigue cambiando, no queda vacío y `snapshot()/restore()` es exacto con el estado nuevo. Además: relevo de cristales (DLA), avance del campo (DLA), relevo de curvas (crecimiento), relevo de plantas y bucle exacto (sistemas L), adyacencias siempre válidas en los modos continuos (WFC) y campo quieto sin movimiento (líneas de campo).
- Paridad entre motores (`families-qa --compare`): `node scripts/families-qa.mjs --ids=dla,crecimiento,sistema_l,wfc,campos_em --compare`: los 38 presets, sin errores, r = 1,0000 y 100 % de glifos iguales en los dos motores. Dos recursos externos de la página de QA dieron 403 (red del entorno), sin efecto en el dibujo.

## Cambios compartidos que harían falta (no hechos)

1. **`figure` por preset.** `FamilyMeta.figure` es de familia. El jardín y las raíces de `sistema_l` llenan el lienzo a lo ancho, pero en un lienzo vertical `figureFit` las reduce como a una figura. Por eso se quedan en «arte/organicas» y no en «fondos/organicas». Una anulación por preset (por ejemplo `FamilyPreset.figure?: boolean`, leída por `FIGURES`/`figureFit` según el preset activo) permitiría ofrecerlas como fondo. Lo mismo valdría para un futuro campo de cargas que llene el lienzo.
2. **Periodo de un bucle por parámetro.** El panel muestra «Bucle de N s» con `FamilyPreset.period`. En `sistema_l` con «Se pliega en ciclo», el periodo es el parámetro «Crecimiento», y si la persona lo cambia el panel sigue mostrando el del preset. Un `period` declarado por parámetro (por ejemplo `TimeRule` con `periodParam`) lo resolvería.
3. **`scripts/families-time.ts`** mide el coste sólo de `step()`. En `sistema_l` (jardín) y `campos_em`, la mayor parte del coste está en `render()` (líneas AA) y la sonda marca 0 ms. Convendría medir también el render.

## Pendiente o no resuelto (con evidencia)

- **DLA, presets de construcción a 160 filas (A-05).** Crecen muy despacio: 5–11 % de tinta a 30 s, contra 39–60 % a 64 filas. No se congelan ni quedan vacíos, pero tardan minutos en completarse. El número de caminantes del camino anterior está fijado por compatibilidad y no se escaló. Los presets con renovación sí escalan.
- **`colonia_viva`.** Cuando se deshace una curva grande quedan zonas vacías un rato: la tinta baja al 14–25 % y luego se recupera. Es el diseño (el relevo se ve), pero puede leerse como un hueco.
- **`dragon_pliegue`.** Poca tinta en las fases estiradas (4–8 % a 96 filas). Es una figura de línea; se dejó el grosor en 3,4 para no empastar las fases plegadas.
- **Coste de las líneas de campo en movimiento.** Picos de 122 ms (`espiras_vivas`) y 111 ms (`dipolo_vivo`) por segundo simulado en la sonda final; en una ejecución anterior con la máquina cargada, hasta 227 ms. Están dentro del límite de 250 pero son altos; el resto del grupo queda por debajo de 60 ms.
- **Nombres.** «La onda que colapsa» y «Curva del dragón» se conservan: son evocadores y su término técnico está en `aka`.
