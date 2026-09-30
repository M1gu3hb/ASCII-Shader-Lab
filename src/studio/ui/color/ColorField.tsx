import { useId, useState } from 'react';
import { ColorPicker } from './ColorPicker';
import { describe } from './color-math';
import './color.css';

/**
 * A colour setting: its swatch and code in one button that opens the studio's colour editor right under it
 * (in the flow of the panel, so it works the same in the side panel, the tablet layout and the phone sheet).
 * Replaces the browser's own colour input, which looks and behaves differently on every device.
 */
export function ColorField({ value, onChange, label, labelId, swatches, describedBy }: {
  value: string;
  onChange: (hex: string) => void;
  label: string;
  /** id of the visible name, when there is one */
  labelId?: string;
  swatches?: string[];
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const v = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
  return (
    <div className="cf">
      <button
        type="button" className="cf-btn" aria-expanded={open} aria-controls={id} aria-describedby={describedBy}
        aria-label={`${label}: ${v.toUpperCase()}, ${describe(v)}. ${open ? 'Cerrar el editor' : 'Editar'}`}
        onClick={() => setOpen(o => !o)}
      >
        <span className="cf-sw" style={{ background: v }} aria-hidden="true" />
        <span className="cf-val mono" aria-hidden="true">{v.toUpperCase()}</span>
        <span className="cf-chev" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      <div id={id} className="cf-pop" hidden={!open} aria-labelledby={labelId}>
        {open && <ColorPicker value={v} onChange={onChange} label={label} swatches={swatches} />}
      </div>
    </div>
  );
}
