// Test pravidla odpočinku podle časů služeb: node tests/test-rest.mjs
import { buildMonth } from '../js/calendar.js';
import { solve, validate } from '../js/solver.js';
import { DEFAULT_POSITIONS } from '../js/config.js';

const days = buildMonth(2026, 12);
const P = DEFAULT_POSITIONS;
const doc = { id: 'a', name: 'A', positions: P.map((p) => p.id), target: 2 };
const run = (want, minRestHours = 11, prev = []) => solve({
  days, positions: P, doctors: [doc], requests: { a: { off: [], want } }, prev, minRestHours, restarts: 1, iterations: 2000,
}).wants.map((w) => w.ok);
let fails = 0;
const check = (got, exp, msg) => { const ok = JSON.stringify(got) === JSON.stringify(exp); console.log(ok ? '✔' : '✘', msg, ok ? '' : got); if (!ok) fails++; };

// út 1. 12. a st 2. 12. jsou pracovní dny
check(run([{ day: 1, pos: ['OUPd'] }, { day: 2, pos: ['l1'] }]), [true, true], 'OUP den (do 19:00) → další den 24h služba: 12 h odpočinku, OK');
check(run([{ day: 1, pos: ['l1'] }, { day: 2, pos: ['OUPd'] }]), [true, false], '24h služba → další den nic');
check(run([{ day: 1, pos: ['OUPn'] }, { day: 2, pos: ['t2'] }]), [true, false], 'OUP noc (do 7:00) → tečka2 v 9:30: jen 2,5 h, nelze');
check(run([{ day: 1, pos: ['t1'] }, { day: 2, pos: ['OUPd'] }]), [true, true], 'tečka1 (do 17:30) → další den OUP den: 13,5 h, OK');
check(run([{ day: 1, pos: ['OUPd'] }, { day: 2, pos: ['l1'] }], 13), [true, false], 'při min. odpočinku 13 h: OUP den → 24h služba nelze');
check(run([{ day: 1, pos: ['l1'] }], 11, [{ doctorId: 'a', day: 0, posId: 'OUPn' }]), [false], 'OUP noc 30. 11. → 1. 12. nic (přes přelom měsíce)');
check(run([{ day: 1, pos: ['l1'] }], 11, [{ doctorId: 'a', day: 0, posId: 'OUPd' }]), [true], 'OUP den 30. 11. → 1. 12. 24h služba OK');
// validace ručně upraveného rozpisu
const grid = days.map(() => P.map(() => null));
grid[0][0] = 'a'; grid[1][7] = 'a'; // 1. 12. lékař1, 2. 12. OUP den
const issues = validate({ days, positions: P, doctors: [doc], requests: {} }, grid);
check(issues.map((i) => i.msg), ['A má jen 0 h odpočinku po předchozí službě'], 'kontrola ruční úpravy hlásí chybějící odpočinek');

console.log(fails ? `\n${fails} CHYB` : '\nVše v pořádku');
process.exit(fails ? 1 : 0);
