// Napodobené prostředí Google Apps Script (Tabulky, spouštěče, e-mail…) pro testy.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { execSync } from 'node:child_process';

export function createGas() {
  execSync('node tools/build-gas.mjs', { cwd: new URL('../', import.meta.url) });
  const code = readFileSync(new URL('../apps-script/Kod.gs', import.meta.url), 'utf8');

  const clock = { now: new Date('2026-11-06T10:00:00Z') };
  const mails = [];
  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
    _cell(i, j) { const row = (this.sh.data[this.r - 1 + i] ||= []); return row[this.c - 1 + j]; }
    getValues() { return Array.from({ length: this.nr }, (_, i) => Array.from({ length: this.nc }, (_, j) => this._cell(i, j) ?? '')); }
    getDisplayValues() { return this.getValues().map((r) => r.map((x) => String(x))); }
    getValue() { return this.getValues()[0][0]; }
    setValues(v) {
      if (v.length !== this.nr || v.some((r) => r.length !== this.nc)) throw new Error(`setValues rozměr ${v.length}x${v[0]?.length} != ${this.nr}x${this.nc}`);
      v.forEach((row, i) => row.forEach((x, j) => { (this.sh.data[this.r - 1 + i] ||= [])[this.c - 1 + j] = x; })); return this;
    }
    setValue(x) { return this.setValues([[x]]); }
    insertCheckboxes() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) { const row = (this.sh.data[this.r - 1 + i] ||= []); if (row[this.c - 1 + j] === undefined || row[this.c - 1 + j] === '') row[this.c - 1 + j] = false; } return this; }
  }
  for (const m of ['setFontWeight', 'setBackground', 'setBackgrounds', 'setNumberFormat', 'setFontFamily', 'setFontSize', 'setBorder', 'setFontColor']) Range.prototype[m] = function () { return this; };
  class Sheet {
    constructor(name) { this.name = name; this.data = []; }
    getName() { return this.name; }
    getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
    getLastRow() { let n = this.data.length; while (n && !(this.data[n - 1] || []).some((x) => x !== '' && x !== undefined && x !== false)) n--; return n; }
    getDataRange() { const nr = Math.max(1, this.getLastRow()); const nc = Math.max(1, ...this.data.slice(0, nr).map((r) => (r || []).length)); return new Range(this, 1, 1, nr, nc); }
    clear() { this.data = []; } setFrozenRows() {} setFrozenColumns() {} setColumnWidth() {} activate() {}
  }
  const sheets = [new Sheet('List 1')];
  const book = {
    getSheetByName: (n) => sheets.find((s) => s.name === n) || null,
    insertSheet: (n, i) => { const s = new Sheet(n); if (i === 0) sheets.unshift(s); else sheets.push(s); return s; },
    getSheets: () => sheets, deleteSheet: (s) => sheets.splice(sheets.indexOf(s), 1), getUrl: () => 'https://docs.google.com/x',
  };
  const triggers = [];
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => book, getUi: () => ({ alert: (m) => console.log('  [alert]', String(m).split('\n')[0]), ButtonSet: {}, Button: { YES: 1 }, createMenu: () => ({}) }), BorderStyle: { SOLID: 1 } },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate: (d, tz, f) => {
        const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(clock.now);
        const g = (t) => p.find((x) => x.type === t).value;
        return f === 'yyyy-MM-dd' ? `${g('year')}-${g('month')}-${g('day')}` : `${+g('day')}. ${+g('month')}. ${g('year')} ${g('hour')}:${g('minute')}`;
      },
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'admin@x.cz' }) },
    ScriptApp: {
      getProjectTriggers: () => triggers, deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: (fn) => { const b = { timeBased: () => b, everyDays: () => b, atHour: () => b, inTimezone: () => b, create: () => triggers.push({ getHandlerFunction: () => fn }) }; return b; },
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { createTextOutput: (s) => ({ setMimeType() { return this; }, s }), MimeType: { JSON: 1 } },
    MailApp: { sendEmail: (to, subj, body) => mails.push({ to, subj, body }) },
    console,
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const call = (fn, ...a) => vm.runInContext(fn, ctx)(...a);
  const api = (params) => JSON.parse(call('doGet', { parameter: params }).s);
  const post = (body) => JSON.parse(call('doPost', { postData: { contents: JSON.stringify(body) } }).s);
  return { clock, sheets, book, triggers, mails, call, api, post };
}
