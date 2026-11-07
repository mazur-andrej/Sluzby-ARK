// Spustenie: node tests/test-solver.mjs
import { readFileSync } from 'node:fs';
import { buildMonth } from '../js/calendar.js';
import { solve, validate } from '../js/solver.js';
import { DEFAULT_POSITIONS } from '../js/config.js';

import { DEFAULT_DOCTORS } from '../js/default-doctors.js';
const doctors = DEFAULT_DOCTORS.filter((d) => d.active);
const days = buildMonth(2026, 12);
// náhodné požiadavky: každý si vyškrtne ~8 dní, niektorí niečo chcú
let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const requests = {};
for (const d of doctors) {
  const off = new Set(); while (off.size < (+process.env.OFF || 8)) off.add(1 + Math.floor(r() * days.length));
  const want = r() < 0.3 ? [{ day: [...Array(31).keys()].map((x) => x + 1).find((x) => !off.has(x) && r() < 0.1) || 15 }] : [];
  requests[d.id] = { off: [...off], want };
}
const PREV = doctors.find((d) => d.positions.includes('l1')).id; // slouží 24h službu poslední den minulého měsíce
const input = { days, positions: DEFAULT_POSITIONS, doctors, requests, prev: [{ doctorId: PREV, day: 0, posId: 'l1' }], seed: 1 };
const t0 = Date.now();
const res = solve(input);
console.log('čas', Date.now() - t0, 'ms, cena', res.cost);
console.log(res.warnings.join('\n') || 'bez varovaní');
const issues = validate(input, res.grid);
console.log('porušenia pravidiel:', issues.length, issues.slice(0, 5));
const dev = res.stats.map((x) => x.count - x.target);
console.log('odchýlky od cieľa:', JSON.stringify(dev.reduce((m, v) => ((m[v] = (m[v] || 0) + 1), m), {})));
console.log(`${PREV} 1.12. (po 24h službě):`, res.grid[0].includes(PREV) ? 'CHYBA' : 'ok');
if (issues.length) process.exit(1);
