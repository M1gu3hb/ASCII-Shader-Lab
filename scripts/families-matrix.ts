/**
 * Writes docs/cambios/revision-pr10/MATRIZ-PRESETS.md: every visual family and preset as published after the
 * PR #10 review, from their specs (name, other names, contract, period, where the library offers it, algorithm
 * version), marked against the 86 presets published before it (tests/unit/fixtures/families-v1.json), with the
 * activity a run of scripts/families-time.ts measured (model change and ink at 0, 30, 60, 120 and 600 s).
 *
 *   npx esbuild scripts/families-matrix.ts --bundle --platform=node --format=esm --outfile=.cache/families-matrix.mjs
 *   node .cache/families-matrix.mjs .cache/final-time.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { FAMILIES } from '../src/families/all';
import { normParams, timeContract, figureOf, TIME_WORDS } from '../src/families/params';
import { usesOf } from '../src/families/uses';
import { FAMILY_GROUP_NAMES } from '../src/families/types';

const before = JSON.parse(readFileSync('tests/unit/fixtures/families-v1.json', 'utf8')) as { cases: Array<{ family: string; preset: string }> };
const old = new Set(before.cases.map(c => `${c.family}:${c.preset}`));
const oldFamilies = new Set(before.cases.map(c => c.family));
interface Sample { t: number; model: number; lit: number; ms: number; msRender?: number }
interface Row { family: string; preset: string; samples: Sample[]; error?: string }
const probe: Row[] = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : [];
const runOf = new Map(probe.map(r => [`${r.family}:${r.preset}`, r]));
const pct = (v: number) => (v * 100).toFixed(v < 0.01 ? 2 : 1).replace('.', ',');

const lines: string[] = [];
let n = 0, fresh = 0;
const contracts: Record<string, number> = { continuo: 0, bucle: 0, construccion: 0 };
for (const f of FAMILIES) {
  lines.push(`\n### ${f.name} (\`${f.id}\`) — ${FAMILY_GROUP_NAMES[f.group]}, ${f.kind === 'analytic' ? 'analítica' : f.kind === 'simulation' ? 'simulación' : 'geometría'}, versión ${f.version}${oldFamilies.has(f.id) ? '' : ' · **nueva**'}`);
  if (f.aka?.length) lines.push(`\nTambién: ${f.aka.join(', ')}.`);
  lines.push('\n| Preset | Nombre | También | Tiempo | Usos | Figura | Actividad (cambio % · tinta %) a 0 / 30 / 60 / 120 / 600 s |\n|---|---|---|---|---|---|---|');
  for (const p of f.presets) {
    n++;
    const isNew = !old.has(`${f.id}:${p.id}`);
    if (isNew) fresh++;
    const params = normParams(f, p.params);
    const tc = timeContract(f, params);
    contracts[tc]++;
    const r = runOf.get(`${f.id}:${p.id}`);
    const act = r?.error ? `error: ${r.error}` : r ? r.samples.map(s => `${pct(s.model)} · ${pct(s.lit)}`).join(' / ') : '—';
    lines.push(`| \`${p.id}\`${isNew ? ' (nuevo)' : ''} | ${p.name} | ${(p.aka ?? []).join(', ') || '—'} | ${TIME_WORDS[tc].mark} ${TIME_WORDS[tc].label}${p.period ? ` (${String(p.period).replace('.', ',')} s)` : ''} | ${usesOf(f, p).join(', ')} | ${figureOf(f, params, p.layer?.scale ?? 1) ? 'sí' : 'no'} | ${act} |`);
  }
}

const head = `# Matriz de familias y presets (revisión del PR #10)

Generada por \`scripts/families-matrix.ts\` desde las fichas de las familias (\`src/families/meta/*.ts\`), la referencia de los 86 presets publicados antes de esta revisión (\`tests/unit/fixtures/families-v1.json\`) y una ejecución de la sonda temporal (\`scripts/families-time.ts --seeds=1 --res=def --times=0,30,60,120 --long=600\`, Node, sin navegador). No se edita a mano.

- **${FAMILIES.length} familias** (${oldFamilies.size} de antes y ${FAMILIES.length - oldFamilies.size} nuevas) y **${n} presets** (${n - fresh} de antes, con su id, y ${fresh} nuevos).
- Contrato temporal: ${contracts.continuo} continuos (∞), ${contracts.bucle} en bucle exacto (↻) y ${contracts.construccion} construcciones (▣).
- **Actividad**: por cada momento, el % medio de cambio del campo en el medio segundo siguiente (para las simulaciones, con la cámara quieta: el estado) y el % del campo con tinta. Una construcción termina quieta por definición (cambio 0 al final); un fondo lento está bien si sigue cambiando. Mide cambio y ocupación del campo que los motores convierten en glifos: no mide belleza ni fotogramas por segundo en un dispositivo real. Las analíticas se muestrean en 96 × 48 con la escala de su capa.
- **Usos**: dónde lo ofrece la biblioteca (\`espacio/sección\`); el mismo preset puede estar en varios espacios con el mismo id. **Figura**: se dibuja en el centro (en lienzos verticales se ajusta al ancho); Fondos sólo ofrece lo que no lo es.
- Las decisiones, el antes y el después y lo que quedó sin resolver de cada grupo están en \`docs/cambios/revision-familias/\`.
`;
writeFileSync('docs/cambios/revision-pr10/MATRIZ-PRESETS.md', head + lines.join('\n') + '\n');
console.log(`${FAMILIES.length} familias, ${n} presets (${fresh} nuevos)`, contracts);
