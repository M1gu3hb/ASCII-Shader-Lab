/**
 * «Quitar fondo del video» in the «Recorte» panel, for a video source (src/video removeBackgroundVideo: a matting
 * model on every frame of a stretch, smoothed in time so the edge does not boil).
 *
 *   1. what it costs before anything starts (estimateBackgroundVideo: frames, time on a device like the test
 *      machine, the download when the model is not here yet) for the chosen model and stretch;
 *   2. consent before any download (consentInfo: size, where from, licences, «tu video no se sube»);
 *   3. progress (with time left) and «Cancelar»;
 *   4. the result, ONE undo step: the target layer's mask (the subject, or the background: the subject taken out
 *      of it), or a new layer with the video cut out (the same video with that mask), just above the target.
 */
import { useEffect, useState } from 'react';
import type { CutoutCaps } from '../../cutout';
import { sourceFit } from '../../project/compositor';
import { defaultMask, newLayer } from '../../project/normalize';
import { edit, select, useProject } from '../../project/store';
import type { Id, Layer, MaskRasterPart, Project, Source } from '../../project/types';
import type { ToolHost } from '../tools/types';
import { Button, Note, Progress, Row, Segmented, Slider } from '../tools/ui';

type Cut = typeof import('../../cutout');
let cutP: Promise<Cut> | null = null;
const cutout = () => (cutP ??= import('../../cutout'));

type Model = 'portrait' | 'subject';
type Use = 'subject' | 'background' | 'layer';
type Phase = 'idle' | 'consent' | 'downloading' | 'running' | 'done' | 'error';

/** QA hooks (tests/e2e/foto-video.spec.ts reads them). */
export const videoCutoutQA: { phase: () => string; last: null | { frames: number; ms: number; model: string; use: Use } } = { phase: () => '', last: null };

const fmtT = (s: number) => {
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1).replace('.', ',')}`;
};

/** The stretch a layer shows (its span, or the whole project). */
export function stretchOfLayer(p: Project, layer: Layer | null): { start: number; end: number } {
  return { start: Math.max(0, layer?.span?.in ?? 0), end: Math.max(0.05, Math.min(p.time.duration, layer?.span?.out ?? p.time.duration)) };
}

/** Puts the matted part where the person chose, in one undo step. Returns what was done, in Spanish. */
export function applyVideoMatte(part: MaskRasterPart, use: Use, source: Source, targetId: Id | null): string {
  const p = useProject.getState().project;
  if (!p) return '';
  if (use === 'layer') {
    const layer = newLayer('photo', { name: 'Video recortado', source: source.id, fit: sourceFit(p, source.id), mask: { ...defaultMask(), parts: [{ ...part, op: 'add', origin: 'subject' }] } });
    edit(d => {
      const at = d.layers.findIndex(l => l.id === targetId);
      d.layers.splice(at >= 0 ? at + 1 : d.layers.length, 0, layer);
    });
    select([layer.id]);
    return 'una capa nueva con el video recortado (el mismo video con la máscara del sujeto)';
  }
  if (!targetId) return '';
  // the background: the subject taken out of the layer (a first part that subtracts starts from everything)
  const done: MaskRasterPart = use === 'subject' ? { ...part, op: 'add', origin: 'subject' } : { ...part, op: 'subtract', origin: 'background' };
  let name = '';
  edit(d => {
    const t = d.layers.find(l => l.id === targetId);
    if (!t) return;
    name = t.name;
    t.mask ??= defaultMask();
    t.mask.off = false;
    t.mask.parts.push(done);
  });
  return use === 'subject' ? `la máscara del sujeto en «${name}»` : `la máscara del fondo en «${name}» (el sujeto se quita de ella)`;
}

export function VideoCutout({ host, source, onBusy, onClose }: { host: ToolHost; source: Source; onBusy(b: boolean): void; onClose(): void }) {
  const project = useProject(s => s.project);
  const targetId = host.target();
  const target = project?.layers.find(l => l.id === targetId) ?? null;
  const base = project ? stretchOfLayer(project, target) : { start: 0, end: 1 };
  const [range, setRange] = useState(base);
  const [model, setModel] = useState<Model>('portrait');
  const [use, setUse] = useState<Use>('layer');
  const [caps, setCaps] = useState<CutoutCaps | null>(null);
  const [est, setEst] = useState<Awaited<ReturnType<typeof import('../../video/matte').estimateBackgroundVideo>> | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [consent, setConsent] = useState<null | { name: string; size: string; text: string; licence: string; note?: string; from: string }>(null);
  const [progress, setProgress] = useState<{ p: number | null; label: string }>({ p: null, label: '' });
  const [ac, setAc] = useState<AbortController | null>(null);
  videoCutoutQA.phase = () => phase;

  useEffect(() => { let live = true; void cutout().then(c => c.cutoutCaps()).then(c => { if (live) setCaps(c); }).catch(() => undefined); return () => { live = false; }; }, []);
  // what it costs, said before starting
  useEffect(() => {
    if (!project) return;
    let live = true;
    const h = setTimeout(() => {
      void import('../../video/matte').then(m => m.estimateBackgroundVideo(project, { model, start: range.start, end: range.end, size: 512 }))
        .then(e => { if (live) setEst(e); }).catch(() => undefined);
    }, 120);
    return () => { live = false; clearTimeout(h); };
  }, [project?.id, model, range.start, range.end]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => ac?.abort(), [ac]);
  useEffect(() => { onBusy(phase === 'downloading' || phase === 'running'); }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!project) return null;
  const info = caps?.models.find(m => m.id === model);
  const available = (id: Model) => !!caps?.models.find(m => m.id === id)?.available;

  async function start() {
    const cut = await cutout();
    const st = await cut.modelState(model);
    if (st === 'absent' || st === 'error') {
      const c = await cut.consentInfo(model);
      setConsent({ name: c.name, size: c.size, text: c.text.replace('Tus fotos no se suben', 'Tu video no se sube'), licence: c.licence, note: c.note, from: c.from });
      setPhase('consent');
      host.say(`Hace falta descargar «${c.name}» (${c.size}). Nada se descarga sin tu permiso.`);
      return;
    }
    await run();
  }

  async function download() {
    const cut = await cutout();
    const ctl = new AbortController();
    setAc(ctl);
    setPhase('downloading');
    setProgress({ p: 0, label: 'Empezando la descarga…' });
    try {
      await cut.downloadModel(model, { signal: ctl.signal, onProgress: setProgress });
      await run();
    } catch (e) {
      const aborted = ctl.signal.aborted || (e as { code?: string })?.code === 'aborted';
      setPhase('consent');
      setError(aborted ? '' : (e as Error)?.message || 'La descarga falló.');
      host.say(aborted ? 'Descarga cancelada: no se guardó nada.' : 'La descarga falló.');
    }
  }

  async function run() {
    const p = useProject.getState().project;
    if (!p) return;
    const m = await import('../../video/matte');
    const ctl = new AbortController();
    setAc(ctl);
    setPhase('running');
    setError('');
    setProgress({ p: 0, label: 'Preparando el modelo…' });
    host.say('Quitando el fondo del video en este equipo: el video no se sube.');
    const t0 = performance.now();
    try {
      const part = await m.removeBackgroundVideo(p, {
        source: source.id, model, size: 512, smooth: 0.5, start: range.start, end: range.end, signal: ctl.signal,
        onProgress: pr => setProgress({ p: pr.total ? pr.done / pr.total : null, label: pr.label }),
      });
      const what = applyVideoMatte(part, use, source, targetId);
      videoCutoutQA.last = { frames: part.frames?.length ?? 0, ms: Math.round(performance.now() - t0), model, use };
      setPhase('done');
      host.say(`Hecho: ${what}, ${part.frames?.length ?? 0} cuadros. Un paso de deshacer lo quita.`);
      onClose();
    } catch (e) {
      const aborted = ctl.signal.aborted || (e as Error)?.name === 'AbortError';
      setPhase(aborted ? 'idle' : 'error');
      setError(aborted ? '' : (e as Error)?.message || 'No se pudo quitar el fondo del video.');
      host.say(aborted ? 'Cancelado: no se cambió nada.' : 'No se pudo quitar el fondo del video.');
    } finally {
      setAc(a => (a === ctl ? null : a));
    }
  }

  const busy = phase === 'downloading' || phase === 'running';
  const fps = Math.max(1, project.time.fps);
  return (
    <section className="cp-sec cp-video" aria-labelledby="cp-video-h">
      <h3 id="cp-video-h">Quitar fondo del video</h3>
      <p className="cp-lead">Cada cuadro pasa por el modelo en este equipo y el borde se suaviza entre cuadros para que no tiemble. Tu video no se sube.</p>
      {!busy && phase !== 'consent' ? (
        <>
          <div className="tool-opts cp-stack">
            <Segmented<Model> label="Modelo" value={model} onChange={v => setModel(v)} options={[
              { value: 'portrait', label: 'Retrato (personas)', title: 'Rápido; sólo personas' },
              { value: 'subject', label: 'Sujeto (cualquier cosa)', title: 'Cualquier sujeto; mucho más lento sin WebGPU' },
            ]} />
            {!available(model) && caps ? <Note tone="warn">{info?.why ?? 'Este modelo no puede ejecutarse aquí.'}</Note> : null}
            <Slider wide label="Desde" value={range.start} min={0} max={Math.max(0.05, project.time.duration - 1 / fps)} step={1 / fps} format={fmtT}
              onChange={v => setRange(r => ({ start: Math.min(v, r.end - 1 / fps), end: r.end }))} />
            <Slider wide label="Hasta" value={range.end} min={1 / fps} max={Math.max(0.05, project.time.duration)} step={1 / fps} format={fmtT}
              onChange={v => setRange(r => ({ start: r.start, end: Math.max(v, r.start + 1 / fps) }))} />
            <Segmented<Use> label="Qué hacer" value={use} onChange={setUse} options={[
              { value: 'layer', label: 'Capa recortada', title: 'Una capa nueva: el video sólo donde está el sujeto' },
              { value: 'subject', label: 'Máscara: sujeto', title: 'La capa elegida se ve sólo en el sujeto' },
              { value: 'background', label: 'Máscara: fondo', title: 'La capa elegida se ve sólo en el fondo' },
            ]} />
          </div>
          <Note tone="quiet">
            {use === 'layer' ? 'Una capa nueva encima de la elegida: el mismo video, sólo el sujeto (con transparencia alrededor).' : `La capa «${target?.name ?? '—'}» se verá sólo ${use === 'subject' ? 'en el sujeto' : 'en el fondo'}, cuadro a cuadro.`}
          </Note>
          {est ? <Note tone={est.seconds[1] > 600 ? 'warn' : 'quiet'}>{est.text}</Note> : <Note tone="quiet">Calculando cuánto tarda…</Note>}
          {info?.note ? <Note tone="quiet">{info.note}</Note> : null}
          {error ? <Note tone="warn">{error}</Note> : null}
          <Row>
            <Button primary disabled={!available(model) || (use !== 'layer' && !target)} onClick={() => void start()}>Quitar fondo del video</Button>
          </Row>
        </>
      ) : null}
      {phase === 'consent' && consent ? (
        <section className="tool-consent cp-consent" aria-labelledby="cp-vconsent-h">
          <h3 id="cp-vconsent-h">¿Descargar «{consent.name}» ({consent.size})?</h3>
          <p>Se descarga una sola vez desde {consent.from} y queda guardado en este navegador.</p>
          <p>{consent.text}</p>
          <Note tone="quiet">Licencia: {consent.licence}.</Note>
          {consent.note ? <Note tone="warn">{consent.note}</Note> : null}
          {error ? <Note tone="warn">{error}</Note> : null}
          <Row>
            <Button onClick={() => { setPhase('idle'); host.say('Sin descarga.'); }}>Ahora no</Button>
            <Button primary onClick={() => void download()}>Descargar {consent.size} y quitar el fondo</Button>
          </Row>
        </section>
      ) : null}
      {busy ? (
        <div className="cp-sec" aria-live="polite">
          <Progress value={progress.p} label={progress.label || 'Trabajando…'} />
          <Row><Button onClick={() => ac?.abort()}>Cancelar</Button></Row>
        </div>
      ) : null}
    </section>
  );
}
