// Test: lékaři jen na JIP mají přesně 4 služby: node tests/test-fixed.mjs
import { buildMonth } from '../js/calendar.js';
import { solve, validate } from '../js/solver.js';
import { DEFAULT_POSITIONS as P, FIXED_GROUP } from '../js/config.js';
import { DEFAULT_DOCTORS } from '../js/default-doctors.js';

let fails = 0;
const check = (c, msg) => { console.log(c ? '✔' : '✘', msg); if (!c) fails++; };
const days = buildMonth(2026, 12);
const doctors = DEFAULT_DOCTORS.filter((d) => d.active);
const jipOnly = doctors.filter((d) => d.positions.length && d.positions.every((p) => FIXED_GROUP.positions.includes(p)));
const count = (grid, id) => grid.reduce((n, r) => n + r.filter((x) => x === id).length, 0);
console.log('  lékaři jen na JIP:', jipOnly.map((d) => d.name).join(', '));
check(jipOnly.length >= 2, 've výchozím seznamu jsou lékaři jen na JIP');

const r = solve({ days, positions: P, doctors, requests: {}, seed: 1 });
check(jipOnly.every((d) => count(r.grid, d.id) === 4), `bez požadavků: všichni přesně 4 (${jipOnly.map((d) => count(r.grid, d.id)).join(', ')})`);
check(r.unfilled.length === 0 && validate({ days, positions: P, doctors, requests: {} }, r.grid).filter((i) => i.level !== 'warn').length === 0, 'vše obsazeno, žádné porušení');

// lékař s cílem 3 v seznamu stejně dostane 4; lékař s max 3 dostane max 3 (ruční strop má přednost)
const low = jipOnly[2] || jipOnly[0];
const capped = { ...jipOnly[1], max: 3 };
const docs2 = doctors.map((d) => (d.id === capped.id ? capped : d));
const r2 = solve({ days, positions: P, doctors: docs2, requests: {}, seed: 2 });
check(count(r2.grid, low.id) === 4, `${low.name}: pravidlo JIP → 4`);
check(count(r2.grid, capped.id) === 3, `${capped.name}: ručně Max 3 → 3 (menší strop vyhrává)`);

// hodně vyškrtnutých dní → méně než 4, s hlášením
const blocked = jipOnly[0];
const off = days.map((d) => d.day).filter((d) => d % 10 !== 5); // volno jen 5., 15., 25.
const r3 = solve({ days, positions: P, doctors, requests: { [blocked.id]: { off, want: [] } }, seed: 3 });
check(count(r3.grid, blocked.id) === 3 && r3.warnings.some((w) => w.includes(`${blocked.name} (jen JIP) má jen 3`)), `${blocked.name} může jen 3 dny → 3 služby a upozornění`);

// pravidlo vypnuté
const r4 = solve({ days, positions: P, doctors, requests: {}, seed: 1, fixedGroup: null });
{ const t = r4.plan[low.id].h24; check(count(r4.grid, low.id) >= t.lo && count(r4.grid, low.id) <= t.hi, `pravidlo vypnuté → ${low.name} podle obvyklého počtu (${count(r4.grid, low.id)}, obvykle ${t.label})`); }

// ruční úprava: 5 služeb = chyba
const g = r.grid.map((row) => row.slice());
const free = g.findIndex((row, t) => !row.includes(jipOnly[0].id) && !g[t - 1]?.includes(jipOnly[0].id) && !g[t + 1]?.includes(jipOnly[0].id));
g[free][1] = jipOnly[0].id;
check(validate({ days, positions: P, doctors, requests: {} }, g).some((i) => i.level === 'error' && /má 5 služeb, má mít 4/.test(i.msg)), 'ruční úprava na 5 služeb → hlášeno jako chyba');

console.log(fails ? `\n${fails} CHYB` : '\nVše v pořádku');
process.exit(fails ? 1 : 0);
