import type { Layer, Recipe } from '../engine/recipe';
import { checkpointGen, getCheckpoint } from './checkpoints';
import { analyticOf, modelOf, modelsGen, ensureFamily } from './models';
import { familyById } from './registry';
import type { LayerFam } from './params';
import type { FamilyMeta, FieldModel, ModelState, Params, Stroke } from './types';

/**
 * Runs the models of a piece's raster families (geometry and simulation) for one engine and hands it each
 * layer's raster. The same class serves the WebGL 2 and the basic engine, so both show the same states.
 *
 * Clocks:
 *  - live engines integrate: every frame adds (piece time elapsed) × |layer speed| × rate steps, under a
 *    per-frame budget; when a device cannot keep up, the run slows down instead of skipping steps (the
 *    state stays a function of its steps) and `info()` says so. Parameters change live; strokes act live.
 *  - fixed-size engines (exports, thumbnails) compute: the frame at piece time t shows the state after
 *    base + floor((t − t0) × |speed| × rate) steps, base being the warm-up from the seed, a saved state
 *    (layer.fam.ck) or a copy of the live state handed over with start(). Going back in time starts again
 *    from that base. A change of parameters starts again too: a thumbnail engine renders many recipes.
 */

/** Raster of a layer as the engines upload or sample it: w × h bytes, row 0 at the top of the domain. */
export interface RasterView { data: Uint8Array; w: number; h: number; version: number; wrap: boolean }

export interface SlotState {
  /** Family, version, seed, rows and checkpoint the state belongs to. */
  key: string;
  /** Layer seconds simulated since its base. */
  simT: number;
  modified: boolean;
  params: Params;
  state: ModelState;
}

/** A copy of the live runs of a piece, per layer index (exports start from it). */
export interface FamilyBundle { slots: Array<SlotState | null> }

export interface SlotInfo {
  layer: number;
  id: string;
  name: string;
  steps: number;
  rate: number;
  /** Layer seconds simulated since the base. */
  simT: number;
  /** Strokes or live parameter changes since the base: the recipe alone no longer rebuilds this state. */
  modified: boolean;
  /** The device does not keep up: the run goes slower than the piece's clock. */
  lag: boolean;
  /** A fixed engine stopped short of the asked moment (budget). */
  partial: boolean;
  /** The state started from a saved checkpoint. */
  fromCheckpoint: boolean;
  /** The recipe names a checkpoint this page does not have: the run started from the seed. */
  ckMissing: boolean;
  loading: boolean;
  failed: boolean;
  /** Mean cost of a step (ms). */
  msPerStep: number;
}

interface Slot {
  key: string;
  meta: FamilyMeta;
  model: FieldModel;
  params: Params;
  paramsKey: string;
  rate: number;
  /** Steps of the base (warm-up, checkpoint or handed-over state). */
  base: number;
  /** State the base restores (checkpoint or handed-over copy); null: the seed plus warm-up. */
  baseState: ModelState | null;
  baseSimT: number;
  simT: number;
  debt: number;
  raster: Uint8Array;
  version: number;
  renderedSteps: number;
  renderedT: number;
  modified: boolean;
  lag: boolean;
  partial: boolean;
  fromCheckpoint: boolean;
  ckMissing: boolean;
  failed: boolean;
  ms: number;
}

interface Pending { key: string; loading: boolean; failed: boolean }

/** Whether a recipe's field pass can use «Bucle perfecto»: not with a family that has memory. */
export const fieldLoops = (r: Recipe) => r.motion.loop > 0 && !FamilyHost.uses(r);
/** The time a family's run reads: stop motion applied, never folded into a loop. */
export const familyTime = (t: number, hold: number) => (hold > 0 ? Math.floor(t * hold) / hold : t);

/** Moment a preview of a recipe (picker thumbnails, explorer) shows: a family with memory at most at `cap` s. */
export const previewTime = (r: Recipe, t: number, cap = 4) => (FamilyHost.uses(r) ? Math.min(t, cap) : t);

/**
 * A run is its family, version, seed, resolution, saved state and the parameters its model only reads when
 * built (`rebuild`: a grammar, a tile set, a population): changing one of those is another run, built anew
 * (and an undo finds the previous one among the retired runs). Other parameters change a run in place.
 */
const keyOf = (l: Layer, f: LayerFam) => {
  const meta = familyById(l.pattern);
  const built = meta ? meta.params.filter(s => s.rebuild).map(s => JSON.stringify(f.p[s.key] ?? null)).join(',') : '';
  return `${l.pattern}|${f.v}|${f.seed}|${f.res ?? 0}|${f.ck ?? ''}|${built}`;
};
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
/**
 * Raster versions are unique across every run of the page: an engine uploads a layer's raster when its version
 * changes, and a fresh run counting from 0 would repeat the version of the run it replaced (a stale texture).
 */
let versions = 0;
const nextVersion = () => ++versions;

export interface HostOptions {
  live: boolean;
  /** Live: milliseconds of model work per frame at most. */
  frameBudget?: number;
  /** Fixed: milliseconds a single render may spend catching up. */
  catchupBudget?: number;
  /** The engine evaluates analytic families on the CPU (the basic engine): their CPU twins load too. */
  cpu?: boolean;
  onError?: (msg: string) => void;
}

export class FamilyHost {
  private slots: Array<Slot | Pending | null> = [null, null, null, null];
  /** Live: runs that left the stage a moment ago (an undo brings them back as they were). */
  private retired: Slot[] = [];
  private lastT = NaN;
  private start: { bundle: FamilyBundle | null; t0: number } | null = null;
  private seenModels = -1;
  private seenCk = -1;
  private o: HostOptions;
  private reported = new Set<string>();

  constructor(o: HostOptions) { this.o = o; }

  /** On-layers in the order the field pass reads them (at most four). */
  static layersOf(r: Recipe): Layer[] { return r.layers.filter(l => l.on).slice(0, 4); }

  /** Whether a recipe has a raster family on (the engines then keep the host busy). */
  static uses(r: Recipe): boolean { return FamilyHost.layersOf(r).some(l => !!l.fam && familyById(l.pattern)?.kind !== 'analytic' && !!familyById(l.pattern)); }

  /** The families whose code this engine needs: raster ones always, analytic ones only on the CPU. */
  private needs(r: Recipe): string[] {
    return FamilyHost.layersOf(r).map(l => familyById(l.pattern)).filter((m): m is FamilyMeta => !!m && (m.kind !== 'analytic' || !!this.o.cpu)).map(m => m.id);
  }

  /** Loads the code of every family the recipe uses. */
  ready(r: Recipe): Promise<void> {
    return Promise.all(this.needs(r).map(ensureFamily)).then(() => undefined);
  }

  /** Whether the code of every family the recipe uses is here already. */
  loaded(r: Recipe): boolean {
    return this.needs(r).every(id => !!modelOf(id) || !!analyticOf(id));
  }

  /**
   * Fixed engines: the next renders start from these live runs at piece time t0; with no bundle, from their
   * seeds and warm-up with their clock starting at t0 (a clip «desde la semilla» that begins at t0).
   */
  setStart(bundle: FamilyBundle | null, t0 = 0) {
    this.start = bundle || t0 ? { bundle, t0 } : null;
    for (let i = 0; i < 4; i++) this.slots[i] = null;
  }

  /**
   * One frame: brings every raster layer's run to piece time `t` (held time: stop motion applied, no loop
   * folding) and renders the rasters that changed. Returns whether a run is still working (warming up,
   * catching up or loading), so a live engine keeps drawing.
   */
  update(r: Recipe, t: number): boolean {
    const layers = FamilyHost.layersOf(r);
    const dt = Number.isNaN(this.lastT) ? 0 : t - this.lastT;
    this.lastT = t;
    let busy = false;
    if (modelsGen() !== this.seenModels || checkpointGen() !== this.seenCk) {
      // code or a checkpoint arrived: pending slots try again; runs from the seed that waited for a
      // checkpoint start over from it (only if nobody touched them yet)
      this.seenModels = modelsGen(); this.seenCk = checkpointGen();
      for (let i = 0; i < 4; i++) {
        const s = this.slots[i];
        if (s && !('model' in s)) this.slots[i] = null;
        else if (s && 'model' in s && s.ckMissing && !s.modified) this.slots[i] = null;
      }
    }
    const pool = new Map<string, Slot>();
    for (let i = 0; i < 4; i++) { const s = this.slots[i]; if (s && 'model' in s) pool.set(s.key, s); }
    const next: Array<Slot | Pending | null> = [null, null, null, null];
    const budget0 = now();
    const frameBudget = this.o.live ? this.o.frameBudget ?? 8 : this.o.catchupBudget ?? 2500;
    for (let i = 0; i < layers.length; i++) {
      const l = layers[i], f = l.fam, meta = familyById(l.pattern);
      if (!meta || meta.kind === 'analytic' || !f) continue;
      const key = keyOf(l, f);
      let s: Slot | Pending | null | undefined = pool.get(key);
      if (s) pool.delete(key);
      else if (this.o.live) {
        const k = this.retired.findIndex(x => x.key === key);
        if (k >= 0) s = this.retired.splice(k, 1)[0];
      }
      if (!s) {
        const prev = this.slots[i];
        s = prev && !('model' in prev) && prev.key === key ? prev : this.create(i, f, meta, key);
      }
      next[i] = s;
      if (!('model' in s)) { busy ||= s.loading; continue; }
      try {
        busy = this.advance(s, l, f, t, dt, budget0, frameBudget) || busy;
      } catch (e) {
        this.fail(s, e);
      }
    }
    if (this.o.live) for (const s of pool.values()) this.retire(s);
    this.slots = next;
    return busy;
  }

  /** Raster of layer i (index among the on-layers), or null when it has none (yet). */
  raster(i: number): RasterView | null {
    const s = this.slots[i];
    if (!s || !('model' in s) || s.failed) return null;
    return { data: s.raster, w: s.model.w, h: s.model.h, version: s.version, wrap: s.meta.wrap !== 'clamp' };
  }

  /** A stroke on layer i (live engines). */
  stroke(i: number, st: Stroke) {
    const s = this.slots[i];
    if (!s || !('model' in s) || !s.model.stroke) return;
    try { s.model.stroke(st); s.modified = true; s.renderedSteps = -1; } catch (e) { this.fail(s, e); }
  }

  /** Starts layer i's run (or all) over from its base: seed and warm-up, or its saved state. */
  reset(i?: number) {
    for (let k = 0; k < 4; k++) {
      if (i !== undefined && k !== i) continue;
      const s = this.slots[k];
      if (s && 'model' in s) this.slots[k] = null;
    }
    this.retired = [];
  }

  /** Runs n steps on layer i's run (or all) right now (the studio's «Paso» while paused). */
  stepNow(n = 1, i?: number) {
    for (let k = 0; k < 4; k++) {
      if (i !== undefined && k !== i) continue;
      const s = this.slots[k];
      if (!s || !('model' in s) || s.failed) continue;
      try {
        s.model.step(n);
        s.simT += n / s.rate;
        s.modified = true;
        this.render(s, this.lastT);
      } catch (e) { this.fail(s, e); }
    }
  }

  /** A copy of the live runs (for an export or a checkpoint). */
  bundle(): FamilyBundle {
    return {
      slots: this.slots.map(s => (s && 'model' in s && !s.failed
        ? { key: s.key, simT: s.simT, modified: s.modified, params: { ...s.params }, state: s.model.snapshot() }
        : null)),
    };
  }

  /** Takes over a bundle in a live engine (the stage moving to the basic engine keeps its runs). */
  adopt(bundle: FamilyBundle) {
    this.start = { bundle, t0: Number.isNaN(this.lastT) ? 0 : this.lastT };
    for (let i = 0; i < 4; i++) this.slots[i] = null;
  }

  info(r: Recipe): SlotInfo[] {
    const out: SlotInfo[] = [];
    const layers = FamilyHost.layersOf(r);
    for (let i = 0; i < 4; i++) {
      const s = this.slots[i], l = layers[i];
      if (!s || !l) continue;
      const meta = familyById(l.pattern);
      if (!meta) continue;
      if (!('model' in s)) {
        out.push({ layer: i, id: meta.id, name: meta.name, steps: 0, rate: meta.budget.rate ?? 30, simT: 0, modified: false, lag: false, partial: false, fromCheckpoint: false, ckMissing: false, loading: s.loading, failed: s.failed, msPerStep: 0 });
        continue;
      }
      out.push({
        layer: i, id: meta.id, name: meta.name, steps: s.model.steps, rate: s.rate, simT: s.simT, modified: s.modified, lag: s.lag,
        partial: s.partial, fromCheckpoint: s.fromCheckpoint, ckMissing: s.ckMissing, loading: false, failed: s.failed, msPerStep: s.ms,
      });
    }
    return out;
  }

  dispose() { this.slots = [null, null, null, null]; this.retired = []; this.start = null; }

  /* ---------------------------------------------------------------- */

  private create(i: number, f: LayerFam, meta: FamilyMeta, key: string): Slot | Pending {
    const factory = modelOf(meta.id);
    if (!factory) {
      void ensureFamily(meta.id);
      return { key, loading: true, failed: false };
    }
    const res = f.res ?? meta.budget.res?.[2] ?? 128;
    let model: FieldModel;
    try {
      model = factory({ seed: f.seed, params: f.p, res });
    } catch (e) {
      this.report(meta.id, e);
      return { key, loading: false, failed: true };
    }
    const rate = meta.budget.rate ?? 30;
    // where the run starts: a copy handed over (exports), a saved state, or the seed and its warm-up
    let baseState: ModelState | null = null, baseSimT = 0, fromCheckpoint = false, ckMissing = false, modified = false;
    let params = f.p;
    const handed = this.start?.bundle?.slots[i];
    if (handed && handed.key === key) {
      baseState = handed.state; baseSimT = handed.simT; modified = handed.modified;
      // a live engine taking over keeps its live parameters until the recipe says otherwise
      if (this.o.live) params = handed.params;
    } else if (f.ck) {
      const ck = getCheckpoint(f.ck);
      if (ck && ck.family === meta.id && ck.fv === f.v && ck.state.arrays) { baseState = ck.state; fromCheckpoint = true; }
      else ckMissing = true;
    }
    if (baseState) {
      try { model.restore(baseState); } catch (e) { this.report(meta.id, e); baseState = null; fromCheckpoint = false; }
    }
    if (params !== f.p) model.setParams(params);
    const base = baseState ? model.steps : meta.budget.warmup ?? 0;
    const s: Slot = {
      key, meta, model, params: f.p, paramsKey: JSON.stringify(f.p), rate, base, baseState, baseSimT, simT: baseSimT,
      debt: baseState ? 0 : base, raster: new Uint8Array(model.w * model.h), version: nextVersion(), renderedSteps: -1, renderedT: NaN,
      modified, lag: false, partial: false, fromCheckpoint, ckMissing, failed: false, ms: 0,
    };
    if (params !== f.p && this.o.live) { s.params = params; s.paramsKey = JSON.stringify(params); }
    return s;
  }

  /** Brings a run to time t. Returns whether it still has work to do. */
  private advance(s: Slot, l: Layer, f: LayerFam, t: number, dt: number, budget0: number, budget: number): boolean {
    if (s.failed) return false;
    const pk = JSON.stringify(f.p);
    if (pk !== s.paramsKey) {
      if (this.o.live) {
        s.model.setParams(f.p);
        s.params = f.p; s.paramsKey = pk; s.modified = true; s.renderedSteps = -1;
      } else {
        // fixed engines: the state is a function of the recipe, so another recipe starts over
        this.rebase(s, f.p);
      }
    }
    const speed = Math.abs(l.speed);
    let busy = false;
    if (this.o.live) {
      if (dt > 0) s.debt += Math.min(0.5, dt) * speed * s.rate;
      busy = this.run(s, budget0, budget);
      // more than half a second behind: the run slows down instead of piling up debt
      const cap = Math.max(4, s.rate * 0.5);
      s.lag = s.debt > cap && s.model.steps > s.base;
      if (s.debt > cap && s.model.steps >= s.base) s.debt = cap;
    } else {
      const t0 = this.start?.t0 ?? 0;
      const target = s.base + Math.floor(Math.max(0, t - t0) * speed * s.rate + 1e-9);
      if (target < s.model.steps) this.rebase(s, s.params);
      s.debt = target - s.model.steps;
      this.run(s, budget0, budget);
      s.partial = s.debt >= 1;
      s.simT = s.baseSimT + Math.max(0, t - t0) * speed;
    }
    this.render(s, t);
    return busy;
  }

  /** Runs whole steps of the debt within the budget. */
  private run(s: Slot, budget0: number, budget: number): boolean {
    let n = Math.floor(s.debt);
    if (n <= 0) return false;
    // steps in chunks, measuring their cost, until the budget is spent
    while (n > 0) {
      const left = budget - (now() - budget0);
      if (left <= 0) break;
      const est = s.ms > 0 ? Math.max(1, Math.floor(left / s.ms)) : 1;
      const k = Math.min(n, est, 64);
      const a = now();
      s.model.step(k);
      const ms = (now() - a) / k;
      s.ms = s.ms > 0 ? s.ms * 0.8 + ms * 0.2 : ms;
      n -= k;
      s.debt -= k;
      if (this.o.live && s.model.steps > s.base) s.simT += k / s.rate;
    }
    return s.debt >= 1;
  }

  /** Back to the run's base (fixed engines going back in time, or other parameters). */
  private rebase(s: Slot, p: Params) {
    const factory = modelOf(s.meta.id);
    if (!factory) return;
    const res = s.model.h;
    s.model = factory({ seed: this.seedOf(s.key), params: p, res });
    if (s.baseState) s.model.restore(s.baseState);
    if (s.baseState && p !== s.params) s.model.setParams(p);
    s.params = p; s.paramsKey = JSON.stringify(p);
    s.renderedSteps = -1;
  }

  private seedOf(key: string) { return key.split('|')[2] ?? 'glyphos'; }

  private render(s: Slot, t: number) {
    if (s.renderedSteps === s.model.steps && s.renderedT === t) return;
    s.model.render(s.raster, t);
    s.renderedSteps = s.model.steps;
    s.renderedT = t;
    s.version = nextVersion();
  }

  private retire(s: Slot) {
    this.retired.unshift(s);
    if (this.retired.length > 3) this.retired.length = 3;
  }

  private fail(s: Slot, e: unknown) {
    s.failed = true;
    this.report(s.meta.id, e);
  }

  private report(id: string, e: unknown) {
    if (this.reported.has(id)) return;
    this.reported.add(id);
    this.o.onError?.(`${familyById(id)?.name ?? id}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
