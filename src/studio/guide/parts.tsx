import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Recipe } from '../../engine/recipe';
import type { CodeOptions, Placement } from '../../exporters/code';
import { copyText, downloadBlob, downloadText } from '../download';
import { exportImage } from '../exporting';
import { pieceFileBase } from '../packages';
import { toast } from '../toast';
import { useEntry } from '../store';
import { renderCrops, type CropSpec } from './thumbs';
import { ScrimCodeNote, useExportScrim } from '../views/scrimExport';

/* ------------------------------------------------------------------ */
/* Style grid                                                           */
/* ------------------------------------------------------------------ */

export interface StyleItem { id: string; name: string; recipe: Recipe; pressed: boolean; pick: () => void }

const STYLE_CROP: CropSpec = { w: 240, h: 150, zoom: 1 };

/**
 * Large visual choices: each tile is a render of the piece as it would look (with the person's own
 * photo or word). Rendered when the step shows, cancelled when it goes, cached.
 */
export function StyleGrid({ items, label, crop = STYLE_CROP, children }: { items: StyleItem[]; label: string; crop?: CropSpec; children?: ReactNode }) {
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const key = useMemo(() => JSON.stringify(items.map(i => i.recipe)), [items]);
  useEffect(() => {
    const sig = { cancelled: false };
    const list = JSON.parse(key) as Recipe[];
    const ids = items.map(i => i.id);
    renderCrops(list, crop, (i, url) => { if (!sig.cancelled) setUrls(u => ({ ...u, [ids[i]]: url })); }, sig);
    return () => { sig.cancelled = true; };
  }, [key, crop]); // items are rebuilt on each render; the recipes they carry are what matters
  return (
    <div className="gs-grid" role="group" aria-label={label}>
      {items.map(it => {
        const url = urls[it.id];
        return (
          <button key={it.id} type="button" className={'gs-tile' + (url ? '' : ' wait')} aria-pressed={it.pressed} onClick={it.pick}
            style={url ? { backgroundImage: `url(${url})` } : undefined}>
            <span className="gs-name">{it.name}</span>
            {url === undefined && <span className="gs-wait" aria-hidden="true">tejiendo…</span>}
          </button>
        );
      })}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Progress                                                             */
/* ------------------------------------------------------------------ */

export function Busy({ p, label, onCancel }: { p: number; label?: string; onCancel?: () => void }) {
  return (
    <div className="guide-busy">
      <div className="progress" role="progressbar" aria-label={label ?? 'Progreso'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}>
        <i style={{ '--v': Math.round(p * 100) + '%' } as React.CSSProperties} />
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="note" style={{ margin: 0 }}>{label ?? 'Trabajando…'} {Math.round(p * 100)} %</span>
        {onCancel && <button type="button" className="mini" onClick={onCancel}>Cancelar</button>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Code for a web page                                                  */
/* ------------------------------------------------------------------ */

type Kind = 'html' | 'wc' | 'react';
const KIND_NAMES: Record<Kind, string> = { html: 'HTML para pegar', wc: 'Web Component', react: 'React' };
const PLACE_NAMES: Record<Placement, string> = { fixed: 'Fondo de página', hero: 'Portada', block: 'Bloque' };

/**
 * The piece as code for a website (the same exporters as the export sheet): pick the kind and the
 * placement, copy it, or download a test page and a poster image.
 */
export function CodeBox({ kinds, placements, placement: initial }: { kinds: Kind[]; placements: Placement[]; placement: Placement }) {
  const e = useEntry();
  const [mod, setMod] = useState<typeof import('../../exporters/code') | null>(null);
  const [kind, setKind] = useState<Kind>(kinds[0]);
  const [placement, setPlacement] = useState<Placement>(initial);
  useEffect(() => { let alive = true; void import('../../exporters/code').then(m => { if (alive) setMod(m); }); return () => { alive = false; }; }, []);
  const r = e?.recipe;
  // the protected zone chosen in the preview goes with the code
  const scrim = useExportScrim();
  const opts: CodeOptions = { placement, interactive: !!r && r.interact.mode !== 'none', systemFont: false, height: 420, mediaUrl: '', scrim };
  const out = useMemo(() => {
    if (!mod || !r) return null;
    if (kind === 'html') { const x = mod.htmlSnippet(r, opts); return { code: x.code, notes: x.notes, file: null as null | { name: string; text: string } }; }
    if (kind === 'wc') { const x = mod.webComponent(r, opts); return { code: x.usage, notes: x.notes, file: { name: 'monotrama-field.js', text: x.file } }; }
    const x = mod.reactComponent(r, opts); return { code: x.code, notes: x.notes, file: null };
  }, [mod, r, kind, placement, scrim]); // opts is rebuilt from these values
  if (!r) return null;
  const base = pieceFileBase(r);
  const poster = async () => {
    try { downloadBlob(base + '-poster.png', await exportImage(r, { kind: 'view', scale: 1 }, { transparent: false, format: 'png' })); }
    catch (err) { toast('No se pudo generar el póster: ' + (err as Error).message); }
  };
  return (
    <div className="codebox">
      {kinds.length > 1 && (
        <div className="seg" role="group" aria-label="Tipo de código">
          {kinds.map(k => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_NAMES[k]}</button>)}
        </div>
      )}
      {placements.length > 1 && (
        <div className="seg" role="group" aria-label="Colocación">
          {placements.map(p => <button key={p} type="button" aria-pressed={placement === p} onClick={() => setPlacement(p)}>{PLACE_NAMES[p]}</button>)}
        </div>
      )}
      <textarea className="code" readOnly value={out?.code ?? 'Preparando…'} aria-label={`Código: ${KIND_NAMES[kind]}`} onFocus={ev => ev.currentTarget.select()} />
      <button type="button" className="btn primary" disabled={!out} onClick={() => out && void copyText(out.code, 'Código copiado')}>Copiar el código</button>
      {out?.file && <button type="button" className="btn" onClick={() => downloadText(out.file!.name, out.file!.text, 'text/javascript')}>Descargar {out.file.name}</button>}
      <div className="row2">
        <button type="button" className="btn" disabled={!mod} onClick={() => mod && downloadText(base + '-prueba.html', mod.htmlPage(r, opts), 'text/html')}>Descargar página de prueba (.html)</button>
        <button type="button" className="btn" onClick={() => void poster()}>Descargar póster (PNG)</button>
      </div>
      <p className="note">
        Motor incluido ({mod ? Math.round(mod.runtimeSize(r, 'basic') / 1024) : '…'} KB), sólo con los patrones que usa esta pieza. Se pausa fuera de pantalla y respeta «reducir movimiento».
        {kind === 'wc' && ' Sube monotrama-field.js junto a tu página.'}
      </p>
      {scrim && <ScrimCodeNote zone={scrim} on />}
      {out?.notes.map((n, i) => <p key={i} className="note">{n}</p>)}
      <p className="note">Sin WebGL 2 la dibuja el motor básico que va incluido (Canvas 2D, más despacio); si tampoco puede, se ve el color de fondo, o el póster si lo subes con tu página y pones su URL en «poster». Para un código más ligero sin ese respaldo, usa la pestaña Código de Exportar.</p>
    </div>
  );
}
