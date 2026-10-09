import { useEffect, useMemo, useRef, useState } from 'react';
import type { GlyphSet } from '../../glyphset/set';
import { paintGlyph, placeGlyph } from '../../glyphset/paint';
import { provideGlyphSet } from '../../glyphset/registry';
import { compileDoc } from '../compile';
import { layoutText } from '../layout';
import { useGlifos } from '../state';
import type { BasicEngine } from '../../engine/basic/engine';
import type { Recipe } from '../../engine/recipe';

/**
 * The set at work: words and a paragraph at several sizes (the alphabet's spacing and kerning), and a piece
 * of the lab drawn by the basic engine with the set in its atlas, exactly as the lab will draw it.
 */

const SAMPLES = {
  texto: 'El veloz murciélago hindú comía feliz cardillo y kiwi. ¿Ñandú? ¡Sí! 0123456789',
  ascii: '',
};
const SIZES = [14, 24, 40, 72, 120];

export function Preview({ pictures }: { pictures?: Parameters<typeof compileDoc>[1] }) {
  const doc = useGlifos(s => s.doc);
  const [all, setAll] = useState(true);
  const [text, setText] = useState(SAMPLES.texto);
  const [size, setSize] = useState(40);
  const [para, setPara] = useState(false);
  // compiled a moment after the last change (a drag recompiles once it rests)
  const [set, setSet] = useState<GlyphSet | null>(null);
  useEffect(() => {
    if (!doc) return;
    const t = setTimeout(() => setSet(compileDoc(doc, pictures, { all }).set), 180);
    return () => clearTimeout(t);
  }, [doc, all, pictures]);
  if (!doc) return null;
  return (
    <div className="gl-preview">
      <label className="toggle"><span>Incluir propuestas sin aceptar</span><span className="switch"><input type="checkbox" role="switch" checked={all} onChange={e => setAll(e.target.checked)} /><span /></span></label>
      {doc.mode === 'texto' && (
        <>
          <h3 className="sub">Texto</h3>
          <div className="ctl"><label className="lbl" htmlFor="gl-pv-text">Escribe para probar</label>
            <textarea id="gl-pv-text" rows={2} value={text} onChange={e => setText(e.target.value)} /></div>
          <div className="seg" role="group" aria-label="Tamaño">{SIZES.map(s => <button key={s} type="button" aria-pressed={size === s} onClick={() => setSize(s)}>{s}</button>)}</div>
          <label className="toggle" style={{ marginTop: 10 }}><span>Párrafo (ajusta líneas)</span><span className="switch"><input type="checkbox" role="switch" checked={para} onChange={e => setPara(e.target.checked)} /><span /></span></label>
          {set && <TextCanvas set={set} text={text} size={size} para={para} />}
          {set && <Waterfall set={set} text={text.split(/\s+/).slice(0, 3).join(' ') || 'Glifos'} />}
        </>
      )}
      <h3 className="sub">En una pieza del laboratorio</h3>
      {set && <PiecePreview set={set} />}
    </div>
  );
}

function useCanvas(draw: (cx: CanvasRenderingContext2D, w: number, dpr: number) => number, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = c.parentElement?.clientWidth ?? 320;
    const cx = c.getContext('2d')!;
    // a first pass measures the height
    const h = draw(cx, w, 0);
    c.width = Math.round(w * dpr); c.height = Math.max(1, Math.round(h * dpr));
    c.style.width = w + 'px'; c.style.height = h + 'px';
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(cx, w, dpr);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

/** Draws laid-out text: the set's glyphs in the text colour, the characters it lacks dimmed in a system font. */
function drawLine(cx: CanvasRenderingContext2D, set: GlyphSet, text: string, fs: number, x0: number, y0: number, maxWidth?: number): { h: number; missing: string[] } {
  const lay = layoutText(set, text, fs, { maxWidth, fallback: ch => { cx.font = `${fs}px ui-monospace, monospace`; return cx.measureText(ch).width; } });
  const lineH = fs * ((set.asc - set.desc) / set.upm) * 1.15;
  const k = fs / set.upm;
  for (const p of lay.chars) {
    const base = y0 + p.line * lineH + set.asc * k;
    if (p.missing) {
      cx.fillStyle = 'rgba(237,230,218,.28)';
      cx.font = `${fs}px ui-monospace, monospace`;
      cx.textBaseline = 'alphabetic';
      cx.fillText(p.ch, x0 + p.x, base);
      continue;
    }
    const shape = set.glyphs[p.ch];
    if (!shape) continue;
    const pl = placeGlyph(set, shape, fs);
    cx.fillStyle = '#ede6da';
    paintGlyph(cx, set, p.ch, x0 + p.x + (shape.a * k) / 2, base - pl.y, fs);
  }
  return { h: lay.lines * lineH, missing: lay.missing };
}

function TextCanvas({ set, text, size, para }: { set: GlyphSet; text: string; size: number; para: boolean }) {
  const [missing, setMissing] = useState<string[]>([]);
  const ref = useCanvas((cx, w, pass) => {
    const r = drawLine(cx, set, text || ' ', size, 8, 8, para ? w - 16 : undefined);
    if (pass) setMissing(r.missing);
    return r.h + 16;
  }, [set, text, size, para]);
  return (
    <>
      <div className="gl-canvas-box"><canvas ref={ref} role="img" aria-label={`Vista previa del texto «${text}» con tus glifos`} /></div>
      {missing.length > 0 && <p className="note">Sin dibujar en tu alfabeto (se ven atenuados con una fuente del sistema): {missing.join(' ')}</p>}
    </>
  );
}

function Waterfall({ set, text }: { set: GlyphSet; text: string }) {
  const ref = useCanvas((cx, _w) => {
    let y = 8;
    for (const s of [12, 18, 28, 44]) y += drawLine(cx, set, text, s, 8, y).h + 6;
    return y + 6;
  }, [set, text]);
  return <div className="gl-canvas-box"><canvas ref={ref} role="img" aria-label="Tus glifos en cuatro tamaños" /></div>;
}

/* ------------------------------------------------------------------ */
/* A lab piece with the set                                            */
/* ------------------------------------------------------------------ */

let previewSerial = 0;
/** Ids for the preview's sets: one per compile, so the engine's atlas and ink caches never mix two drawings. */
const previewId = () => 'f' + (++previewSerial).toString(16).padStart(15, '0');

const PIECES = [
  { id: 'patron', name: 'Patrón' },
  { id: 'familia', name: 'Reacción–difusión' },
  { id: 'texto', name: 'Palabras' },
] as const;

async function pieceRecipe(kind: typeof PIECES[number]['id'], set: GlyphSet, id: string): Promise<Recipe> {
  const { defaultRecipe } = await import('../../engine/recipe');
  let r = defaultRecipe();
  if (kind === 'familia') {
    const { familyRecipe } = await import('../../families/recipes');
    r = familyRecipe('reaccion_difusion', 'coral', r, 'glifos');
  }
  r.glyph.set = id;
  r.glyph.setName = set.name;
  r.glyph.cell = 14;
  r.interact.mode = 'none';
  if (set.mode === 'ascii' && set.ramp) { r.glyph.charset = set.ramp; r.glyph.sort = false; }
  else {
    const letters = Object.keys(set.glyphs).filter(c => c !== ' ').join('');
    if (letters) r.glyph.charset = ' ' + letters;
    r.glyph.sort = true;
  }
  if (kind === 'texto') { r.glyph.mode = 'words'; r.glyph.words = (Object.keys(set.glyphs).filter(c => /\p{L}/u.test(c)).join('') || 'GLIFOS') + ' '; }
  r.v = 3;
  return r;
}

function PiecePreview({ set }: { set: GlyphSet }) {
  const box = useRef<HTMLDivElement>(null);
  const eng = useRef<BasicEngine | null>(null);
  const [kind, setKind] = useState<typeof PIECES[number]['id']>('patron');
  const [err, setErr] = useState('');
  const id = useMemo(() => { const i = previewId(); provideGlyphSet(i, set); return i; }, [set]);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        if (!eng.current) {
          const [{ BasicEngine }, { createFontLoader }] = await Promise.all([import('../../engine/basic/engine'), import('../../engine/fonts')]);
          if (!live || !box.current) return;
          const w = Math.min(640, box.current.clientWidth || 320);
          eng.current = new BasicEngine(document.createElement('canvas'), await pieceRecipe(kind, set, id), {
            fonts: createFontLoader({ google: false }), fixedSize: { width: w, height: Math.round(w * 0.56), pixelRatio: 1 }, autoplay: false, interactive: false, adaptive: false,
          });
          eng.current.canvas.setAttribute('role', 'img');
          box.current.replaceChildren(eng.current.canvas);
        }
        const e = eng.current;
        e.set(await pieceRecipe(kind, set, id));
        await e.ready();
        if (!live) return;
        e.renderAt(6);
        e.canvas.setAttribute('aria-label', `Una pieza ASCII del laboratorio dibujada con tus glifos (${PIECES.find(p => p.id === kind)!.name})`);
        setErr('');
      } catch (x) { if (live) setErr('No se pudo dibujar la vista previa: ' + (x as Error).message); }
    })();
    return () => { live = false; };
  }, [set, id, kind]);
  useEffect(() => () => { eng.current?.destroy(); eng.current = null; }, []);
  return (
    <>
      <div className="seg" role="group" aria-label="Pieza de ejemplo">{PIECES.map(p => <button key={p.id} type="button" aria-pressed={kind === p.id} onClick={() => setKind(p.id)}>{p.name}</button>)}</div>
      <div ref={box} className="gl-piece" />
      {err && <p className="note warn">{err}</p>}
      <p className="note">Dibujada por el motor básico con tu juego en el atlas, igual que en el laboratorio (allí, con WebGL 2 si tu navegador lo tiene).{set.mode === 'texto' ? ' Las letras que tu alfabeto no tiene salen con la tipografía de la pieza.' : ''}</p>
    </>
  );
}
