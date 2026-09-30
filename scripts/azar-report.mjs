#!/usr/bin/env node
/**
 * How varied is «Azar»? Simulates a person pressing the dice many times in each space, the way the
 * studio does (the base is the previous result, fingerprints already seen are avoided, the last results
 * of the space are passed as `recent`), and prints what came out:
 *   node scripts/azar-report.mjs [--rolls 400] [--runs 3] [--gen 1] [--no-recent] [--compare] [--vs 4] [--json out.json]
 * --compare prints version 1 as it rolled (no recency), the current version without recency and with it.
 * --vs N prints version N and the current one, both as the studio rolls them (with recency).
 * Measures, per space:
 *  - shape: share of the most frequent lead patterns (layer 0) and styles (archetypes), 3D solids and library
 *    patterns among the leads, distinct leads per 50 results, how often a result repeats the previous one's lead
 *    or style;
 *  - colour: the palette's most colourful stop (its chroma; hue in 30° bins of the stop most colourful for its hue
 *    and lightness), the background's lightness, how often
 *    a palette is muted warm (brown, khaki, beige: hue 40–115°, chroma .02–.10 at most), neutral (grey) or
 *    vivid, and how often a palette repeats one of the last ten (same quantised colours);
 *  - glyphs and motion: character sets, fill modes, cursor responses and letter animations in use;
 *  - repeats: a result that looks like the one before it (lookDistance below .35, src/random/diversity.ts), or
 *    that shares the lead's family, the palette's hue family and the characters with one of the last five, and
 *    the mean pairwise perceptual distance over windows of 50 consecutive results.
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
const vs = opt('--vs', null);
const SPACES = ['arte', 'fondos', 'media', 'tipo', 'terminal'];
const WINDOW = 50;

const bundle = await build({
  stdin: {
    contents: `export * from './src/random/index.ts';
export * from './src/random/diversity.ts';
export { PATTERNS, patternById, LIBRARY, charsetIdOf } from './src/engine/catalog.ts';
export { hexToOklch } from './src/engine/color.ts';
export { maxChroma } from './src/random/palettes5.ts';
export { defaultRecipe } from './src/engine/recipe.ts';`,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'error',
});
const M = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const GEN = M.GEN_VERSION;
const LIB = new Set([...M.LIBRARY.fields, ...M.LIBRARY.solids, ...M.LIBRARY.particles]);
const LIB_CS = new Set(M.LIBRARY.charsets);

/** One simulated session of `n` dice presses in a space. */
export function session(space, n, run, o) {
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

/** The colours of a piece as a person sees them: the most colourful stop, the background, the spread. */
function colourOf(r) {
  // the hue of the stop that is most colourful for its hue and lightness (blue and magenta can take far more
  // chroma than yellow: comparing raw chroma would always name them), and the chroma of the most colourful stop
  let hue = 0, chroma = 0, rel = -1;
  const Ls = [];
  for (const s of r.color.stops) {
    const [L, C, h] = M.hexToOklch(s);
    Ls.push(L);
    if (C > chroma) chroma = C;
    const k = C < 0.02 ? 0 : C / Math.max(0.02, M.maxChroma(L, h));
    if (k > rel) { rel = k; hue = h; }
  }
  const [bgL] = M.hexToOklch(r.color.bg);
  const sat = r.color.sat ?? 1;
  chroma *= sat;
  const top = M.hexToOklch(r.color.stops[r.color.stops.length - 1])[0];
  return {
    hue, chroma, bgL, spread: Math.max(...Ls, bgL) - Math.min(...Ls, bgL), contrast: Math.abs(top - bgL),
    neutral: chroma < 0.03,
    // brown, khaki, beige, olive: warm hues without much colour
    mutedWarm: chroma >= 0.02 && chroma < 0.1 && hue >= 40 && hue <= 115,
    muted: chroma >= 0.03 && chroma < 0.1,
    vivid: chroma >= 0.18,
    hueFam: chroma < 0.03 ? 'n' : String(Math.floor(((hue + 15) % 360) / 30)),
    sig: r.color.stops.map(s => { const [L, C, h] = M.hexToOklch(s); return C < 0.03 ? `n${Math.round(L * 5)}` : `${Math.round(h / 30) % 12}.${Math.round(L * 4)}`; }).join('/') + '|' + Math.round(bgL * 5),
    light: bgL > 0.6,
  };
}

function measure(space, o) {
  const leads = new Map(), archs = new Map(), charsets = new Map(), modes = new Map(), interact = new Map(), anims = new Map();
  const hueBins = new Array(13).fill(0), chromaBins = new Array(5).fill(0), bgBins = new Array(3).fill(0);
  let total = 0, sameLead = 0, sameArch = 0, solids = 0, lib = 0, libCs = 0, pairs = 0, alike = 0, triple = 0, palRepeat = 0;
  let mutedWarm = 0, neutral = 0, vivid = 0, muted = 0, light = 0, lowContrast = 0, words = 0, brand = 0;
  const div = [], distinct = [], chromaAll = [];
  for (let run = 0; run < RUNS; run++) {
    const rs = session(space, ROLLS, run, o);
    const cols = rs.map(colourOf);
    const looks = rs.map(M.lookOf);
    rs.forEach((r, i) => {
      const lead = r.layers[0].pattern, arch = r.meta.arch, c = cols[i];
      const inc = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
      inc(leads, lead); inc(archs, arch); inc(charsets, M.charsetIdOf(r.glyph.charset)); inc(modes, r.glyph.mode); inc(interact, r.interact.mode);
      if (r.source === 'text' && r.text.anim) inc(anims, r.text.anim.kind);
      if (r.msg.on && r.msg.anim) inc(anims, 'msg:' + r.msg.anim.kind);
      if (M.patternById(lead).family === 'solidos') solids++;
      if (r.layers.some(l => LIB.has(l.pattern))) lib++;
      if (LIB_CS.has(M.charsetIdOf(r.glyph.charset))) libCs++;
      if (r.glyph.mode === 'words') { words++; if (/MONOTRAMA/.test(r.glyph.words)) brand++; }
      if (r.source === 'text' && /MONOTRAMA/.test(r.text.content)) brand++;
      if (r.msg.on && /MONOTRAMA/i.test(r.msg.text)) brand++;
      hueBins[c.neutral ? 12 : Math.floor(((c.hue % 360) + 360) % 360 / 30)]++;
      chromaBins[c.chroma < 0.03 ? 0 : c.chroma < 0.08 ? 1 : c.chroma < 0.14 ? 2 : c.chroma < 0.2 ? 3 : 4]++;
      bgBins[c.bgL < 0.3 ? 0 : c.bgL < 0.7 ? 1 : 2]++;
      chromaAll.push(c.chroma);
      if (c.mutedWarm) mutedWarm++;
      if (c.neutral) neutral++;
      if (c.muted) muted++;
      if (c.vivid) vivid++;
      if (c.light) light++;
      if (c.contrast < 0.35) lowContrast++;
      total++;
      if (i > 0) {
        pairs++;
        if (rs[i - 1].layers[0].pattern === lead) sameLead++;
        if (rs[i - 1].meta.arch === arch) sameArch++;
        if (M.lookDistance(looks[i - 1], looks[i]) < 0.35) alike++;
        let t = false;
        for (let k = Math.max(0, i - 5); k < i; k++) {
          if (looks[k].family === looks[i].family && cols[k].hueFam === c.hueFam && looks[k].charset === looks[i].charset) t = true;
        }
        if (t) triple++;
        let p = false;
        for (let k = Math.max(0, i - 10); k < i; k++) if (cols[k].sig === c.sig) p = true;
        if (p) palRepeat++;
      }
    });
    for (let w = 0; w + WINDOW <= looks.length; w += WINDOW) {
      div.push(M.meanPairwiseDistance(looks.slice(w, w + WINDOW)));
      distinct.push(new Set(looks.slice(w, w + WINDOW).map(l => l.lead)).size);
    }
  }
  const top = m => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v / total]);
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  chromaAll.sort((a, b) => a - b);
  const q = p => chromaAll[Math.min(chromaAll.length - 1, Math.floor(p * chromaAll.length))];
  return {
    space, rolls: total, leads: top(leads), archs: top(archs), charsets: top(charsets), modes: top(modes), interact: top(interact), anims: top(anims),
    solids: solids / total, lib: lib / total, libCs: libCs / total, distinctLeadsAll: leads.size,
    sameLead: sameLead / pairs, sameArch: sameArch / pairs, alike: alike / pairs, triple: triple / pairs, palRepeat: palRepeat / pairs,
    diversity: mean(div), diversityMin: Math.min(...div), distinctLeads: mean(distinct),
    hueBins: hueBins.map(v => v / total), chromaBins: chromaBins.map(v => v / total), bgBins: bgBins.map(v => v / total),
    chromaQ: [q(0.1), q(0.5), q(0.9)], mutedWarm: mutedWarm / total, neutral: neutral / total, muted: muted / total, vivid: vivid / total,
    light: light / total, lowContrast: lowContrast / total, words: words / total, brand,
  };
}

const pct = v => (v * 100).toFixed(1) + '%';
const label = o => `generador ${o.gen ?? GEN}${o.recent ? ', con recencia' : ', sin recencia'}`;

function print(o, results) {
  console.log(`\n## Azar · ${label(o)} · ${ROLLS} tiradas × ${RUNS} sesiones por espacio\n`);
  console.log('| espacio | principal más frecuente | 2.º | Sólidos 3D | con la biblioteca | estilo más frecuente | = principal anterior | = estilo anterior | parecido a la anterior | forma+color+glifos entre las 5 últimas | paleta repetida (10) | diversidad (50) | principales distintos (50 / total) |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const [l1, l2] = r.leads;
    console.log(`| ${r.space} | ${l1[0]} ${pct(l1[1])} | ${l2[0]} ${pct(l2[1])} | ${pct(r.solids)} | ${pct(r.lib)} | ${r.archs[0][0]} ${pct(r.archs[0][1])} | ${pct(r.sameLead)} | ${pct(r.sameArch)} | ${pct(r.alike)} | ${pct(r.triple)} | ${pct(r.palRepeat)} | ${r.diversity.toFixed(3)} (mín. ${r.diversityMin.toFixed(3)}) | ${r.distinctLeads.toFixed(1)} / ${r.distinctLeadsAll} |`);
  }
  console.log('\n### Color\n');
  console.log('| espacio | marrón/caqui apagado | apagado (C .03–.10) | gris | vivo (C ≥ .18) | croma p10 / p50 / p90 | fondo claro | poco contraste | tonos (0°,30°…330°, gris) |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    console.log(`| ${r.space} | ${pct(r.mutedWarm)} | ${pct(r.muted)} | ${pct(r.neutral)} | ${pct(r.vivid)} | ${r.chromaQ.map(v => v.toFixed(3)).join(' / ')} | ${pct(r.light)} | ${pct(r.lowContrast)} | ${r.hueBins.map(v => Math.round(v * 100)).join(' ')} |`);
  }
  console.log('\n### Glifos y movimiento\n');
  for (const r of results) {
    console.log(`${r.space}: juegos ${r.charsets.slice(0, 8).map(([k, v]) => `${k} ${pct(v)}`).join(', ')} (${r.charsets.length} distintos; de la biblioteca ${pct(r.libCs)})`);
    console.log(`${r.space}: relleno ${r.modes.map(([k, v]) => `${k} ${pct(v)}`).join(', ')} · palabras con MONOTRAMA: ${r.brand}`);
    console.log(`${r.space}: cursor ${r.interact.map(([k, v]) => `${k} ${pct(v)}`).join(', ')}`);
    if (r.anims.length) console.log(`${r.space}: letras ${r.anims.map(([k, v]) => `${k} ${pct(v)}`).join(', ')}`);
  }
  for (const r of results) {
    console.log(`\n${r.space}: principales ${r.leads.slice(0, 12).map(([k, v]) => `${k} ${pct(v)}`).join(', ')}`);
    console.log(`${r.space}: estilos ${r.archs.map(([k, v]) => `${k} ${pct(v)}`).join(', ')}`);
  }
}

const configs = compare ? [{ gen: 1, recent: false }, { gen: GEN, recent: false }, { gen: GEN, recent: true }]
  : vs ? [{ gen: Number(vs), recent: true }, { gen: GEN, recent: true }]
  : [{ gen: opt('--gen', null) ? Number(opt('--gen')) : undefined, recent: !args.includes('--no-recent') }];
const all = [];
for (const o of configs) {
  const results = SPACES.map(s => measure(s, o));
  print(o, results);
  all.push({ config: label(o), results });
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(all, null, 2));
