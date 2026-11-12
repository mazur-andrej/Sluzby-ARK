// Rovnoměrnost: OUP den/noc, tečka 1/2, tečky v poolu (24h + tečky), střídání dvojic na 24h
import { solve, planTargets } from '../js/solver.js';
import { buildMonth } from '../js/calendar.js';
import { DEFAULT_POSITIONS as P, CATEGORIES, OUP_LIMIT } from '../js/config.js';
import { DEFAULT_DOCTORS } from '../js/default-doctors.js';
let fails = 0;
const check = (ok, msg) => { console.log(ok ? '✔' : '✘', msg); if (!ok) fails++; };
const docs = DEFAULT_DOCTORS.filter((d) => d.active);
const days = buildMonth(2026, 12);
const res = solve({ days, positions: P, doctors: docs, requests: {}, seed: 1 });
const idx = (id) => P.findIndex((p) => p.id === id);
const unbalanced = (a, b) => docs.filter((d) => d.positions.includes(a) && d.positions.includes(b)).filter((d) => {
  let x = 0, y = 0; res.grid.forEach((r) => { if (r[idx(a)] === d.id) x++; if (r[idx(b)] === d.id) y++; }); return Math.abs(x - y) > 1;
}).map((d) => d.name);
check(unbalanced('OUPd', 'OUPn').length <= 1, `OUP den/noc nevyrovnaní: ${unbalanced('OUPd', 'OUPn').join(', ') || '—'}`);
check(unbalanced('t1', 't2').length <= 1, `tečka 1/2 nevyrovnaní: ${unbalanced('t1', 't2').join(', ') || '—'}`);
// tečky: záťaž 24h + tečky v poolu nejvýš o 2 od sebe
const h24 = new Set(CATEGORIES.h24.positions.map(idx)), tt = new Set(CATEGORIES.tecky.positions.map(idx));
const pool = docs.filter((d) => d.positions.some((x) => CATEGORIES.tecky.positions.includes(x)));
const oo = new Set(OUP_LIMIT.positions.map(idx));
const load = pool.map((d) => res.grid.reduce((a, r) => a + r.filter((id, i) => id === d.id && (h24.has(i) || tt.has(i) || oo.has(i))).length, 0));
check(Math.max(...load) - Math.min(...load) <= 3, `pool teček: 24h + tečky + OUP ${Math.min(...load)}–${Math.max(...load)}`);
// ten, kdo má víc 24h, má méně teček
const plan = planTargets({ days, positions: P, doctors: docs });
const e24 = (d) => plan[d.id].h24?.avg ?? 0;
const byE = [...pool].sort((x, y) => e24(y) - e24(x));
const a = byE[0], b = byE[byE.length - 1];
check(plan[a.id].tecky.avg < plan[b.id].tecky.avg, `cíl teček: ${a.name} (víc 24h) ${plan[a.id].tecky.label} < ${b.name} ${plan[b.id].tecky.label}`);
// méně zkušený (níž v seznamu) dostane při stejném počtu ostatních služeb víc teček
{
  const x = { id: 'x1', name: 'Zkušený', active: true, positions: ['2A', 't1', 't2'], typical24: 2 };
  const y = { id: 'x2', name: 'Nováček', active: true, positions: ['2A', 't1', 't2'], typical24: 2 };
  const pl = planTargets({ days, positions: P, doctors: [x, ...pool, y] });
  check(pl.x2.tecky.avg > pl.x1.tecky.avg, `tečky víc méně zkušenému: nováček ${pl.x2.tecky.avg.toFixed(1)} > zkušený ${pl.x1.tecky.avg.toFixed(1)}`);
}
// dvojice: titíž dva lékaři spolu na 24h nejvýš 2× za měsíc
const m = new Map();
res.grid.forEach((r) => { const ids = [...h24].map((i) => r[i]).filter(Boolean); for (let x = 0; x < ids.length; x++) for (let y = x + 1; y < ids.length; y++) { const k = [ids[x], ids[y]].sort().join(); m.set(k, (m.get(k) || 0) + 1); } });
check(Math.max(...m.values()) <= 2, `stejná dvojice spolu nejvýš ${Math.max(...m.values())}×`);
console.log(fails ? `${fails} CHYB` : 'OK');
process.exit(fails ? 1 : 0);
