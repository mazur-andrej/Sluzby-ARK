// Test: lékaři s 2A bez 1A mají aspoň 2× 2A: node tests/test-posmin.mjs
import { buildMonth } from '../js/calendar.js';
import { solve, validate } from '../js/solver.js';
import { DEFAULT_POSITIONS as P } from '../js/config.js';
import { DEFAULT_DOCTORS } from '../js/default-doctors.js';

let fails = 0;
const check = (c, msg) => { console.log(c ? '✔' : '✘', msg); if (!c) fails++; };
const doctors = DEFAULT_DOCTORS.filter((d) => d.active);
const i2A = P.findIndex((p) => p.id === '2A');
const n2A = (grid, id) => grid.filter((row) => row[i2A] === id).length;
const group = doctors.filter((d) => d.positions.includes('2A') && !d.positions.includes('1A'));
const with1A = doctors.filter((d) => d.positions.includes('2A') && d.positions.includes('1A'));
console.log(`  2A bez 1A: ${group.length} lékařů, 2A i 1A: ${with1A.length}`);
check(group.length === 13 && with1A.length === 4, 'skupiny odpovídají seznamu (13 + 4)');

for (const [y, m] of [[2026, 12], [2027, 2], [2027, 7]]) {
  const days = buildMonth(y, m);
  const base = solve({ days, positions: P, doctors, requests: {}, seed: 1, positionMin: null });
  const r = solve({ days, positions: P, doctors, requests: {}, seed: 1 });
  const before = group.filter((d) => n2A(base.grid, d.id) < 2).length;
  const counts = group.map((d) => n2A(r.grid, d.id));
  check(counts.every((c) => c >= 2) && r.unfilled.length === 0,
    `${m}/${y}: bez pravidla ${before} lékařů pod 2×; s pravidlem všichni ≥ 2× 2A (${counts.join(',')})`);
  check(validate({ days, positions: P, doctors, requests: {} }, r.grid).filter((i) => i.level !== 'warn').length === 0, `${m}/${y}: žádné porušení`);
}

// lékař2 aspoň 1× u lékařů s lékař2 bez lékař1 (plastika / 1A + JIP 2)
{
  const il2 = P.findIndex((p) => p.id === 'l2');
  const g2 = doctors.filter((d) => d.positions.includes('l2') && !d.positions.includes('l1'));
  for (const [y, m] of [[2026, 12], [2027, 3]]) {
    const days = buildMonth(y, m);
    const r = solve({ days, positions: P, doctors, requests: {}, seed: 2 });
    const c = g2.map((d) => r.grid.filter((row) => row[il2] === d.id).length);
    check(c.every((x) => x >= 1), `${m}/${y}: lékař2 aspoň 1× (${g2.length} lékařů: ${c.join(',')})`);
  }
}

// lékař, který může jen 1 den → 1× a upozornění
const days = buildMonth(2026, 12);
const who = group[0];
const r = solve({ days, positions: P, doctors, requests: { [who.id]: { off: days.map((d) => d.day).filter((d) => d !== 10), want: [] } }, seed: 4 });
check(n2A(r.grid, who.id) <= 1 && r.warnings.some((w) => w.startsWith(`${who.name} má jen`) && w.includes('minimum 2')), `${who.name} může jen 10. → upozornění na minimum`);
console.log(fails ? `\n${fails} CHYB` : '\nVše v pořádku');
process.exit(fails ? 1 : 0);
