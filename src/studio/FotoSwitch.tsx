import { useEffect, useRef, useState } from 'react';
import { cloneRecipe, type MediaRef } from '../engine/recipe';
import { putHandoff } from '../foto/handoff';
import { mediaElement } from './media';
import { put } from './mediaStore';
import { currentEntry, currentRecipe, persistNow } from './store';
import { toast } from './toast';
import '../foto/switch.css';

/**
 * «Laboratorio ⇄ Foto y video» in the lab's top bar (the photo studio shows the same switch). «Foto y
 * video» opens a small menu: go to the photo studio, or take this piece there («Llevar al estudio de foto»:
 * a new project with its picture and one ASCII layer with this recipe). Only a key travels in the address;
 * the recipe goes through IndexedDB (src/foto/handoff.ts) and the picture is already in the media store.
 */
export function FotoSwitch() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLElement>('.sw-menu a')?.focus();
    const out = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', out, true);
    return () => document.removeEventListener('pointerdown', out, true);
  }, [open]);
  const bring = async () => {
    setBusy(true);
    try {
      const r = cloneRecipe(currentRecipe());
      let ref: MediaRef | null = null;
      let video: { duration: number } | undefined;
      if ((r.source === 'image' || r.source === 'video') && r.media.ref?.id) {
        ref = r.media.ref;
        const v = r.source === 'video' ? mediaElement('video') as HTMLVideoElement | null : null;
        if (v && Number.isFinite(v.duration)) video = { duration: v.duration };
      } else if (r.source === 'camera') {
        // the camera goes as a still of what the stage shows now (mirrored as the stage shows it)
        const el = mediaElement('camera') as HTMLVideoElement | null;
        if (el && el.videoWidth) {
          const c = document.createElement('canvas');
          c.width = el.videoWidth; c.height = el.videoHeight;
          const x = c.getContext('2d')!;
          if (r.media.mirror) { x.translate(c.width, 0); x.scale(-1, 1); }
          x.drawImage(el, 0, 0);
          const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', 0.92));
          if (blob) {
            const s = await put(blob, { kind: 'image', name: 'camara.jpg', w: c.width, h: c.height });
            ref = { id: s.id, kind: 'image', name: 'camara.jpg', type: 'image/jpeg', size: blob.size, w: c.width, h: c.height };
            r.source = 'image';
            r.media.mirror = false;
          }
        }
      }
      await persistNow();
      const k = await putHandoff({ kind: 'lab-to-foto', recipe: r, ref, ...(video ? { video } : {}), labEntry: currentEntry()?.id, name: r.meta.name ?? undefined, at: Date.now() });
      location.href = `/studio/foto/#lab=${k}`;
    } catch {
      setBusy(false);
      toast('No se pudo llevar la pieza al estudio de foto (el navegador no deja guardar datos en esta ventana).');
    }
  };
  return (
    <nav className="sw" aria-label="Estudios de GLYPHOS" ref={box}>
      <a className="sw-seg" href="/studio/" aria-current="page" title="Laboratorio: patrones, fondos, texto y terminal">
        <span className="sw-long">Laboratorio</span><span className="sw-short" aria-hidden="true">Lab</span>
      </a>
      <div className="sw-go">
        <button type="button" className="sw-seg" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)} title="Foto y video: capas, máscaras y recortes sobre tu foto"
          onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
          <span className="sw-long">Foto y video</span><span className="sw-short" aria-hidden="true">Foto</span>
          <span className="sr-only"> (menú)</span>
        </button>
        {open && (
          <div className="sw-menu" role="menu" onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); box.current?.querySelector<HTMLButtonElement>('.sw-go > button')?.focus(); } }}>
            <a role="menuitem" href="/studio/foto/">Abrir el estudio de foto y video<small>Tus proyectos, plantillas y fotos.</small></a>
            <button type="button" role="menuitem" disabled={busy} onClick={() => void bring()}>
              {busy ? 'Llevando la pieza…' : 'Llevar al estudio de foto'}<small>Esta pieza como capa ASCII sobre su foto, en un proyecto nuevo.</small>
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
