import { onOwnershipLost, pauseStudio, persistNow, useStudio } from './store';

/**
 * One studio tab at a time keeps the history and the collection. Each tab works from its own copy in
 * memory, so two tabs saving side by side overwrote each other (the last one to save won, and one
 * tab's clean-up deleted records and files the other still used).
 *
 * The newest tab takes over: the tab that had the studio saves what it has, stops and says so (its
 * «Usar aquí» reloads it, which takes the studio back). A Web Lock says who has it, a
 * BroadcastChannel asks that tab to let go, and the owner token in IndexedDB (store.ts) stops a tab
 * that was frozen in the background, and so never heard it, from saving over the new owner.
 */
const NAME = 'monotrama-estudio';

const channel: BroadcastChannel | null = typeof BroadcastChannel === 'function' ? new BroadcastChannel(NAME) : null;
type Msg = { type: 'claim' } | { type: 'released' };
const post = (m: Msg) => { try { channel?.postMessage(m); } catch { /* closed */ } };

/** Lets go of the lock this tab holds (null: it holds none). */
let release: (() => void) | null = null;
let ready = false;
let claimed = false;
/** The latest lock request: an earlier one of this same tab that gives way to it is not a loss. */
let latest = 0;

/** How long a tab that has the studio gets to save and let go before the new one takes it anyway. */
const PATIENCE = 3000;

function request(opts: LockOptions): Promise<boolean> {
  const n = ++latest;
  return new Promise(resolve => {
    let held = false;
    navigator.locks.request(NAME, opts, lock => {
      if (!lock) { resolve(false); return undefined; }
      held = true;
      resolve(true);
      return new Promise<void>(r => { release = () => { release = null; r(); }; });
    }).catch(() => {
      // a request given up (signal) rejects too; only the lock held, then taken by another tab, is lost
      if (held && n === latest) { release = null; lost(); }
      resolve(false);
    });
  });
}

/**
 * Makes this tab the one that owns the studio data, before anything is loaded. When another tab has
 * it, that tab is asked to save and let go; `waiting` is called if that takes a moment.
 */
export async function claimStudio(waiting: () => void): Promise<void> {
  channel?.addEventListener('message', ev => {
    const m = ev.data as Msg | null;
    if (m?.type === 'claim') void handOver();
  });
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  try {
    if (!locks?.request) {
      // no Web Locks: ask, and give the other tab a moment to save (the owner token guards the rest)
      if (channel) { post({ type: 'claim' }); await answer(600); }
      return;
    }
    if (await request({ ifAvailable: true })) return;
    const t = setTimeout(waiting, 400);
    post({ type: 'claim' });
    const queued = new AbortController();
    const got = await Promise.race([
      request({ signal: queued.signal }),
      new Promise<boolean>(r => setTimeout(r, PATIENCE, false)),
    ]);
    // the other tab did not answer (frozen in the background, or busy): take the studio anyway
    if (!got && !release) {
      queued.abort();
      await request({ steal: true });
    }
    clearTimeout(t);
  } catch {
    // locks not allowed here (e.g. a sandboxed frame): work as before, the owner token still guards
  } finally {
    claimed = true;
  }
}

function answer(ms: number): Promise<void> {
  return new Promise(res => {
    const t = setTimeout(res, ms);
    channel?.addEventListener('message', ev => { if ((ev.data as Msg | null)?.type === 'released') { clearTimeout(t); res(); } });
  });
}

/** Called once the store is loaded: a claim that came meanwhile is answered now. */
export function tabsReady() {
  ready = true;
  onOwnershipLost(() => { release?.(); });
  if (pending) void handOver();
}

let pending = false;
/** Another tab wants the studio: save, stop, let go. */
async function handOver() {
  if (!claimed || !ready) { pending = true; return; }
  pending = false;
  if (useStudio.getState().away) return;
  let saved = true;
  try { await persistNow(); } catch { saved = false; }
  if (useStudio.getState().storage !== 'ok') saved = false;
  pauseStudio(saved);
  release?.();
  post({ type: 'released' });
}

/** The lock was taken away without asking (this tab did not answer in time). */
function lost() {
  pauseStudio(false);
}
