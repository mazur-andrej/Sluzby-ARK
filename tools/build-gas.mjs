// Spojí algoritmus (js/*.js) a server (apps-script/server.js) do jednoho souboru
// apps-script/Kod.gs, který se vloží do editoru Google Apps Script.
// Spuštění: node tools/build-gas.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const parts = ['js/calendar.js', 'js/config.js', 'js/default-doctors.js', 'js/solver.js', 'js/ics.js', 'apps-script/server.js'];
const strip = (src) => src
  .replace(/^import .*$/gm, '')
  .replace(/^export (const|function|let|class) /gm, '$1 ');
let out = `// ===== Rozpis služeb – Kod.gs =====\n// VYGENEROVÁNO z repozitáře (node tools/build-gas.mjs). Neupravujte ručně – změny dělejte ve zdrojových souborech.\n`;
for (const p of parts) out += `\n// ----- ${p} -----\n` + strip(readFileSync(new URL(p, root), 'utf8'));
writeFileSync(new URL('apps-script/Kod.gs', root), out);
console.log('apps-script/Kod.gs', out.length, 'znaků');
