// node tests/test-xlsx.mjs požiadavky.xlsx [mesiac]
import { readFileSync } from 'node:fs';
import { readXlsx } from '../js/xlsx.js';
import { parseRequestsSheet, pickSheet } from '../js/requests.js';
import { DEFAULT_POSITIONS, GROUP_ALIASES } from '../js/config.js';
import { DEFAULT_DOCTORS } from '../js/default-doctors.js';
const sheets = await readXlsx(readFileSync(process.argv[2]));
const month = +(process.argv[3] || 11);
console.log(sheets.map((s) => `${s.name} (${s.rows.length} r.)`).join(', '));
const sh = pickSheet(sheets, month);
console.log('hárok:', sh.name);
const res = parseRequestsSheet(sh.rows, DEFAULT_DOCTORS, DEFAULT_POSITIONS, month, GROUP_ALIASES);
for (const [id, r] of Object.entries(res.requests)) {
  const extra = [r.want.length && 'chce ' + r.want.map((w) => w.day + (w.pos ? '(' + w.pos.join('/') + ')' : '')).join(','),
    r.ban.length && 'nie ' + r.ban.map((b) => b.day + '(' + b.pos.join('/') + ')').join(',')].filter(Boolean).join('; ');
  console.log(id.padEnd(12), 'off', String(r.off.length).padStart(2), extra);
}
console.log('neznámi:', res.unknown, 'neaktívni:', res.inactive, 'nejasné:', res.unclear);
