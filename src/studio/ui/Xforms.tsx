import { useCallback, useId, useLayoutEffect, useMemo, useRef } from 'react';
import { XFORMS, xformById } from '../../engine/catalog';
import { XFORM_MAX, type Xform, type XformKind } from '../../engine/recipe';
import { randomXforms } from '../../random/generator';
import type { SpaceId } from '../../random/spaces';
import { F, Note, Slider, Sub, useField } from '../controls';
import { CompareStrip } from '../guide/CompareStrip';
import { IDice, IDown, IEye, IEyeOff, ITrash, IUp } from '../icons';
import { useMedia } from '../media';
import { edit, useRecipe } from '../store';
import { HelpMore, HelpToggle, HintText, useHelp } from './Help';
import { Picker } from './Picker';
import { PiecePreview, XformThumb, closeThumbSession, openThumbSession, withXforms, xformOptions } from './options';
import '../css/creative.css';

/** Values the comparison under «?» offers for a transformation's strength. */
const AMOUNTS = [{ label: 'Poca', value: 0.3 }, { label: 'Media', value: 0.6 }, { label: 'Toda', value: 1 }];
const pct = (v: number) => Math.round(v * 100) + ' %';

/** A transformation as it is added: its own starting values. */
const fresh = (kind: XformKind): Xform => ({ kind, on: true, ...xformById(kind)!.defaults });

/** Removes the list when it is empty (a piece without transformations is what it was before them). */
function setList(r: { media: { xform?: Xform[] } }, list: Xform[]) {
  if (list.length) r.media.xform = list; else delete r.media.xform;
}


/**
 * «Transformar»: an ordered stack of transformations of the source (a photo, a video, the camera or the big
 * text), applied on the cell grid before the source becomes characters (engine/xform.ts). Each card is
 * one step: what it is (a picker with a small render of the piece with it), whether it is on, its two
 * settings, and its place in the order.
 */
export function XformTab({ space }: { space: SpaceId }) {
  const recipe = useRecipe();
  const list = useField(F<Xform[] | undefined>('media.xform')) ?? [];
  const media = useMedia();
  const source = recipe?.source ?? 'pattern';
  const isText = source === 'text';
  const loaded = isText || (source === 'image' && !!media.image) || (source === 'video' && !!media.video) || (source === 'camera' && media.camera === 'on');
  const moving = source === 'video' || source === 'camera' || (isText && !!recipe?.text.anim);
  const used = list.map(x => x.kind);
  const labelId = useId();
  const onOpen = useCallback((o: boolean) => { if (o) openThumbSession(); else closeThumbSession(); }, []);
  const addOpts = useMemo(() => xformOptions(used), [used.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const full = list.length >= XFORM_MAX;
  const add = (kind: XformKind) => edit(r => setList(r, [...(r.media.xform ?? []), fresh(kind)]), 'xf-add' + Date.now());
  const surprise = () => edit(r => {
    const pool = isText ? (['semitono', 'contorno', 'caleido', 'desplazar', 'arrastre', 'ondular', 'bandas', 'canales', 'estela'] as XformKind[]) : undefined;
    setList(r, randomXforms(`${Date.now()}`, r.meta.arch, moving, pool));
  }, 'xf-dice' + Date.now());
  // a card that changes kind is made again, and one removed goes away, with the control that had the
  // keyboard: once the list is drawn, it goes to the card now at that place (or the last one), else to «Añadir»
  const addBox = useRef<HTMLDivElement>(null);
  const refocus = useRef<number | null>(null);
  const keepFocus = useCallback((i: number) => { refocus.current = i; }, []);
  useLayoutEffect(() => {
    const i = refocus.current, box = addBox.current;
    if (i === null || !box) return;
    refocus.current = null;
    const cards = box.parentElement?.querySelectorAll('.xf-card') ?? [];
    const card = cards[Math.min(i, cards.length - 1)];
    (card?.querySelector<HTMLElement>('[role="combobox"]') ?? box.querySelector<HTMLElement>('[role="combobox"]'))?.focus();
  }, [list]);
  if (source === 'pattern') {
    return <Note>Las transformaciones cambian una imagen, un video, la cámara o el texto grande antes de volverlos caracteres. Elige una fuente en «{space === 'tipo' ? 'Texto' : 'Fuente'}».</Note>;
  }
  return (
    <>
      <Note>Cambian {isText ? 'el texto' : 'la imagen'} antes de volverl{isText ? 'o' : 'a'} caracteres. Se aplican en orden, de arriba abajo: combina hasta {XFORM_MAX} y cambia su orden para cambiar el resultado.</Note>
      {!loaded && <Note>Cuando cargues {source === 'camera' ? 'la cámara' : source === 'video' ? 'un video' : 'una imagen'} en «Fuente» verás aquí cada transformación sobre ella.</Note>}
      {list.map((x, i) => <XformCard key={x.kind} i={i} n={list.length} x={x} used={used} moving={moving} isText={isText} onOpen={onOpen} keepFocus={keepFocus} />)}
      <Sub>{list.length ? 'Añadir otra' : 'Añadir una transformación'}</Sub>
      <div className="xf-add" ref={addBox}>
        <span id={labelId} className="sr-only">Añadir una transformación</span>
        <Picker<XformKind>
          value={undefined} options={addOpts} label="Añadir una transformación" labelId={labelId} placeholder={full ? `Ya hay ${XFORM_MAX}: quita una para añadir otra` : 'Elige una transformación…'}
          disabled={full} minWidth={320} onOpenChange={onOpen}
          renderOption={o => (
            <>
              <XformThumb base={recipe} list={[...list, fresh(o.value)]} />
              <span className="pk-main"><span className="pk-name">{o.label}</span>{o.desc && <span className="pk-desc">{o.desc}</span>}</span>
            </>
          )}
          preview={o => (recipe && !o.disabled ? <PiecePreview recipe={withXforms(recipe, [...list, fresh(o.value)])} label={o.label} /> : null)}
          onChange={add} />
        <button type="button" className="icon-btn" title="Otra combinación al azar" aria-label="Otra combinación de transformaciones al azar" onClick={surprise}><IDice /></button>
      </div>
      {list.length > 0 && (
        <button type="button" className="btn ghost" onClick={() => { keepFocus(0); edit(r => setList(r, []), 'xf-clear' + Date.now()); }}>Quitar las transformaciones</button>
      )}
    </>
  );
}

function XformCard({ i, n, x, used, moving, isText, onOpen, keepFocus }: {
  i: number; n: number; x: Xform; used: XformKind[]; moving: boolean; isText: boolean; onOpen: (o: boolean) => void; keepFocus: (i: number) => void;
}) {
  const info = xformById(x.kind) ?? XFORMS[0];
  const recipe = useRecipe();
  const labelId = useId();
  const h = useHelp(undefined, { hint: info.desc, more: MORE[x.kind] });
  const P = (k: string) => F(`media.xform.${i}.${k}`);
  const opts = useMemo(() => xformOptions(used, x.kind), [used.join(), x.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = recipe?.media.xform ?? [];
  const card = useRef<HTMLDivElement>(null);
  const move = (d: number) => {
    const had = !!card.current && card.current.contains(document.activeElement);
    edit(r => {
      const l = r.media.xform!.slice();
      const [t] = l.splice(i, 1);
      l.splice(i + d, 0, t);
      r.media.xform = l;
    }, 'xf-move' + Date.now());
    // the card moved with its buttons: if the one pressed can no longer go that way, the other keeps the focus
    requestAnimationFrame(() => {
      const bs = card.current?.querySelectorAll<HTMLButtonElement>('.xf-move');
      if (!bs || !had) return;
      const want = bs[d < 0 ? 0 : 1], other = bs[d < 0 ? 1 : 0];
      (want && !want.disabled ? want : other)?.focus();
    });
  };
  return (
    <div ref={card} className={'layer xf-card' + (x.on ? '' : ' off')}>
      <div className="layer-head">
        <span className="idx">{String(i + 1).padStart(2, '0')}</span>
        <span id={labelId} className="sr-only">Transformación {i + 1}</span>
        <Picker<XformKind>
          value={x.kind} options={opts} label={`Transformación ${i + 1}`} labelId={labelId} describedBy={h?.hintId} minWidth={320} onOpenChange={onOpen}
          renderOption={o => (
            <>
              <XformThumb base={recipe} list={list.map((y, j) => (j === i ? { ...fresh(o.value), on: true } : y))} />
              <span className="pk-main"><span className="pk-name">{o.label}</span>{o.desc && <span className="pk-desc">{o.desc}</span>}</span>
            </>
          )}
          onChange={k => { keepFocus(i); edit(r => { r.media.xform![i] = fresh(k); }, `media.xform.${i}.kind`); }} />
        <button type="button" className="icon-btn" aria-pressed={!x.on} title={x.on ? 'Apagar un momento' : 'Apagada: pulsa para encenderla'} aria-label={`Apagar «${info.name}»`}
          onClick={() => edit(r => { r.media.xform![i].on = !r.media.xform![i].on; }, 'xf-toggle' + Date.now())}>{x.on ? <IEye /> : <IEyeOff />}</button>
        {h && <HelpToggle h={h} name={info.name} />}
      </div>
      <HintText h={h} />
      <HelpMore h={h} />
      <p className="layer-desc">{info.desc}</p>
      {info.motion && !moving && <Note>{isText ? 'Se ve cuando las letras se mueven («Letras que se mueven», en Texto).' : 'Sólo se ve con un video o la cámara: en una foto quieta no hay movimiento que dejar atrás.'}</Note>}
      {x.kind === 'desplazar' && <Note>Empuja con el patrón de {isText ? '«Relleno»' : '«Patrón»'}: cambia allí el dibujo para cambiar el empuje.</Note>}
      <Slider f={P('amount')} label={info.amount} min={0} max={1} fmt={pct} help={{ hint: `${info.amount} de «${info.name}». En 0 no cambia nada.` }}
        compare={<CompareStrip path={`media.xform.${i}.amount`} choices={AMOUNTS} fmt={pct} zoom={0.6} label={`${info.amount} de ${info.name}`} />} />
      <Slider f={P('p')} label={info.p} min={0} max={1} fmt={info.pFmt} help={{ hint: `${info.p} de «${info.name}».` }} />
      <div className="row" style={{ marginBottom: 10 }}>
        <button type="button" className="icon-btn xf-move" disabled={i === 0} onClick={() => move(-1)} aria-label={`Subir «${info.name}»`} title={i === 0 ? 'Ya es la primera' : 'Antes (se aplica antes)'}><IUp /></button>
        <button type="button" className="icon-btn xf-move" disabled={i === n - 1} onClick={() => move(1)} aria-label={`Bajar «${info.name}»`} title={i === n - 1 ? 'Ya es la última' : 'Después (se aplica después)'}><IDown /></button>
        <span style={{ flex: 1 }} />
        <button type="button" className="icon-btn" onClick={() => { keepFocus(i); edit(r => setList(r, r.media.xform!.filter((_, j) => j !== i)), 'xf-rm' + Date.now()); }}
          aria-label={`Quitar «${info.name}»`} title="Quitar"><ITrash /></button>
      </div>
    </div>
  );
}

/** A few words more for each, behind «?». */
const MORE: Record<XformKind, string> = {
  semitono: 'Como la impresión de un periódico: una trama de puntos a 45°; donde hay luz el punto crece. Con juegos de caracteres de pocos pasos (Bloques, Puntos) los puntos se leen mejor.',
  contorno: 'Busca los cambios de brillo y los enciende con el color de la propia imagen; el resto se apaga. Con «Colores de: La imagen» brilla como neón.',
  bandas: 'Reduce cada color a unas pocas tintas planas. Con dos o tres tintas queda como un cartel; combina bien con Semitono.',
  arrastre: 'En cada tramo vertical más claro que el umbral, los colores se ordenan del más oscuro (arriba) al más claro (abajo): el «pixel sort» de los glitches, hecho de caracteres.',
  desplazar: 'Usa el valor del patrón de capas en cada celda para empujar la fuente en una dirección. Un patrón suave da un vidrio ondulado; uno duro, cortes y saltos.',
  caleido: 'Repite un gajo de la fuente alrededor del centro con espejos. Con dos espejos es una simetría doble; con doce, un rosetón.',
  ondular: 'Desplaza las filas y las columnas con ondas que avanzan: la fuente ondea aunque sea una foto quieta.',
  estela: 'Compara cada fotograma con el anterior: lo que cambió deja una luz de su color que se apaga poco a poco. Con video, cámara o letras que se mueven.',
  canales: 'Toma el rojo de un lado y el azul del otro, como una señal de video desajustada. Se nota más con «Colores de: La imagen».',
  bloques: 'Agrupa las celdas en bloques cuadrados que toman el color de su centro: píxeles grandes hechos de un mismo carácter.',
};
