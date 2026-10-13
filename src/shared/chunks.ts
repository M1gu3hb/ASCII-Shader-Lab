/**
 * Lazy chunks that can be asked for again. A module whose fetch failed (a 404, a dropped connection) stays
 * failed in the browser's module map: importing the same address again fails at once, without a request
 * (Chromium does so). A retry therefore asks for the same file under another address (a query), which the
 * failed import's message names in Chromium and Firefox. Where the message does not name it, the retry
 * repeats the original import, and the caller's notice suggests reloading the page.
 */
const again = new Map<string, string>();
let serial = 0;

/** The module address a failed dynamic import names in its message, if any. */
export function failedChunkUrl(e: unknown): string | undefined {
  const msg = e instanceof Error ? e.message : String(e);
  return /(https?:\/\/[^\s'"]+?\.(?:m?js|tsx?))(?:\?[^\s'"]*)?(?=[\s'"]|$)/.exec(msg)?.[1];
}

export async function importChunk<T>(key: string, load: () => Promise<T>): Promise<T> {
  const url = again.get(key);
  try {
    const m = url ? ((await import(/* @vite-ignore */ url)) as T) : await load();
    again.delete(key);
    return m;
  } catch (e) {
    const failed = failedChunkUrl(e) ?? url?.split('?')[0];
    if (failed) again.set(key, `${failed}?reintento=${++serial}`);
    throw e;
  }
}
