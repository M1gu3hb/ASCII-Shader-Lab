import { useEffect, useMemo } from 'react';
import {
  BLEND_NAMES, CHARSETS, COLOR_MAP_NAMES, FAMILY_NAMES, FONTS, GLYPH_MODE_NAMES, INTERACT_NAMES, MSG_MODE_NAMES, PATTERNS,
  charsetIdOf, fontById, nearestWeight, patternById, type PatternFamily,
} from '../engine/catalog';
import { DEFAULT_LAYER, type BlendMode, type ColorMap, type GlyphMode, type InteractMode, type MsgMode, type Recipe, type SourceKind } from '../engine/recipe';
import { CURATED } from '../random/palettes';
import { Rng } from '../random/prng';
import type { SpaceId } from '../random/spaces';
import { Color, F, Note, Seg, Select, Slider, Sub, Text, Toggle, useField, type Opt } from './controls';
import { IDice, IDown, IEye, IEyeOff, IPlus, ITrash, IUp } from './icons';
import { toggleMute, toggleVideo, useMedia, setVideoRate, startCamera, stopCamera } from './media';
import { edit, setUI, useStudio } from './store';
import { startMic, stopMic, useLive } from './live';
import { BasicFxHint } from './BasicMode';
import { pickFile } from './files';
import { CharsetSwatches, CompareStrip, Hint } from './guide/CompareStrip';
import { CONTRAST, DETAIL } from './guide/paths';
import { setView, useView } from './views/state';
import { TERM_SIZES } from './views/views';

export const TABS: Record<SpaceId, Array<[string, string]>> = {
  fondos: [['forma', 'Forma'], ['color', 'Color'], ['glifos', 'Glifos'], ['mov', 'Movimiento'], ['fx', 'Efectos']],
  arte: [['forma', 'Capas'], ['color', 'Color'], ['glifos', 'Glifos'], ['mov', 'Movimiento'], ['fx', 'Efectos'], ['fuente', 'Fuente'], ['msg', 'Mensaje']],
  media: [['fuente', 'Fuente'], ['glifos', 'Glifos'], ['color', 'Color'], ['forma', 'Patrón'], ['mov', 'Interacción'], ['fx', 'Efectos']],
  tipo: [['fuente', 'Texto'], ['msg', 'Mensaje'], ['glifos', 'Glifos'], ['color', 'Color'], ['forma', 'Relleno'], ['mov', 'Movimiento'], ['fx', 'Efectos']],
  terminal: [['term', 'Terminal'], ['msg', 'Mensaje'], ['glifos', 'Glifos'], ['color', 'Color'], ['forma', 'Forma'], ['mov', 'Movimiento'], ['fx', 'Efectos']],
  componentes: [],
};

const PATTERN_OPTS: Opt<string>[] = (Object.keys(FAMILY_NAMES) as PatternFamily[]).map(fam => ({
  group: FAMILY_NAMES[fam], opts: PATTERNS.filter(p => p.family === fam).map(p => [p.id, p.name] as [string, string]),
}));
const BLEND_OPTS = (Object.keys(BLEND_NAMES) as BlendMode[]).map(b => [b, BLEND_NAMES[b]] as [BlendMode, string]);

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
      <Slider f={F('motion.warp')} label="Deformación" min={0} max={1.5} />
      <Slider f={F('motion.warpScale')} label="Escala de la deformación" min={0.2} max={3} />
    </>
  );
}

function LayerCard({ i, n }: { i: number; n: number }) {
  const P = (k: string) => F(`layers.${i}.${k}`);
  const on = useField(P('on')) as boolean;
  const pat = useField(P('pattern')) as string;
  const info = patternById(pat);
  const move = (d: number) => edit(r => { const l = r.layers.splice(i, 1)[0]; r.layers.splice(i + d, 0, l); if (r.layers[0]) r.layers[0].blend = 'normal'; }, 'move' + Date.now());
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
        <select aria-label={`Patrón de la capa ${i + 1}`} value={pat} onChange={e => edit(r => { r.layers[i].pattern = e.target.value; }, `layers.${i}.pattern`)}>
          {PATTERN_OPTS.map((g, gi) => !Array.isArray(g) && (
            <optgroup key={gi} label={g.group}>{g.opts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</optgroup>
          ))}
        </select>
        <button type="button" className="icon-btn" title="Otro patrón al azar" aria-label="Otro patrón al azar" onClick={reroll}><IDice /></button>
        <button type="button" className="icon-btn" aria-pressed={!on} title={on ? 'Ocultar capa' : 'Mostrar capa'} aria-label={on ? 'Ocultar capa' : 'Mostrar capa'}
          onClick={() => edit(r => { r.layers[i].on = !r.layers[i].on; }, 'toggle' + Date.now())} disabled={n === 1}>{on ? <IEye /> : <IEyeOff />}</button>
      </div>
      {i > 0 && <Select f={P('blend')} label="Mezcla con lo de abajo" opts={BLEND_OPTS} />}
      <Slider f={P('mix')} label={i === 0 ? 'Intensidad' : 'Fuerza de la mezcla'} min={0} max={1} />
      <Slider f={P('a')} label={info.a} min={0} max={1} />
      <Slider f={P('b')} label={info.b} min={0} max={1} />
      <Slider f={P('scale')} label="Escala" min={0.2} max={4} />
      <Slider f={P('speed')} label="Velocidad" min={-2} max={3} />
      <Slider f={P('rot')} label="Rotación" min={0} max={360} step={1} fmt={v => Math.round(v) + '°'} />
      <Toggle f={P('invert')} label="Invertir" />
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
  const isMedia = source === 'image' || source === 'video' || source === 'camera';
  return (
    <>
      <Sub>Paletas</Sub>
      <Hint>Colorean de las celdas vacías a las llenas, sobre su fondo. Mucho contraste con el fondo llama la atención; poco se lee mejor bajo texto.</Hint>
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
      {isMedia && <Seg f={F('color.mode')} label="Color de" opts={[['ramp', 'Paleta'], ['source', 'La imagen']]} />}
      {mode === 'source' && isMedia && <Slider f={F('color.vivid')} label="Viveza" min={0} max={1} />}
      <Select f={F<ColorMap>('color.map')} label="Reparto del color" opts={(Object.keys(COLOR_MAP_NAMES) as ColorMap[]).map(k => [k, COLOR_MAP_NAMES[k]])} />
      <Slider f={F('color.shade')} label="Sombreado por brillo" min={0} max={1} />
      <Sub>Ajustes</Sub>
      <Slider f={F('color.shift')} label="Desplazar paleta" min={-1} max={1} />
      <Slider f={F('color.cycle')} label="Ciclo de color" min={-0.3} max={0.3} step={0.005} />
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
  const font = fontById(fontId);
  const csId = charsetIdOf(charset);
  const charsetOpts = useMemo(() => {
    const list = space === 'terminal' ? CHARSETS.filter(c => c.ascii) : CHARSETS;
    return [...list.map(c => [c.id, c.name + (c.ascii ? '' : ' ·')] as [string, string]), ['custom', 'Personalizado'] as [string, string]];
  }, [space]);
  return (
    <>
      <Slider f={F('glyph.cell')} label="Tamaño de celda" min={3} max={48} step={1} fmt={v => v + ' px'} />
      <Hint what="tamaños de celda" compare={<CompareStrip path="glyph.cell" choices={DETAIL} fmt={v => v + ' px'} zoom={0.4} label="Tamaños de celda" />}>
        Pequeña: más detalle y más caracteres (más trabajo para el equipo). Grande: más gráfica y ligera.
      </Hint>
      <Slider f={F('glyph.aspect')} label="Proporción de celda" min={0.6} max={2.4} />
      <div className="ctl">
        <label className="lbl" htmlFor="cs-sel">Juego de caracteres</label>
        <select id="cs-sel" value={csId} onChange={e => { const c = CHARSETS.find(x => x.id === e.target.value); if (c) edit(r => { r.glyph.charset = c.chars; }, 'glyph.charset'); }}>
          {charsetOpts.map(([id, name]) => <option key={id} value={id} disabled={id === 'custom'}>{name}</option>)}
        </select>
      </div>
      <Hint what="juegos de caracteres" compare={<CharsetSwatches asciiOnly={space === 'terminal'} />}>
        Los caracteres que dibujan, de vacío a lleno. Muchos dan degradados suaves; pocos, más contraste y carácter.
      </Hint>
      <Text f={F('glyph.charset')} label="Caracteres (de vacío a lleno)" mono />
      {space === 'terminal' && /[^\x20-\x7e]/.test(charset) && <Note><b>Aviso:</b> hay caracteres fuera de ASCII; algunas terminales antiguas no los mostrarán.</Note>}
      <Toggle f={F('glyph.sort')} label="Ordenar por densidad medida" />
      <Select f={F('glyph.font')} label="Tipografía" opts={FONTS.map(f => [f.id, f.name] as [string, string])}
        onPick={id => edit(r => { r.glyph.weight = nearestWeight(fontById(id), r.glyph.weight); }, 'glyph.font')} />
      {font.weights.length > 1 && <Slider f={F('glyph.weight')} label="Grosor" min={font.weights[0]} max={font.weights[font.weights.length - 1]} step={100} />}
      <Slider f={F('glyph.scale')} label="Tamaño del carácter" min={0.3} max={1.8} />
      <Sub>Modo</Sub>
      <Seg f={F<GlyphMode>('glyph.mode')} opts={(Object.keys(GLYPH_MODE_NAMES) as GlyphMode[]).map(k => [k, GLYPH_MODE_NAMES[k]])} />
      {mode === 'words' && <Text f={F('glyph.words')} label="Texto que rellena la imagen" area rows={2} />}
      {(mode === 'scramble' || mode === 'words') && <Slider f={F('glyph.jitter')} label={mode === 'words' ? 'Desplazamiento del texto' : 'Velocidad del caos'} min={0} max={1} />}
      {mode !== 'lines' && <Slider f={F('glyph.edge')} label="Contornos  | / - \\" min={0} max={1} />}
      {mode === 'lines' && <Slider f={F('glyph.edge')} label="Sensibilidad de líneas" min={0} max={1} />}
      <Slider f={F('glyph.dither')} label="Tramado" min={0} max={1} />
      <Seg f={F('glyph.ditherKind')} opts={[['bayer', 'Bayer'], ['noise', 'Ruido']]} />
      <Sub>Tono</Sub>
      <Slider f={F('tone.bright')} label="Brillo" min={-1} max={1} />
      <Slider f={F('tone.contrast')} label="Contraste" min={0} max={3} />
      <Hint what="contrastes" compare={<CompareStrip path="tone.contrast" choices={CONTRAST} fmt={v => '×' + v} zoom={0.75} label="Contrastes" />}>
        Separa claros y oscuros. Alto marca las formas pero pierde matices; bajo conserva los grises y puede quedar plano.
      </Hint>
      <Slider f={F('tone.gamma')} label="Gamma" min={0.2} max={3} />
      <Slider f={F('tone.levels')} label="Posterizar (niveles)" min={0} max={12} step={1} fmt={v => (v < 2 ? 'no' : String(v))} />
      <Toggle f={F('tone.invert')} label="Invertir" />
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
          <Slider f={F('motion.hold')} label="Fotogramas por segundo (stop motion)" min={0} max={24} step={1} fmt={v => (v === 0 ? 'fluido' : v + ' fps')} />
          <Slider f={F('motion.loop')} label="Bucle perfecto" min={0} max={20} step={0.5} fmt={v => (v === 0 ? 'no' : v + ' s')} />
          <Note>El bucle funde el final con el principio: ideal para GIF, video y fondos que no deben «saltar».</Note>
          <Sub>Ritmo</Sub>
          <Slider f={F('motion.pulse')} label="Pulso" min={0} max={1} />
          <Slider f={F('motion.bpm')} label="Tempo" min={40} max={180} step={1} fmt={v => v + ' bpm'} />
          <SoundControl />
        </>
      )}
      <Sub>Cursor y tacto</Sub>
      <div className="ctl">
        <span className="lbl">Reacción</span>
        <div className="seg" role="group" aria-label="Reacción al cursor">
          {(Object.keys(INTERACT_NAMES) as InteractMode[]).map(k => (
            <button key={k} type="button" aria-pressed={mode === k} onClick={() => edit(r => { r.interact.mode = k; }, 'interact.mode')}>{INTERACT_NAMES[k]}</button>
          ))}
        </div>
      </div>
      {mode !== 'none' && (
        <>
          <Slider f={F('interact.strength')} label="Fuerza" min={0} max={1} />
          <Slider f={F('interact.radius')} label="Radio" min={0.03} max={0.6} />
          <Toggle f={F('interact.auto')} label="Cursor fantasma cuando nadie interactúa" />
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
      <Slider f={F('fx.bloom')} label="Bloom" min={0} max={1.5} />
      <Slider f={F('fx.cellBg')} label="Relleno de celda" min={0} max={1} />
      <Sub>Pantalla</Sub>
      <Slider f={F('fx.scan')} label="Líneas de barrido" min={0} max={1} />
      <Slider f={F('fx.curve')} label="Curvatura CRT" min={0} max={1} />
      <Slider f={F('fx.vig')} label="Viñeta" min={0} max={1} />
      <Slider f={F('fx.chroma')} label="Aberración cromática" min={0} max={1} />
      <Slider f={F('fx.flicker')} label="Parpadeo" min={0} max={1} />
      <Slider f={F('fx.grain')} label="Grano" min={0} max={1} />
      <Slider f={F('fx.grid')} label="Retícula" min={0} max={1} />
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
      <Seg f={F<SourceKind>('source')} label="Qué se convierte en caracteres" opts={opts} onPick={v => {
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
          <Select f={F('media.fit')} label="Ajuste" opts={[['cover', 'Cubrir (recorta)'], ['contain', 'Contener (completo)'], ['stretch', 'Estirar']]} />
          <Slider f={F('media.zoom')} label="Zoom" min={0.5} max={4} />
          <Slider f={F('media.panX')} label="Mover horizontal" min={-1} max={1} />
          <Slider f={F('media.panY')} label="Mover vertical" min={-1} max={1} />
          <Toggle f={F('media.mirror')} label="Espejo" />
          <Slider f={F('media.reveal')} label="Mostrar la imagen original" min={0} max={1} />
        </>
      )}
      {source === 'text' && <TextSource />}
      {source !== 'pattern' && (
        <>
          <Sub>Mezclar con el patrón</Sub>
          <Slider f={F('media.mix')} label="Cantidad de patrón" min={0} max={1} />
          <Select f={F<BlendMode>('media.blend')} label="Modo de mezcla" opts={BLEND_OPTS} />
          <Note>«Multiplicar» rellena la forma con el patrón; «Máscara» sólo lo muestra dentro.</Note>
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
      <Select f={F('text.font')} label="Tipografía" opts={FONTS.filter(f => f.display).map(f => [f.id, f.name] as [string, string])}
        onPick={id => edit(r => { r.text.weight = nearestWeight(fontById(id), r.text.weight); }, 'text.font')} />
      {font.weights.length > 1 && <Slider f={F('text.weight')} label="Grosor" min={font.weights[0]} max={font.weights[font.weights.length - 1]} step={100} />}
      <Slider f={F('text.size')} label="Tamaño" min={0.2} max={1.6} />
      <Slider f={F('text.tracking')} label="Espaciado" min={-0.2} max={0.6} />
      <Slider f={F('text.leading')} label="Interlineado" min={0.7} max={2} />
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
      <Toggle f={F('msg.on')} label="Mostrar mensaje" />
      {on && (
        <>
          <Text f={F('msg.text')} label="Mensaje" area rows={3} />
          <Select f={F<MsgMode>('msg.mode')} label="Animación" opts={(Object.keys(MSG_MODE_NAMES) as MsgMode[]).map(k => [k, MSG_MODE_NAMES[k]])} />
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
        ? <Note>La vista reproduce una terminal de <b>{t.cols}×{t.rows}</b>. Lo que ves es exactamente lo que exportas como texto, ANSI o animación para la consola.</Note>
        : <button type="button" className="btn" onClick={() => setView('terminal')}>Ver la ventana de terminal ({t.cols}×{t.rows})</button>}
      <div className="ctl">
        <span className="lbl">Tamaño</span>
        <div className="seg" role="group" aria-label="Tamaño de la terminal">
          {TERM_SIZES.map(([c, r]) => (
            <button key={c + 'x' + r} type="button" aria-pressed={t.cols === c && t.rows === r} onClick={() => setUI({ terminal: { cols: c, rows: r } })}>{c}×{r}</button>
          ))}
        </div>
      </div>
      <div className="row2">
        <label className="ctl"><span className="lbl">Columnas</span><input type="number" min={10} max={300} value={t.cols} onChange={e => setUI({ terminal: { ...t, cols: clampInt(e.target.value, 10, 300) } })} /></label>
        <label className="ctl"><span className="lbl">Filas</span><input type="number" min={4} max={120} value={t.rows} onChange={e => setUI({ terminal: { ...t, rows: clampInt(e.target.value, 4, 120) } })} /></label>
      </div>
      <Sub>Consejos</Sub>
      <Note>Las celdas de una terminal miden cerca de 1:2, por eso la proporción de celda está en 2. Usa juegos de caracteres ASCII para máxima compatibilidad.</Note>
      <button type="button" className="btn primary" onClick={() => setUI({ sheet: 'export' })}>Exportar para terminal…</button>
    </>
  );
}

const clampInt = (v: string, a: number, b: number) => Math.max(a, Math.min(b, Math.round(Number(v) || a)));

export type { Recipe };
