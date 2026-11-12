// Spravedlnost za rok: kdo měl míň 24h než obvykle, dostane později víc; kdo byl celý měsíc pryč, žádnou náhradu nedostane
import { buildFairHistory, planTargets } from '../js/solver.js';
import { buildMonth } from '../js/calendar.js';
import { DEFAULT_POSITIONS as P } from '../js/config.js';
import { DEFAULT_DOCTORS } from '../js/default-doctors.js';
let fails = 0;
const check = (ok, msg) => { console.log(ok ? '✔' : '✘', msg); if (!ok) fails++; };
const docs = DEFAULT_DOCTORS.filter((d) => d.active);
const plastOnly = docs.filter((d) => d.positions.join() === 'plast');
const [a, b, c] = plastOnly; // a: měl jen 1 službu, b: celý měsíc pryč, c: normálně
const days = buildMonth(2027, 1);
const header = ['', ...P.map((p) => p.label)];
const rows = days.map(() => P.map(() => null));
const ip = P.findIndex((p) => p.id === 'plast');
rows[2][ip] = a.id; [5, 9, 13].forEach((t) => { rows[t][ip] = c.id; });
const fh = buildFairHistory({ targetKey: '2027-02', past: [{ key: '2027-01', header, rows, days }], doctors: docs, positions: P });
check((fh[a.id]?.dev || 0) < -1, `${a.name}: měl 1 službu místo ~${a.typical24} → odchylka ${(fh[a.id]?.dev || 0).toFixed(1)}`);
check(!(fh[b.id]?.dev), `${b.name}: celý měsíc pryč → bez odchylky (${fh[b.id]?.dev || 0})`);
const d2 = buildMonth(2027, 2);
const p0 = planTargets({ days: d2, positions: P, doctors: docs });
const p1 = planTargets({ days: d2, positions: P, doctors: docs, fairHistory: fh });
check(p1[a.id].h24.avg > p0[a.id].h24.avg + 0.5, `${a.name}: cíl v únoru ${p0[a.id].h24.avg.toFixed(1)} → ${p1[a.id].h24.avg.toFixed(1)} (náhrada)`);
check(Math.abs(p1[b.id].h24.avg - p0[b.id].h24.avg) < 0.3, `${b.name}: cíl v únoru beze změny (${p0[b.id].h24.avg.toFixed(1)} → ${p1[b.id].h24.avg.toFixed(1)})`);
console.log(fails ? `\n${fails} CHYB` : '\nVše v pořádku');
process.exit(fails ? 1 : 0);
