/**
 * The inspector's «Ajustes guardados» section of the selected layer: «Guardar como ajuste» (this layer's
 * style, finishes, animation and geometric mask) and «Aplicar ajuste» (the settings sheet, aimed at it).
 */
import { useState } from 'react';
import type { Layer } from '../../project/types';
import { Section } from '../controls';
import { saveLayerPreset } from './presetOps';
import { openExtras } from './state';

export function PresetSection({ l }: { l: Layer }) {
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  return (
    <Section title="Ajustes guardados" open={false} className="xr-sec">
      <div className="xr-inline">
        <input type="text" value={name} placeholder={l.name} maxLength={80} aria-label="Nombre del ajuste" onChange={e => setName(e.target.value)} />
        <button type="button" className="mini" disabled={busy} onClick={() => { setBusy(true); void saveLayerPreset(l.id, name.trim() || undefined).finally(() => { setBusy(false); setName(''); }); }}>
          Guardar como ajuste
        </button>
      </div>
      <button type="button" className="mini xr-apply" onClick={() => openExtras('ajustes', { mode: 'open' })}>Aplicar ajuste…</button>
      <p className="note">Guarda el estilo, los acabados, las animaciones y las zonas geométricas de la máscara de esta capa para usarlos en otra foto o video.</p>
    </Section>
  );
}
