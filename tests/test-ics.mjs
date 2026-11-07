// Test kalendáře (.ics): node tests/test-ics.mjs
import { writeFileSync } from 'node:fs';
import { buildIcs } from '../js/ics.js';
import { DEFAULT_POSITIONS as P } from '../js/config.js';

let fails = 0;
const check = (c, msg) => { console.log(c ? '✔' : '✘', msg); if (!c) fails++; };
const header = ['', ...P.map((p) => p.label)];
const row = (label, map) => [label, ...P.map((p) => map[p.id] || '')];
const ics = buildIcs({
  schedules: [{ month: '2026-12', version: 2, header, rows: [
    row('út 1. 12.', { l1: 'Dr. 05', OUPn: 'Dr. 07' }),
    row('st 2. 12.', { t1: 'Dr. 05' }),
    row('čt 31. 12.', { OUPn: 'Dr. 05', '1A': 'Dr. 05; test' }),
  ] }],
  positions: P, name: 'Dr. 05', uid: 'lekar-05',
});
writeFileSync('/tmp/test.ics', ics);
const ev = ics.split('BEGIN:VEVENT').slice(1);
check(ev.length === 3, `3 služby Dr. 05 → 3 události (má ${ev.length})`);
check(/DTSTART;TZID=Europe\/Prague:20261201T073000[\s\S]*DTEND;TZID=Europe\/Prague:20261202T073000/.test(ev[0]), '24h lékař1 1. 12. 7:30 → 2. 12. 7:30');
check(/DTSTART;TZID=Europe\/Prague:20261202T073000[\s\S]*DTEND;TZID=Europe\/Prague:20261202T173000/.test(ev[1]), 'tečka1 2. 12. 7:30 → 17:30');
check(/DTSTART;TZID=Europe\/Prague:20261231T190000[\s\S]*DTEND;TZID=Europe\/Prague:20270101T070000/.test(ev[2]), 'OUP noc 31. 12. 19:00 → 1. 1. 2027 7:00 (přes konec roku)');
check(!ics.includes('Dr. 07'), 'služby jiných lékařů v kalendáři nejsou');
check(ics.includes('SUMMARY:Služba: OUP noc') && ics.includes('verze 2'), 'název události a verze rozpisu');
check(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75), 'žádný řádek delší než 75 bajtů');
const long = buildIcs({ schedules: [{ month: '2026-12', header: ['', 'Velmi dlouhý název pozice s diakritikou čšťžýáíé – oddělení anesteziologie'], rows: [['út 1. 12.', 'X']] }], positions: [], name: 'X', uid: 'x' });
check(long.split('\r\n').every((l) => Buffer.byteLength(l) <= 75) && /SUMMARY:Služba: Velmi[\s\S]*\r\n /.test(long), 'dlouhý název s diakritikou se správně zalomí');
check(ics.includes('BEGIN:VTIMEZONE') && ics.endsWith('END:VCALENDAR\r\n'), 'časové pásmo Praha, správný konec souboru');
const uids = ev.map((e) => e.match(/UID:(.*)/)[1]);
check(new Set(uids).size === 3 && uids.every((u) => u.includes('lekar-05')), 'stabilní a jedinečné UID (aktualizace nahradí, neduplikuje)');
console.log(fails ? `\n${fails} CHYB` : '\nVše v pořádku');
process.exit(fails ? 1 : 0);
