import { useCallback, useEffect, useId, useMemo, type ReactNode } from 'react';
import { CHARSETS, GLYPH_MODE_NAMES, PATTERNS, charsetIdOf, fontById, nearestWeight, patternById } from '../engine/catalog';
import { DEFAULT_LAYER, type BlendMode, type ColorMap, type DitherKind, type Fit, type GlyphMode, type InteractMode, type MsgMode, type Recipe, type SourceKind } from '../engine/recipe';
import { isMarkMode } from '../engine/touch';
import { Rng } from '../random/prng';
import type { SpaceId } from '../random/spaces';
import { Color, F, Note, Seg, SegGroup, Select, Slider, Sub, Text, Toggle, useField } from './controls';
import { ICamera, IDice, IDown, IEye, IEyeOff, IImage, IPlus, ITrash, IUp } from './icons';
import { chooseCamera, chooseCameraMirror, chooseFacing, toggleMute, toggleVideo, useMedia, setVideoRate, startCamera, stopCamera } from './media';
import type { Facing } from './cameraMirror';
import { edit, setUI, useRecipe, useStudio } from './store';
import { startMic, stopMic, useLive } from './live';
import { BasicFxHint } from './BasicMode';
import { pickFile } from './files';
import { CompareStrip } from './guide/CompareStrip';
import { CharsetExplorer } from './ui/CharsetExplorer';
import { CONTRAST, DETAIL, type Choice } from './guide/paths';
import { setView, useView } from './views/state';
import { TERM_SIZES } from './views/views';
import { Picker } from './ui/Picker';
import { Range } from './ui/Range';
import { NumberField } from './ui/NumberField';
import { HelpMore, HelpToggle, HintText, useHelp } from './ui/Help';
import { DITHER_DESC, DITHER_ICON, FIT_DESC, GLYPH_MODE_DESC, GLYPH_MODE_ICON, SOURCE_DESC } from './ui/copy';
import {
  CharsetOption, CharsetPreview, CharsetRamp, PatternThumb, blendOptions, charsetOptions, closeThumbSession, colorMapOptions, fontOptions,
  letterAnimOptions, msgModeOptions, openThumbSession, patternOptions,
} from './ui/options';
import { XformTab } from './ui/Xforms';
import { TouchControls } from './ui/Touch';
import { RampEditor } from './ui/RampEditor';
import { PaletteEditor } from './ui/color/PaletteEditor';
import { useRamps } from './ui/ramps';
import { LETTER_ANIMS } from '../engine/catalog';
import { MSG_ANIMS, TEXT_ANIMS, type LetterAnim, type LetterAnimKind } from '../engine/recipe';

/**
 * The groups of settings of each space: [id, visible name]. The ids are internal (the same group has a
 * different name where it means something else: «Capas» in Arte is «Relleno» in Texto). «Origen» is
 * what becomes characters (a pattern, a text, a photo…): «Fuente» read as a font.
 */
export const TABS: Record<SpaceId, Array<[string, string]>> = {
  fondos: [['forma', 'Forma'], ['color', 'Color'], ['glifos', 'Glifos'], ['mov', 'Movimiento'], ['fx', 'Efectos']],
  arte: [['forma', 'Capas'], ['color', 'Color'], ['glifos', 'Glifos'], ['mov', 'Movimiento'], ['fx', 'Efectos'], ['fuente', 'Origen'], ['msg', 'Mensaje']],
  media: [['fuente', 'Origen'], ['xform', 'Transformar'], ['glifos', 'Glifos'], ['color', 'Color'], ['forma', 'Patrón'], ['mov', 'Interacción'], ['fx', 'Efectos']],
  tipo: [['fuente', 'Tu texto'], ['msg', 'Mensaje'], ['xform', 'Transformar'], ['glifos', 'Glifos'], ['color', 'Color'], ['forma', 'Relleno'], ['mov', 'Movimiento'], ['fx', 'Efectos']],
  terminal: [['term', 'Terminal'], ['msg', 'Mensaje'], ['glifos', 'Glifos'], ['color', 'Color'], ['forma', 'Forma'], ['mov', 'Movimiento'], ['fx', 'Efectos']],
  componentes: [],
};

const PATTERN_OPTS = patternOptions();
const BLEND_OPTS = blendOptions();
const MSG_OPTS = msgModeOptions();
const DISPLAY_FONTS = fontOptions(true);
/** Values the comparison strips offer beside the cell size and contrast ones. */
const GAMMA: Choice<number>[] = [{ label: 'Claros', value: 0.55 }, { label: 'Neutro', value: 1 }, { label: 'Oscuros', value: 1.8 }];
const ASPECT: Choice<number>[] = [{ label: 'Cuadrada', value: 1 }, { label: 'Libro', value: 1.4 }, { label: 'Terminal', value: 2 }];
const DITHER: Choice<number>[] = [{ label: 'Sin tramado', value: 0 }, { label: 'Medio', value: 0.5 }, { label: 'Máximo', value: 1 }];
const BLOOM: Choice<number>[] = [{ label: 'Sin halo', value: 0 }, { label: 'Suave', value: 0.5 }, { label: 'Fuerte', value: 1.2 }];
const WARP: Choice<number>[] = [{ label: 'Quieta', value: 0 }, { label: 'Leve', value: 0.35 }, { label: 'Líquida', value: 1 }];
const SOURCE_ICON: Partial<Record<SourceKind, ReactNode>> = {
  pattern: '≈', text: 'Aa', image: <IImage width={13} height={13} />, video: '▶', camera: <ICamera width={13} height={13} />,
};
const FIT_ICON: Record<Fit, string> = { cover: '▣', contain: '▭', stretch: '⇔' };

export function TabContent({ tab, space }: { tab: string; space: SpaceId }) {
  switch (tab) {
    case 'forma': return <FormaTab space={space} />;
    case 'color': return <ColorTab />;
    case 'glifos': return <GlifosTab space={space} />;
    case 'mov': return <MovTab space={space} />;
    case 'fx': return <FxTab />;
    case 'fuente': return <FuenteTab space={space} />;
    case 'msg': return <MsgTab />;
    case 'term': return <TermTab />;
    case 'xform': return <XformTab space={space} />;
    default: return null;
  }
}

/* ------------------------------------------------------------------ */
/* Layers                                                              */
/* ------------------------------------------------------------------ */

function FormaTab({ space }: { space: SpaceId }) {
  const n = useStudio(s => s.entries[s.cursor]?.recipe.layers.length ?? 0);
  // «content on top» is the «Fondo web» destination preview
  const preview = useView() === 'web';
  const source = useField(F<SourceKind>('source'));
  return (
    <>
      {space === 'fondos' && (
        <button type="button" className="btn" onClick={() => setView(preview ? 'libre' : 'web')} aria-pressed={preview}>
          {preview ? <IEyeOff width={16} /> : <IEye width={16} />} {preview ? 'Ocultar contenido de prueba' : 'Probar con contenido encima'}
        </button>
      )}
      {source !== 'pattern' && <Note>Estas capas se mezclan con lo que se convierte en caracteres según «Cantidad de patrón», en {space === 'tipo' ? '«Tu texto»' : '«Origen»'}.</Note>}
      {Array.from({ length: n }, (_, i) => <LayerCard key={i} i={i} n={n} />)}
      <button type="button" className="btn" disabled={n >= 4} title={n >= 4 ? 'Una pieza tiene hasta cuatro capas' : undefined} onClick={() => edit(r => {
        const rng = new Rng('add' + Date.now());
        r.layers.push({ ...DEFAULT_LAYER, pattern: rng.pick(PATTERNS).id, blend: 'multiply', mix: 0.6, phase: Math.round(rng.range(0, 40)) });
      }, 'add-layer' + Date.now())}>
        <IPlus width={16} /> Añadir capa {n >= 4 && '(máx. 4)'}
      </button>
      <Sub>Distorsión global</Sub>
      <Slider f={F('motion.warp')} label="Deformación" min={0} max={1.5}
        compare={<CompareStrip path="motion.warp" choices={WARP} fmt={v => v.toFixed(2)} zoom={0.8} label="Deformaciones" />} />
      <Slider f={F('motion.warpScale')} label="Tamaño de la deformación" min={0.2} max={3} />
    </>
  );
}

function LayerCard({ i, n }: { i: number; n: number }) {
  const P = (k: string) => F(`layers.${i}.${k}`);
  const on = useField(P('on')) as boolean;
  const pat = useField(P('pattern')) as string;
  const info = patternById(pat);
  const move = (d: number) => edit(r => { const l = r.layers.splice(i, 1)[0]; r.layers.splice(i + d, 0, l); if (r.layers[0]) r.layers[0].blend = 'normal'; }, 'move' + Date.now());
  const recipe = useRecipe();
  const h = useHelp('layers.*.pattern');
  const labelId = useId();
  const onOpen = useCallback((o: boolean) => { if (o) openThumbSession(); else closeThumbSession(); }, []);
  const reroll = () => edit(r => {
    const rng = new Rng(`reroll${i}${Date.now()}`);
    const same = PATTERNS.filter(p => p.family === info.family && p.id !== pat);
    r.layers[i].pattern = (rng.chance(0.5) && same.length ? rng.pick(same) : rng.pick(PATTERNS)).id;
    r.layers[i].a = Math.round(rng.range(0.1, 0.9) * 100) / 100;
    r.layers[i].b = Math.round(rng.range(0.1, 0.9) * 100) / 100;
  }, 'reroll' + Date.now());
  return (
    <div className={'layer' + (on ? '' : ' off')}>
      <div className="layer-head">
        <span className="idx">{String(i + 1).padStart(2, '0')}</span>
        <span id={labelId} className="sr-only">Patrón de la capa {i + 1}</span>
        <Picker value={pat} options={PATTERN_OPTS} label={`Patrón de la capa ${i + 1}`} labelId={labelId} describedBy={h?.hintId} minWidth={300}
          onOpenChange={onOpen}
          renderOption={o => (
            <>
              <PatternThumb base={recipe} pattern={o.value} />
              <span className="pk-main"><span className="pk-name">{o.label}</span>{o.desc && <span className="pk-desc">{o.desc}</span>}</span>
            </>
          )}
          onChange={v => edit(r => { r.layers[i].pattern = v; }, `layers.${i}.pattern`)} />
        <button type="button" className="icon-btn" title="Otro patrón al azar" aria-label="Otro patrón al azar" onClick={reroll}><IDice /></button>
        <button type="button" className="icon-btn" aria-pressed={!on} title={on ? 'Ocultar capa' : 'Oculta: pulsa para mostrarla'} aria-label={`Ocultar la capa ${i + 1}`}
          onClick={() => edit(r => { r.layers[i].on = !r.layers[i].on; }, 'toggle' + Date.now())}>{on ? <IEye /> : <IEyeOff />}</button>
        {h && <HelpToggle h={h} name={`Patrón de la capa ${i + 1}`} />}
      </div>
      <HintText h={h} />
      <HelpMore h={h} />
      <p className="layer-desc">{PATTERN_OPTS.find(o => o.value === pat)?.desc}</p>
      {i > 0 && <Select f={P('blend')} label="Mezcla con la capa de abajo" opts={BLEND_OPTS} minWidth={300} />}
      <Slider f={P('mix')} label={i === 0 ? 'Intensidad' : 'Fuerza de la mezcla'} min={0} max={1} />
      <Slider f={P('a')} label={info.a} min={0} max={1} help={{ hint: `Ajuste propio de «${info.name}»: ${info.a.toLowerCase()}.` }} />
      <Slider f={P('b')} label={info.b} min={0} max={1} help={{ hint: `Ajuste propio de «${info.name}»: ${info.b.toLowerCase()}.` }} />
      <Slider f={P('scale')} label="Escala" min={0.2} max={4} />
      <Slider f={P('speed')} label="Velocidad" min={-2} max={3} />
      <Slider f={P('rot')} label="Rotación" min={-360} max={360} step={1} fmt={v => Math.round(v) + '°'} />
      <Slider f={P('x')} label="Posición horizontal" min={-2} max={2} />
      <Slider f={P('y')} label="Posición vertical" min={-2} max={2} />
      <Slider f={P('phase')} label="Desfase de la animación (s)" min={0} max={1000} step={0.1} />
      <Toggle f={P('invert')} label="Invertir lleno y vacío" />
      <div className="row" style={{ marginBottom: 10 }}>
        <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(-1)} aria-label="Subir capa" title={i === 0 ? 'Ya es la primera capa' : 'Subir'}><IUp /></button>
        <button type="button" className="icon-btn" disabled={i === n - 1} onClick={() => move(1)} aria-label="Bajar capa" title={i === n - 1 ? 'Ya es la última capa' : 'Bajar'}><IDown /></button>
        <span style={{ flex: 1 }} />
        <button type="button" className="icon-btn" disabled={n === 1} onClick={() => edit(r => { r.layers.splice(i, 1); if (r.layers[0]) r.layers[0].blend = 'normal'; }, 'rm' + Date.now())} aria-label="Eliminar capa" title={n === 1 ? 'Una pieza necesita al menos una capa' : 'Eliminar capa'}><ITrash /></button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Colour                                                              */
/* ------------------------------------------------------------------ */

function ColorTab() {
  const source = useField(F<SourceKind>('source'));
  const mode = useField(F<string>('color.mode'));
  const recipe = useRecipe();
  const stopsKey = recipe ? recipe.color.stops.join() + recipe.color.bg : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const maps = useMemo(() => colorMapOptions(recipe), [stopsKey]);
  const isMedia = source === 'image' || source === 'video' || source === 'camera';
  return (
    <>
      <Sub>Paleta</Sub>
{isMedia && mode === 'source' && <p className="note">Los colores vienen de la imagen. Para cambiar su paleta y reparto, <button type="button" className="mini" onClick={() => edit(r => { r.color.mode = 'ramp'; }, 'color.mode')}>Usar tu paleta</button>.</p>}
      <fieldset disabled={isMedia && mode === 'source'} className="inactive-controls"><PaletteEditor isMedia={isMedia} /></fieldset>
      {isMedia && <Seg f={F('color.mode')} label="Colores de" opts={[['ramp', 'Tu paleta'], ['source', 'La imagen']]} />}
      {mode === 'source' && isMedia && <Slider f={F('color.vivid')} label="Viveza" min={0} max={1} />}
      <fieldset disabled={isMedia && mode === 'source'} className="inactive-controls"><Select f={F<ColorMap>('color.map')} label="Cómo se reparte el color" opts={maps} minWidth={290} /></fieldset>
      <Slider f={F('color.shade')} label="Atenuar las zonas oscuras" min={0} max={1} />
      <Sub>Ajustes</Sub>
      <fieldset disabled={isMedia && mode === 'source'} className="inactive-controls"><Slider f={F('color.shift')} label="Desplazar la paleta" min={-1} max={1} />
      <Slider f={F('color.cycle')} label="Colores en movimiento" min={-0.3} max={0.3} step={0.005} fmt={v => (v === 0 ? 'quietos' : v.toFixed(3))} /></fieldset>
      <Slider f={F('color.hue')} label="Rotar tono" min={0} max={1} step={0.005} fmt={v => Math.round(v * 360) + '°'} scale={360} />
      <Slider f={F('color.sat')} label="Saturación" min={0} max={2} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Glyphs                                                              */
/* ------------------------------------------------------------------ */

function GlifosTab({ space }: { space: SpaceId }) {
  const charset = useField(F<string>('glyph.charset')) ?? '';
  const mode = useField(F<GlyphMode>('glyph.mode'));
  const fontId = useField(F<string>('glyph.font')) ?? 'system';
  const recipe = useRecipe();
  const font = fontById(fontId);
  const ramps = useRamps(st => st.list);
  const mine = ramps.find(x => x.chars === charset);
  const csId = mine && charsetIdOf(charset) === 'custom' ? 'ramp:' + mine.id : charsetIdOf(charset);
  const ascii = space === 'terminal';
  // the saved ramps join the list, under the built-in sets (the recipe keeps their characters, not their name)
  const charsetOpts = useMemo(() => [
    ...charsetOptions(ascii).filter(o => o.value !== 'custom'),
    ...ramps.map(x => ({ value: 'ramp:' + x.id, label: x.name, desc: 'Guardada en este navegador.', group: 'Tus rampas' })),
    { value: 'custom', label: 'Personalizado', desc: 'Los que escribes abajo, en «Tus caracteres».', disabled: true, group: ramps.length ? 'Tus rampas' : 'Tuyos' },
  ], [ascii, ramps]);
  const rampChars = (id: string) => (id.startsWith('ramp:') ? ramps.find(x => 'ramp:' + x.id === id)?.chars : undefined);
  const fonts = useMemo(() => fontOptions(false), []);
  const csHelp = useHelp('glyph.charset');
  const csLabel = useId();
  return (
    <>
      <Slider f={F('glyph.cell')} label="Tamaño de celda" min={3} max={48} step={1} fmt={v => v + ' px'}
        compare={<CompareStrip path="glyph.cell" choices={DETAIL} fmt={v => v + ' px'} zoom={0.4} label="Tamaños de celda" />} />
      <Slider f={F('glyph.aspect')} label="Forma de la celda (alto ÷ ancho)" min={0.6} max={2.4} fmt={v => v.toFixed(2)}
        compare={<CompareStrip path="glyph.aspect" choices={ASPECT} fmt={v => '1:' + v} zoom={0.4} label="Formas de celda" />} />
      <div className={'ctl cx' + (csHelp ? ' has-help' : '')}>
        <span className="lbl" id={csLabel} {...csHelp?.hover}>Caracteres</span>
        <Picker value={csId} options={charsetOpts} label="Caracteres" labelId={csLabel} describedBy={csHelp?.hintId} minWidth={310} placeholder="Personalizado"
          renderOption={o => <CharsetOption o={o} recipe={recipe} chars={rampChars(o.value)} />}
          renderValue={o => (o && o.value !== 'custom'
            ? <><span className="pk-txt">{o.label}</span><CharsetRamp id={o.value} chars={rampChars(o.value)} recipe={recipe} n={10} /></>
            : <span className="pk-txt">Personalizado</span>)}
          preview={o => (o.value !== 'custom' ? <CharsetPreview id={o.value} chars={rampChars(o.value)} recipe={recipe} /> : null)}
          onChange={id => { const c = rampChars(id) ?? CHARSETS.find(x => x.id === id)?.chars; if (c) edit(r => { r.glyph.charset = c; }, 'glyph.charset'); }} />
        {csHelp && <HelpToggle h={csHelp} name="Caracteres" />}
        <HintText h={csHelp} />
        <HelpMore h={csHelp}><CharsetExplorer asciiOnly={ascii} /></HelpMore>
      </div>
      <RampEditor ascii={ascii} />
      <Select f={F('glyph.font')} label="Tipografía de los caracteres" opts={fonts} minWidth={290}
        onPick={id => edit(r => { r.glyph.weight = nearestWeight(fontById(id), r.glyph.weight); }, 'glyph.font')} />
      {font.weights.length > 1 && <Select f={F('glyph.weight')} label="Grosor" opts={font.weights.map(w => ({ value: w, label: String(w) }))} />}
      <Slider f={F('glyph.scale')} label="Tamaño del carácter en su celda" min={0.3} max={1.8} />
      <Sub>Modo</Sub>
      <Seg f={F<GlyphMode>('glyph.mode')} opts={(Object.keys(GLYPH_MODE_NAMES) as GlyphMode[]).map(k => [k, GLYPH_MODE_NAMES[k]])} desc={GLYPH_MODE_DESC} icons={GLYPH_MODE_ICON} />
      {mode === 'words' && <Text f={F('glyph.words')} label="Texto que rellena la imagen" area rows={2} />}
      {(mode === 'scramble' || mode === 'words') && <Slider f={F('glyph.jitter')} label={mode === 'words' ? 'Desplazamiento del texto' : 'Velocidad del caos'} min={0} max={1} />}
      {mode !== 'lines' && <Slider f={F('glyph.edge')} label="Dibujar contornos  | / - \\" min={0} max={1} />}
      {mode === 'lines' && <Slider f={F('glyph.edge')} label="Sensibilidad de las líneas" min={0} max={1} />}
      <Slider f={F('glyph.dither')} label="Tramado (dither)" min={0} max={1}
        compare={<CompareStrip path="glyph.dither" choices={DITHER} fmt={v => v.toFixed(1)} zoom={0.35} label="Tramados" />} />
      <Seg f={F<DitherKind>('glyph.ditherKind')} label="Tipo de tramado" opts={[['bayer', 'Ordenado'], ['noise', 'Ruido']]} desc={DITHER_DESC} icons={DITHER_ICON} />
      <Sub>Tono</Sub>
      <Slider f={F('tone.bright')} label="Brillo" min={-1} max={1} />
      <Slider f={F('tone.contrast')} label="Contraste" min={0} max={3}
        compare={<CompareStrip path="tone.contrast" choices={CONTRAST} fmt={v => '×' + v} zoom={0.75} label="Contrastes" />} />
      <Slider f={F('tone.gamma')} label="Tonos medios (gamma)" min={0.2} max={3}
        compare={<CompareStrip path="tone.gamma" choices={GAMMA} fmt={v => v.toFixed(2)} zoom={0.75} label="Tonos medios" />} />
      <Slider f={F('tone.levels')} label="Reducir tonos (posterizar)" min={0} max={12} step={1} fmt={v => (v < 2 ? 'no' : v + ' tonos')} />
      <Toggle f={F('tone.invert')} label="Invertir claros y oscuros" />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Motion & interaction                                                */
/* ------------------------------------------------------------------ */

function MovTab({ space }: { space: SpaceId }) {
  return (
    <>
      {space !== 'media' && (
        <>
          <Slider f={F('motion.speed')} label="Velocidad" min={0} max={3} />
          <Slider f={F('motion.hold')} label="Stop motion" min={0} max={24} step={1} fmt={v => (v === 0 ? 'fluido' : v + ' fps')} />
          <Slider f={F('motion.loop')} label="Bucle perfecto" min={0} max={20} step={0.5} fmt={v => (v === 0 ? 'no' : v + ' s')} />
          <Sub>Ritmo</Sub>
          <Slider f={F('motion.pulse')} label="Latido" min={0} max={1} />
          <Slider f={F('motion.bpm')} label="Tempo" min={40} max={180} step={1} fmt={v => v + ' bpm'} />
          <SoundControl />
        </>
      )}
      <TouchControls />
    </>
  );
}

function SoundControl() {
  const mic = useLive(s => s.mic);
  const level = useLive(s => s.level);
  const gain = useLive(s => s.gain);
  return (
    <>
      {mic === 'on'
        ? <button type="button" className="btn primary" onClick={stopMic}>Dejar de escuchar</button>
        : <button type="button" className="btn" disabled={mic === 'starting'} onClick={() => void startMic()}>{mic === 'starting' ? 'Esperando permiso…' : 'Reaccionar al sonido (micrófono)'}</button>}
      {mic === 'on' && (
        <>
          <div className="progress" aria-hidden="true"><i style={{ '--v': Math.round(level * 100) + '%', transition: 'none' } as React.CSSProperties} /></div>
          <div className="ctl">
            <label className="lbl" htmlFor="mic-gain">Sensibilidad</label><output>{gain.toFixed(1)}</output>
            <Range id="mic-gain" min={0.3} max={4} step={0.1} value={gain} onValue={g => useLive.setState({ gain: g })} />
          </div>
        </>
      )}
      <Note>Con el micrófono, el volumen marca el pulso en lugar del tempo. Se analiza en tu navegador; nada se graba ni se envía.</Note>
    </>
  );
}

function FxTab() {
  return (
    <>
      <Sub>Luz</Sub>
      <Slider f={F('fx.glow')} label="Resplandor en la celda" min={0} max={1.5} />
      <Slider f={F('fx.bloom')} label="Halo de luz (bloom)" min={0} max={1.5}
        compare={<CompareStrip path="fx.bloom" choices={BLOOM} fmt={v => v.toFixed(1)} zoom={0.7} label="Halos de luz" />} />
      <Slider f={F('fx.cellBg')} label="Relleno de celda" min={0} max={1} />
      <Sub>Pantalla</Sub>
      <Slider f={F('fx.scan')} label="Líneas de monitor" min={0} max={1} />
      <Slider f={F('fx.curve')} label="Curvatura de tubo (CRT)" min={0} max={1} />
      <Slider f={F('fx.vig')} label="Bordes oscuros (viñeta)" min={0} max={1} />
      <Slider f={F('fx.chroma')} label="Separación de color" min={0} max={1} />
      <Slider f={F('fx.flicker')} label="Parpadeo" min={0} max={1} />
      <Slider f={F('fx.grain')} label="Grano" min={0} max={1} />
      <Slider f={F('fx.grid')} label="Rejilla de celdas" min={0} max={1} />
      <BasicFxHint />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Source                                                              */
/* ------------------------------------------------------------------ */

function FuenteTab({ space }: { space: SpaceId }) {
  const source = useField(F<SourceKind>('source'));
  const media = useMedia();
  const opts: Array<[SourceKind, string]> = space === 'media'
    ? [['image', 'Imagen'], ['video', 'Video'], ['camera', 'Cámara']]
    : space === 'tipo' ? [['text', 'Texto'], ['pattern', 'Sólo patrón']]
      : [['pattern', 'Patrón'], ['text', 'Texto'], ['image', 'Imagen'], ['video', 'Video'], ['camera', 'Cámara']];
  const isMedia = source === 'image' || source === 'video' || source === 'camera';
  return (
    <>
      {/* manual: moving with the arrows must not open a file picker at each step */}
      <Seg f={F<SourceKind>('source')} label="Qué se convierte en caracteres" opts={opts} desc={SOURCE_DESC} icons={SOURCE_ICON} activate="manual" onPick={v => {
        if ((v === 'image' && !media.image) || (v === 'video' && !media.video)) pickFile(v);
      }} />
      {source === 'image' && (
        <>
          <button type="button" className="btn primary" onClick={() => pickFile('image')}>{media.image ? 'Cambiar imagen' : 'Elegir imagen'}</button>
          <Note>{media.image ? <>Archivo: <b>{media.image.name}</b> · {media.image.w}×{media.image.h}</> : 'También puedes soltarla sobre el lienzo.'}</Note>
        </>
      )}
      {source === 'video' && (
        <>
          <button type="button" className="btn primary" onClick={() => pickFile('video')}>{media.video ? 'Cambiar video' : 'Elegir video'}</button>
          {media.video && (
            <div className="row2">
              <button type="button" className="btn" onClick={toggleVideo}>{media.videoPaused ? 'Reproducir' : 'Pausar video'}</button>
              <button type="button" className="btn" onClick={toggleMute}>{media.videoMuted ? 'Activar sonido' : 'Silenciar'}</button>
            </div>
          )}
          <Slider f={F('media.rate')} label="Velocidad del video" min={0.25} max={2} step={0.05} fmt={v => v.toFixed(2) + '×'} />
          <RateSync />
          <Note>{media.video ? <>Archivo: <b>{media.video.name}</b></> : 'MP4 (H.264) es el formato que más navegadores abren; WebM también sirve en la mayoría.'}</Note>
        </>
      )}
      {source === 'camera' && <CameraControls />}
      {isMedia && <p className="note privacy">Todo se procesa en tu navegador: nada se sube a ningún servidor.</p>}
      {media.error && <p className="warn">{media.error}</p>}
      {isMedia && (
        <>
          <Sub>Encuadre</Sub>
          <Seg f={F<Fit>('media.fit')} label="Encaje" opts={[['cover', 'Cubrir'], ['contain', 'Completa'], ['stretch', 'Estirar']]} desc={FIT_DESC} icons={FIT_ICON} />
          <Slider f={F('media.zoom')} label="Zoom" min={0.5} max={4} />
          <Slider f={F('media.panX')} label="Mover horizontal" min={-1} max={1} />
          <Slider f={F('media.panY')} label="Mover vertical" min={-1} max={1} />
          {source !== 'camera' && <Toggle f={F('media.mirror')} label="Espejo" />}
          <Slider f={F('media.reveal')} label="Dejar ver la foto original" min={0} max={1} />
        </>
      )}
      {source === 'text' && <TextSource />}
      {source !== 'pattern' && (
        <>
          <Sub>Mezclar con el patrón</Sub>
          <Slider f={F('media.mix')} label="Cantidad de patrón" min={0} max={1} />
          <Select f={F<BlendMode>('media.blend')} label="Cómo entra el patrón" opts={BLEND_OPTS} minWidth={300} />
        </>
      )}
    </>
  );
}

function RateSync() {
  const rate = useField(F<number>('media.rate')) ?? 1;
  useEffect(() => setVideoRate(rate), [rate]);
  return null;
}

const FACING_OPTS: Array<[Facing, string]> = [['user', 'Cámara frontal'], ['environment', 'Cámara trasera']];

/**
 * The camera: on and off, front or rear (or one of the listed devices), and its mirror. The front camera
 * starts as a mirror and the rear one as it is (cameraMirror.ts); the person's own choice of «Espejo» is
 * kept for that camera. The mirror is part of the piece, so the still and the recording show the same.
 */
function CameraControls() {
  const media = useMedia();
  const mirror = !!useField(F<boolean>('media.mirror'));
  const id = useId();
  const on = media.camera === 'on';
  const facing: Facing = on ? media.camFacing ?? 'user' : media.camWant.facing;
  // asked for the rear camera and got one that looks at the person (a laptop's only webcam)
  const noRear = on && media.camWant.facing === 'environment' && !media.camWant.deviceId && media.camFacing !== 'environment';
  const device = media.camDevice ?? media.camWant.deviceId ?? '';
  return (
    <>
      {on
        ? <button type="button" className="btn" onClick={stopCamera}>Apagar cámara</button>
        : <button type="button" className="btn primary" disabled={media.camera === 'starting'} onClick={() => void startCamera()}>{media.camera === 'starting' ? 'Esperando permiso…' : 'Activar cámara'}</button>}
      <div className="ctl cx cam-which">
        <span className="lbl" id={id + 'f'}>Qué cámara</span>
        <SegGroup labelId={id + 'f'} value={facing} opts={FACING_OPTS} onPick={chooseFacing} activate="manual" />
      </div>
      {noRear && <Note>Este equipo no ofrece una cámara trasera: sigue la que te mira.</Note>}
      {media.cameras.length > 1 && (
        <div className="ctl cx">
          <span className="lbl" id={id + 'd'}>Dispositivo</span>
          <Picker value={media.cameras.some(c => c.id === device) ? device : undefined} placeholder="Elige una cámara" label="Dispositivo" labelId={id + 'd'} minWidth={260}
            options={media.cameras.map(c => ({ value: c.id, label: c.label }))} onChange={chooseCamera} />
        </div>
      )}
      <div className="toggle-row cam-mirror">
        <label className="toggle">
          <span>Espejo: como te ves en el espejo</span>
          <span className="switch"><input type="checkbox" role="switch" checked={mirror} aria-describedby={id + 'h'} onChange={e => chooseCameraMirror(e.target.checked)} /><span /></span>
        </label>
      </div>
      <p className="note cam-honest" id={id + 'h'}>
        Lo que ves es lo que tendrá el archivo: la imagen fija y la grabación salen con este mismo espejo.{' '}
        {facing === 'user' ? 'La cámara frontal empieza en espejo, como en la cámara de un teléfono.' : 'La cámara trasera empieza sin espejo, tal como la ves.'}
      </p>
    </>
  );
}

function TextSource() {
  const fontId = useField(F<string>('text.font')) ?? 'martian';
  const font = fontById(fontId);
  return (
    <>
      <Text f={F('text.content')} label="Texto (Enter para otra línea)" area rows={3} />
      <Select f={F('text.font')} label="Tipografía del texto" opts={DISPLAY_FONTS} minWidth={290}
        onPick={id => edit(r => { r.text.weight = nearestWeight(fontById(id), r.text.weight); }, 'text.font')} />
      {font.weights.length > 1 && <Select f={F('text.weight')} label="Grosor" opts={font.weights.map(w => ({ value: w, label: String(w) }))} />}
      <Slider f={F('text.size')} label="Tamaño" min={0.2} max={1.6} />
      <Slider f={F('text.tracking')} label="Espacio entre letras" min={-0.2} max={0.6} />
      <Slider f={F('text.leading')} label="Espacio entre líneas" min={0.7} max={2} />
      <Seg f={F('text.align')} label="Alineación" opts={[['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']]} />
      <Toggle f={F('text.italic')} label="Cursiva" />
      <Slider f={F('text.morph')} label="Disolver en el patrón cada" min={0} max={20} step={0.5} fmt={v => (v === 0 ? 'nunca' : v + ' s')} />
      <Sub>Letras que se mueven</Sub>
      <LetterAnimCtl target="text" />
    </>
  );
}

/** Sensible starting points of each animation (how far and how fast), for the big text and the message. */
const ANIM_START: Record<LetterAnimKind, Omit<LetterAnim, 'kind'>> = {
  ola: { amount: 0.6, speed: 1 }, rebote: { amount: 0.6, speed: 1 }, latido: { amount: 0.6, speed: 1 }, revolver: { amount: 0.8, speed: 1 },
  palabras: { amount: 0.5, speed: 1 }, explosion: { amount: 0.6, speed: 1 }, brillo: { amount: 0.7, speed: 1 }, color: { amount: 1, speed: 1 },
  orbita: { amount: 0.6, speed: 0.8 }, enjambre: { amount: 0.55, speed: 0.8 }, cascada: { amount: 0.65, speed: 0.9 },
};

/** Per-letter animation of the big text (`text`) or of the message (`msg`): which one, how much, how fast. */
function LetterAnimCtl({ target }: { target: 'text' | 'msg' }) {
  const anim = useField(F<LetterAnim | undefined>(`${target}.anim`));
  const opts = useMemo(() => letterAnimOptions(target === 'text' ? TEXT_ANIMS : MSG_ANIMS), [target]);
  const info = anim ? LETTER_ANIMS[anim.kind] : null;
  return (
    <>
      <Select f={{ key: `${target}.anim.kind`, get: r => r[target].anim?.kind ?? '', set: (r, v: string) => {
        if (!v) delete r[target].anim;
        else r[target].anim = { kind: v as LetterAnimKind, ...(r[target].anim?.kind === v ? r[target].anim! : ANIM_START[v as LetterAnimKind]) };
      } }} label={target === 'text' ? 'Cómo se mueven las letras' : 'Efecto por letra'} opts={opts} minWidth={290}
        help={{ hint: target === 'text' ? 'Cada letra del texto grande se mueve por su cuenta, en bucle.' : 'Cada letra del mensaje se mueve o cambia de color por su cuenta.', more: 'Se repite siempre igual: el video, el GIF y las exportaciones lo capturan tal cual. Con «reducir movimiento» el estudio arranca en pausa.' }} />
      {info && anim && (
        <>
          <Slider f={F(`${target}.anim.amount`)} label={info.amount} min={0} max={1} fmt={v => Math.round(v * 100) + ' %'} scale={100} help={{ hint: `${info.amount} de «${info.name}».` }} />
          <Slider f={F(`${target}.anim.speed`)} label="Velocidad" min={0.2} max={2.5} fmt={v => v.toFixed(2) + '×'} help={{ hint: `Qué tan rápido va «${info.name}».` }} />
        </>
      )}
      {target === 'msg' && anim && anim.kind !== 'color' && <Note>En la rejilla las letras saltan de celda en celda: con celdas grandes el movimiento es más gráfico.</Note>}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Message overlay                                                     */
/* ------------------------------------------------------------------ */

function MsgTab() {
  const on = useField(F<boolean>('msg.on'));
  const color = useField(F<string>('msg.color'));
  const cellFill = useField(F<number>('fx.cellBg')) ?? 0;
  const glow = useField(F<number>('fx.glow')) ?? 0;
  const gesture = useField(F<InteractMode>('interact.mode'));
  const plateActive = cellFill > 0 || glow > 0 || gesture === 'reveal' || isMarkMode(gesture ?? 'none');
  return (
    <>
      <Note>Un texto literal que vive en la rejilla: se escribe, se borra, se descifra o desfila por encima de la pieza.</Note>
      <Toggle f={F('msg.on')} label="Mostrar mensaje" help={null} />
      {on && (
        <>
          <Text f={F('msg.text')} label="Mensaje" area rows={3} />
          <Select f={F<MsgMode>('msg.mode')} label="Cómo aparece" opts={MSG_OPTS} minWidth={280} />
          <Slider f={F('msg.speed')} label="Letras por segundo" min={2} max={60} step={1} />
          <Slider f={F('msg.hold')} label="Pausa antes de borrar" min={0} max={10} step={0.5} fmt={v => v + ' s'} />
          <Slider f={F('msg.x')} label="Posición horizontal" min={0} max={1} />
          <Slider f={F('msg.y')} label="Posición vertical" min={0} max={1} />
          <Seg f={F('msg.align')} label="Alineación" opts={[['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']]} />
          <fieldset className="inactive-controls" disabled={!plateActive}><Slider f={F('msg.box')} label="Placa detrás del texto" min={0} max={1} help={{ hint: 'Quita el relleno y resplandor bajo el mensaje para mejorar su lectura.' }} /></fieldset>
          {!plateActive && <Note>El fondo bajo el mensaje ya es plano. La placa se activa al añadir relleno de celda o resplandor en Efectos, o marcas del cursor.</Note>}
          <Toggle f={F('msg.cursor')} label="Cursor de bloque" />
          <label className="toggle">
            <span>Color propio</span>
            <span className="switch"><input type="checkbox" role="switch" checked={!!color} onChange={e => { const c = e.target.checked; edit(r => { r.msg.color = c ? '#ffffff' : ''; }, 'msg.color'); }} /><span /></span>
          </label>
          {!!color && <Color f={F('msg.color')} label="Color del mensaje" />}
          <Sub>Letras que se mueven</Sub>
          <LetterAnimCtl target="msg" />
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Terminal                                                            */
/* ------------------------------------------------------------------ */


function TermTab() {
  const t = useStudio(s => s.ui.terminal);
  const inTerm = useView() === 'terminal';
  return (
    <>
      {inTerm
        ? <Note>La vista reproduce una terminal de <b>{t.cols}×{t.rows}</b>: las columnas y filas que exportas como texto, ANSI o animación para la consola. Los efectos de pantalla (barrido, curvatura, bloom…) se ven aquí, pero no van en el texto ni en el ANSI.</Note>
        : <button type="button" className="btn" onClick={() => setView('terminal')}>Ver la ventana de terminal ({t.cols}×{t.rows})</button>}
      <div className="ctl cx">
        <span className="lbl" id="term-size-l">Tamaño de la terminal (columnas × filas)</span>
        <SegGroup labelId="term-size-l" value={`${t.cols}x${t.rows}`} opts={TERM_SIZES.map(([c, r]) => [`${c}x${r}`, `${c}×${r}`] as [string, string])}
          onPick={v => { const [cols, rows] = v.split('x').map(Number); setUI({ terminal: { cols, rows } }); }} />
      </div>
      <div className="row2">
        <div className="ctl">
          <label className="lbl" htmlFor="term-cols">Columnas</label>
          <NumberField id="term-cols" min={10} max={300} value={t.cols} onValue={cols => setUI({ terminal: { ...useStudio.getState().ui.terminal, cols } })} />
        </div>
        <div className="ctl">
          <label className="lbl" htmlFor="term-rows">Filas</label>
          <NumberField id="term-rows" min={4} max={120} value={t.rows} onValue={rows => setUI({ terminal: { ...useStudio.getState().ui.terminal, rows } })} />
        </div>
      </div>
      <Sub>Consejos</Sub>
      <Note>Las celdas de una terminal miden cerca de 1:2 (el doble de altas que anchas); por eso, en Glifos, la forma de la celda está en 2. Los caracteres ASCII son los más compatibles con las terminales.</Note>
      <button type="button" className="btn primary" onClick={() => setUI({ sheet: 'export' })}>Exportar para terminal…</button>
    </>
  );
}

export type { Recipe };
