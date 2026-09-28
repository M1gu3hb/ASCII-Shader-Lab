import { create } from 'zustand';
import { toast } from './toast';

/**
 * The last file saved, for «Compartir» where the system can share files (phones, tablets, some
 * desktops): the export sheet shows it at its foot (a sheet covers the notices on a phone), a notice
 * offers it elsewhere. `n` counts saves, so a view knows whether one happened since it opened.
 */
export const useSaved = create<{ n: number; name: string; file: File | null }>(() => ({ n: 0, name: '', file: null }));

/**
 * Saves a file locally. Nothing is uploaded: the blob never leaves the browser. Sharing is the system's
 * own share sheet (messages, notes, social apps…), which the person chooses and which a tap has to start.
 */
export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  const file = shareable(name, blob);
  useSaved.setState(s => ({ n: s.n + 1, name, file }));
  if (file) toast('Descargado: ' + name, { label: 'Compartir', run: () => void shareFile(file) }, 6000);
  else toast('Descargado: ' + name);
}

/** Opens the system's share sheet with a file (a tap must start it); says so if it fails. */
export async function shareFile(file: File): Promise<void> {
  try {
    await navigator.share({ files: [file], title: file.name });
  } catch (e) {
    // the person closed the share sheet: nothing to say
    if ((e as { name?: string } | null)?.name !== 'AbortError') toast('No se pudo compartir el archivo. Ya está en tus descargas.');
  }
}

/** The file as the system's share sheet takes it, when this browser can share it (else null). */
function shareable(name: string, blob: Blob): File | null {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function' || typeof navigator.share !== 'function' || typeof File !== 'function') return null;
  try {
    const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
    return navigator.canShare({ files: [file] }) ? file : null;
  } catch {
    return null;
  }
}

export function downloadText(name: string, text: string, type = 'text/plain') {
  downloadBlob(name, new Blob([text], { type: type + ';charset=utf-8' }));
}

export async function copyText(text: string, what = 'Copiado al portapapeles') {
  try {
    await navigator.clipboard.writeText(text);
    toast(what);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    toast(ok ? what : 'No se pudo copiar: selecciona el texto y usa Ctrl+C');
    return ok;
  }
}
