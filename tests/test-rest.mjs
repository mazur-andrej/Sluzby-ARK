// Test pravidla odpočinku podle časů služeb: node tests/test-rest.mjs
import { buildMonth } from '../js/calendar.js';
import { solve, validate } from '../js/solver.js';
import { DEFAULT_POSITIONS } from '../js/config.js';

const days = buildMonth(2026, 12);
const P = DEFAULT_POSITIONS;
const doc = { id: 'a', name: 'A', positions: P.map((p) => p.id), target: 2 };
const run = (want, minRestHours = 11, prev = [], afterNight = 'hard') => solve({
  days, positions: P, doctors: [doc], requests: { a: { off: [], want } }, prev, minRestHours, afterNight, restarts: 1, iterations: 2000,
}).wants.map((w) => w.ok);
let fails = 0;
const check = (got, exp, msg) => { const ok = JSON.stringify(got) === JSON.stringify(exp); console.log(ok ? '✔' : '✘', msg, ok ? '' : got); if (!ok) fails++; };

// út 1. 12. a st 2. 12. jsou pracovní dny
check(run([{ day: 1, pos: ['OUPd'] }, { day: 2, pos: ['l1'] }]), [true, true], 'OUP den (do 19:00) → další den 24h služba od 7:30: 12,5 h, OK');
check(run([{ day: 1, pos: ['l1'] }, { day: 2, pos: ['OUPd'] }]), [true, false], '24h služba → další den nic');
check(run([{ day: 1, pos: ['OUPn'] }, { day: 2, pos: ['t2'] }]), [true, false], 'OUP noc (do 7:00) → tečka2 v 9:30: jen 2,5 h, nelze');
check(run([{ day: 1, pos: ['t1'] }, { day: 2, pos: ['OUPd'] }]), [true, true], 'tečka1 (7:30–17:30) → další den OUP den: 13,5 h, OK');
check(run([{ day: 1, pos: ['OUPd'] }, { day: 2, pos: ['l1'] }], 13), [true, false], 'při min. odpočinku 13 h: OUP den → 24h služba nelze');
check(run([{ day: 1, pos: ['l1'] }, { day: 2, pos: ['OUPn'] }]), [true, false], '[vždy volno] 24h služba (do 7:30) → večer OUP noc: nelze');
check(run([{ day: 1, pos: ['l1'] }, { day: 2, pos: ['OUPn'] }], 11, [], 'off'), [true, true], '[jen hodiny] projde (11,5 h ≥ 11 h)');
check(run([{ day: 1, pos: ['OUPn'] }, { day: 2, pos: ['OUPn'] }]), [true, false], '[vždy volno] OUP noc → další noc OUP: nelze');
check(run([{ day: 1, pos: ['l1'] }], 11, [{ doctorId: 'a', day: 0, posId: 'OUPn' }]), [false], 'OUP noc 30. 11. → 1. 12. nic (přes přelom měsíce)');
check(run([{ day: 1, pos: ['l1'] }], 11, [{ doctorId: 'a', day: 0, posId: 'OUPd' }]), [true], 'OUP den 30. 11. → 1. 12. 24h služba OK');
// validace ručně upraveného rozpisu
const grid = days.map(() => P.map(() => null));
grid[0][0] = 'a'; grid[1][7] = 'a'; // 1. 12. lékař1, 2. 12. OUP den
const issues = validate({ days, positions: P, doctors: [doc], requests: {}, afterNight: 'hard' }, grid).filter((i) => !['even', 'oup'].includes(i.kind));
check(issues.map((i) => i.msg), ['A má jen 0 h odpočinku po předchozí službě'], 'kontrola ruční úpravy hlásí chybějící odpočinek (24h do 7:30 → OUP den v 7:00)');
const grid2 = days.map(() => P.map(() => null));
grid2[0][0] = 'a'; grid2[1][8] = 'a'; // 1. 12. lékař1, 2. 12. OUP noc
check(validate({ days, positions: P, doctors: [doc], requests: {}, afterNight: 'hard' }, grid2).filter((i) => !['even', 'oup'].includes(i.kind)).map((i) => i.level + ': ' + i.msg), ['error: A slouží den po noční/24h službě'], '[vždy volno] ruční úprava: služba den po 24h = chyba');
check(validate({ days, positions: P, doctors: [doc], requests: {}, afterNight: 'soft' }, grid2).filter((i) => !['even', 'oup'].includes(i.kind)).map((i) => i.level + ': ' + i.msg), ['warn: A slouží den po noční/24h službě (výjimka)'], '[výjimečně] ruční úprava: služba den po 24h = jen upozornění');

// [výjimečně] výjimka jen když není jiná možnost:
// 2 dny, pozice lékař1 (24h) a OUP noc; A umí obojí, B a C jen OUP noc, C 2. den nemůže.
const two = days.slice(0, 2);
const P2 = P.filter((p) => ['l1', 'OUPn'].includes(p.id));
const A = { id: 'a', name: 'A', positions: ['l1', 'OUPn'], target: 2 };
const B = { id: 'b', name: 'B', positions: ['OUPn'], target: 1 };
const C = { id: 'c', name: 'C', positions: ['OUPn'], target: 1 };
const solve2 = (bOff, mode) => solve({ days: two, positions: P2, doctors: [A, B, C], requests: { a: { off: [], want: [{ day: 1, pos: ['l1'] }] }, b: { off: bOff, want: [] }, c: { off: [2], want: [] } }, afterNight: mode, restarts: 2, iterations: 5000 });
let r = solve2([], 'soft');
check(r.grid[1][1], 'b', '[výjimečně] B volný 2. den → OUP noc dostane B, žádná výjimka');
check(r.warnings.filter((w) => w.startsWith('Výjimka')).length, 0, '…a žádné hlášení výjimky');
r = solve2([2], 'soft');
check(r.grid[1][1], 'a', '[výjimečně] B 2. den nemůže → OUP noc dostane A jako výjimku');
check(r.warnings.some((w) => w.startsWith('Výjimka: A má 2. OUP noc')), true, '…a výjimka je nahlášená');
r = solve2([2], 'hard');
check(r.grid[1][1], null, '[vždy volno] B 2. den nemůže → OUP noc zůstane neobsazená');

console.log(fails ? `\n${fails} CHYB` : '\nVše v pořádku');
process.exit(fails ? 1 : 0);
