#!/usr/bin/env node
/**
 * How varied is «Azar»? Simulates a person pressing the dice many times in each space, the way the
 * studio does (the base is the previous result, fingerprints already seen are avoided, the last results
 * of the space are passed as `recent`), and prints what came out:
 *   node scripts/azar-report.mjs [--rolls 400] [--runs 3] [--gen 1] [--no-recent] [--compare] [--json out.json]
 * --compare prints version 1 as it rolled (no recency), the current version without recency and with it.
 * Measures, per space: share of the most frequent lead patterns (layer 0) and styles (archetypes), share of
 * 3D solids among the leads, how often a result repeats the previous one's lead or style, and the mean
 * pairwise perceptual distance (src/random/diversity.ts) over windows of 50 consecutive results, and how often
 * a result looks like the one before it (distance below 0.35).
 * Seeds come from a fixed stream, so two runs of the same code print the same numbers.
 */
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const ROLLS = Number(opt('--rolls', 400));
const RUNS = Number(opt('--runs', 3));
const jsonOut = opt('--json', null);
const compare = args.includes('--compare');
const SPACES = ['arte', 'fondos', 'media', 'tipo', 'terminal'];
const WINDOW = 50;

const bundle = await build({
  stdin: {
    contents: `export * from './src/random/index.ts';
export * from './src/random/diversity.ts';
export { PATTERNS, patternById } from './src/engine/catalog.ts';
export { defaultRecipe } from './src/engine/recipe.ts';`,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'error',
});
const M = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const GEN = M.GEN_VERSION;

/** One simulated session of `n` dice presses in a space. */
function session(space, n, run, o) {
  const stream = new M.Rng(`azar-report|${space}|${run}`);
  const fresh = () => M.randomSeed(stream);
  const rand = () => stream.next();
  const seen = new Set();
  let base = M.defaultRecipe();
  if (space === 'media') base.source = 'image';
  if (space === 'tipo') { base.source = 'text'; base.text.content = 'TRAMA'; }
  const recent = [];
  const out = [];
  for (let i = 0; i < n; i++) {
    const res = M.roll({ space, base, seen, fresh, rand, ...(o.gen ? { gen: o.gen } : {}), ...(o.recent ? { recent: recent.slice(-10) } : {}) });
    seen.add(res.fp);
    base = res.recipe;
    recent.push(res.recipe);
    out.push(res.recipe);
  }
  return out;
}

function measure(space, o) {
  const leads = new Map(), archs = new Map();
  let total = 0, sameLead = 0, sameArch = 0, solids = 0, pairs = 0, alike = 0;
  const div = [], distinct = [];
  for (let run = 0; run < RUNS; run++) {
    const rs = session(space, ROLLS, run, o);
    rs.forEach((r, i) => {
      const lead = r.layers[0].pattern, arch = r.meta.arch;
      leads.set(lead, (leads.get(lead) ?? 0) + 1);
      archs.set(arch, (archs.get(arch) ?? 0) + 1);
      if (M.patternById(lead).family === 'solidos') solids++;
      total++;
      if (i > 0) {
        pairs++;
        if (rs[i - 1].layers[0].pattern === lead) sameLead++;
        if (rs[i - 1].meta.arch === arch) sameArch++;
      }
    });
    const looks = rs.map(M.lookOf);
    for (let i = 1; i < looks.length; i++) if (M.lookDistance(looks[i - 1], looks[i]) < 0.35) alike++;
    for (let w = 0; w + WINDOW <= looks.length; w += WINDOW) {
      div.push(M.meanPairwiseDistance(looks.slice(w, w + WINDOW)));
      distinct.push(new Set(looks.slice(w, w + WINDOW).map(l => l.lead)).size);
    }
  }
  const top = m => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v / total]);
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  return {
    space, rolls: total, leads: top(leads), archs: top(archs), solids: solids / total,
    sameLead: sameLead / pairs, sameArch: sameArch / pairs, alike: alike / pairs,
    diversity: mean(div), diversityMin: Math.min(...div), distinctLeads: mean(distinct),
  };
}

const pct = v => (v * 100).toFixed(1) + '%';
const label = o => `generador ${o.gen ?? GEN}${o.recent ? ', con recencia' : ', sin recencia'}`;

function print(o, results) {
  console.log(`\n## Azar · ${label(o)} · ${ROLLS} tiradas × ${RUNS} sesiones por espacio\n`);
  console.log('| espacio | principal más frecuente | 2.º | 3.º | Sólidos 3D | estilo más frecuente | = principal anterior | = estilo anterior | parecido a la anterior | diversidad (50) | principales distintos (50) |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const [l1, l2, l3] = r.leads;
    console.log(`| ${r.space} | ${l1[0]} ${pct(l1[1])} | ${l2[0]} ${pct(l2[1])} | ${l3[0]} ${pct(l3[1])} | ${pct(r.solids)} | ${r.archs[0][0]} ${pct(r.archs[0][1])} | ${pct(r.sameLead)} | ${pct(r.sameArch)} | ${pct(r.alike)} | ${r.diversity.toFixed(3)} (mín. ${r.diversityMin.toFixed(3)}) | ${r.distinctLeads.toFixed(1)} |`);
  }
  for (const r of results) {
    console.log(`\n${r.space}: principales ${r.leads.slice(0, 10).map(([k, v]) => `${k} ${pct(v)}`).join(', ')}`);
    console.log(`${r.space}: estilos ${r.archs.map(([k, v]) => `${k} ${pct(v)}`).join(', ')}`);
  }
}

const configs = compare ? [{ gen: 1, recent: false }, { gen: GEN, recent: false }, { gen: GEN, recent: true }] : [{ gen: opt('--gen', null) ? Number(opt('--gen')) : undefined, recent: !args.includes('--no-recent') }];
const all = [];
for (const o of configs) {
  const results = SPACES.map(s => measure(s, o));
  print(o, results);
  all.push({ config: label(o), results });
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(all, null, 2));
