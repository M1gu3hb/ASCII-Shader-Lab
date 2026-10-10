import { normOptics, syncVersion, type OpticsKind, type Recipe } from '../../engine/recipe';
import { F, Note, Seg, Select, Slider, useField, type Field } from '../controls';

/**
 * «Vidrio delante» (recipe.optics; PR #10 review V-06 and V-10): rain on glass or fluted glass in front of
 * whatever the piece shows (pattern, picture or text). Each cell reads the source from where the glass sends
 * it, before the characters are chosen.
 */
const SHAPES: Array<[number, string]> = [[0, 'Prisma'], [1, 'Lente'], [2, 'Contorno'], [3, 'Cascada'], [4, 'Ondas']];

/** The kind of glass: choosing one puts it in front with its defaults (or keeps the settings it had); «Ninguno» takes it away. */
const KIND: Field<'no' | OpticsKind> = {
  key: 'optics.kind',
  get: (r: Recipe) => r.optics?.kind ?? 'no',
  set: (r: Recipe, k) => {
    if (k === 'no') delete r.optics;
    else r.optics = normOptics({ ...(r.optics?.kind === k ? r.optics : {}), kind: k })!;
    syncVersion(r);
  },
};

export function GlassControls() {
  const kind = useField(F<OpticsKind | undefined>('optics.kind'));
  return (
    <>
      <Seg f={KIND} label="Vidrio delante" opts={[['no', 'Ninguno'], ['lluvia', 'Lluvia'], ['acanalado', 'Acanalado']]}
        desc={{ no: 'Nada delante de la pieza.', lluvia: 'Gotas que resbalan y dejan rastro sobre un cristal empañado: dentro de cada gota se ve lo de detrás, invertido.', acanalado: 'Un cristal de canales que reparte y desplaza lo de detrás; se mueve despacio de lado.' }} />
      {kind && (
        <>
          <Slider f={F('optics.amount')} label="Refracción" min={0} max={1} />
          <Slider f={F('optics.scale')} label={kind === 'lluvia' ? 'Tamaño de las gotas' : 'Ancho de los canales'} min={0.4} max={3} />
          <Slider f={F('optics.speed')} label={kind === 'lluvia' ? 'Velocidad de las gotas' : 'Deriva del cristal'} min={0} max={2} />
          <Slider f={F('optics.angle')} label={kind === 'lluvia' ? 'Inclinación' : 'Dirección'} min={-90} max={90} step={1} fmt={v => Math.round(v) + '°'} />
          {kind === 'lluvia'
            ? <Slider f={F('optics.profile')} label="Gotitas" min={0} max={1} />
            : <Select f={F<number>('optics.profile')} label="Forma del canal" opts={SHAPES} minWidth={200} />}
          <Slider f={F('optics.shine')} label="Brillo del cristal" min={0} max={1} />
          {kind === 'lluvia' && <Slider f={F('optics.fog')} label="Vaho" min={0} max={1} />}
          <Note>Funciona sobre cualquier fuente: el patrón, tu imagen, tu video o tu texto.</Note>
        </>
      )}
    </>
  );
}
