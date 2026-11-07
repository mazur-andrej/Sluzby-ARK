// =====================================================================
// Rozpis služeb – serverová část pro Google Apps Script (Google Tabulky)
// Tento soubor se spojí s algoritmem do apps-script/Kod.gs (node tools/build-gas.mjs).
// =====================================================================

const SH = {
  DOC: 'Lékaři', POS: 'Pozice', REQ: 'Požadavky', STATE: 'Stav', SET: 'Nastavení',
};
const TZ = 'Europe/Prague';
const SETTINGS_DEFAULT = [
  ['Uzávěrka požadavků (poslední den v měsíci, kdy lze zadávat)', 12],
  ['E-mail pro upozornění (prázdné = vlastník tabulky)', ''],
  ['Adresa stránky pro lékaře', 'https://mazur-andrej.github.io/Sluzby-ARK/lekar.html'],
  ['Minimální odpočinek mezi službami (hodiny)', 11],
  ['Den po službě přes noc (24h, OUP noc): VŽDY VOLNO / VÝJIMEČNĚ / NE', 'VÝJIMEČNĚ'],
  ['Po vygenerování rozeslat rozpis lékařům e-mailem (ANO/NE)', 'ANO'],
];
const RED = '#ea9999', YELLOW = '#fce8b2';

// ---------------------------------------------------------------- menu
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Rozpis služeb')
    .addItem('Počáteční nastavení (spustit jednou)', 'nastavit')
    .addSeparator()
    .addItem('Doplnit odkazy nově přidaným lékařům', 'doplnitOdkazy')
    .addItem('Přehled požadavků na příští měsíc', 'prehledPozadavku')
    .addSeparator()
    .addItem('Vygenerovat rozpis příštího měsíce teď', 'generovatTed')
    .addItem('Znovu otevřít požadavky příštího měsíce', 'odemknout')
    .addSeparator()
    .addItem('Rozeslat rozpis příštího měsíce lékařům e-mailem', 'rozeslatTed')
    .addToUi();
}

// ---------------------------------------------------------------- pomocné
/** Zpráva správci – v tabulce jako okno, při spuštění z editoru do protokolu. */
function info(msg) { try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); } }
const ss = () => SpreadsheetApp.getActiveSpreadsheet();
function sheet(name) { return ss().getSheetByName(name); }
function ensureSheet(name, header) {
  let s = sheet(name);
  if (!s) {
    s = ss().insertSheet(name);
    if (header) {
      s.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#eeeeee');
      s.setFrozenRows(1);
    }
  }
  return s;
}
function todayParts() {
  const s = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd').split('-').map(Number);
  return { year: s[0], month: s[1], day: s[2] };
}
function monthKey(y, m) { return `${y}-${String(m).padStart(2, '0')}`; }
function parseKey(k) { const [y, m] = String(k).split('-').map(Number); return { year: y, month: m }; }
function nextMonth(y, m) { return m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 }; }
function targetMonth() { const t = todayParts(); const n = nextMonth(t.year, t.month); return monthKey(n.year, n.month); }
function newToken() { return Utilities.getUuid().replace(/-/g, '').slice(0, 20); }
const scheduleSheetName = (key) => `Rozpis ${key}`;

function getSetting(i) {
  const s = sheet(SH.SET);
  if (!s) return SETTINGS_DEFAULT[i][1];
  const v = s.getRange(i + 1, 2).getValue();
  return v === '' || v == null ? SETTINGS_DEFAULT[i][1] : v;
}
const deadlineDay = () => Number(getSetting(0)) || 12;
function adminEmail() { return getSetting(1) || Session.getEffectiveUser().getEmail(); }

/** Uzávěrka pro daný cílový měsíc = den N v předchozím měsíci. */
function deadlineOf(key) {
  const { year, month } = parseKey(key);
  const p = prevMonthOf(year, month);
  const last = new Date(p.year, p.month, 0).getDate();
  return { year: p.year, month: p.month, day: Math.min(deadlineDay(), last) };
}
function deadlinePassed(key) {
  const d = deadlineOf(key), t = todayParts();
  const a = t.year * 10000 + t.month * 100 + t.day, b = d.year * 10000 + d.month * 100 + d.day;
  return a > b;
}

// ---------------------------------------------------------------- data
// List Pozice: Zkratka | Název sloupce | Začátek | Délka (h) | Jen pracovní dny | Jak to lékaři píšou
function readPositions() {
  const v = sheet(SH.POS).getDataRange().getDisplayValues().slice(1).filter((r) => String(r[0]).trim() !== '');
  return v.map((r) => ({
    id: String(r[0]).trim(), label: String(r[1]).trim(),
    start: String(r[2]).trim(), hours: Number(String(r[3]).replace(',', '.')),
    workdaysOnly: String(r[4]).toUpperCase() === 'TRUE',
    aliases: String(r[5] || '').split(',').map((x) => x.trim()).filter(Boolean),
  }));
}
const minRestHours = () => { const v = Number(getSetting(3)); return v >= 0 ? v : 11; };
function afterNightSetting() {
  const v = String(getSetting(4)).trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/^(vzdy|ano|true|1)/.test(v)) return 'hard';
  if (/^(ne|no|false|0)/.test(v)) return 'off';
  return 'soft';
}

/** Načte lékaře; chybějící ID/token doplní a zapíše zpět. */
function readDoctors() {
  const s = sheet(SH.DOC);
  const v = s.getDataRange().getValues();
  const out = [];
  let dirty = false;
  for (let i = 1; i < v.length; i++) {
    const r = v[i];
    const name = String(r[1] || '').trim();
    if (!name) continue;
    let id = String(r[0] || '').trim();
    let token = String(r[6] || '').trim();
    if (!id) { id = slug(name, out.map((d) => d.id)); r[0] = id; dirty = true; }
    if (!token) { token = newToken(); r[6] = token; dirty = true; }
    out.push({
      row: i + 1, id, name, active: r[2] === true || String(r[2]).toUpperCase() === 'ANO',
      positions: String(r[3] || '').split(',').map((x) => x.trim()).filter(Boolean),
      target: r[4] === '' ? 0 : Number(r[4]), max: r[5] === '' ? null : Number(r[5]), token,
      email: String(r[8] || '').trim(),
    });
  }
  if (dirty) {
    s.getRange(1, 1, v.length, 7).setValues(v.map((r) => r.slice(0, 7).concat(Array(Math.max(0, 7 - r.length)).fill('')).slice(0, 7)));
    writeLinks(out);
  }
  return out;
}
function slug(name, taken) {
  let id = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lekar';
  while (taken.includes(id)) id += '-2';
  return id;
}
function writeLinks(doctors) {
  const base = String(getSetting(2));
  const s = sheet(SH.DOC);
  doctors.forEach((d) => s.getRange(d.row, 8).setValue(`${base}?t=${d.token}`));
}

function readState(key) {
  const v = sheet(SH.STATE).getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (String(v[i][0]) === key) return { row: i + 1, status: String(v[i][1] || ''), note: String(v[i][3] || '') };
  return { row: null, status: '', note: '' };
}
function writeState(key, status, note) {
  const s = sheet(SH.STATE);
  const st = readState(key);
  const row = st.row || s.getLastRow() + 1;
  const now = Utilities.formatDate(new Date(), TZ, 'd. M. yyyy HH:mm');
  s.getRange(row, 1, 1, 4).setValues([[key, status, now, note == null ? st.note : note]]);
  s.getRange(row, 1).setNumberFormat('@');
}
/** Je možné zadávat požadavky? */
function isOpen(key) {
  const st = readState(key).status;
  if (st === 'uzamčeno') return false;
  if (st === 'otevřeno') return true;
  return !deadlinePassed(key);
}

function readRequests(key) {
  const v = sheet(SH.REQ).getDataRange().getValues();
  const out = {};
  for (let i = 1; i < v.length; i++) {
    if (String(v[i][0]) !== key) continue;
    try { out[String(v[i][1])] = JSON.parse(v[i][3]); } catch (e) { /* poškozený řádek */ }
  }
  return out;
}
function writeRequest(key, doc, req) {
  const s = sheet(SH.REQ);
  const v = s.getDataRange().getValues();
  let row = null;
  for (let i = 1; i < v.length; i++) if (String(v[i][0]) === key && String(v[i][1]) === doc.id) { row = i + 1; break; }
  if (!row) row = s.getLastRow() + 1;
  const now = Utilities.formatDate(new Date(), TZ, 'd. M. yyyy HH:mm');
  s.getRange(row, 1, 1, 5).setValues([[key, doc.id, doc.name, JSON.stringify(req), now]]);
  s.getRange(row, 1).setNumberFormat('@');
}

// ---------------------------------------------------------------- počáteční nastavení
function nastavit() {
  // Pokud list Lékaři už existuje (např. importovaný soukromý seznam se jmény), zůstane beze změny.
  const docS = ensureSheet(SH.DOC, ['ID', 'Jméno', 'Aktivní', 'Pozice (zkratky oddělené čárkou)', 'Cíl služeb/měsíc', 'Max', 'Token (neměnit)', 'Osobní odkaz pro lékaře', 'E-mail (pro rozeslání rozpisu)']);
  if (docS.getLastRow() < 2) {
    const rows = DEFAULT_DOCTORS.map((d) => [d.id, d.name, !!d.active, d.positions.join(', '), d.target, d.max == null ? '' : d.max, newToken(), '', '']);
    docS.getRange(2, 1, rows.length, 9).setValues(rows);
  }
  if (!docS.getRange(1, 9).getValue()) docS.getRange(1, 9).setValue('E-mail (pro rozeslání rozpisu)');
  docS.getRange(2, 3, Math.max(docS.getLastRow() - 1, 200), 1).insertCheckboxes();
  docS.setColumnWidth(2, 140); docS.setColumnWidth(4, 220); docS.setColumnWidth(8, 420); docS.setColumnWidth(9, 220);
  const posS = ensureSheet(SH.POS, ['Zkratka', 'Název sloupce', 'Začátek (HH:MM)', 'Délka (h)', 'Jen pracovní dny', 'Jak to lékaři píšou']);
  if (posS.getLastRow() < 2) {
    const rows = DEFAULT_POSITIONS.map((p) => [p.id, p.label, p.start, p.hours, p.workdaysOnly, (p.aliases || []).join(', ')]);
    posS.getRange(2, 3, rows.length, 1).setNumberFormat('@'); // čas jako text, ať ho Tabulky nepřevádějí
    posS.getRange(2, 1, rows.length, 6).setValues(rows);
    posS.getRange(2, 5, rows.length, 1).insertCheckboxes();
    posS.getRange(2, 5, rows.length, 1).setValues(rows.map((r) => [r[4]]));
  }
  ensureSheet(SH.REQ, ['Měsíc', 'ID lékaře', 'Jméno', 'Požadavky (data)', 'Uloženo']);
  ensureSheet(SH.STATE, ['Měsíc', 'Stav', 'Změněno', 'Poznámka']);
  const setS = ensureSheet(SH.SET);
  if (setS.getLastRow() < 1) {
    setS.getRange(1, 1, SETTINGS_DEFAULT.length, 2).setValues(SETTINGS_DEFAULT);
    setS.setColumnWidth(1, 420); setS.setColumnWidth(2, 420);
  }
  writeLinks(readDoctors());
  // denní kontrola uzávěrky
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'denniKontrola').forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('denniKontrola').timeBased().everyDays(1).atHour(1).inTimezone(TZ).create();
  const def = ss().getSheetByName('List 1') || ss().getSheetByName('Sheet1') || ss().getSheetByName('Hárok1');
  if (def && ss().getSheets().length > 1 && def.getLastRow() === 0) ss().deleteSheet(def);
  info('Hotovo. Teď nasaďte webovou aplikaci (Nasadit → Nové nasazení → Webová aplikace) – postup je v README.');
}

function doplnitOdkazy() {
  const d = readDoctors();
  writeLinks(d);
  info(`Odkazy doplněny (${d.length} lékařů). Najdete je ve sloupci „Osobní odkaz pro lékaře".`);
}

// ---------------------------------------------------------------- automatika
/** Spouští se každou noc v 1:00. Po uzávěrce zamkne požadavky a vygeneruje rozpis. */
function denniKontrola() {
  const key = targetMonth();
  const st = readState(key).status;
  // ručně znovu otevřeno = čeká se na ruční generování; už vygenerováno = nic
  if (deadlinePassed(key) && st !== 'otevřeno' && !sheet(scheduleSheetName(key))) generovat(key, true);
  hlidatZmeny();
}

function generovatTed() {
  const key = targetMonth();
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { /* spuštěno z editoru */ }
  if (ui && sheet(scheduleSheetName(key))) {
    const r = ui.alert(`Rozpis ${key} už existuje. Přepsat ho novým (ruční úpravy se ztratí)?`, ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
  }
  const res = generovat(key, false);
  info(`Rozpis ${key} vygenerován. Požadavky jsou uzamčeny.${res.warnings.length ? '\n\nUpozornění:\n' + res.warnings.join('\n') : ''}`);
}

function odemknout() {
  const key = targetMonth();
  writeState(key, 'otevřeno', 'požadavky znovu otevřeny ručně');
  info(`Požadavky na ${key} jsou znovu otevřené. Rozpis pak vygenerujte ručně v menu.`);
}

function generovat(key, notify) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    writeState(key, 'uzamčeno', 'generuji…');
    const { year, month } = parseKey(key);
    const days = buildMonth(year, month);
    const positions = readPositions();
    const doctors = readDoctors().filter((d) => d.active);
    const requests = readRequests(key);
    const prev = prevTail(year, month, positions, doctors);
    const res = solve({ days, positions, doctors, requests, prev, seed: 1, restarts: 3, minRestHours: minRestHours(), afterNight: afterNightSetting() });
    writeSchedule(key, days, positions, doctors, res, prev);
    const missing = doctors.filter((d) => !requests[d.id]).map((d) => d.name);
    const note = [`vygenerováno`, res.warnings.length ? `${res.warnings.length} upozornění` : 'bez upozornění',
      missing.length ? `nezadali požadavky: ${missing.join(', ')}` : ''].filter(Boolean).join('; ');
    writeState(key, 'uzamčeno', note);
    let sent = null;
    if (notify && sendSetting()) sent = rozeslat(key, { force: true });
    if (notify) {
      try {
        MailApp.sendEmail(adminEmail(), `Rozpis služeb ${key} vygenerován`,
          `Požadavky na ${key} byly uzamčeny a rozpis je vygenerovaný v listu „${scheduleSheetName(key)}".\n\n` +
          (res.warnings.length ? `Upozornění:\n${res.warnings.join('\n')}\n\n` : 'Všechny služby obsazeny bez upozornění.\n\n') +
          (missing.length ? `Požadavky nezadali: ${missing.join(', ')}\n\n` : '') +
          (sent ? (sent.error ? `Rozpis NEBYL rozeslán: ${sent.error}\n\n` : `Rozpis (verze ${sent.version}) rozeslán e-mailem ${sent.sent} lékařům${sent.noEmail.length ? `; bez e-mailu: ${sent.noEmail.join(', ')}` : ''}${sent.mailError ? `; CHYBA: ${sent.mailError}` : ''}.\n\n`) : '') + ss().getUrl());
      } catch (e) { /* e-mail není kritický */ }
    }
    return res;
  } finally { lock.releaseLock(); }
}

/** Služby z konce minulého měsíce (z listu Rozpis), kvůli odpočinku po noční. */
function prevTail(year, month, positions, doctors) {
  const p = prevMonthOf(year, month);
  const s = sheet(scheduleSheetName(monthKey(p.year, p.month)));
  if (!s) return [];
  const last = new Date(p.year, p.month, 0).getDate();
  const v = s.getDataRange().getDisplayValues();
  const header = v[0];
  const byName = new Map(doctors.map((d) => [d.name, d.id]));
  const out = [];
  for (const r of v) {
    const m = String(r[0]).match(/(\d{1,2})\.\s*(\d{1,2})\./);
    if (!m || +m[2] !== p.month || +m[1] < last - 1) continue;
    for (let c = 1; c < header.length; c++) {
      const pos = positions.find((x) => x.label === header[c]);
      const id = byName.get(String(r[c]).trim());
      if (pos && id) out.push({ doctorId: id, day: +m[1] - last, posId: pos.id });
    }
  }
  return out;
}

function writeSchedule(key, days, positions, doctors, res, prev) {
  const name = scheduleSheetName(key);
  let s = sheet(name);
  if (s) s.clear(); else s = ss().insertSheet(name, 0);
  const byId = new Map(doctors.map((d) => [d.id, d.name]));
  const { year, month } = parseKey(key);
  const rows = [[''].concat(positions.map((p) => p.label))];
  const colors = [rows[0].map(() => RED)];
  const pEnd = prev.filter((x) => x.day === 0);
  if (pEnd.length) {
    const pm = prevMonthOf(year, month);
    const ld = new Date(pm.year, pm.month, 0);
    rows.push([`${DAY_ABBR[ld.getDay()]} ${ld.getDate()}. ${pm.month}.`].concat(positions.map((p) => byId.get((pEnd.find((x) => x.posId === p.id) || {}).doctorId) || '')));
    colors.push(rows[1].map(() => RED));
  }
  days.forEach((d, t) => {
    rows.push([d.label].concat(positions.map((p, pi) => byId.get(res.grid[t][pi]) || '')));
    colors.push(rows[0].map(() => (d.weekend || d.holiday ? YELLOW : '#ffffff')));
  });
  const rng = s.getRange(1, 1, rows.length, rows[0].length);
  rng.setNumberFormat('@').setValues(rows).setBackgrounds(colors).setFontFamily('Arial').setFontSize(9)
    .setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
  s.setColumnWidth(1, 70);
  for (let c = 2; c <= rows[0].length; c++) s.setColumnWidth(c, 95);
  s.setFrozenRows(1);
  // přehled vpravo
  const sc = rows[0].length + 2;
  const stats = [['Lékař', 'Služby', 'Cíl', 'Víkendy/svátky', 'Hodiny', `${OUP_LIMIT.label} (max)`]].concat(res.stats.map((x) => [x.name, x.count, x.target, x.weekends, x.hours, x.oupMax ? `${x.oup} (${x.oupMax})` : x.oup]));
  s.getRange(1, sc, stats.length, 6).setValues(stats).setFontSize(9);
  s.getRange(1, sc, 1, 6).setFontWeight('bold').setBackground('#eeeeee');
  if (res.warnings.length) {
    s.getRange(rows.length + 2, 1, res.warnings.length, 1).setValues(res.warnings.map((w) => [w])).setFontColor('#b91c1c');
  }
}

/** Přehled požadavků jako tabulka lékaři × dny (jako dosavadní Excel). */
function prehledPozadavku() {
  const key = targetMonth();
  const { year, month } = parseKey(key);
  const days = buildMonth(year, month);
  const doctors = readDoctors().filter((d) => d.active);
  const reqs = readRequests(key);
  const name = `Požadavky ${key}`;
  let s = sheet(name);
  if (s) s.clear(); else s = ss().insertSheet(name);
  const rows = [['Lékař', `${OUP_LIMIT.label} max`].concat(days.map((d) => d.label))];
  const colors = [rows[0].map((_, i) => (i > 1 && (days[i - 2].weekend || days[i - 2].holiday) ? YELLOW : '#eeeeee'))];
  for (const d of doctors) {
    const r = reqs[d.id];
    const row = [r ? d.name : `${d.name} (nezadal/a)`, r && r.oupMax ? r.oupMax : ''];
    const col = ['#ffffff', '#ffffff'];
    days.forEach((day) => {
      let txt = '', c = day.weekend || day.holiday ? YELLOW : '#ffffff';
      if (r) {
        const w = (r.want || []).find((x) => +x.day === day.day);
        const b = (r.ban || []).find((x) => +x.day === day.day);
        if ((r.off || []).map(Number).includes(day.day)) { txt = 'x'; c = '#fde2e2'; }
        else if (w) { txt = 'chci' + (w.pos ? ' ' + [].concat(w.pos).join('/') : ''); c = '#dcfce7'; }
        else if (b) { txt = 'ne ' + [].concat(b.pos).join('/'); c = '#ffedd5'; }
        const note = (r.notes || {})[day.day];
        if (note) txt += (txt ? ' – ' : '') + note;
      }
      row.push(txt); col.push(c);
    });
    rows.push(row); colors.push(col);
  }
  // součet zvolených OUP vs. kolik OUP služeb měsíc potřebuje
  const positions = readPositions();
  const need = days.reduce((n, d) => n + positions.filter((p) => OUP_LIMIT.positions.includes(p.id) && !(p.workdaysOnly && !d.workday)).length, 0);
  const chosen = doctors.map((d) => (reqs[d.id] || {}).oupMax).filter(Boolean);
  const total = chosen.reduce((a, b) => a + b, 0);
  rows.push([`Součet zvolených ${OUP_LIMIT.label} (${chosen.length} lékařů): ${total} / potřeba ${need}${total < need ? ' – zbytek dostanou lékaři bez volby' : ''}`, ''].concat(days.map(() => '')));
  colors.push(rows[0].map(() => '#ffffff'));
  s.getRange(1, 1, rows.length, rows[0].length).setValues(rows).setBackgrounds(colors).setFontSize(9);
  s.setFrozenRows(1); s.setFrozenColumns(2);
  s.activate();
}

// ---------------------------------------------------------------- rozeslání e-mailem
const sendSetting = () => !/^(ne|no|false|0)$/i.test(String(getSetting(5)).trim());

function rozeslatTed() {
  const key = targetMonth();
  if (!sheet(scheduleSheetName(key))) { info(`Rozpis ${key} ještě není vygenerovaný.`); return; }
  const r = rozeslat(key);
  info(`Rozesláno ${r.sent} lékařům.${r.noEmail.length ? `\nBez e-mailu (doplňte ve sloupci E-mail): ${r.noEmail.join(', ')}` : ''}${r.error ? `\n\nChyba: ${r.error}` : ''}`);
}

// Každé rozeslání se uloží (list „_Rozeslané verze“): měsíc, verze, čas, přesný obsah.
// Díky tomu: všichni dostanou při jednom rozeslání totéž, každá změna dostane nové číslo verze,
// dotčení lékaři dostanou „ZMĚNA ve vašich službách“ a noční kontrola rozešle zapomenuté změny.
const SENT_SHEET = '_Rozeslané verze';

/** Aktuální obsah rozpisu (jen dny daného měsíce), přesně jak je v listu – včetně ručních úprav. */
function scheduleSnapshot(key) {
  const s = sheet(scheduleSheetName(key));
  if (!s) return null;
  const v = s.getDataRange().getDisplayValues();
  const width = v[0].findIndex((x, i) => i > 0 && x === '') > 0 ? v[0].findIndex((x, i) => i > 0 && x === '') : v[0].length;
  const { month } = parseKey(key);
  const rows = v.filter((r) => { const m = String(r[0]).match(/(\d{1,2})\.\s*(\d{1,2})\./); return m && +m[2] === month; })
    .map((r) => r.slice(0, width).map((c) => String(c).trim()));
  return { header: v[0].slice(0, width).map((c) => String(c).trim()), rows };
}
function lastSent(key) {
  const s = sheet(SENT_SHEET);
  if (!s) return null;
  const v = s.getDataRange().getValues();
  for (let i = v.length - 1; i >= 1; i--) {
    if (String(v[i][0]) === key) return { version: Number(v[i][1]), at: String(v[i][2]), json: String(v[i][3]) };
  }
  return null;
}
function recordSent(key, version, json, note) {
  let s = sheet(SENT_SHEET);
  if (!s) { s = ensureSheet(SENT_SHEET, ['Měsíc', 'Verze', 'Rozesláno', 'Obsah (neměnit)', 'Poznámka']); s.hideSheet && s.hideSheet(); }
  const row = s.getLastRow() + 1;
  s.getRange(row, 1, 1, 5).setValues([[key, version, Utilities.formatDate(new Date(), TZ, 'd. M. yyyy HH:mm'), json, note]]);
  s.getRange(row, 1).setNumberFormat('@');
}
/** Rozdíly mezi dvěma verzemi: [{day, pos, from, to}] */
function diffSnapshots(a, b) {
  const out = [];
  const byDay = new Map(a.rows.map((r) => [r[0], r]));
  for (const r of b.rows) {
    const old = byDay.get(r[0]) || [];
    for (let c = 1; c < b.header.length; c++) {
      const from = old[c] || '', to = r[c] || '';
      if (from !== to) out.push({ day: r[0], pos: b.header[c], from, to });
    }
  }
  return out;
}
/** Jména v rozpisu, která neodpovídají žádnému aktivnímu lékaři (překlep při ruční úpravě). */
function unknownNames(snap, doctors) {
  const known = new Set(doctors.map((d) => d.name));
  const bad = new Set();
  snap.rows.forEach((r) => r.slice(1).forEach((c) => { if (c && !known.has(c)) bad.add(c); }));
  return [...bad];
}

function rozeslatTed() {
  const key = targetMonth();
  const cur = todayParts();
  const keys = [monthKey(cur.year, cur.month), key].filter((k) => sheet(scheduleSheetName(k)));
  if (!keys.length) { info('Zatím není žádný rozpis k rozeslání.'); return; }
  const msgs = keys.map((k) => {
    const r = rozeslat(k, { force: true });
    if (r.error) return `${k}: NEROZESLÁNO – ${r.error}`;
    return `${k}: verze ${r.version}${r.changes ? ` (${r.changes} změn)` : ''}, rozesláno ${r.sent} lékařům` +
      (r.noEmail.length ? `\nbez e-mailu: ${r.noEmail.join(', ')}` : '') + (r.mailError ? `\nCHYBA odesílání: ${r.mailError}` : '');
  });
  info(msgs.join('\n\n'));
}

/**
 * Rozešle rozpis všem aktivním lékařům s e-mailem – všem stejnou verzi.
 * opts.force = rozeslat i bez změny (ruční rozeslání); bez force se posílá jen nová verze.
 */
function rozeslat(key, opts) {
  opts = opts || {};
  const snap = scheduleSnapshot(key);
  if (!snap) return { error: 'rozpis neexistuje', sent: 0, noEmail: [] };
  const doctors = readDoctors().filter((x) => x.active);
  const bad = unknownNames(snap, doctors);
  if (bad.length) return { error: `v rozpisu jsou jména, která nejsou v seznamu aktivních lékařů: ${bad.join(', ')}. Opravte je a rozešlete znovu.`, sent: 0, noEmail: [] };
  const json = JSON.stringify(snap);
  const prev = lastSent(key);
  const changed = !prev || prev.json !== json;
  if (!changed && !opts.force) return { unchanged: true, sent: 0, noEmail: [], version: prev.version };
  const version = prev ? prev.version + (changed ? 1 : 0) : 1;
  const changes = prev && changed ? diffSnapshots(JSON.parse(prev.json), snap) : [];
  const { year, month } = parseKey(key);
  const days = buildMonth(year, month);
  const base = String(getSetting(2));
  const when = Utilities.formatDate(new Date(), TZ, 'd. M. yyyy HH:mm');
  const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const out = { sent: 0, noEmail: [], mailError: '', version, changes: changes.length };
  const th = 'border:1px solid #ccc;padding:2px 6px;background:#ea9999';
  const ths = snap.header.map((h) => `<th style="${th}">${esc(h)}</th>`).join('');
  for (const d of doctors) {
    if (!d.email) { out.noEmail.push(d.name); continue; }
    const mine = [];
    const changedCells = new Set(changes.map((c) => `${c.day}|${c.pos}`));
    const trs = snap.rows.map((r) => {
      const dm = String(r[0]).match(/(\d{1,2})\./);
      const day = dm ? days[+dm[1] - 1] : null;
      const bg = day && (day.weekend || day.holiday) ? '#fce8b2' : '#ffffff';
      return `<tr style="background:${bg}">` + r.map((c, i) => {
        const me = i > 0 && c === d.name;
        if (me) mine.push(`${r[0]} – ${snap.header[i]}`);
        const ch = i > 0 && changedCells.has(`${r[0]}|${snap.header[i]}`);
        const st = me ? 'background:#2563eb;color:#fff;font-weight:bold;' : ch ? 'background:#fde68a;' : '';
        return `<td style="border:1px solid #ccc;padding:2px 6px;${st}">${esc(c)}</td>`;
      }).join('') + '</tr>';
    }).join('');
    const myChanges = changes.filter((c) => c.from === d.name || c.to === d.name);
    const fmtChange = (c) => `${c.day} ${c.pos}: ${c.from || '—'} → ${c.to || '—'}`;
    const link = `${base}?t=${d.token}`;
    const title = `${MONTHS[month - 1]} ${year}`;
    const subject = (myChanges.length ? `ZMĚNA ve vašich službách – ${title}` : `Rozpis služeb – ${title}`) + ` (verze ${version})`;
    let html = `<p>Dobrý den,</p><p>rozpis služeb na <b>${title}</b> – <b>verze ${version}</b> (rozesláno ${when}).`
      + (version > 1 ? ' Tato verze nahrazuje všechny předchozí.' : '') + '</p>';
    if (myChanges.length) html += `<p style="background:#fde68a;padding:8px"><b>⚠ Změna ve vašich službách:</b><br>${myChanges.map((c) => esc(fmtChange(c))).join('<br>')}</p>`;
    html += `<p><b>Vaše služby (${mine.length}):</b><br>${mine.map(esc).join('<br>') || 'žádné'}</p>`;
    if (changes.length) html += `<p>Všechny změny oproti verzi ${version - 1} (žlutě v tabulce):<br>${changes.map((c) => esc(fmtChange(c))).join('<br>')}</p>`;
    html += `<p>Platí vždy aktuální rozpis na vaší stránce: <a href="${link}">${esc(link)}</a></p>`
      + `<table style="border-collapse:collapse;font:12px Arial"><tr>${ths}</tr>${trs}</table>`;
    const text = `Rozpis služeb na ${title} – verze ${version} (rozesláno ${when}).\n\n`
      + (myChanges.length ? `ZMĚNA ve vašich službách:\n${myChanges.map(fmtChange).join('\n')}\n\n` : '')
      + `Vaše služby (${mine.length}):\n${mine.join('\n') || 'žádné'}\n\nAktuální rozpis: ${link}`;
    try {
      MailApp.sendEmail({ to: d.email, subject, body: text, htmlBody: html, name: 'Rozpis služeb' });
      out.sent++;
    } catch (e) { out.mailError = String(e.message || e); break; }
  }
  const note = `rozesláno ${out.sent}` + (out.mailError ? `; PŘERUŠENO: ${out.mailError}` : '') + (out.noEmail.length ? `; bez e-mailu ${out.noEmail.length}` : '');
  recordSent(key, version, json, note);
  writeState(key, readState(key).status, `${readState(key).note.replace(/; verze \d+ rozeslána.*$/, '')}; verze ${version} rozeslána ${when} (${out.sent})`);
  return out;
}

/** Noční pojistka: změny v rozpisech po rozeslání se rozešlou automaticky. */
function hlidatZmeny() {
  if (!sendSetting()) return;
  const cur = todayParts();
  const reports = [];
  for (const k of [monthKey(cur.year, cur.month), targetMonth()]) {
    if (!sheet(scheduleSheetName(k)) || !lastSent(k)) continue;
    const r = rozeslat(k, {});
    if (r.unchanged) continue;
    reports.push(r.error ? `${k}: NEROZESLÁNO – ${r.error}` : `${k}: rozeslána verze ${r.version} (${r.changes} změn) ${r.sent} lékařům${r.mailError ? ', CHYBA: ' + r.mailError : ''}`);
  }
  if (reports.length) {
    try { MailApp.sendEmail(adminEmail(), 'Rozpis služeb – změny rozeslány', reports.join('\n') + '\n\n' + ss().getUrl()); } catch (e) { /* nevadí */ }
  }
}

// ---------------------------------------------------------------- webové API
function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

function doGet(e) {
  try { return json(handle(e.parameter || {}, null)); } catch (err) { return json({ error: String(err.message || err) }); }
}
function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    return json(handle(body, body));
  } catch (err) { return json({ error: String(err.message || err) }); }
}

function handle(p, body) {
  const doctors = readDoctors();
  const doc = doctors.find((d) => d.token && d.token === String(p.t || ''));
  if (!doc) return { error: 'Neplatný odkaz. Požádejte o nový odkaz správce rozpisu.' };
  const action = p.action || 'me';
  const key = targetMonth();
  if (action === 'me') {
    const positions = readPositions();
    const dl = deadlineOf(key);
    return {
      doctor: { name: doc.name, positions: doc.positions, active: doc.active },
      positions: positions.map((x) => ({ id: x.id, label: x.label, workdaysOnly: x.workdaysOnly, start: x.start, hours: x.hours })),
      month: key, open: isOpen(key) && doc.active,
      deadline: `${dl.day}. ${dl.month}. ${dl.year}`,
      request: readRequests(key)[doc.id] || null,
      schedules: ss().getSheets().map((s) => s.getName()).filter((n) => /^Rozpis \d{4}-\d{2}$/.test(n)).map((n) => n.slice(7)).sort().reverse(),
    };
  }
  if (action === 'save') {
    if (!body && p.payload) { try { body = JSON.parse(p.payload); } catch (e) { body = null; } }
    if (!body) return { error: 'Chybí data.' };
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (!isOpen(key) || !doc.active) return { error: 'Požadavky na tento měsíc jsou už uzamčené.' };
      if (body.month !== key) return { error: 'Požadavky se zadávají jen na příští měsíc. Obnovte stránku.' };
      writeRequest(key, doc, cleanRequest(body.request || {}, key));
      return { ok: true };
    } finally { lock.releaseLock(); }
  }
  if (action === 'schedule') {
    const m = String(p.month || '');
    const s = sheet(scheduleSheetName(m));
    if (!/^\d{4}-\d{2}$/.test(m) || !s) return { error: 'Rozpis pro tento měsíc zatím není.' };
    const v = s.getDataRange().getDisplayValues();
    const width = v[0].findIndex((x, i) => i > 0 && x === '') > 0 ? v[0].findIndex((x, i) => i > 0 && x === '') : v[0].length;
    const rows = v.filter((r) => /\d{1,2}\.\s*\d{1,2}\./.test(r[0])).map((r) => r.slice(0, width));
    const ls = lastSent(m);
    const snap = scheduleSnapshot(m);
    return { month: m, header: v[0].slice(0, width), rows, me: doc.name,
      version: ls ? ls.version : null, sentAt: ls ? ls.at : null, changedSinceSent: !!ls && ls.json !== JSON.stringify(snap) };
  }
  return { error: 'Neznámá akce.' };
}

function cleanRequest(r, key) {
  const { year, month } = parseKey(key);
  const n = new Date(year, month, 0).getDate();
  const ok = (d) => Number.isInteger(+d) && +d >= 1 && +d <= n;
  const posIds = readPositions().map((x) => x.id);
  const okPos = (a) => (a == null ? null : [].concat(a).filter((x) => posIds.includes(x)));
  return {
    off: [...new Set((r.off || []).filter(ok).map(Number))],
    want: (r.want || []).filter((w) => ok(w.day)).map((w) => ({ day: +w.day, pos: okPos(w.pos) && okPos(w.pos).length ? okPos(w.pos) : null })),
    ban: (r.ban || []).filter((b) => ok(b.day)).map((b) => ({ day: +b.day, pos: okPos(b.pos) || [] })).filter((b) => b.pos.length),
    notes: Object.fromEntries(Object.entries(r.notes || {}).filter(([d, t]) => ok(d) && t).map(([d, t]) => [d, String(t).slice(0, 200)])),
    note: String(r.note || '').slice(0, 500),
    oupMax: Number(r.oupMax) > 0 ? Math.min(31, Math.max(OUP_LIMIT.min, Math.round(Number(r.oupMax)))) : null,
  };
}
