import { useMemo } from 'react';
import { resolveScrim, type Scrim } from '../../shared/scrim';
import { useStudio } from '../store';
import { inkFor } from './legibility';

/**
 * The protected zone as the previews show it, for exported code: the same colour (from the text colour
 * chosen in «Fondo web»), opacity, blur and shape. Null while it is off.
 */
export function useExportScrim(): Scrim | null {
  const settings = useStudio(s => s.ui.viewOpts.scrim);
  const ink = useStudio(s => s.ui.viewOpts.ink);
  const bg = useStudio(s => s.entries[s.cursor]?.recipe.color.bg ?? '#000000');
  return useMemo(() => resolveScrim(settings, inkFor(ink, bg), bg), [settings, ink, bg]);
}

const LEVEL = { off: '', suave: 'suave', fuerte: 'fuerte', custom: 'a medida' } as const;

/** What the zone does in the code, or how to get one. */
export function ScrimCodeNote({ zone, on }: { zone: Scrim | null; on: boolean }) {
  const mode = useStudio(s => s.ui.viewOpts.scrim.mode);
  if (!zone) {
    return <p className="note">Zona protegida: sin activar. Si el fondo compite con tu texto, actívala en la vista «Fondo web» (o en la guía del fondo): se verá en la vista previa, entrará en la estimación de legibilidad y podrás traerla aquí.</p>;
  }
  if (!on) return <p className="note">Zona protegida: no se incluye en el código.</p>;
  const what = `Zona protegida (${LEVEL[mode]}: ${Math.round(zone.opacity * 100)} % de opacidad, ${zone.blur} px de desenfoque)`;
  return (
    <p className="note">
      {zone.shape === 'block'
        ? <>{what}, tras el texto: el código trae la clase <code>glyphos-zona</code>; ponla en cada bloque de texto que vaya encima del fondo.</>
        : zone.shape === 'full'
          ? <>{what}, en toda la página: la añade el propio script, entre el fondo y tu contenido.</>
          : <>{what}, en degradado: la añade el propio script, más fuerte a la izquierda en pantallas anchas y abajo en las altas, donde suele ir el texto.</>}
    </p>
  );
}
