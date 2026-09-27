import { toast } from './toast';

/** Saves a file locally. Nothing is uploaded: the blob never leaves the browser. */
export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  toast('Descargado: ' + name);
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
