import { POLY_SHAPES, normOptics, syncVersion, tidyTail, type OpticsKind, type Recipe } from '../../engine/recipe';
import { Color, F, Note, Seg, Select, Slider, useField, type Field } from '../controls';

/**
 * «Vidrio delante» (recipe.optics; PR #10 review V-06 and V-10): rain on glass or fluted glass in front of
 * whatever the piece shows (pattern, picture or text). Each cell reads the source from where the glass sends
 * it, before the characters are chosen. Closing of PR #10 (I-36…I-43): a sphere or a polyhedron of glass, with
 * its index of refraction, thickness, dispersion and tint.
 */
const SHAPES: Array<[number, string]> = [[0, 'Prisma'], [1, 'Lente'], [2, 'Contorno'], [3, 'Cascada'], [4, 'Ondas']];
const POLY_NAMES: Record<(typeof POLY_SHAPES)[number], string> = { prisma: 'Prisma triangular', cubo: 'Cubo', octaedro: 'Octaedro', dodecaedro: 'Dodecaedro', icosaedro: 'Icosaedro (gema)' };
const POLYS: Array<[number, string]> = POLY_SHAPES.map((s, i) => [i, POLY_NAMES[s]]);
const solidKind = (k: OpticsKind | 'no' | undefined) => k === 'esfera' || k === 'poliedro';

/**
 * The kind of glass: choosing one puts it in front with its defaults (or keeps the settings it had: a sphere
 * and a polyhedron share theirs); «Ninguno» takes it away.
 */
const KIND: Field<'no' | OpticsKind> = {
  key: 'optics.kind',
  get: (r: Recipe) => r.optics?.kind ?? 'no',
  set: (r: Recipe, k) => {
    if (k === 'no') delete r.optics;
    else {
      const keep = r.optics && (r.optics.kind === k || (solidKind(r.optics.kind) && solidKind(k)));
      r.optics = normOptics({ ...(keep ? r.optics : {}), kind: k, ...(keep && r.optics?.kind !== k ? { profile: undefined } : {}) })!;
    }
    tidyTail(r);
    syncVersion(r);
  },
};

const deg = (v: number) => Math.round(v) + '°';

export function GlassControls() {
  const kind = useField(F<OpticsKind | undefined>('optics.kind'));
  const solid = solidKind(kind);
  return (
    <>
      <Seg f={KIND} label="Vidrio delante" opts={[['no', 'Ninguno'], ['lluvia', 'Lluvia'], ['acanalado', 'Acanalado'], ['esfera', 'Esfera'], ['poliedro', 'Poliedro']]}
        desc={{
          no: 'Nada delante de la pieza.',
          lluvia: 'Gotas que resbalan y dejan rastro sobre un cristal empañado: dentro de cada gota se ve lo de detrás, invertido.',
          acanalado: 'Un cristal de canales que reparte y desplaza lo de detrás; se mueve despacio de lado.',
          esfera: 'Una bola de vidrio delante: refracta lo de detrás (invertido, o como una lupa si es fina), refleja la luz en el borde y proyecta su sombra.',
          poliedro: 'Un sólido de vidrio que gira despacio: cada cara refracta lo de detrás a su manera y sus aristas brillan.',
        }} />
      {kind && !solid && (
        <>
          <Slider f={F('optics.amount')} label="Refracción" min={0} max={1} />
          <Slider f={F('optics.scale')} label={kind === 'lluvia' ? 'Tamaño de las gotas' : 'Ancho de los canales'} min={0.4} max={3} />
          <Slider f={F('optics.speed')} label={kind === 'lluvia' ? 'Velocidad de las gotas' : 'Deriva del cristal'} min={0} max={2} />
          <Slider f={F('optics.angle')} label={kind === 'lluvia' ? 'Inclinación' : 'Dirección'} min={-90} max={90} step={1} fmt={deg} />
          {kind === 'lluvia'
            ? <Slider f={F('optics.profile')} label="Gotitas" min={0} max={1} />
            : <Select f={F<number>('optics.profile')} label="Forma del canal" opts={SHAPES} minWidth={200} />}
          <Slider f={F('optics.shine')} label="Brillo del cristal" min={0} max={1} />
          {kind === 'lluvia' && <Slider f={F('optics.fog')} label="Vaho" min={0} max={1} />}
        </>
      )}
      {solid && (
        <>
          {kind === 'poliedro' && <Select f={F<number>('optics.profile')} label="Sólido" opts={POLYS} minWidth={200} />}
          <Slider f={F('optics.scale')} label="Tamaño" min={0.4} max={3} />
          <Slider f={F('optics.x')} label="Posición horizontal" min={-1.2} max={1.2} />
          <Slider f={F('optics.y')} label="Posición vertical" min={-0.6} max={0.6} />
          <Slider f={F('optics.speed')} label={kind === 'esfera' ? 'Deriva' : 'Giro'} min={0} max={2} />
          {kind === 'poliedro' && <Slider f={F('optics.angle')} label="Inclinación del eje" min={-90} max={90} step={1} fmt={deg} />}
          <Slider f={F('optics.ior')} label="Índice de refracción" min={1.05} max={2.4} fmt={v => v.toFixed(2).replace('.', ',')} />
          <Slider f={F('optics.thick')} label="Grosor" min={0.15} max={1} />
          <Slider f={F('optics.amount')} label="Refracción" min={0} max={1} />
          <Slider f={F('optics.disp')} label="Dispersión (arcoíris)" min={0} max={1} />
          <Slider f={F('optics.shine')} label="Brillo y reflejo (Fresnel)" min={0} max={1} />
          <Color f={F('optics.tint')} label="Tinte del vidrio" />
          <Slider f={F('optics.fog')} label="Opacidad del tinte" min={0} max={1} />
        </>
      )}
      {kind && <Note>Funciona sobre cualquier fuente: el patrón, tu imagen, tu video o tu texto.</Note>}
    </>
  );
}
