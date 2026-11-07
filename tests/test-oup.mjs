// Test lékařem zvoleného počtu OUP služeb: node tests/test-oup.mjs
import { buildMonth } from '../js/calendar.js';
import { solve, validate } from '../js/solver.js';
import { DEFAULT_POSITIONS as P } from '../js/config.js';
import { DEFAULT_DOCTORS } from '../js/default-doctors.js';

const days = buildMonth(2026, 12);
const doctors = DEFAULT_DOCTORS.filter((d) => d.active);
const oupIdx = P.map((p, i) => (['OUPd', 'OUPn'].includes(p.id) ? i : -1)).filter((i) => i >= 0);
const count = (grid, id) => grid.reduce((n, row) => n + oupIdx.filter((i) => row[i] === id).length, 0);
let fails = 0;
const check = (c, msg) => { console.log(c ? '✔' : '✘', msg); if (!c) fails++; };

const requests = { tomancova: { off: [], want: [], oupMax: 2 }, zabkova: { off: [], want: [], oupMax: 5 }, kriz: { off: [], want: [], oupMax: 1 } };
const base = solve({ days, positions: P, doctors, requests: {}, seed: 1 });
console.log(`  bez volby: Tomancová ${count(base.grid, 'tomancova')} OUP, Žabková ${count(base.grid, 'zabkova')}, Kříž ${count(base.grid, 'kriz')}`);
const r = solve({ days, positions: P, doctors, requests, seed: 1 });
const t = count(r.grid, 'tomancova'), z = count(r.grid, 'zabkova'), k = count(r.grid, 'kriz');
check(t === 2, `Tomancová zvolila 2 → má ${t}`);
check(z >= 2 && z <= 5, `Žabková zvolila 5 → má ${z} (2–5)`);
check(k === 2, `Kříž zadal 1 → bere se minimum 2, má ${k}`);
check(r.unfilled.length === 0, 'všechny služby obsazené');
check(validate({ days, positions: P, doctors, requests }, r.grid).length === 0, 'žádné porušení pravidel');
// maximum se nepřekročí ani když by se to hodilo – mnoho lékařů s nízkým limitem
const many = Object.fromEntries(doctors.filter((d) => d.positions.some((p) => p.startsWith('OUP'))).map((d) => [d.id, { off: [], want: [], oupMax: 2 }]));
const r2 = solve({ days, positions: P, doctors, requests: many, seed: 2 });
const over = Object.keys(many).filter((id) => count(r2.grid, id) > 2);
check(over.length === 0, `všichni OUP lékaři limit 2 → nikdo nepřekročí (neobsazeno: ${r2.unfilled.length})`);
console.log(fails ? `\n${fails} CHYB` : '\nVše v pořádku');
process.exit(fails ? 1 : 0);
