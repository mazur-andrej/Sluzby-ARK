// Přání lékařů mají přednost před ostatními pravidly, kromě počtu služeb: node tests/test-wants.mjs
import { buildMonth } from '../js/calendar.js';
import { solve, buildFairHistory } from '../js/solver.js';
import { DEFAULT_POSITIONS as P } from '../js/config.js';
import { DEFAULT_DOCTORS } from '../js/default-doctors.js';

let fails = 0;
const check = (c, msg) => { console.log(c ? '✔' : '✘', msg); if (!c) fails++; };
const docs = DEFAULT_DOCTORS.filter((d) => d.active);
const days = buildMonth(2026, 12);
const fairHistory = buildFairHistory({ targetKey: '2026-12', past: [], doctors: docs, positions: P });
const svc = (r, id) => r.grid.map((row, t) => (row.includes(id) ? t + 1 : null)).filter(Boolean);
const by = (name) => docs.find((d) => d.name === name);

// 1) víc přání než počet služeb → splní se jen do počtu, zbytek s důvodem
const kriz = by('Kříž'); // obvykle ~3 × 24h (l2, plast) + OUP
const wants5 = [2, 6, 10, 14, 18].map((day) => ({ day, pos: ['l2', 'plast'] }));
let r = solve({ days, positions: P, doctors: docs, requests: { [kriz.id]: { off: [], want: wants5 } }, seed: 1, fairHistory });
const ok = r.wants.filter((w) => w.doctorId === kriz.id && w.ok).length;
const cap = r.plan[kriz.id].h24.hi;
check(ok === cap && r.wants.filter((w) => w.doctorId === kriz.id && !w.ok).every((w) => /plný počet/.test(w.reason)),
  `${kriz.name} chce 5× 24h, počet ${r.plan[kriz.id].h24.label} → splněno ${ok}, zbytek „plný počet“`);

// 2) JIP jen: chce 6 → dostane 4
const suk = by('Suk');
r = solve({ days, positions: P, doctors: docs, requests: { [suk.id]: { off: [], want: [3, 7, 11, 15, 19, 23].map((day) => ({ day, pos: null })) } }, seed: 1, fairHistory });
check(svc(r, suk.id).length === 4 && r.wants.filter((w) => w.doctorId === suk.id && w.ok).length === 4, `${suk.name} (jen JIP) chce 6 → má 4`);

// 3) přání má přednost před spravedlností víkendů: kdo měl nejvíc víkendů a chce sobotu i neděli dvou víkendů, dostane je
const most = [...docs].filter((d) => d.positions.includes('plast')).sort((a, b) => b.fair.we - a.fair.we)[0];
r = solve({ days, positions: P, doctors: docs, requests: { [most.id]: { off: [], want: [{ day: 5, pos: null }, { day: 13, pos: null }] } }, seed: 1, fairHistory });
check(r.wants.filter((w) => w.doctorId === most.id).every((w) => w.ok), `${most.name} (víkendů dříve ${most.fair.we}) chce so 5. a ne 13. → dostane obě`);

// 4) vyškrtnuté dny platí vždy
const off = Array.from({ length: 31 }, (_, i) => i + 1).filter((d) => d % 2 === 0);
r = solve({ days, positions: P, doctors: docs, requests: { [kriz.id]: { off, want: [] } }, seed: 1, fairHistory });
check(svc(r, kriz.id).every((d) => d % 2 === 1), `${kriz.name}: vyškrtnuté sudé dny → slouží jen liché (${svc(r, kriz.id).join(', ')})`);

// 5) odpočinek zůstává: chce dva dny po sobě 24h → druhý se nesplní
r = solve({ days, positions: P, doctors: docs, requests: { [kriz.id]: { off: [], want: [{ day: 8, pos: ['plast'] }, { day: 9, pos: ['plast'] }] } }, seed: 1, fairHistory });
check(r.wants.find((w) => w.doctorId === kriz.id && w.day === 9)?.ok === false, `${kriz.name}: 24h 8. a 9. → 9. se nesplní (odpočinek po službě)`);
// 6) přání na OUP: splní se, ale nejvýš do zvoleného maxima OUP
r = solve({ days, positions: P, doctors: docs, requests: { [kriz.id]: { off: [], oupMax: 2, want: [3, 10, 17, 24].map((day) => ({ day, pos: ['OUPn'] })) } }, seed: 1, fairHistory });
const oupOk = r.wants.filter((w) => w.doctorId === kriz.id && w.ok).length;
check(oupOk === 2, `${kriz.name}: chce 4× OUP noc, zvolil max 2 → splněno ${oupOk}`);
// Senirita: dva lékaři chtějí stejnou jedinou službu → dostane ji zkušenější (výš v seznamu)
{
  const { solve } = await import('../js/solver.js');
  const { buildMonth } = await import('../js/calendar.js');
  const { DEFAULT_POSITIONS: P } = await import('../js/config.js');
  const { DEFAULT_DOCTORS } = await import('../js/default-doctors.js');
  const docs = DEFAULT_DOCTORS.filter((d) => d.active);
  const only = docs.filter((d) => d.positions.length === 1 && d.positions[0] === 'l1'); // Štětka
  const plast = docs.filter((d) => d.positions.join() === 'plast'); // jen plastika, seřazení podle zkušenosti
  const [a, b] = [plast[0], plast[plast.length - 1]];
  const req = { [a.id]: { off: [], want: [{ day: 10, pos: ['plast'] }] }, [b.id]: { off: [], want: [{ day: 10, pos: ['plast'] }] } };
  const r = solve({ days: buildMonth(2027, 2), positions: P, doctors: docs, requests: req, seed: 1 });
  const got = r.grid[9][P.findIndex((p) => p.id === 'plast')];
  const ok = got === a.id;
  console.log(ok ? '✔' : '✘', `stejné přání (10. plast): ${a.name} (zkušenější) i ${b.name} → dostal ${docs.find((d) => d.id === got)?.name}`);
  if (!ok) fails++;
}

// „jen jeden z“: přání 10. a 11. ve stejné skupině → slouží právě jeden z těch dnů
{
  const { solve } = await import('../js/solver.js');
  const { buildMonth } = await import('../js/calendar.js');
  const { DEFAULT_POSITIONS: P } = await import('../js/config.js');
  const { DEFAULT_DOCTORS } = await import('../js/default-doctors.js');
  const docs = DEFAULT_DOCTORS.filter((d) => d.active);
  const g = docs.find((d) => d.name === 'Grác');
  const r = solve({ days: buildMonth(2027, 2), positions: P, doctors: docs, requests: { [g.id]: { off: [], want: [{ day: 10, pos: null, group: 'jeden' }, { day: 11, pos: null, group: 'jeden' }] } }, seed: 1 });
  const n = [9, 10].filter((t) => r.grid[t].includes(g.id)).length;
  console.log(n === 1 ? '✔' : '✘', `jen jeden z 10./11.: Grác slouží ${n}× z těch dnů`);
  if (n !== 1) fails++;
}
console.log(fails ? `\n${fails} CHYB` : '\nVše v pořádku');
process.exit(fails ? 1 : 0);
