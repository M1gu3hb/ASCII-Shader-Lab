import { useCallback, useEffect, useId, useMemo, type ReactNode } from 'react';
import { CHARSETS, GLYPH_MODE_NAMES, PATTERNS, charsetIdOf, fontById, nearestWeight, patternById } from '../engine/catalog';
import { DEFAULT_LAYER, type BlendMode, type ColorMap, type DitherKind, type Fit, type GlyphMode, type InteractMode, type MsgMode, type Recipe, type SourceKind } from '../engine/recipe';
import { CURATED } from '../random/palettes';
import { Rng } from '../random/prng';
import type { SpaceId } from '../random/spaces';
import { Color, F, Note, Seg, SegGroup, Select, Slider, Sub, Text, Toggle, useField } from './controls';
import { ICamera, IDice, IDown, IEye, IEyeOff, IImage, IPlus, ITrash, IUp } from './icons';
import { toggleMute, toggleVideo, useMedia, setVideoRate, startCamera, stopCamera } from './media';
import { edit, setUI, useRecipe, useStudio } from './store';
import { startMic, stopMic, useLive } from './live';
import { BasicFxHint } from './BasicMode';
import { pickFile } from './files';
import { CharsetSwatches, CompareStrip } from './guide/CompareStrip';
import { CONTRAST, DETAIL, type Choice } from './guide/paths';
import { setView, useView } from './views/state';
import { TERM_SIZES } from './views/views';
import { Picker } from './ui/Picker';
import { HelpMore, HelpToggle, HintText, useHelp } from './ui/Help';
import { DITHER_DESC, DITHER_ICON, FIT_DESC, GLYPH_MODE_DESC, GLYPH_MODE_ICON, SOURCE_DESC } from './ui/copy';
import {
  CharsetOption, CharsetRamp, PatternThumb, PiecePreview, blendOptions, charsetOptions, closeThumbSession, colorMapOptions, fontOptions, interactOptions,
  msgModeOptions, openThumbSession, patternOptions, withCharset,
} from './ui/options';

export const TABS: Record<SpaceId, Array<[string, string]>> = {
  fondos: [['forma', 'Forma'], ['color', 'Color'], ['glifos', 'Glifos'], ['mov', 'Movimiento'], ['fx', 'Efectos']],
  arte: [['forma', 'Capas'], ['color', 'Color'], ['glifos', 'Glifos'], ['mov', 'Movimiento'], ['fx', 'Efectos'], ['fuente', 'Fuente'], ['msg', 'Mensaje']],
  media: [['fuente', 'Fuente'], ['glifos', 'Glifos'], ['color', 'Color'], ['forma', 'Patrón'], ['mov', 'Interacción'], ['fx', 'Efectos']],
  tipo: [['fuente', 'Texto'], ['msg', 'Mensaje'], ['glifos', 'Glifos'], ['color', 'Color'], ['forma', 'Relleno'], ['mov', 'Movimiento'], ['fx', 'Efectos']],
  terminal: [['term', 'Terminal'], ['msg', 'Mensaje'], ['glifos', 'Glifos'], ['color', 'Color'], ['forma', 'Forma'], ['mov', 'Movimiento'], ['fx', 'Efectos']],
  componentes: [],
};

const PATTERN_OPTS = patternOptions();
const BLEND_OPTS = blendOptions();
const INTERACT_OPTS = interactOptions();
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
      {source !== 'pattern' && <Note>Estas capas se mezclan con la fuente según «Cantidad de patrón» en la pestaña de fuente.</Note>}
      {Array.from({ length: n }, (_, i) => <LayerCard key={i} i={i} n={n} />)}
      <button type="button" className="btn" disabled={n >= 4} onClick={() => edit(r => {
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
        <button type="button" className="icon-btn" aria-pressed={!on} title={on ? 'Ocultar capa' : 'Mostrar capa'} aria-label={on ? 'Ocultar capa' : 'Mostrar capa'}
          onClick={() => edit(r => { r.layers[i].on = !r.layers[i].on; }, 'toggle' + Date.now())} disabled={n === 1}>{on ? <IEye /> : <IEyeOff />}</button>
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
      <Slider f={P('rot')} label="Rotación" min={0} max={360} step={1} fmt={v => Math.round(v) + '°'} />
      <Toggle f={P('invert')} label="Invertir lleno y vacío" />
      <div className="row" style={{ marginBottom: 10 }}>
        <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(-1)} aria-label="Subir capa" title="Subir"><IUp /></button>
        <button type="button" className="icon-btn" disabled={i === n - 1} onClick={() => move(1)} aria-label="Bajar capa" title="Bajar"><IDown /></button>
        <span style={{ flex: 1 }} />
        <button type="button" className="icon-btn" disabled={n === 1} onClick={() => edit(r => { r.layers.splice(i, 1); if (r.layers[0]) r.layers[0].blend = 'normal'; }, 'rm' + Date.now())} aria-label="Eliminar capa" title="Eliminar capa"><ITrash /></button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Colour                                                              */
/* ------------------------------------------------------------------ */

function ColorTab() {
  const stops = useField(F<string[]>('color.stops')) ?? [];
  const source = useField(F<SourceKind>('source'));
  const mode = useField(F<string>('color.mode'));
  const recipe = useRecipe();
  const stopsKey = recipe ? recipe.color.stops.join() + recipe.color.bg : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const maps = useMemo(() => colorMapOptions(recipe), [stopsKey]);
  const isMedia = source === 'image' || source === 'video' || source === 'camera';
  return (
    <>
      <Sub>Paletas</Sub>
      <Note>Colorean de las celdas vacías a las llenas, sobre su fondo. Mucho contraste con el fondo llama la atención; poco se lee mejor bajo texto.</Note>
      <div className="palettes">
        {CURATED.map(p => (
          <button key={p.name} type="button" className="pal" title={p.name} onClick={() => edit(r => { r.color.stops = p.stops.slice(); r.color.bg = p.bg; if (r.color.mode === 'source' && !isMedia) r.color.mode = 'ramp'; }, 'pal' + Date.now())}>
            <span className="bar" aria-hidden="true">
              <i style={{ background: p.bg, flex: '0 0 24%' }} />
              <i style={{ background: p.stops.length > 1 ? `linear-gradient(90deg, ${p.stops.join(', ')})` : p.stops[0] }} />
            </span>
            <span>{p.name}</span>
          </button>
        ))}
      </div>
      <Sub>Colores</Sub>
      <Note>De las celdas más vacías (izquierda) a las más llenas (derecha).</Note>
      <div className="colors" style={{ marginBottom: 14 }}>
        {stops.map((c, i) => (
          <span key={i} className="swatch" style={{ background: c }}>
            <input type="color" aria-label={`Color ${i + 1}`} value={c} onChange={e => { const v = e.target.value; edit(r => { r.color.stops[i] = v; }, 'stop' + i); }} />
            {stops.length > 1 && <button type="button" className="x" aria-label={`Quitar color ${i + 1}`} onClick={() => edit(r => { r.color.stops.splice(i, 1); }, 'rmstop' + Date.now())}>×</button>}
          </span>
        ))}
        <button type="button" className="mini" disabled={stops.length >= 6} onClick={() => edit(r => { r.color.stops.push(r.color.stops[r.color.stops.length - 1] ?? '#ffffff'); }, 'addstop' + Date.now())} aria-label="Añadir color">+</button>
        <button type="button" className="mini" onClick={() => edit(r => { r.color.stops.reverse(); }, 'rev' + Date.now())} title="Invertir orden">⇄</button>
      </div>
      <Color f={F('color.bg')} label="Fondo" />
      {isMedia && <Seg f={F('color.mode')} label="Colores de" opts={[['ramp', 'Tu paleta'], ['source', 'La imagen']]} />}
      {mode === 'source' && isMedia && <Slider f={F('color.vivid')} label="Viveza" min={0} max={1} />}
      <Select f={F<ColorMap>('color.map')} label="Cómo se reparte el color" opts={maps} minWidth={290} />
      <Slider f={F('color.shade')} label="Atenuar las zonas oscuras" min={0} max={1} />
      <Sub>Ajustes</Sub>
      <Slider f={F('color.shift')} label="Desplazar la paleta" min={-1} max={1} />
      <Slider f={F('color.cycle')} label="Colores en movimiento" min={-0.3} max={0.3} step={0.005} fmt={v => (v === 0 ? 'quietos' : v.toFixed(3))} />
      <Slider f={F('color.hue')} label="Rotar tono" min={0} max={1} step={0.005} fmt={v => Math.round(v * 360) + '°'} />
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
  const csId = charsetIdOf(charset);
  const ascii = space === 'terminal';
  const charsetOpts = useMemo(() => charsetOptions(ascii), [ascii]);
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
          renderOption={o => <CharsetOption o={o} recipe={recipe} />}
          renderValue={o => (o && o.value !== 'custom'
            ? <><span className="pk-txt">{o.label}</span><CharsetRamp id={o.value} recipe={recipe} n={10} /></>
            : <span className="pk-txt">Personalizado</span>)}
          preview={o => (o.value !== 'custom' && recipe ? <PiecePreview recipe={withCharset(recipe, o.value)} label={o.label} /> : null)}
          onChange={id => { const c = CHARSETS.find(x => x.id === id); if (c) edit(r => { r.glyph.charset = c.chars; }, 'glyph.charset'); }} />
        {csHelp && <HelpToggle h={csHelp} name="Caracteres" />}
        <HintText h={csHelp} />
        <HelpMore h={csHelp}><CharsetSwatches asciiOnly={ascii} /></HelpMore>
      </div>
      <Text f={F('glyph.charset')} helpKey="glyph.charsetText" label="Tus caracteres (del vacío al lleno)" mono />
      {ascii && /[^\x20-\x7e]/.test(charset) && <Note><b>Aviso:</b> hay caracteres fuera de ASCII; algunas terminales antiguas no los mostrarán.</Note>}
      <Toggle f={F('glyph.sort')} label="Ordenar por cuánta tinta tienen" />
      <Select f={F('glyph.font')} label="Tipografía de los caracteres" opts={fonts} minWidth={290}
        onPick={id => edit(r => { r.glyph.weight = nearestWeight(fontById(id), r.glyph.weight); }, 'glyph.font')} />
      {font.weights.length > 1 && <Slider f={F('glyph.weight')} label="Grosor" min={font.weights[0]} max={font.weights[font.weights.length - 1]} step={100} />}
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
  const mode = useField(F<InteractMode>('interact.mode'));
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
      <Sub>Cursor y tacto</Sub>
      <Select f={F<InteractMode>('interact.mode')} label="Qué hace el cursor" opts={INTERACT_OPTS} minWidth={280} />
      {mode !== 'none' && (
        <>
          <Slider f={F('interact.strength')} label="Fuerza" min={0} max={1} />
          <Slider f={F('interact.radius')} label="Radio" min={0.03} max={0.6} />
          <Toggle f={F('interact.auto')} label="Cursor automático si nadie lo mueve" />
        </>
      )}
      {mode === 'erase' && <Note>Con una imagen, el borrador revela la foto original bajo los caracteres.</Note>}
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
        : <button type="button" className="btn" onClick={() => void startMic()}>{mic === 'starting' ? 'Esperando permiso…' : 'Reaccionar al sonido (micrófono)'}</button>}
      {mic === 'on' && (
        <>
          <div className="progress" aria-hidden="true"><i style={{ '--v': Math.round(level * 100) + '%', transition: 'none' } as React.CSSProperties} /></div>
          <div className="ctl">
            <label className="lbl" htmlFor="mic-gain">Sensibilidad</label><output>{gain.toFixed(1)}</output>
            <input id="mic-gain" type="range" min={0.3} max={4} step={0.1} value={gain} style={{ '--p': ((gain - 0.3) / 3.7) * 100 + '%' } as React.CSSProperties} onChange={e => useLive.setState({ gain: parseFloat(e.target.value) })} />
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
          <Note>{media.video ? <>Archivo: <b>{media.video.name}</b></> : 'MP4 (H.264) o WebM funcionan en todos los navegadores.'}</Note>
        </>
      )}
      {source === 'camera' && (
        media.camera === 'on'
          ? <button type="button" className="btn" onClick={stopCamera}>Apagar cámara</button>
          : <button type="button" className="btn primary" onClick={() => void startCamera()}>{media.camera === 'starting' ? 'Esperando permiso…' : 'Activar cámara'}</button>
      )}
      {isMedia && <p className="note privacy">Todo se procesa en tu navegador: nada se sube a ningún servidor.</p>}
      {media.error && <p className="warn">{media.error}</p>}
      {isMedia && (
        <>
          <Sub>Encuadre</Sub>
          <Seg f={F<Fit>('media.fit')} label="Encaje" opts={[['cover', 'Cubrir'], ['contain', 'Completa'], ['stretch', 'Estirar']]} desc={FIT_DESC} icons={FIT_ICON} />
          <Slider f={F('media.zoom')} label="Zoom" min={0.5} max={4} />
          <Slider f={F('media.panX')} label="Mover horizontal" min={-1} max={1} />
          <Slider f={F('media.panY')} label="Mover vertical" min={-1} max={1} />
          <Toggle f={F('media.mirror')} label="Espejo" />
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

function TextSource() {
  const fontId = useField(F<string>('text.font')) ?? 'martian';
  const font = fontById(fontId);
  return (
    <>
      <Text f={F('text.content')} label="Texto (Enter para otra línea)" area rows={3} />
      <Select f={F('text.font')} label="Tipografía del texto" opts={DISPLAY_FONTS} minWidth={290}
        onPick={id => edit(r => { r.text.weight = nearestWeight(fontById(id), r.text.weight); }, 'text.font')} />
      {font.weights.length > 1 && <Slider f={F('text.weight')} label="Grosor" min={font.weights[0]} max={font.weights[font.weights.length - 1]} step={100} />}
      <Slider f={F('text.size')} label="Tamaño" min={0.2} max={1.6} />
      <Slider f={F('text.tracking')} label="Espacio entre letras" min={-0.2} max={0.6} />
      <Slider f={F('text.leading')} label="Espacio entre líneas" min={0.7} max={2} />
      <Seg f={F('text.align')} label="Alineación" opts={[['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']]} />
      <Toggle f={F('text.italic')} label="Cursiva" />
      <Slider f={F('text.morph')} label="Disolver en el patrón cada" min={0} max={20} step={0.5} fmt={v => (v === 0 ? 'nunca' : v + ' s')} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Message overlay                                                     */
/* ------------------------------------------------------------------ */

function MsgTab() {
  const on = useField(F<boolean>('msg.on'));
  const color = useField(F<string>('msg.color'));
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
          <Slider f={F('msg.box')} label="Placa detrás del texto" min={0} max={1} />
          <Toggle f={F('msg.cursor')} label="Cursor de bloque" />
          <label className="toggle">
            <span>Color propio</span>
            <span className="switch"><input type="checkbox" role="switch" checked={!!color} onChange={e => { const c = e.target.checked; edit(r => { r.msg.color = c ? '#ffffff' : ''; }, 'msg.color'); }} /><span /></span>
          </label>
          {!!color && <Color f={F('msg.color')} label="Color del mensaje" />}
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
        <label className="ctl"><span className="lbl">Columnas</span><input type="number" min={10} max={300} value={t.cols} onChange={e => setUI({ terminal: { ...t, cols: clampInt(e.target.value, 10, 300) } })} /></label>
        <label className="ctl"><span className="lbl">Filas</span><input type="number" min={4} max={120} value={t.rows} onChange={e => setUI({ terminal: { ...t, rows: clampInt(e.target.value, 4, 120) } })} /></label>
      </div>
      <Sub>Consejos</Sub>
      <Note>Las celdas de una terminal miden cerca de 1:2 (el doble de altas que anchas); por eso, en Glifos, la forma de la celda está en 2. Los caracteres ASCII son los más compatibles con las terminales.</Note>
      <button type="button" className="btn primary" onClick={() => setUI({ sheet: 'export' })}>Exportar para terminal…</button>
    </>
  );
}

const clampInt = (v: string, a: number, b: number) => Math.max(a, Math.min(b, Math.round(Number(v) || a)));

export type { Recipe };
