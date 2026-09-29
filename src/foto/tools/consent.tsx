/**
 * The consent flow of the point-selection model ('select', src/cutout), shared by the tools that use it
 * («Objeto» and «Seguir objeto»): nothing is downloaded until the person agrees; the box names the model, its
 * size, where it comes from, its licences and the privacy sentence; «Ahora no» leaves a one-line reminder.
 */
import { useId, useState } from 'react';
import type { ToolHost } from './types';
import { Button, Note, Row } from './ui';

export interface ConsentFacts { name: string; size: string; text: string; licence: string; note?: string; from: string }

type Cut = typeof import('../../cutout');
let cutP: Promise<Cut> | null = null;
export const cutout = () => (cutP ??= import('../../cutout'));

/**
 * Whether the selection model can run now: 'ready' (downloaded), 'consent' (asks first: the facts to show, and
 * an error of an earlier try) or 'error' (this device cannot run it, with the reason).
 */
export async function selectModelState(): Promise<{ state: 'ready' } | { state: 'consent'; consent: ConsentFacts; error: string | null } | { state: 'error'; error: string }> {
  const cut = await cutout();
  const info = await cut.consentInfo('select');
  if (!info.available) return { state: 'error', error: info.why ?? 'Este equipo no puede ejecutar la selección de objetos.' };
  const st = await cut.modelState('select');
  if (st === 'absent' || st === 'error') {
    return {
      state: 'consent',
      consent: { name: info.name, size: info.size, text: info.text, licence: info.licence, note: info.note, from: info.from },
      error: st === 'error' ? 'La descarga anterior falló. Puedes intentarlo de nuevo.' : null,
    };
  }
  return { state: 'ready' };
}

/** The consent box (or, after «Ahora no», a one-line reminder with «Descargar…»). */
export function ModelConsent({ c, error, purpose, title, tool, host, onDownload }: {
  c: ConsentFacts; error: string | null;
  /** «seleccionar objetos con puntos», «seguir un objeto en el video»… */
  purpose: string;
  /** The options bar's title («Objeto», «Seguir objeto»). */
  title: string;
  /** data-tool of the options bar. */
  tool: string;
  host: ToolHost;
  onDownload(): void;
}) {
  const [later, setLater] = useState(false);
  const id = useId();
  if (later) {
    return (
      <div className="tool-opts" data-tool={tool}>
        <span className="tool-title">{title}</span>
        <Note tone="quiet">Para {purpose} hace falta un modelo de {c.size} que todavía no está en este navegador.</Note>
        <Button onClick={() => setLater(false)}>Descargar…</Button>
      </div>
    );
  }
  return (
    <div className="tool-opts" data-tool={tool}>
      <section className="tool-consent wide" aria-labelledby={id}>
        <h3 id={id}>¿Descargar «{c.name}» ({c.size})?</h3>
        <p>Para {purpose} hace falta este modelo. Se descarga una sola vez desde {c.from} y queda guardado aquí. {c.text.replace(/\. El modelo se descarga.*$/, '.').replace('el recorte ocurre', 'la selección ocurre')}</p>
        <Note tone="quiet">Licencia: {c.licence}.{c.note ? ` ${c.note}` : ''}</Note>
        {error ? <Note tone="warn">{error}</Note> : null}
        <Row>
          <Button onClick={() => { setLater(true); host.say('Sin descarga. Puedes seleccionar con las otras herramientas.'); }}>Ahora no</Button>
          <Button primary onClick={onDownload}>Descargar {c.size}</Button>
        </Row>
      </section>
    </div>
  );
}
