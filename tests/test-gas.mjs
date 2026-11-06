// Test serverové části s napodobeným Google prostředím: node tests/test-gas.mjs
import { createGas } from './gas-mock.mjs';
const { clock, sheets, book, triggers, mails, call, api, post } = createGas();
let fails = 0;
const check = (cond, msg) => { console.log(cond ? '✔' : '✘', msg); if (!cond) fails++; };

// 1) nastavení
call('nastavit');
check(sheets.map((s) => s.name).join() === 'Lékaři,Pozice,Požadavky,Stav,Nastavení', 'listy vytvořeny: ' + sheets.map((s) => s.name).join(', '));
check(triggers.length === 1, 'denní spouštěč vytvořen');
const docRows = book.getSheetByName('Lékaři').getDataRange().getValues().slice(1);
check(docRows.every((r) => r[6] && String(r[7]).includes('lekar.html?t=' + r[6])), 'každý lékař má token a odkaz');
const tok = (name) => docRows.find((r) => r[1] === name)[6];

// 2) lékař otevře odkaz
let me = api({ t: tok('Mazúr') });
check(me.doctor?.name === 'Mazúr' && me.month === '2026-12' && me.open === true, `Mazúr vidí prosinec, otevřeno, uzávěrka ${me.deadline}`);
check(api({ t: 'spatny' }).error, 'neplatný token odmítnut');

// 3) všichni aktivní zadají požadavky
let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const active = docRows.filter((r) => r[2] === true);
for (const r of active) {
  const off = new Set(); while (off.size < 8) off.add(1 + Math.floor(rnd() * 31));
  const request = { off: [...off], want: rnd() < 0.3 ? [{ day: 30, pos: null }] : [], ban: rnd() < 0.2 ? [{ day: 5, pos: ['OUPd', 'OUPn'] }] : [], notes: { 3: 'kurz' } };
  const res = post({ t: r[6], action: 'save', month: '2026-12', request });
  if (!res.ok) { check(false, 'uložení ' + r[1] + ' ' + res.error); break; }
}
check(Object.keys(call('readRequests', '2026-12')).length === active.length, `uloženo ${active.length} požadavků`);
check(post({ t: tok('Mazúr'), action: 'save', month: '2027-01', request: {} }).error, 'nelze ukládat na jiný měsíc');
me = api({ t: tok('Mazúr') });
check(me.request && me.request.off.length === 8, 'Mazúr vidí své uložené požadavky');

// 4) uzávěrka
clock.now = new Date('2026-11-12T22:30:00Z'); // 12. 11. 23:30 v Praze
call('denniKontrola');
check(!book.getSheetByName('Rozpis 2026-12') && api({ t: tok('Mazúr') }).open, '12. 11. ještě otevřeno, nic negenerováno');
clock.now = new Date('2026-11-13T00:30:00Z'); // 13. 11. 1:30
const t0 = Date.now();
call('denniKontrola');
check(!!book.getSheetByName('Rozpis 2026-12'), `13. 11. rozpis vygenerován (${Date.now() - t0} ms)`);
check(api({ t: tok('Mazúr') }).open === false, 'požadavky uzamčeny');
check(post({ t: tok('Mazúr'), action: 'save', month: '2026-12', request: { off: [1] } }).error, 'uložení po uzávěrce odmítnuto');
check(mails.length === 1, 'e-mail správci: ' + mails[0]?.subj);
console.log('  stav:', call('readState', '2026-12').note.slice(0, 120));
  console.log('  ', book.getSheetByName('Rozpis 2026-12').getDataRange().getValues().slice(34).map((r) => r[0]).filter(Boolean).slice(0, 4).join(' | '));

// 5) rozpis pro lékaře
const sch = api({ t: tok('Suk'), action: 'schedule', month: '2026-12' });
check(sch.rows?.length === 31 && sch.header.length === 10, `rozpis: ${sch.rows?.length} dní × ${sch.header?.length - 1} pozic`);
const empty = sch.rows.reduce((n, r) => n + r.slice(1).filter((x, i) => !x && !(['tečka1', 'tečka2'].includes(sch.header[i + 1]))).length, 0);
check(empty === 0, 'všechny noční/denní služby obsazeny');
// kontrola: nikdo neslouží v den, který si vyškrtl
const reqs = call('readRequests', '2026-12'); const byName = new Map(docRows.map((r) => [r[1], r[0]]));
let viol = 0; sch.rows.forEach((r, t) => r.slice(1).forEach((n) => { const id = byName.get(n); if (id && reqs[id]?.off.includes(t + 1)) viol++; }));
check(viol === 0, 'žádná služba ve vyškrtnutý den');
check(api({ t: tok('Suk') }).schedules[0] === '2026-12', 'seznam rozpisů obsahuje 2026-12');

// 6) další měsíc navazuje na konec prosince
clock.now = new Date('2026-12-02T10:00:00Z');
me = api({ t: tok('Suk') });
check(me.month === '2027-01' && me.open, 'v prosinci se otevřely požadavky na leden');
clock.now = new Date('2026-12-13T00:30:00Z');
call('denniKontrola');
const jan = book.getSheetByName('Rozpis 2027-01').getDataRange().getValues();
check(/31\. 12\./.test(jan[1][0]), 'leden začíná řádkem 31. 12. z minulého měsíce');
// po noční 31.12. nesmí sloužit 1.1.
const nightCols = [1, 2, 3, 4, 5, 9];
const prevNight = new Set(nightCols.map((c) => jan[1][c]).filter(Boolean));
const day1 = jan[2].slice(1).filter(Boolean);
check(!day1.some((n) => prevNight.has(n)), 'odpočinek po noční přes přelom měsíce dodržen');

// 7) ruční odemknutí
clock.now = new Date('2027-01-14T10:00:00Z');
call('odemknout');
check(api({ t: tok('Suk') }).open === true, 'po ručním odemknutí lze znovu zadávat');
call('denniKontrola');
check(!book.getSheetByName('Rozpis 2027-02'), 'odemknutý měsíc se automaticky negeneruje');
call('prehledPozadavku');
check(!!book.getSheetByName('Požadavky 2027-02'), 'přehled požadavků vytvořen');

console.log(fails ? `\n${fails} CHYB` : '\nVše v pořádku');
process.exit(fails ? 1 : 0);
