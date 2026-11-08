// Test spravedlnosti víkendů a svátků (24h; pátek = ½ víkendu) přes 6 měsíců: node tests/test-fair.mjs
import { buildMonth } from '../js/calendar.js';
import { solve, buildFairHistory } from '../js/solver.js';
import { DEFAULT_POSITIONS as P } from '../js/config.js';
import { DEFAULT_DOCTORS } from '../js/default-doctors.js';

let fails = 0;
const check = (c, msg) => { console.log(c ? '✔' : '✘', msg); if (!c) fails++; };
const docs = DEFAULT_DOCTORS.filter((d) => d.active);
const past = [];
const missing = new Map(docs.map((d) => [d.id, 0]));
const holYear = new Map();
for (const [y, m] of [[2026, 12], [2027, 1], [2027, 2], [2027, 3], [2027, 4], [2027, 5]]) {
  const key = `${y}-${String(m).padStart(2, '0')}`;
  const days = buildMonth(y, m);
  const fairHistory = buildFairHistory({ targetKey: key, past, doctors: docs, positions: P });
  const r = solve({ days, positions: P, doctors: docs, requests: {}, seed: 1, fairHistory });
  const expected = r.stats.filter((s) => (s.fixed ?? 0) > 0 || (r.plan[s.id]?.h24?.hi ?? 0) > 0).length;
  const weSlots = days.filter((d) => d.weekend).length * 5;
  const none = r.fair.noWeekend.length, fri = r.fair.onlyFriday.length;
  // 2A-only lékaři se dělí jen o víkendové služby na 2A (8–10 měsíčně)
  const only2A = docs.filter((d) => d.positions.filter((p) => ['l1', 'l2', '1A', '2A', 'plast'].includes(p)).join() === '2A').length;
  const limit = Math.max(0, expected - weSlots, only2A - days.filter((d) => d.weekend).length);
  check(r.unfilled.length === 0 && none <= 4 && none + fri <= limit,
    `${key}: ${weSlots} so/ne služeb pro ${expected} lékařů → bez víkendu i pátku ${none}, jen pátek ${fri}`);
  r.fair.noWeekend.forEach((id) => missing.set(id, missing.get(id) + 1));
  r.fair.onlyFriday.forEach((id) => missing.set(id, missing.get(id) + 0.5));
  if (key === '2026-12') check(r.stats.every((s) => s.hol24 <= 1), 'Vánoce: nikdo nemá víc než 1 svátek');
  r.stats.forEach((s) => holYear.set(s.id, s.holYear));
  past.push({ key, days, header: P.map((p) => p.label), rows: r.grid });
}
const mv = [...missing.values()];
check(Math.max(...mv) <= 2, `za 6 měsíců nikomu nechyběly víc než 2 víkendy (pátek = ½; rozložení ${JSON.stringify(mv.reduce((a, c) => ((a[c] = (a[c] || 0) + 1), a), {}))})`);
const hv = [...holYear.values()];
check(Math.max(...hv) <= 3 && hv.filter((v) => v === 3).length <= 3, `svátky za 12 měsíců: nejvýš 3, a to jen výjimečně (${JSON.stringify(hv.reduce((a, c) => ((a[c] = (a[c] || 0) + 1), a), {}))})`);
console.log(fails ? `\n${fails} CHYB` : '\nVše v pořádku');
process.exit(fails ? 1 : 0);
