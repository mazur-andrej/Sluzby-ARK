// Test rozdělení 24h služeb a teček podle obvyklých počtů: node tests/test-plan.mjs
import { buildMonth } from '../js/calendar.js';
import { solve, validate, planTargets } from '../js/solver.js';
import { DEFAULT_POSITIONS as P } from '../js/config.js';
import { DEFAULT_DOCTORS } from '../js/default-doctors.js';

let fails = 0;
const check = (c, msg) => { console.log(c ? '✔' : '✘', msg); if (!c) fails++; };
const doctors = DEFAULT_DOCTORS.filter((d) => d.active);
for (const [y, m] of [[2026, 12], [2027, 2], [2027, 7]]) {
  const days = buildMonth(y, m);
  const r = solve({ days, positions: P, doctors, requests: {}, seed: 1 });
  const out24 = r.stats.filter((s) => !s.fixed && r.plan[s.id]?.h24 && (s.h24 < r.plan[s.id].h24.lo || s.h24 > r.plan[s.id].h24.hi));
  const outT = r.stats.filter((s) => r.plan[s.id]?.tecky && (s.tecky < r.plan[s.id].tecky.lo || s.tecky > r.plan[s.id].tecky.hi));
  check(r.unfilled.length === 0 && out24.length === 0 && outT.length === 0, `${m}/${y}: vše obsazeno, každý v rozsahu svého obvyklého počtu 24h i teček`);
  check(validate({ days, positions: P, doctors, requests: {} }, r.grid).filter((i) => i.level !== 'warn').length === 0, `${m}/${y}: žádné porušení pravidel`);
}
// konkrétní skupiny
const days = buildMonth(2026, 12);
const plan = planTargets({ days, positions: P, doctors });
const seniors = doctors.filter((d) => d.typical24 === 4 && !d.positions.every((p) => ['l1', 'l2'].includes(p)));
check(seniors.length >= 3 && seniors.every((d) => plan[d.id].h24.label === '4'), `${seniors.length} lékařů, kteří měli vždy 4 → plán přesně 4`);
const low = doctors.filter((d) => d.typical24 != null && d.typical24 < 1.5 && !d.positions.includes('2A'));
{
  const r = solve({ days, positions: P, doctors, requests: {}, seed: 1 });
  const cnt = (id) => r.grid.reduce((n, row) => n + row.filter((x) => x === id).length, 0);
  check(low.length >= 1 && low.every((d) => cnt(d.id) <= (d.max ?? 2)) && !r.warnings.some((w) => low.some((d) => w.startsWith(d.name))),
    `lékař s obvykle ~1 službou (${low.map((d) => `${d.name}: ${cnt(d.id)}, Max ${d.max}`).join(', ')}) – bez zbytečného upozornění`);
}
const twoA = doctors.filter((d) => d.positions.includes('2A') && !d.positions.includes('1A') && d.typical24 < 2);
check(twoA.length >= 1 && twoA.every((d) => plan[d.id].h24.lo >= 2), `obvykle < 2, ale pravidlo 2A ≥ 2 má přednost (${twoA.map((d) => d.name).join(', ')})`);
const sumT = doctors.reduce((a, d) => a + (plan[d.id]?.tecky?.avg || 0), 0);
check(Math.abs(sumT - 42) < 0.01, `tečky: plán dohromady = 42 teček v prosinci (${sumT.toFixed(1)})`);
// nový lékař bez historie dostane průměr
const newbie = { id: 'novy', name: 'Nový', active: true, positions: ['l2', 'plast'], typical24: null };
const p2 = planTargets({ days, positions: P, doctors: [...doctors, newbie] });
check(p2.novy.h24.lo >= 2 && p2.novy.h24.hi <= 4, `nový lékař bez historie → průměr (${p2.novy.h24.label})`);
console.log(fails ? `\n${fails} CHYB` : '\nVše v pořádku');
process.exit(fails ? 1 : 0);
