// Test serverové části s napodobeným Google prostředím: node tests/test-gas.mjs
import { createGas } from './gas-mock.mjs';
import { readFileSync } from 'node:fs';
const { clock, sheets, book, triggers, mails, call, api, post } = createGas();
// pojistka: žádné duplicitní funkce/konstanty v Kod.gs (vytvořen v createGas)
{
  const names = [...readFileSync(new URL('../apps-script/Kod.gs', import.meta.url), 'utf8').matchAll(/^(?:function|const) ([A-Za-z_]+)/gm)].map((m) => m[1]);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  if (dup.length) { console.log('✘ duplicitní definice v Kod.gs:', dup); process.exit(1); }
}
let fails = 0;
const check = (cond, msg) => { console.log(cond ? '✔' : '✘', msg); if (!cond) fails++; };

// 0) správce nejdřív importuje soukromý seznam se jmény (list Lékaři) – setup ho nesmí přepsat
const imp = book.insertSheet('Lékaři');
imp.getRange(1, 1, 3, 6).setValues([['ID', 'Jméno', 'Aktivní', 'Pozice', 'Cíl', 'Max'], ['x-1', 'Testová Jana', true, 'l2, OUPd, OUPn', 4, ''], ['x-2', 'Zkušební Petr', true, 'l1, l2', 4, '']]);
call('nastavit');
const kept = book.getSheetByName('Lékaři').getDataRange().getValues();
check(kept.length === 3 && kept[1][1] === 'Testová Jana' && kept[1][6] && String(kept[1][7]).includes('?t=' + kept[1][6]), 'importovaný seznam zachován, doplněn token a odkaz');
check(kept[0][8] === 'E-mail (pro rozeslání rozpisu)', 'přidán sloupec E-mail');
// pro zbytek testu: čistý výchozí (anonymní) seznam
book.deleteSheet(book.getSheetByName('Lékaři'));

// 1) nastavení
call('nastavit');
check(['Lékaři', 'Pozice', 'Požadavky', 'Stav', 'Nastavení'].every((n) => sheets.some((x) => x.name === n)), 'listy vytvořeny: ' + sheets.map((s) => s.name).join(', '));
check(docRowsAll().every((r) => /^Dr\. \d\d$/.test(r[1])), 'výchozí seznam je anonymní (Dr. 01…)');
check(triggers.length === 1, 'denní spouštěč vytvořen');
// e-maily dvěma lékařům (sloupec I)
function docRowsAll() { return book.getSheetByName('Lékaři').getDataRange().getValues().slice(1); }
const docRows = docRowsAll();
check(docRows.every((r) => r[6] && String(r[7]).includes('lekar.html?t=' + r[6])), 'každý lékař má token a odkaz');
const tok = (name) => docRows.find((r) => r[1] === name)[6];
// dva aktivní lékaři: A s OUP a 24h službami, B senior (lékař1)
const actRows = docRows.filter((r) => r[2] === true);
const DOC_A = actRows.find((r) => String(r[3]).includes('OUPn') && String(r[3]).includes('1A'))[1];
const DOC_B = actRows.find((r) => String(r[3]).startsWith('l1'))[1];

book.getSheetByName('Lékaři').getRange(docRows.indexOf(docRows.find((r) => r[1] === DOC_A)) + 2, 9).setValue('a@nemocnice.cz');
book.getSheetByName('Lékaři').getRange(docRows.indexOf(docRows.find((r) => r[1] === DOC_B)) + 2, 9).setValue('b@nemocnice.cz');

// 2) lékař otevře odkaz
let me = api({ t: tok(DOC_A) });
check(me.doctor?.name === DOC_A && me.month === '2026-12' && me.open === true, `${DOC_A} vidí prosinec, otevřeno, uzávěrka ${me.deadline}`);
check(api({ t: 'spatny' }).error, 'neplatný token odmítnut');

// 2b) připomínka lékařům bez požadavků: 3 dny před uzávěrkou (8. 11.) a v den uzávěrky (11. 11.)
clock.now = new Date('2026-11-07T00:30:00Z'); call('denniKontrola');
check(mails.length === 0, '4 dny před uzávěrkou: nic');
clock.now = new Date('2026-11-08T00:30:00Z'); call('denniKontrola');
const rem1 = mails.map((m) => m.to);
check(rem1.length === 2 && rem1.every((m) => /^Připomínka: požadavky na služby – prosinec 2026/.test(m.subject)) && rem1[0].body.includes('?t=') && rem1[0].body.includes('11. 11. 2026'),
  '3 dny před uzávěrkou: připomínka oběma lékařům s e-mailem, s odkazem a datem');
call('denniKontrola');
check(mails.length === 2, 'druhé spuštění téhož dne už nic nepošle');
post({ t: tok(DOC_A), action: 'save', month: '2026-12', request: { off: [], want: [] } }); // A uloží prázdné požadavky
clock.now = new Date('2026-11-11T00:30:00Z'); call('denniKontrola');
const rem2 = mails.slice(2).map((m) => m.to);
check(rem2.length === 1 && rem2[0].to === 'b@nemocnice.cz' && /^Dnes je uzávěrka/.test(rem2[0].subject), 'v den uzávěrky: jen B (A už uložil/a), předmět „Dnes je uzávěrka“');
mails.length = 0; clock.now = new Date('2026-11-06T10:00:00Z');

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
check(post({ t: tok(DOC_A), action: 'save', month: '2027-01', request: {} }).error, 'nelze ukládat na jiný měsíc');
me = api({ t: tok(DOC_A) });
check(me.request && me.request.off.length === 8, `${DOC_A} vidí své uložené požadavky`);

// 4) uzávěrka (do 11. včetně), v noci na 12. se vygeneruje rozpis KE SCHVÁLENÍ
clock.now = new Date('2026-11-11T22:30:00Z'); // 11. 11. 23:30 v Praze
call('denniKontrola');
check(!book.getSheetByName('Rozpis 2026-12') && api({ t: tok(DOC_A) }).open, '11. 11. večer ještě otevřeno, nic negenerováno');
clock.now = new Date('2026-11-12T00:30:00Z'); // 12. 11. 1:30
const t0 = Date.now();
call('denniKontrola');
check(!!book.getSheetByName('Rozpis 2026-12'), `12. 11. v noci rozpis vygenerován (${Date.now() - t0} ms)`);
const meLocked = api({ t: tok(DOC_A) });
check(meLocked.open === false && meLocked.awaiting === true, 'požadavky uzamčeny, lékař vidí „čeká na schválení“');
check(post({ t: tok(DOC_A), action: 'save', month: '2026-12', request: { off: [1] } }).error, 'uložení po uzávěrce odmítnuto');
const adminMail = mails.find((m) => typeof m.to === 'string');
check(!!adminMail && /čeká na schválení/.test(adminMail.subj), 'e-mail správci: ' + adminMail?.subj);
check(!mails.some((m) => typeof m.to === 'object'), 'lékařům zatím NIC neodešlo');
check(!!api({ t: tok(DOC_B), action: 'schedule', month: '2026-12' }).error && meLocked.schedules.length === 0, 'neschválený rozpis lékaři nevidí');
console.log('  stav:', call('readState', '2026-12').note.slice(0, 120));
// během dne kontrola – další noc jen připomínka správci, lékařům nic
clock.now = new Date('2026-11-13T00:30:00Z');
const m0 = mails.length; call('denniKontrola');
check(mails.slice(m0).length === 1 && /čeká na schválení/.test(mails[m0].subj) && typeof mails[m0].to === 'string', 'neschváleno → v noci připomínka jen správci');

// pravidlo JIP: lékaři jen na l1/l2 mají v rozpisu přesně 4 služby
{
  const decS = book.getSheetByName('Rozpis 2026-12').getDataRange().getValues();
  const jip = docRows.filter((r) => r[2] === true && String(r[3]).split(',').map((x) => x.trim()).every((p) => ['l1', 'l2'].includes(p)));
  const cnt = jip.map((r) => decS.slice(1, 33).reduce((n, row) => n + row.slice(1, 10).filter((x) => x === r[1]).length, 0));
  const want = jip.map((r) => (r[5] !== '' && r[5] != null ? Math.min(4, +r[5]) : 4));
  check(jip.length >= 2 && cnt.every((c, i) => c === want[i]), `lékaři jen na JIP mají přesně 4 (nižší Max podle Max) (${cnt.join(', ')})`);
  const setS = book.getSheetByName('Nastavení').getDataRange().getValues();
  check(setS.length >= 9 && /JIP/.test(setS[7][0]) && setS[7][1] === 4 && setS[8][1] === 'l1, l2', 'list Nastavení obsahuje pravidlo JIP (4; l1, l2)');
  book.getSheetByName('Nastavení').getRange(7, 2).setValue('NE');
  check(call('reminderDays').length === 0, 'připomínky: „NE“ = vypnuto');
  book.getSheetByName('Nastavení').getRange(7, 2).setValue('3, 0');
  book.getSheetByName('Nastavení').getRange(8, 2).setValue(0);
  check(call('fixedGroupSetting') === null, 'pravidlo JIP: 0 = vypnuto');
  book.getSheetByName('Nastavení').getRange(8, 2).setValue(4);
}
{
  const decS = book.getSheetByName('Rozpis 2026-12').getDataRange().getValues();
  const c2A = decS[0].indexOf('lékař4=2A');
  const grp = docRows.filter((r) => r[2] === true && String(r[3]).includes('2A') && !String(r[3]).includes('1A'));
  const cnt = grp.map((r) => decS.slice(1, 33).filter((row) => row[c2A] === r[1]).length);
  check(grp.length === 13 && cnt.every((c) => c >= 2), `Google: 13 lékařů s 2A bez 1A má každý ≥ 2× 2A (${cnt.join(',')})`);
  check(JSON.stringify(call('positionMinSetting')) === JSON.stringify({ position: '2A', min: 2, except: ['1A'] }), 'list Nastavení: minimum 2A = 2, kromě 1A');
}

// 4b) správce schválí → rozeslání verze 1
const res1 = call('schvalit', '2026-12');
const docMails = mails.filter((m) => typeof m.to === 'object');
check(/schválena verze 1/.test(res1), 'schváleno: ' + res1.split('\n')[0]);
check(docMails.length === 2 && docMails.map((m) => m.to.to).sort().join() === 'a@nemocnice.cz,b@nemocnice.cz', 'rozpis rozeslán 2 lékařům s e-mailem');
const mA = docMails.find((m) => m.to.to === 'a@nemocnice.cz').to;
const svcA = (mA.body.match(/Vaše služby \((\d+)\)/) || [])[1];
check(+svcA > 0 && mA.htmlBody.includes(DOC_A) && mA.htmlBody.includes('?t=') && /verze 1/.test(mA.subject), `e-mail lékaře A: ${svcA} služeb, verze 1, celý rozpis se jmény, osobní odkaz`);
check(/bez e-mailu: /.test(res1), 'správce ví, kdo nemá e-mail');
// odběr kalendáře
const feed = call('doGet', { parameter: { action: 'ics', t: tok(DOC_A) } });
const nEv = (feed.s.match(/BEGIN:VEVENT/g) || []).length;
check(feed.mime === 2 && feed.s.startsWith('BEGIN:VCALENDAR') && nEv === +svcA, `kalendář k odběru: ${nEv} událostí = ${svcA} služeb lékaře A`);
check(!call('doGet', { parameter: { action: 'ics', t: 'zly' } }).s.includes('BEGIN:VCALENDAR'), 'kalendář se špatným odkazem se nevydá');

// 5) rozpis pro lékaře
const sch = api({ t: tok(DOC_B), action: 'schedule', month: '2026-12' });
check(sch.rows?.length === 31 && sch.header.length === 10 && sch.version === 1, `rozpis: ${sch.rows?.length} dní × ${sch.header?.length - 1} pozic, verze ${sch.version}`);
const empty = sch.rows.reduce((n, r) => n + r.slice(1).filter((x, i) => !x && !(['tečka1', 'tečka2'].includes(sch.header[i + 1]))).length, 0);
check(empty === 0, 'všechny noční/denní služby obsazeny');
const reqs = call('readRequests', '2026-12'); const byName = new Map(docRows.map((r) => [r[1], r[0]]));
let viol = 0; sch.rows.forEach((r, t) => r.slice(1).forEach((n) => { const id = byName.get(n); if (id && reqs[id]?.off.includes(t + 1)) viol++; }));
check(viol === 0, 'žádná služba ve vyškrtnutý den');
check(api({ t: tok(DOC_B) }).schedules[0] === '2026-12', 'seznam rozpisů obsahuje 2026-12');

// 5b) změna po schválení: lékaři vidí dál verzi 1, dokud správce neschválí verzi 2
const dec = book.getSheetByName('Rozpis 2026-12');
const firstMails = mails.length;
call('denniKontrola');
check(mails.length === firstMails, 'beze změny se v noci nic neposílá');
const dv = dec.getDataRange().getValues();
let cell = null;
for (let r = 1; r < dv.length && !cell; r++) for (let c = 1; c < 10; c++) if (dv[r][c] === DOC_B) { cell = [r + 1, c + 1, dv[r][0], dv[0][c]]; break; }
dec.getRange(cell[0], cell[1]).setValue(DOC_A);
const sch2 = api({ t: tok(DOC_A), action: 'schedule', month: '2026-12' });
const shown = sch2.rows.find((r) => r[0] === cell[2])[cell[1] - 1];
check(sch2.version === 1 && shown === DOC_B, 'neschválená úprava: lékaři pořád vidí verzi 1 (původní jméno)');
call('denniKontrola');
const night = mails.slice(firstMails);
check(night.length === 1 && typeof night[0].to === 'string' && /1 neschválených změn/.test(night[0].body), 'v noci jen připomínka správci „1 neschválených změn“');
const res2 = call('schvalit', '2026-12');
const v2 = mails.slice(firstMails).filter((m) => typeof m.to === 'object').map((m) => m.to);
const toA = v2.find((m) => m.to === 'a@nemocnice.cz'), toB = v2.find((m) => m.to === 'b@nemocnice.cz');
check(/verze 2 \(1 změn\)/.test(res2) && v2.length === 2 && toA.subject.startsWith('ZMĚNA') && toB.subject.startsWith('ZMĚNA'),
  `schválena verze 2, oba dotčení mají „ZMĚNA…“ (${toA?.subject})`);
check(toB.body.includes(`${cell[2]} ${cell[3]}: ${DOC_B} → ${DOC_A}`), `změna popsaná přesně: ${cell[2]} ${cell[3]}: ${DOC_B} → ${DOC_A}`);
check(api({ t: tok(DOC_B), action: 'schedule', month: '2026-12' }).version === 2, 'stránka lékaře: verze 2');
// překlep ve jméně → schválení se zastaví
const before = mails.length;
dec.getRange(cell[0], cell[1]).setValue(DOC_A + 'x');
const res3 = call('schvalit', '2026-12');
check(/NESCHVÁLENO/.test(res3) && mails.length === before, 'překlep ve jméně: schválení zastaveno, nic neodešlo');
dec.getRange(cell[0], cell[1]).setValue(DOC_A);
check(call('pendingApprovals').length === 0, 'po opravě překlepu není nic ke schválení');

// 6) další měsíc navazuje na konec prosince
clock.now = new Date('2026-12-02T10:00:00Z');
me = api({ t: tok(DOC_B) });
check(me.month === '2027-01' && me.open, 'v prosinci se otevřely požadavky na leden');
// 12. 12. 2026 je sobota → kontrola v pondělí 14. 12., uzávěrka v neděli 13. 12.
check(me.deadline === '13. 12. 2026', `víkend: uzávěrka posunuta na ${me.deadline}`);
clock.now = new Date('2026-12-12T00:30:00Z'); call('denniKontrola');
clock.now = new Date('2026-12-13T00:30:00Z'); call('denniKontrola');
check(!book.getSheetByName('Rozpis 2027-01') && api({ t: tok(DOC_B) }).open, 'v sobotu a neděli ještě otevřeno, nic negenerováno');
clock.now = new Date('2026-12-14T00:30:00Z');
call('denniKontrola');
check(!!book.getSheetByName('Rozpis 2027-01'), 'v noci na pondělí 14. 12. vygenerováno ke schválení');
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
check(api({ t: tok(DOC_B) }).open === true, 'po ručním odemknutí lze znovu zadávat');
call('denniKontrola');
check(!book.getSheetByName('Rozpis 2027-02'), 'odemknutý měsíc se automaticky negeneruje');
call('prehledPozadavku');
check(!!book.getSheetByName('Požadavky 2027-02'), 'přehled požadavků vytvořen');

console.log(fails ? `\n${fails} CHYB` : '\nVše v pořádku');
process.exit(fails ? 1 : 0);
