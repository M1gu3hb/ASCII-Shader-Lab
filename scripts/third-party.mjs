#!/usr/bin/env node
/**
 * Regenerates THIRD_PARTY_NOTICES.md from node_modules: every runtime dependency in package.json
 * ("dependencies", followed recursively; type-only @types/* packages are skipped), with its version,
 * license, copyright lines and license text. Run after changing dependencies:
 *
 *   node scripts/third-party.mjs          # write THIRD_PARTY_NOTICES.md
 *   node scripts/third-party.mjs --check  # exit 1 if the file is out of date
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'THIRD_PARTY_NOTICES.md');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/** What each package does here (shown in the summary). Fonts are described generically. */
const USE = {
  react: 'Interfaz del estudio',
  'react-dom': 'Interfaz del estudio',
  scheduler: 'Dependencia de react-dom',
  zustand: 'Estado del estudio',
  gifenc: 'Exportación a GIF',
  'opentype.js': 'Contornos de letras en la exportación SVG',
  'tiny-inflate': 'Dependencia de opentype.js',
  'string.prototype.codepointat': 'Dependencia de opentype.js',
  'idb-keyval': 'Almacenamiento local (historial y colección)',
  mediabunny: 'Codificación de video MP4/WebM en el editor. Se usa sin modificar y nunca va dentro del código exportado',
};

const readJson = p => JSON.parse(readFileSync(p, 'utf8'));
const isFont = name => name.startsWith('@fontsource');

function findDir(name, from) {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    if (dir === root || dirname(dir) === dir) break;
  }
  throw new Error(`No encuentro ${name} en node_modules: ejecuta npm install.`);
}

function licenseFile(dir) {
  const f = readdirSync(dir).find(n => /^(licen[cs]e|copying)(\.(md|txt|mit))?$|^licen[cs]e-mit(\.txt)?$/i.test(n));
  return f ? readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim() : '';
}

const repoUrl = j => {
  const r = typeof j.repository === 'string' ? j.repository : j.repository?.url;
  if (!r) return j.homepage ?? '';
  return r.replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://').replace(/^github:/, 'https://github.com/');
};

const packages = new Map();
function visit(name, from) {
  if (name.startsWith('@types/') || packages.has(name)) return;
  const dir = findDir(name, from);
  const j = readJson(join(dir, 'package.json'));
  const text = licenseFile(dir);
  // Font licenses start with the copyright statement(s), one per font file; keep each distinct one once.
  const head = text.split(/This Font Software is licensed/)[0];
  const copyright = [...new Set(head.split(/\s[\w-]+(?:\[[\w,]+\])?\.ttf:\s/).map(s => s.replace(/\s+/g, ' ').trim()).filter(s => /^(copyright|\(c\)|©)/i.test(s)))];
  packages.set(name, { name, version: j.version, license: j.license ?? 'desconocida', repo: repoUrl(j), text, copyright });
  for (const dep of Object.keys(j.dependencies ?? {})) visit(dep, dir);
}
for (const dep of Object.keys(pkg.dependencies ?? {}).sort()) visit(dep, root);

const all = [...packages.values()].sort((a, b) => a.name.localeCompare(b.name));
const code = all.filter(p => !isFont(p.name));
const fonts = all.filter(p => isFont(p.name));

const fence = s => '```text\n' + s + '\n```';
const lines = [];
lines.push(
  '# Avisos de terceros',
  '',
  'GLYPHOS (el editor y este sitio) usa el software de terceros que se lista abajo, cada uno con su licencia.',
  'El código que exporta el estudio no incluye ninguno de estos paquetes; los archivos SVG exportados incrustan',
  'los contornos de las letras que usan, de tipografías con licencia SIL OFL 1.1, que lo permite.',
  '',
  `Generado con \`node scripts/third-party.mjs\` a partir de \`node_modules\` (dependencias de ejecución de \`package.json\`).`,
  '',
  '## Resumen',
  '',
  '| Paquete | Versión | Licencia | Uso |',
  '| --- | --- | --- | --- |',
  ...code.map(p => `| [${p.name}](${p.repo}) | ${p.version} | ${p.license} | ${USE[p.name] ?? 'Dependencia'} |`),
  ...fonts.map(p => `| [${p.name}](${p.repo}) | ${p.version} | ${p.license} | Tipografía |`),
  '',
  '## Bibliotecas',
  '',
);
let apache = '';
for (const p of code) {
  lines.push(`### ${p.name} ${p.version} — ${p.license}`, '', `Fuente: ${p.repo}`, '');
  if (p.license === 'MPL-2.0') lines.push('Se distribuye sin modificar; su código fuente está disponible en la dirección de arriba y en npm.', '');
  if (p.license === 'Apache-2.0') apache = p.name;
  lines.push(p.text ? fence(p.text) : `Sin archivo de licencia en el paquete; licencia declarada: ${p.license}.`, '');
}
if (apache) {
  const tsLicense = join(root, 'node_modules', 'typescript', 'LICENSE.txt');
  lines.push('### Texto de la licencia Apache 2.0', '', `Aplica a ${apache}. También en https://www.apache.org/licenses/LICENSE-2.0`, '');
  if (existsSync(tsLicense)) lines.push(fence(readFileSync(tsLicense, 'utf8').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim()), '');
}
lines.push('## Tipografías (SIL Open Font License 1.1)', '');
for (const p of fonts) lines.push(`- **${p.name}** ${p.version}: ${p.copyright.join(' ') || 'ver el paquete'}`);
const ofl = fonts.map(p => p.text).find(t => t.includes('SIL OPEN FONT LICENSE'));
if (ofl) {
  const body = ofl.slice(ofl.indexOf('-----'));
  lines.push('', 'Texto de la licencia, común a todas las tipografías de la lista:', '', fence(body));
}
const md = lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';

if (process.argv.includes('--check')) {
  const current = existsSync(out) ? readFileSync(out, 'utf8') : '';
  if (current !== md) { console.error('THIRD_PARTY_NOTICES.md no está al día: ejecuta node scripts/third-party.mjs'); process.exit(1); }
  console.log('THIRD_PARTY_NOTICES.md al día.');
} else {
  writeFileSync(out, md);
  console.log(`THIRD_PARTY_NOTICES.md: ${code.length} bibliotecas, ${fonts.length} paquetes de tipografías.`);
}
