import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cloneRecipe, type MediaRef } from '../engine/recipe';
import { putHandoff } from '../foto/handoff';
import { FOTO_STUDIO } from '../shared/site';
import { mediaElement } from './media';
import { hasMedia, put } from './mediaStore';
import { currentEntry, currentRecipe, persistNow } from './store';
import { toast } from './toast';
import '../foto/switch.css';

/**
 * «Laboratorio ⇄ Foto y video» in the lab's top bar (the photo studio shows the same switch). «Foto y
 * video» opens a small menu: go to the photo studio, or take this piece there («Llevar al estudio de foto»:
 * a new project with its picture and one ASCII layer with this recipe). Only a key travels in the address;
 * the recipe goes through IndexedDB (src/foto/handoff.ts) and the picture is already in the media store.
 * While the photo studio is paused (FOTO_STUDIO, src/shared/site.ts) there is no switch and no menu.
 */
export function FotoSwitch() {
  return FOTO_STUDIO ? <FotoSwitchMenu /> : null;
}

function FotoSwitchMenu() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // it hangs from the switch: on a narrow screen it moves left, so it ends 8 px from the right edge
    const m = menu.current;
    if (!open || !m) return;
    m.style.left = '';
    const r = m.getBoundingClientRect();
    const over = r.right - (document.documentElement.clientWidth - 8);
    if (over > 0) m.style.left = `${-Math.max(0, Math.min(over, r.left - 8))}px`;
  }, [open]);
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
      // only what this browser keeps travels (the photo studio reads it from the media store): a file too big
      // for it, or kept when there was no room, lives only in this tab, and the project would open without it
      const unkept = () => {
        setBusy(false);
        setOpen(false);
        const video = r.source === 'video';
        toast(`${video ? 'Este video no está guardado' : 'Esta foto no está guardada'} en el navegador (pesa demasiado o no quedó espacio), así que no puede viajar al estudio de foto. Ábre${video ? 'lo' : 'la'} allí directamente.`,
          { label: 'Ir al estudio de foto', run: () => { location.href = '/studio/foto/'; } }, 9000);
      };
      if ((r.source === 'image' || r.source === 'video') && r.media.ref?.id) {
        if (!(await hasMedia(r.media.ref.id))) { unkept(); return; }
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
            if (!s.stored) { unkept(); return; }
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
    <nav className="sw compact" aria-label="Estudios de GLYPHOS" ref={box}>
      {/* one accessible name whichever label shows (the short ones on narrower bars) */}
      {/* the page you are on: a tap does not reload it (that dropped the undo steps and turned the camera off) */}
      <a className="sw-seg" href="/studio/" aria-current="page" aria-label="Laboratorio" title="Laboratorio: patrones, fondos, texto y terminal"
        onClick={e => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) e.preventDefault(); }}>
        <span className="sw-long">Laboratorio</span><span className="sw-short" aria-hidden="true">Lab</span>
      </a>
      <div className="sw-go">
        <button type="button" className="sw-seg" aria-label="Foto y video" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)} title="Foto y video: capas, máscaras y recortes sobre tu foto"
          onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
          <span className="sw-long">Foto y video</span><span className="sw-short" aria-hidden="true">Foto</span>
        </button>
        {open && (
          <div className="sw-menu" role="menu" ref={menu} onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); box.current?.querySelector<HTMLButtonElement>('.sw-go > button')?.focus(); } }}>
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
