// Test spravedlnosti víkendů a svátků (24h) přes 6 měsíců: node tests/test-fair.mjs
import { buildMonth } from '../js/calendar.js';
import { solve, buildFairHistory } from '../js/solver.js';
import { DEFAULT_POSITIONS as P } from '../js/config.js';
import { DEFAULT_DOCTORS } from '../js/default-doctors.js';

let fails = 0;
const check = (c, msg) => { console.log(c ? '✔' : '✘', msg); if (!c) fails++; };
const docs = DEFAULT_DOCTORS.filter((d) => d.active);
const past = [];
const misses = new Map(docs.map((d) => [d.id, []]));
const holYear = new Map();
for (const [y, m] of [[2026, 12], [2027, 1], [2027, 2], [2027, 3], [2027, 4], [2027, 5]]) {
  const key = `${y}-${String(m).padStart(2, '0')}`;
  const days = buildMonth(y, m);
  const fairHistory = buildFairHistory({ targetKey: key, past, doctors: docs, positions: P });
  const r = solve({ days, positions: P, doctors: docs, requests: {}, seed: 1, fairHistory });
  const expected = r.stats.filter((s) => (s.fixed ?? 0) > 0 || (r.plan[s.id]?.h24?.hi ?? 0) > 0).length;
  // minimum podle pozic: 2A-only lékaři (bez jiné 24h pozice) se dělí jen o víkendové služby na 2A
  const only2A = docs.filter((d) => d.positions.filter((p) => ['l1', 'l2', '1A', '2A', 'plast'].includes(p)).join() === '2A').length;
  const we2A = days.filter((d) => d.weekend).length;
  const minPossible = Math.max(0, expected - r.fair.weekendSlots, only2A - we2A);
  const no = r.fair.noWeekend;
  const multi = r.stats.filter((s) => s.we24 > 1).length;
  // 2× víkend při tom, že jiný nemá, je OK jen když chybějící víkendy jsou na 2A (kam ostatní nemohou)
  const poolLimited = minPossible > Math.max(0, expected - r.fair.weekendSlots);
  check(r.unfilled.length === 0 && no.length === minPossible && (no.length === 0 || multi === 0 || poolLimited),
    `${key}: ${r.fair.weekendSlots} víkendových 24h služeb, ${expected} lékařů → bez víkendu ${no.length} (minimum ${minPossible}), nikdo 2× víkend, když jiný 0×`);
  no.forEach((id) => misses.get(id).push(key));
  if (key === '2026-12') check(r.stats.every((s) => s.hol24 <= 1), 'Vánoce: nikdo nemá víc než 1 svátek');
  r.stats.forEach((s) => holYear.set(s.id, s.holYear));
  past.push({ key, days, header: P.map((p) => p.label), rows: r.grid });
}
const counts = [...misses.values()].map((v) => v.length);
check(Math.max(...counts) <= 3, `za 6 měsíců nikdo bez víkendu víc než 3× (rozložení: ${JSON.stringify(counts.reduce((a, c) => ((a[c] = (a[c] || 0) + 1), a), {}))})`);
const consec = [...misses].filter(([, v]) => v.some((k, i) => i > 0 && v[i - 1] && (+k.slice(5) - +v[i - 1].slice(5) === 1 || (k.endsWith('-01') && v[i - 1].endsWith('-12')))));
check(consec.length <= 3, `bez víkendu dva měsíce po sobě nejvýš 3 lékaři (${consec.length})`);
const hv = [...holYear.values()];
check(Math.max(...hv) <= 3 && hv.filter((v) => v === 3).length <= 3, `svátky za 12 měsíců: nejvýš 3, a to jen výjimečně (rozložení: ${JSON.stringify(hv.reduce((a, c) => ((a[c] = (a[c] || 0) + 1), a), {}))})`);
console.log(fails ? `\n${fails} CHYB` : '\nVše v pořádku');
process.exit(fails ? 1 : 0);
