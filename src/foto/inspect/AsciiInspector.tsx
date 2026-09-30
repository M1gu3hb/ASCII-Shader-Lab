/**
 * An ASCII layer's style: the lab's recipe in a compact form, only the controls that matter for a zone of
 * a photo (source, pattern, characters, font, cell, tone, colour, dithering, light, motion, mix). Labels
 * and ranges follow the lab's panels (src/studio/panels.tsx) so the two studios speak the same language.
 */
import { CHARSETS, FAMILY_NAMES, FONTS, PATTERNS, charsetIdOf, fontById, patternById } from '../../engine/catalog';
import type { GlyphMode, Recipe } from '../../engine/recipe';
import { updateLayer } from '../../project/store';
import type { AsciiLayer, LayerFit, Project } from '../../project/types';
import { CURATED } from '../../random/palettes';
import { ColorInput, ColorStops, Note, Section, SegGroup, Select, Slider, TextField, Toggle } from '../controls';
import { openInLab } from '../bridge';
import { openSheet } from '../ui';

const PATTERN_OPTS = PATTERNS.map(p => ({ value: p.id, label: p.name, group: FAMILY_NAMES[p.family] }));
const CHARSET_OPTS = [
  ...CHARSETS.map(c => ({ value: c.id, label: c.name, desc: [...c.chars].slice(0, 14).join(''), group: c.ascii ? 'ASCII' : 'Unicode' })),
  { value: 'custom', label: 'Tus caracteres', desc: 'Los que escribes abajo.', group: 'Tuyos' },
];
const FONT_OPTS = FONTS.map(f => ({ value: f.id, label: f.name }));
const MODE_OPTS: Array<[GlyphMode, string]> = [['density', 'Densidad'], ['lines', 'Líneas'], ['scramble', 'Revuelto'], ['words', 'Palabras']];
const FITS: Array<[LayerFit, string]> = [['cover', 'Cubrir'], ['contain', 'Completa'], ['fill', 'Estirar']];

export function sourceOptions(p: Project, withStyle: boolean) {
  return [
    ...p.sources.map(s => ({ value: s.id, label: s.name || (s.kind === 'video' ? 'Video' : 'Foto'), desc: `${s.kind === 'video' ? 'Video' : s.kind === 'cutout' ? 'Recorte' : 'Foto'} · ${s.w}×${s.h}` })),
    { value: 'below', label: 'Lo que hay debajo', desc: 'La composición de las capas bajo esta (con sus efectos).' },
    ...(withStyle ? [{ value: 'style', label: 'Sin foto: su propio patrón', desc: 'El patrón o el texto de la receta, como en el laboratorio.' }] : []),
  ];
}

export function AsciiInspector({ l, p }: { l: AsciiLayer; p: Project }) {
  const r = l.style;
  const set = (fn: (s: Recipe) => void, key: string) => updateLayer(l.id, x => { fn((x as AsciiLayer).style); }, 'style.' + key);
  const setL = (patch: Partial<AsciiLayer>, key = '') => updateLayer(l.id, patch as never, key);
  const csId = charsetIdOf(r.glyph.charset);
  const font = fontById(r.glyph.font);
  const pat = patternById(r.layers[0]?.pattern ?? 'nube');
  const own = l.source === 'style';
  const opaque = !!l.opaque;
  return (
    <>
      <p className="kind-badge graphic"><b>Render gráfico</b> (no es texto): el motor del laboratorio dibuja los caracteres como luz. Para texto que se copia, usa una capa de «Caracteres reales».</p>
      <Section title="Fuente">
        <Select label="Qué se convierte en caracteres" value={l.source} options={sourceOptions(p, true)} onChange={v => setL({ source: v })} minWidth={280} />
        {!own && l.source !== 'below' && <SegGroup label="Encaje de la foto" value={l.fit ?? 'cover'} opts={FITS} onPick={v => setL({ fit: v })} />}
        <Toggle label="Con su fondo (como en el laboratorio)" checked={opaque} onChange={v => setL({ opaque: v })}
          hint={opaque ? 'La pieza entera, con su color de fondo: el halo, el grano y la rejilla se ven.' : 'Sólo los caracteres: entre ellos se ve lo que hay debajo.'} />
        <div className="row2 btns">
          <button type="button" className="btn" onClick={() => openSheet('styles')}>Usar estilo del laboratorio</button>
          <button type="button" className="btn" onClick={() => void openInLab(l, p)}>Abrir estilo en el laboratorio</button>
        </div>
      </Section>
      {(own || r.media.mix > 0) && (
        <Section title="Patrón">
          <Select label="Patrón" value={pat.id} options={PATTERN_OPTS} minWidth={260} onChange={v => set(s => { if (s.layers[0]) s.layers[0].pattern = v; }, 'pattern')} />
          <Slider label={pat.a} value={r.layers[0]?.a ?? 0.5} min={0} max={1} def={0.5} onChange={v => set(s => { if (s.layers[0]) s.layers[0].a = v; }, 'pa')} />
          <Slider label={pat.b} value={r.layers[0]?.b ?? 0.5} min={0} max={1} def={0.5} onChange={v => set(s => { if (s.layers[0]) s.layers[0].b = v; }, 'pb')} />
          <Slider label="Escala del patrón" value={r.layers[0]?.scale ?? 1} min={0.2} max={4} def={1} onChange={v => set(s => { if (s.layers[0]) s.layers[0].scale = v; }, 'ps')} />
        </Section>
      )}
      {!own && (
        <Section title="Mezcla">
          <Slider label="Dejar ver la foto original" value={r.media.reveal} min={0} max={1} def={0} onChange={v => set(s => { s.media.reveal = v; }, 'reveal')}
            hint={opaque ? undefined : 'Se nota con «Con su fondo»; sin él, la foto ya se ve entre los caracteres.'} />
          <Slider label="Cantidad de patrón" value={r.media.mix} min={0} max={1} def={0} onChange={v => set(s => { s.media.mix = v; }, 'mix')} hint="Un patrón del laboratorio tejido sobre la foto." />
          <Slider label="Zoom de la foto" value={r.media.zoom} min={0.5} max={4} def={1} onChange={v => set(s => { s.media.zoom = v; }, 'zoom')} />
          <Toggle label="Espejo" checked={r.media.mirror} onChange={v => set(s => { s.media.mirror = v; }, 'mirror')} />
        </Section>
      )}
      <Section title="Caracteres">
        <Select label="Caracteres" value={csId} options={CHARSET_OPTS} minWidth={300}
          onChange={v => set(s => { if (v !== 'custom') s.glyph.charset = CHARSETS.find(c => c.id === v)!.chars; else if (csId !== 'custom') s.glyph.charset = ' .:-=+*#%@'; }, 'charset')} />
        {csId === 'custom' && <TextField label="Tus caracteres (del vacío al lleno)" value={r.glyph.charset} mono max={400} onChange={v => set(s => { s.glyph.charset = v || ' #'; }, 'charset-txt')} />}
        <SegGroup label="Cómo se eligen" value={r.glyph.mode} opts={MODE_OPTS} onPick={v => set(s => { s.glyph.mode = v; }, 'mode')} />
        {r.glyph.mode === 'words' && <TextField label="Palabras que rellenan la imagen" value={r.glyph.words} area rows={2} onChange={v => set(s => { s.glyph.words = v; }, 'words')} />}
        <Select label="Tipografía" value={font.id} options={FONT_OPTS} onChange={v => set(s => { s.glyph.font = v; }, 'font')} />
        {font.weights.length > 1 && <Slider label="Grosor" value={r.glyph.weight} min={font.weights[0]} max={font.weights[font.weights.length - 1]} step={100} onChange={v => set(s => { s.glyph.weight = v; }, 'weight')} />}
        <Slider label="Tamaño de celda" value={r.glyph.cell} min={3} max={48} step={1} def={10} unit="px" onChange={v => set(s => { s.glyph.cell = v; }, 'cell')} hint="En píxeles de la imagen final." />
        <Slider label="Forma de la celda (alto ÷ ancho)" value={r.glyph.aspect} min={0.6} max={2.4} fmt={v => v.toFixed(2)} onChange={v => set(s => { s.glyph.aspect = v; }, 'aspect')} />
        <Slider label="Densidad (tamaño del carácter en su celda)" value={r.glyph.scale} min={0.3} max={1.8} def={1} onChange={v => set(s => { s.glyph.scale = v; }, 'scale')} />
        {r.glyph.mode !== 'words' && <Slider label="Dibujar contornos | / - \\" value={r.glyph.edge} min={0} max={1} def={0} onChange={v => set(s => { s.glyph.edge = v; }, 'edge')} />}
      </Section>
      <Section title="Tono" open={false}>
        <Slider label="Brillo" value={r.tone.bright} min={-1} max={1} def={0} onChange={v => set(s => { s.tone.bright = v; }, 'bright')} />
        <Slider label="Contraste" value={r.tone.contrast} min={0} max={3} def={1} onChange={v => set(s => { s.tone.contrast = v; }, 'contrast')} />
        <Slider label="Tonos medios (gamma)" value={r.tone.gamma} min={0.2} max={3} def={1} onChange={v => set(s => { s.tone.gamma = v; }, 'gamma')} />
        <Slider label="Reducir tonos (posterizar)" value={r.tone.levels} min={0} max={12} step={1} fmt={v => (v < 2 ? 'no' : v + ' tonos')} onChange={v => set(s => { s.tone.levels = v; }, 'levels')} />
        <Toggle label="Invertir claros y oscuros" checked={r.tone.invert} onChange={v => set(s => { s.tone.invert = v; }, 'invert')} />
        <Slider label="Tramado (dither)" value={r.glyph.dither} min={0} max={1} def={0} onChange={v => set(s => { s.glyph.dither = v; }, 'dither')} />
        {r.glyph.dither > 0 && <SegGroup label="Tipo de tramado" value={r.glyph.ditherKind} opts={[['bayer', 'Ordenado'], ['noise', 'Ruido']]} onPick={v => set(s => { s.glyph.ditherKind = v; }, 'dk')} />}
      </Section>
      <Section title="Color">
        {!own && <SegGroup label="Colores de" value={r.color.mode} opts={[['ramp', 'Tu paleta'], ['source', 'La imagen']]} onPick={v => set(s => { s.color.mode = v; }, 'cmode')} />}
        {(r.color.mode === 'ramp' || own) && (
          <>
            <ColorStops label="Paleta (de vacío a lleno)" stops={r.color.stops} onChange={v => set(s => { s.color.stops = v; }, 'stops')} />
            <div className="pal-row" role="group" aria-label="Paletas curadas">
              {CURATED.slice(0, 12).map(c => (
                <button key={c.name} type="button" className="pal-chip" title={c.name} aria-label={`Paleta ${c.name}`}
                  onClick={() => set(s => { s.color.stops = [...c.stops]; if (opaque) s.color.bg = c.bg; s.color.mode = 'ramp'; }, 'pal' + c.name)}>
                  {c.stops.map((x, i) => <i key={i} style={{ background: x }} />)}
                </button>
              ))}
            </div>
          </>
        )}
        {r.color.mode === 'source' && !own && <Slider label="Viveza" value={r.color.vivid} min={0} max={1} onChange={v => set(s => { s.color.vivid = v; }, 'vivid')} />}
        <Slider label="Saturación" value={r.color.sat} min={0} max={2} def={1} onChange={v => set(s => { s.color.sat = v; }, 'sat')} />
        <Slider label="Rotar tono" value={r.color.hue} min={0} max={1} step={0.005} fmt={v => Math.round(v * 360) + '°'} def={0} onChange={v => set(s => { s.color.hue = v; }, 'hue')} />
        {opaque && <ColorInput label="Fondo" value={r.color.bg} onChange={v => set(s => { s.color.bg = v ?? '#0c0b0a'; }, 'bg')} />}
      </Section>
      <Section title="Luz y textura" open={false}>
        <Slider label="Resplandor en la celda" value={r.fx.glow} min={0} max={1.5} def={0} onChange={v => set(s => { s.fx.glow = v; }, 'glow')} />
        <Slider label="Halo de luz (bloom)" value={r.fx.bloom} min={0} max={1.5} def={0} disabled={!opaque} onChange={v => set(s => { s.fx.bloom = v; }, 'bloom')} />
        <Slider label="Grano" value={r.fx.grain} min={0} max={1} def={0} disabled={!opaque} onChange={v => set(s => { s.fx.grain = v; }, 'grain')} />
        <Slider label="Relleno de celda" value={r.fx.cellBg} min={0} max={1} def={0} onChange={v => set(s => { s.fx.cellBg = v; }, 'cellbg')} />
        {!opaque && <Note>El halo y el grano del motor sólo se dibujan con «Con su fondo». Para brillo o grano sobre sólo los caracteres, usa los acabados de abajo («Resplandor», «Grano»).</Note>}
      </Section>
      <Section title="Movimiento" open={false}>
        <Slider label="Velocidad" value={r.motion.speed} min={0} max={3} def={1} onChange={v => set(s => { s.motion.speed = v; }, 'speed')} hint="Se nota en video y en las animaciones; una foto fija muestra un instante." />
        <Slider label="Deformación" value={r.motion.warp} min={0} max={1.5} def={0} onChange={v => set(s => { s.motion.warp = v; }, 'warp')} />
      </Section>
    </>
  );
}
