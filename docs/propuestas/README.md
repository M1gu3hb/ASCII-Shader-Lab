# GLYPHOS — Propuestas y próximos cambios

Fecha: 7 de octubre de 2026. Rama: **glyphos-propuestas**.
Base: **9f3ef2aebee7262a88b1054ec1ca979116279991**, el mismo commit de la auditoría recibida.

Este espacio reúne las ideas de Miguel, su desarrollo como propuestas de producto, la investigación visual y el inventario completo de la auditoría. Las funciones nuevas y las correcciones están **pendientes de implementación**. En esta entrega se agregan documentos; el código del producto conserva el estado de main.

## Contenido

| Bloque | Documento | Contenido |
|---|---|---|
| Prioridad: auditoría | [AUDITORIA-PENDIENTES.md](AUDITORIA-PENDIENTES.md) | Los 48 puntos, su impacto, corrección propuesta y orden de trabajo. |
| Ideas 1–6 | [IDEAS-01-06.md](IDEAS-01-06.md) | Música, Azar propio, glifos propios, fondos de pantalla, visuales y carpetas. |
| Idea 7 | [IDEA-07-REACCION-DIFUSION.md](IDEA-07-REACCION-DIFUSION.md) | Investigación del video: RD Tool, Gray–Scott, variantes y sistemas relacionados. |
| Más familias visuales | [FAMILIAS-VISUALES.md](FAMILIAS-VISUALES.md) | Diez familias distintas, modelo, imagen, página y adaptación propuesta a ASCII. |
| Investigación 2026-10-09 | [INVESTIGACION-FAMILIAS-2026-10-09.md](INVESTIGACION-FAMILIAS-2026-10-09.md) | Licencias de las referencias, las 23 líneas implementadas, ampliaciones registradas aparte y la búsqueda de un modelo neuronal para glifos. |
| Estudio de glifos | [ESTUDIO-GLIFOS.md](ESTUDIO-GLIFOS.md) | Diseño de «Crea tus GLYPHOS»: flujo, asistente local, requisitos de una capa neuronal, datos, protección y exportaciones. |
| Procedencia | [RAMA-ANTERIOR.md](RAMA-ANTERIOR.md) | Verificación de independencia, integración y conservación de los commits anteriores. |
| Registro original | [REGISTRO-ORIGINAL.md](REGISTRO-ORIGINAL.md) | Nota previa completa, conservada como referencia de lo que pidió Miguel. |

## Orden de trabajo

1. Proteger los datos: E-01 y sus pruebas; acompañar con CI.
2. Recuperación de arranque y shaders; cerrar correctamente los medios.
3. Fidelidad de exportación y conservación de ediciones/importaciones.
4. Resolver los demás pendientes de la auditoría según impacto.
5. Implementar las propuestas por entregas pequeñas; validar exportación, guardado y compatibilidad en cada una.

**Nota (9 de octubre de 2026):** la auditoría quedó cerrada en main (ver `docs/correcciones/CIERRE-AUDITORIA.md`); [AUDITORIA-PENDIENTES.md](AUDITORIA-PENDIENTES.md) se conserva como registro histórico. Las familias visuales (la idea 7, las diez de [FAMILIAS-VISUALES.md](FAMILIAS-VISUALES.md) y doce más) y los glifos propios (idea 3) se implementaron en la rama de familias y glifos: ver [`docs/cambios/FAMILIAS-Y-GLIFOS.md`](../cambios/FAMILIAS-Y-GLIFOS.md).

Las ideas no son un compromiso de implementar todas simultáneamente. La prioridad expresa de Miguel son los errores de la auditoría; su arreglo se inicia cuando lo indique. El estudio de foto/video pausado no se reactiva por estas propuestas.
