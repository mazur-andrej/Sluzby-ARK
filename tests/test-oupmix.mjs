// OUP den/noc rovnoměrně u lékařů, kteří mohou obojí
import { solve } from '../js/solver.js';
import { buildMonth } from '../js/calendar.js';
import { DEFAULT_POSITIONS as P } from '../js/config.js';
import { DEFAULT_DOCTORS } from '../js/default-doctors.js';
const docs = DEFAULT_DOCTORS.filter((d) => d.active);
const res = solve({ days: buildMonth(2026, 12), positions: P, doctors: docs, requests: {}, seed: 1 });
const iD = P.findIndex((p) => p.id === 'OUPd'), iN = P.findIndex((p) => p.id === 'OUPn');
let both = 0, bad = [];
for (const d of docs.filter((x) => x.positions.includes('OUPd') && x.positions.includes('OUPn'))) {
  let a = 0, b = 0; res.grid.forEach((r) => { if (r[iD] === d.id) a++; if (r[iN] === d.id) b++; });
  both++; if (Math.abs(a - b) > 1) bad.push(`${d.name} ${a}/${b}`);
}
console.log(`lékaři s OUP den i noc: ${both}, nevyrovnaní: ${bad.length}`, bad.join(', '));
if (bad.length > 2) { console.error('FAIL: příliš mnoho nevyrovnaných'); process.exit(1); }
console.log('OK');
