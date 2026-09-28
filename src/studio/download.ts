import { toast } from './toast';

/**
 * Saves a file locally. Nothing is uploaded: the blob never leaves the browser. Where the system can
 * share files (phones, tablets, some desktops), the notice offers «Compartir» too: the system's own share
 * sheet (messages, notes, social apps…), which the person chooses and which a tap has to start.
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
  if (file) {
    toast('Descargado: ' + name, {
      label: 'Compartir',
      run: () => {
        navigator.share({ files: [file], title: name }).catch((e: unknown) => {
          // the person closed the share sheet: nothing to say
          if ((e as { name?: string } | null)?.name !== 'AbortError') toast('No se pudo compartir el archivo. Ya está en tus descargas.');
        });
      },
    }, 6000);
    return;
  }
  toast('Descargado: ' + name);
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
