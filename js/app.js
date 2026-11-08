import { buildMonth, prevMonthOf, MONTHS } from './calendar.js';
import { readDocx, parseScheduleTable, buildScheduleDocx } from './docx.js';
import { solve, validate, DEFAULT_WEIGHTS } from './solver.js';
import { parseRequestsText, parseRequestsTable, parseRequestsSheet, pickSheet, mergeRequests, findDoctor, norm } from './requests.js';
import { readXlsx } from './xlsx.js';
import { OUP_LIMIT, FIXED_GROUP, POSITION_MIN, DEFAULT_POSITIONS, GROUP_ALIASES, DEFAULT_MIN_REST_HOURS, DEFAULT_AFTER_NIGHT, AFTER_NIGHT_LABELS, shiftTimes } from './config.js';
import { DEFAULT_DOCTORS } from './default-doctors.js';

const STORE_KEY = 'rozpis-sluzieb-v1';
const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k);
  return e;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------------- Stav ----------------
function defaultState() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    version: 1,
    doctors: structuredClone(DEFAULT_DOCTORS),
    positions: structuredClone(DEFAULT_POSITIONS),
    weights: {},
    current: { year: next.getFullYear(), month: next.getMonth() + 1 },
    months: {},
  };
}
let state;
try { state = JSON.parse(localStorage.getItem(STORE_KEY)) || defaultState(); } catch { state = defaultState(); }
// doplnenie nových vlastností do starších uložených dát
for (const p of state.positions) {
  const def = DEFAULT_POSITIONS.find((d) => d.id === p.id);
  if (!p.aliases) p.aliases = [...(def?.aliases || [])];
  if (!p.start || !p.hours) { const t = shiftTimes(p); p.start = def?.start || `${String(Math.floor(t.start / 60)).padStart(2, '0')}:${String(t.start % 60).padStart(2, '0')}`; p.hours = t.hours; }
  delete p.night;
}
if (state.minRestHours == null) state.minRestHours = DEFAULT_MIN_REST_HOURS;
if (!state.afterNight) state.afterNight = DEFAULT_AFTER_NIGHT;
if (state.fixedGroup === undefined) state.fixedGroup = structuredClone(FIXED_GROUP);
if (state.positionMin === undefined) state.positionMin = structuredClone(POSITION_MIN);
delete state.nextDayOff;
// v2: pracovní doba začíná v 7:30 (kromě OUP) – oprava časů uložených dřívější verzí
if ((state.schema || 1) < 2) {
  for (const p of state.positions) {
    const def = DEFAULT_POSITIONS.find((d) => d.id === p.id);
    if (def && p.start === '07:00' && def.start === '07:30') { p.start = '07:30'; if (p.id === 't1' && p.hours === 10.5) p.hours = 10; }
  }
  state.schema = 2;
}
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { console.warn(e); } };

const keyOf = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
function monthData(y = state.current.year, m = state.current.month) {
  const k = keyOf(y, m);
  if (!state.months[k]) state.months[k] = { requests: {}, prev: null, grid: null, locked: {}, extraHolidays: [], seed: 1 };
  return state.months[k];
}
const days = () => buildMonth(state.current.year, state.current.month, monthData().extraHolidays || []);
const activeDoctors = () => state.doctors.filter((d) => d.active);
const docById = (id) => state.doctors.find((d) => d.id === id);

/** Služby z konca minulého mesiaca: z importu alebo z uloženého rozpisu. */
function prevServices() {
  const md = monthData();
  if (md.prev) return md.prev;
  const { year, month } = prevMonthOf(state.current.year, state.current.month);
  const pm = state.months[keyOf(year, month)];
  if (!pm || !pm.grid) return [];
  const n = pm.grid.length, out = [];
  for (let t = Math.max(0, n - 2); t < n; t++) {
    pm.grid[t].forEach((id, p) => { if (id && state.positions[p]) out.push({ doctorId: id, day: t + 1 - n, posId: state.positions[p].id }); });
  }
  return out;
}

// ---------------- Správy ----------------
function message(target, kind, html) {
  $(target).innerHTML = `<div class="msg ${kind}">${html}</div>`;
}
const list = (items) => `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;

// ---------------- Mesiac ----------------
function renderMonth() {
  $('#monthLabel').textContent = `${MONTHS[state.current.month - 1]} ${state.current.year}`;
  $('#extraHol').value = (monthData().extraHolidays || []).join(', ');
  renderAll();
}
function shiftMonth(delta) {
  let { year, month } = state.current;
  month += delta;
  if (month < 1) { month = 12; year--; }
  if (month > 12) { month = 1; year++; }
  state.current = { year, month };
  save(); renderMonth();
}
$('#prevMonth').onclick = () => shiftMonth(-1);
$('#nextMonth').onclick = () => shiftMonth(1);

// ---------------- Karty ----------------
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${b.dataset.tab}`));
  renderAll();
}));

function renderAll() {
  renderRequests();
  renderSchedule();
  renderDoctors();
  renderSettings();
}

// ---------------- Požiadavky ----------------
function renderRequests() {
  const md = monthData();
  const ds = days();
  const tbl = $('#reqTable');
  const head = el('tr', {}, el('th', { class: 'name' }, 'Lékař'),
    ds.map((d) => el('th', { class: d.weekend || d.holiday ? 'we' : '', title: d.holiday ? 'svátek' : '' }, `${d.day}`, el('br'), d.label.split(' ')[0])),
    el('th', {}, '✗'), el('th', {}, '✓'), el('th', { title: `Kolik ${OUP_LIMIT.label} služeb si lékař zvolil (nejvýš; minimum ${OUP_LIMIT.min})` }, `${OUP_LIMIT.label} max`));
  const body = activeDoctors().map((doc) => {
    const req = md.requests[doc.id] || { off: [], want: [] };
    const offSet = new Set(req.off.map(Number));
    const wantMap = new Map(req.want.map((w) => [+w.day, w]));
    const banMap = new Map((req.ban || []).map((b) => [+b.day, [].concat(b.pos)]));
    const notes = req.notes || {};
    return el('tr', {}, el('td', { class: 'name', title: req.note || '' }, doc.name + (req.note ? ' 📝' : '')),
      ds.map((d) => {
        const w = wantMap.get(d.day);
        const b = banMap.get(d.day);
        const cls = offSet.has(d.day) ? 'off' : w ? 'want' : b ? 'ban' : '';
        const txt = offSet.has(d.day) ? '✗' : w ? (w.pos ? [].concat(w.pos).map(posShort).join('/') : '✓') : b ? '¬' + banLabel(b) : '';
        const tip = [notes[d.day] ? `„${notes[d.day]}"` : '', b ? `ne na: ${b.map(posShort).join(', ')}` : ''].filter(Boolean).join(' – ');
        return el('td', {
          class: `c ${cls} ${d.weekend || d.holiday ? 'we' : ''} ${notes[d.day] ? 'note' : ''}`,
          title: tip || null,
          onclick: () => cycleReq(doc.id, d.day),
          oncontextmenu: (e) => { e.preventDefault(); posMenu(e, doc, d.day); },
        }, txt);
      }),
      el('td', { class: 'cnt' }, String(offSet.size)), el('td', { class: 'cnt' }, String(wantMap.size)),
      el('td', { class: 'cnt' }, doc.positions.some((id) => OUP_LIMIT.positions.includes(id))
        ? el('input', { type: 'number', min: OUP_LIMIT.min, max: 31, value: req.oupMax || '', style: 'width:52px', onchange: (e) => setOupMax(doc.id, e.target.value) }) : ''));
  });
  tbl.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
  // součet zvolených OUP vs. potřeba
  const need = ds.reduce((n, d) => n + state.positions.filter((p) => OUP_LIMIT.positions.includes(p.id) && !(p.workdaysOnly && !d.workday)).length, 0);
  const chosen = activeDoctors().map((d) => md.requests[d.id]?.oupMax).filter(Boolean);
  const total = chosen.reduce((a, b) => a + b, 0);
  $('#oupInfo').textContent = chosen.length
    ? `${OUP_LIMIT.label}: ${chosen.length} lékařů si zvolilo dohromady nejvýš ${total} služeb, měsíc potřebuje ${need}.${total < need ? ' Zbytek dostanou lékaři bez volby.' : ''}`
    : '';
  const prev = prevServices();
  $('#prevInfo').textContent = prev.length
    ? `Konec minulého měsíce (kvůli odpočinku po službě): ${prev.filter((p) => p.day === 0).map((p) => docById(p.doctorId)?.name || p.doctorId).join(', ')}`
    : 'Rozpis minulého měsíce není načtený – pravidlo odpočinku po službě se na 1. den měsíce neuplatní.';
}
const posShort = (id) => id;
function banLabel(ids) {
  for (const [g, members] of Object.entries(GROUP_ALIASES)) if (members.length === ids.length && members.every((m) => ids.includes(m))) return g;
  if (ids.length > state.positions.length / 2) return '';
  return ids.map(posShort).join('/');
}

function setOupMax(docId, v) {
  const md = monthData();
  const req = md.requests[docId] || (md.requests[docId] = { off: [], want: [], note: '' });
  if (v === '' || !(+v > 0)) delete req.oupMax; else req.oupMax = Math.min(31, Math.max(OUP_LIMIT.min, Math.round(+v)));
  save(); renderRequests();
}

function cycleReq(docId, day) {
  const md = monthData();
  const req = md.requests[docId] || (md.requests[docId] = { off: [], want: [], note: '' });
  const isOff = req.off.map(Number).includes(day);
  const isWant = req.want.some((w) => +w.day === day);
  req.off = req.off.filter((d) => +d !== day);
  req.want = req.want.filter((w) => +w.day !== day);
  req.ban = (req.ban || []).filter((b) => +b.day !== day);
  if (!isOff && !isWant) req.off.push(day);
  else if (isOff) req.want.push({ day, pos: null });
  save(); renderRequests();
}

function posMenu(e, doc, day) {
  const menu = $('#posMenu');
  const setWant = (pos) => {
    const md = monthData();
    const req = md.requests[doc.id] || (md.requests[doc.id] = { off: [], want: [], note: '' });
    req.off = req.off.filter((d) => +d !== day);
    req.want = req.want.filter((w) => +w.day !== day);
    req.ban = (req.ban || []).filter((b) => +b.day !== day);
    if (pos !== undefined) req.want.push({ day, pos: pos ? [pos] : null });
    menu.classList.add('hidden'); save(); renderRequests();
  };
  menu.replaceChildren(
    el('div', { class: 'muted', style: 'padding:4px 10px' }, `${doc.name}, ${day}. – chce sloužit:`),
    el('button', { onclick: () => setWant(null) }, 'kdekoli'),
    ...state.positions.filter((p) => doc.positions.includes(p.id)).map((p) => el('button', { onclick: () => setWant(p.id) }, p.label)),
    el('button', { onclick: () => setWant(undefined) }, '— zrušit —'),
  );
  menu.style.left = `${Math.min(e.clientX, innerWidth - 200)}px`;
  menu.style.top = `${Math.min(e.clientY, innerHeight - 300)}px`;
  menu.classList.remove('hidden');
}
document.addEventListener('click', (e) => { if (!$('#posMenu').contains(e.target)) $('#posMenu').classList.add('hidden'); });

function applyParsed(parsed, source) {
  const md = monthData();
  md.requests = mergeRequests(md.requests, parsed.requests);
  save(); renderRequests();
  const names = Object.keys(parsed.requests).map((id) => docById(id)?.name).filter(Boolean);
  let html = `<b>${esc(source)}:</b> načteny požadavky ${names.length} lékařů (${esc(names.join(', '))}).`;
  if (parsed.sheet) html += `<br>List: <b>${esc(parsed.sheet)}</b>.`;
  if (parsed.shift) html += ' Data v tabulce jsou posunutá o sloupec oproti záhlaví s daty – zarovnal jsem je podle obsahu, zkontrolujte prosím několik lékařů.';
  if (parsed.inactive?.length) html += `<br>Přeskočení neaktivní lékaři: ${esc(parsed.inactive.join(', '))}.`;
  if (parsed.unknown.length) html += `<br>Tyto řádky jsem nepřiřadil žádnému lékaři – zkontrolujte je nebo lékaře přidejte na kartě Lékaři:${list(parsed.unknown.slice(0, 30))}`;
  if (parsed.unclear?.length) html += `<br>Buňky, kterým nerozumím (nebyly započítány, doplňte ručně):${list(parsed.unclear)}`;
  const missing = activeDoctors().filter((d) => !parsed.requests[d.id]).map((d) => d.name);
  if (parsed.sheet && missing.length) html += `<br>Aktivní lékaři, kteří v tabulce chybí: ${esc(missing.join(', '))}.`;
  message('#reqMessages', parsed.unknown.length || parsed.unclear?.length ? 'warn' : 'ok', html);
}

$('#reqPasteBtn').onclick = () => $('#pasteBox').classList.toggle('hidden');
$('#pasteApply').onclick = () => {
  const parsed = parseRequestsText($('#pasteText').value, activeDoctors(), state.positions, days().length);
  applyParsed(parsed, 'Vložený text');
  $('#pasteBox').classList.add('hidden');
};
$('#reqFile').onchange = async (e) => {
  for (const f of e.target.files) {
    try {
      const n = days().length;
      let parsed;
      if (/\.xlsx$/i.test(f.name)) {
        const sheets = await readXlsx(await f.arrayBuffer());
        const sh = pickSheet(sheets, state.current.month);
        if (!sh) throw new Error(`V souboru není list s dny měsíce ${MONTHS[state.current.month - 1]} (listy: ${sheets.map((x) => x.name).join(', ')}). Nahoře zvolte správný měsíc.`);
        parsed = parseRequestsSheet(sh.rows, state.doctors, state.positions, state.current.month, GROUP_ALIASES);
        if (!parsed) throw new Error('V listu jsem nenašel řádek s daty.');
        parsed.sheet = sh.name;
        // tabuľka obsahuje všetkých lekárov -> nahradí predchádzajúce požiadavky
        monthData().requests = {};
      } else if (/\.docx$/i.test(f.name)) {
        const doc = await readDocx(await f.arrayBuffer());
        parsed = null;
        for (const t of doc.tables) { const p = parseRequestsTable(t, activeDoctors(), state.positions, n); if (p && Object.keys(p.requests).length) { parsed = p; break; } }
        if (!parsed) parsed = parseRequestsText(doc.text, activeDoctors(), state.positions, n);
      } else {
        const text = await f.text();
        const rows = text.split(/\r?\n/).map((l) => l.split(/[;\t]/));
        parsed = parseRequestsTable(rows, activeDoctors(), state.positions, n);
        if (!parsed || !Object.keys(parsed.requests).length) parsed = parseRequestsText(text, activeDoctors(), state.positions, n);
      }
      applyParsed(parsed, f.name);
    } catch (err) { message('#reqMessages', 'err', `Soubor ${esc(f.name)} se nepodařilo načíst: ${esc(err.message)}`); }
  }
  e.target.value = '';
};
$('#reqClear').onclick = () => {
  if (!confirm('Opravdu smazat všechny požadavky pro tento měsíc?')) return;
  monthData().requests = {}; save(); renderRequests();
};
$('#prevFile').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  try {
    const doc = await readDocx(await f.arrayBuffer());
    const sch = parseScheduleTable(doc.tables);
    if (!sch) throw new Error('V dokumentu jsem nenašel tabulku rozpisu.');
    const pm = prevMonthOf(state.current.year, state.current.month);
    const rows = sch.rows.filter((r) => r.month === pm.month);
    if (!rows.length) throw new Error(`V dokumentu nejsou dny z měsíce ${pm.month}.`);
    const last = new Date(pm.year, pm.month, 0).getDate();
    const colPos = sch.header.slice(1).map((h) => state.positions.find((p) => norm(p.label) === norm(h))?.id);
    const prev = [], unknown = new Set();
    for (const r of rows.filter((x) => x.day >= last - 1)) {
      r.cells.forEach((name, i) => {
        if (!name || !colPos[i]) return;
        const d = findDoctor(name, state.doctors);
        if (d) prev.push({ doctorId: d.id, day: r.day - last, posId: colPos[i] }); else unknown.add(name);
      });
    }
    monthData().prev = prev; save(); renderRequests();
    message('#reqMessages', 'ok', `Načten konec minulého měsíce (${last - 1}. a ${last}. ${pm.month}.).${unknown.size ? ' Neznámí lékaři: ' + esc([...unknown].join(', ')) : ''}`);
  } catch (err) { message('#reqMessages', 'err', esc(err.message)); }
};

// ---------------- Rozpis ----------------
let highlightDoc = null;
function solverInput() {
  const md = monthData();
  return {
    days: days(), positions: state.positions, doctors: activeDoctors(),
    requests: md.requests, prev: prevServices(), locked: md.locked,
    weights: state.weights, seed: md.seed, minRestHours: state.minRestHours, afterNight: state.afterNight, fixedGroup: state.fixedGroup, positionMin: state.positionMin,
  };
}

function generate(newSeed) {
  const md = monthData();
  if (newSeed) md.seed = (md.seed || 1) + 1;
  $('#genStatus').textContent = 'Počítám…';
  setTimeout(() => {
    const t0 = performance.now();
    const res = solve(solverInput());
    md.grid = res.grid;
    md.lastWarnings = res.warnings;
    save();
    $('#genStatus').textContent = `Hotovo za ${((performance.now() - t0) / 1000).toFixed(1)} s (varianta ${md.seed}).`;
    renderSchedule();
  }, 30);
}
$('#genBtn').onclick = () => generate(false);
$('#genNewBtn').onclick = () => generate(true);
$('#unlockBtn').onclick = () => { monthData().locked = {}; save(); renderSchedule(); };

function renderSchedule() {
  const md = monthData();
  const ds = days();
  const P = state.positions;
  const tbl = $('#schedTable');
  const head = el('tr', {}, el('th', {}, ''), P.map((p) => el('th', {}, p.label)));
  const rows = [];
  const prev = prevServices().filter((x) => x.day === 0);
  if (prev.length) {
    const pm = prevMonthOf(state.current.year, state.current.month);
    rows.push(el('tr', {}, el('td', { class: 'prev' }, `${new Date(pm.year, pm.month, 0).getDate()}. ${pm.month}.`),
      P.map((p) => el('td', { class: 'prev' }, docById(prev.find((x) => x.posId === p.id)?.doctorId)?.name || ''))));
  }
  if (!md.grid || md.grid.length !== ds.length) {
    tbl.replaceChildren(el('thead', {}, head), el('tbody', {}, rows));
    $('#statsTable').replaceChildren();
    message('#schedMessages', 'warn', 'Rozpis ještě není vygenerovaný. Zkontrolujte požadavky a klikněte na <b>Vygenerovat rozpis</b>.');
    return;
  }
  const input = solverInput();
  const allIssues = validate(input, md.grid);
  const issues = allIssues.filter((i) => i.level !== 'warn');
  const exceptions = allIssues.filter((i) => i.level === 'warn' && i.kind === 'afterNight');
  const softWarn = allIssues.filter((i) => i.level === 'warn' && i.kind !== 'afterNight');
  const badCells = new Map();
  for (const i of issues) if (i.day) badCells.set(`${i.day}|${i.pos}`, i.msg);
  const excCells = new Map(exceptions.filter((i) => i.day).map((i) => [`${i.day}|${i.pos}`, i.msg]));
  const wishSet = new Set();
  for (const [id, r] of Object.entries(md.requests)) for (const w of r.want || []) wishSet.add(`${w.day}|${id}`);
  const docs = activeDoctors();

  ds.forEach((d, t) => {
    rows.push(el('tr', {}, el('td', { class: `day ${d.weekend || d.holiday ? 'we' : ''}` }, d.label),
      P.map((p, pi) => {
        const active = !(p.workdaysOnly && !d.workday);
        if (!active) return el('td', { class: `na ${d.weekend || d.holiday ? 'we' : ''}` });
        const cur = md.grid[t][pi];
        const key = `${d.day}|${p.id}`;
        const offIds = new Set(Object.entries(md.requests).filter(([, r]) => (r.off || []).map(Number).includes(d.day)
          || (r.ban || []).some((b) => +b.day === d.day && [].concat(b.pos).includes(p.id))).map(([id]) => id));
        const sel = el('select', { onchange: (e) => setCell(t, pi, e.target.value), title: badCells.get(key) || excCells.get(key) || '' },
          el('option', { value: '' }, ''),
          docs.filter((x) => x.positions.includes(p.id) || x.id === cur)
            .map((x) => el('option', { value: x.id, selected: x.id === cur }, x.name + (offIds.has(x.id) ? ' ✗' : ''))));
        const cls = [d.weekend || d.holiday ? 'we' : '', md.locked[key] ? 'locked' : '', cur && wishSet.has(`${d.day}|${cur}`) ? 'wish' : '',
          badCells.has(key) ? 'bad' : excCells.has(key) ? 'exc' : '', !cur ? 'empty' : '', highlightDoc && cur === highlightDoc ? 'hl' : ''].join(' ');
        return el('td', { class: cls }, sel);
      })));
  });
  tbl.replaceChildren(el('thead', {}, head), el('tbody', {}, rows));

  // Správy
  const empty = [];
  ds.forEach((d, t) => P.forEach((p, pi) => { if (!(p.workdaysOnly && !d.workday) && !md.grid[t][pi]) empty.push(`${d.label} – ${p.label}`); }));
  const unmet = [];
  for (const [id, r] of Object.entries(md.requests)) for (const w of r.want || []) {
    const row = md.grid[w.day - 1];
    if (!row) continue;
    const pi = row.indexOf(id);
    const wp = w.pos == null ? null : [].concat(w.pos);
    if (pi < 0 || (wp && !wp.includes(P[pi].id))) unmet.push(`${docById(id)?.name || id} chtěl(a) ${w.day}.${wp ? ' (' + wp.map(posShort).join('/') + ')' : ''}`);
  }
  let html = '';
  if (!empty.length && !issues.length && !unmet.length && !exceptions.length && !softWarn.length) html = '<div class="msg ok">✔ Všechny služby jsou obsazené, pravidla i přání lékařů jsou dodržena.</div>';
  if (empty.length) html += `<div class="msg err"><b>Neobsazené služby (${empty.length})</b> – nikdo volný nesplňuje pravidla, doplňte ručně:${list(empty)}</div>`;
  if (softWarn.length) html += `<div class="msg warn"><b>Upozornění (${softWarn.length})</b>:${list(softWarn.map((i) => (i.day ? i.day + '. ' : '') + i.msg))}</div>`;
  if (exceptions.length) html += `<div class="msg warn"><b>Výjimky – služba den po noční/24h službě (${exceptions.length})</b>, jinak by zůstala neobsazená. Zkontrolujte, zda je to přijatelné:${list(exceptions.map((i) => i.day + '. ' + i.msg))}</div>`;
  if (issues.length) html += `<div class="msg err"><b>Porušení pravidel (${issues.length})</b> – po ruční úpravě:${list(issues.map((i) => (i.day ? i.day + '. ' : '') + i.msg))}</div>`;
  if (unmet.length) html += `<div class="msg warn"><b>Nesplněná přání (${unmet.length})</b>:${list(unmet)}</div>`;
  html += '<p class="muted">Buňku změníte výběrem lékaře – změna se zamkne (modrá) a při dalším generování zůstane. Zelená = přání lékaře. ✗ u jména = lékař si den vyškrtl nebo tu pozici nechce.</p>';
  $('#schedMessages').innerHTML = html;

  renderStats(md, ds);
}

function setCell(t, pi, id) {
  const md = monthData();
  const key = `${t + 1}|${state.positions[pi].id}`;
  md.grid[t][pi] = id || null;
  if (id) md.locked[key] = id; else delete md.locked[key];
  save(); renderSchedule();
}

function renderStats(md, ds) {
  const P = state.positions;
  const rows = activeDoctors().map((doc) => {
    let n = 0, we = 0, hours = 0;
    md.grid.forEach((row, t) => row.forEach((id, pi) => {
      if (id !== doc.id) return;
      n++; if (ds[t].weekend || ds[t].holiday) we++; hours += shiftTimes(P[pi]).hours;
    }));
    const req = md.requests[doc.id] || { off: [], want: [] };
    let oup = 0; md.grid.forEach((row) => row.forEach((id, pi) => { if (id === doc.id && OUP_LIMIT.positions.includes(P[pi].id)) oup++; }));
    const tgt = fixedFor(doc) ?? (+doc.target || 0);
    return { doc, n, we, hours, oup, oupMax: req.oupMax, off: req.off.length, tgt, diff: n - tgt };
  });
  const tbl = $('#statsTable');
  tbl.replaceChildren(
    el('thead', {}, el('tr', {}, ['Lékař', 'Služby', 'Cíl', 'Víkend/sv.', 'Hodiny', `${OUP_LIMIT.label} (max)`, 'Vyškrtl'].map((h) => el('th', {}, h)))),
    el('tbody', {}, rows.map((r) => el('tr', {
      class: highlightDoc === r.doc.id ? 'sel' : '',
      title: 'Kliknutím zvýrazníte služby lékaře v rozpisu',
      onclick: () => { highlightDoc = highlightDoc === r.doc.id ? null : r.doc.id; renderSchedule(); },
    },
    el('td', {}, r.doc.name),
    el('td', { class: `num ${r.diff > 0 ? 'diff-pos' : r.diff < 0 ? 'diff-neg' : ''}` }, String(r.n)),
    el('td', { class: 'num' }, String(r.tgt)),
    el('td', { class: 'num' }, String(r.we)),
    el('td', { class: 'num' }, String(Math.round(r.hours * 10) / 10)),
    el('td', { class: 'num' }, r.oupMax ? `${r.oup} (${r.oupMax})` : String(r.oup)),
    el('td', { class: 'num' }, String(r.off))))),
  );
}

$('#exportDocx').onclick = () => {
  const md = monthData();
  if (!md.grid) { alert('Nejprve vygenerujte rozpis.'); return; }
  const ds = days();
  const P = state.positions;
  const name = (id) => docById(id)?.name || '';
  const rows = [];
  const prev = prevServices().filter((x) => x.day === 0);
  if (prev.length) {
    const pm = prevMonthOf(state.current.year, state.current.month);
    const lastDate = new Date(pm.year, pm.month, 0);
    const label = `${['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'][lastDate.getDay()]} ${lastDate.getDate()}. ${pm.month}.`;
    rows.push({ label, cells: P.map((p) => name(prev.find((x) => x.posId === p.id)?.doctorId)), fill: 'EA9999' });
  }
  ds.forEach((d, t) => rows.push({ label: d.label, cells: P.map((_, pi) => name(md.grid[t][pi])), fill: d.weekend || d.holiday ? 'FCE8B2' : null }));
  const blob = buildScheduleDocx(['', ...P.map((p) => p.label)], rows);
  const a = el('a', { href: URL.createObjectURL(blob), download: `SLUŽBY LÉKAŘ – ${MONTHS[state.current.month - 1].toUpperCase()} ${state.current.year}.docx` });
  document.body.append(a); a.click(); a.remove();
};
$('#printBtn').onclick = () => window.print();

function pmInfo() {
  const pm = state.positionMin;
  if (!pm || !(pm.min > 0)) { $('#pmWho').textContent = 'Pravidlo je vypnuté.'; return; }
  const who = activeDoctors().filter((d) => d.positions.includes(pm.position) && !(pm.except || []).some((x) => d.positions.includes(x)));
  $('#pmWho').textContent = `Týká se ${who.length} lékařů: ${who.map((d) => d.name).join(', ')}`;
}

// ---------------- Lekári ----------------
/** Lékař jen na JIP → pevný počet služeb z Nastavení, jinak null. */
function fixedFor(doc) {
  const fg = state.fixedGroup;
  if (!fg || !(fg.count > 0) || !doc.positions.length) return null;
  return doc.positions.every((id) => (fg.positions || []).includes(id)) ? fg.count : null;
}
function renderDoctors() {
  const P = state.positions;
  const tbl = $('#docTable');
  const sorted = [...state.doctors].sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name, 'cs'));
  const head = el('tr', {}, el('th', {}, 'Jméno'), el('th', {}, 'Aktivní'), P.map((p) => el('th', {}, p.label)),
    el('th', {}, 'Cíl'), el('th', {}, 'Max'), el('th', {}, 'Poznámka'), el('th', {}, ''));
  const counts = P.map((p) => activeDoctors().filter((d) => d.positions.includes(p.id)).length);
  const sumTarget = activeDoctors().reduce((s, d) => s + (fixedFor(d) ?? (+d.target || 0)), 0);
  const slotsCount = days().reduce((s, d) => s + P.filter((p) => !(p.workdaysOnly && !d.workday)).length, 0);
  const foot = el('tr', {}, el('td', {}, el('b', {}, 'Celkem aktivních')), el('td', {}, String(activeDoctors().length)),
    counts.map((c) => el('td', {}, String(c))),
    el('td', { title: `Služeb v měsíci: ${slotsCount}` }, el('b', { style: sumTarget < slotsCount ? 'color:#dc2626' : '' }, `${sumTarget}/${slotsCount}`)), el('td'), el('td'), el('td'));
  const upd = (doc, fn) => (e) => { fn(e); save(); };
  const body = sorted.map((doc) => el('tr', { class: doc.active ? '' : 'inactive' },
    el('td', { class: 'name' }, el('input', { value: doc.name, onchange: upd(doc, (e) => { doc.name = e.target.value.trim(); }) })),
    el('td', {}, el('input', { type: 'checkbox', checked: doc.active, onchange: upd(doc, (e) => { doc.active = e.target.checked; renderDoctors(); }) })),
    P.map((p) => el('td', {}, el('input', {
      type: 'checkbox', checked: doc.positions.includes(p.id),
      onchange: upd(doc, (e) => { doc.positions = e.target.checked ? [...doc.positions, p.id] : doc.positions.filter((x) => x !== p.id); }),
    }))),
    el('td', {}, fixedFor(doc) != null
      ? el('span', { title: `Slouží jen na ${(state.fixedGroup.positions || []).join(', ')} → pravidlo z Nastavení` }, `${fixedFor(doc)} (${state.fixedGroup.label || 'JIP'})`)
      : el('input', { type: 'number', min: 0, value: doc.target ?? '', onchange: upd(doc, (e) => { doc.target = e.target.value === '' ? 0 : +e.target.value; renderDoctors(); }) })),
    el('td', {}, el('input', { type: 'number', min: 0, value: doc.max ?? '', onchange: upd(doc, (e) => { doc.max = e.target.value === '' ? null : +e.target.value; }) })),
    el('td', {}, el('input', { class: 'note', value: doc.note || '', onchange: upd(doc, (e) => { doc.note = e.target.value; }) })),
    el('td', {}, el('button', { class: 'danger', title: 'Odstranit lékaře', onclick: () => {
      if (!confirm(`Odstranit lékaře ${doc.name}? (Pokud má jen přestávku, raději odškrtněte „Aktivní".)`)) return;
      state.doctors = state.doctors.filter((d) => d !== doc); save(); renderDoctors();
    } }, '🗑'))));
  tbl.replaceChildren(el('thead', {}, head), el('tbody', {}, body), el('tfoot', {}, foot));
}

$('#addDoc').onclick = () => {
  const name = $('#newDocName').value.trim();
  if (!name) return;
  if (state.doctors.some((d) => norm(d.name) === norm(name))) { alert('Lékař s tímto jménem už existuje.'); return; }
  let id = norm(name).replace(/[^a-z0-9]+/g, '-');
  while (state.doctors.some((d) => d.id === id)) id += '-2';
  state.doctors.push({ id, name, active: true, positions: [], target: 4, max: null, note: '' });
  $('#newDocName').value = '';
  save(); renderDoctors();
  alert(`Lékař ${name} přidán. Nezapomeňte zaškrtnout pozice, na kterých může sloužit.`);
};
$('#newDocName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#addDoc').click(); });

// Seznam lékařů ze souboru (sloupce podle záhlaví: ID, Jméno, Aktivní, Pozice, Cíl, Max)
$('#importDocs').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  try {
    let rows;
    if (/\.xlsx$/i.test(f.name)) {
      const sheets = await readXlsx(await f.arrayBuffer());
      const sh = sheets.find((x) => /l[eé]ka|doctor/i.test(x.name)) || sheets[0];
      rows = sh.rows;
    } else {
      const text = (await f.text()).replace(/^\uFEFF/, '');
      const sep = (text.split('\n')[0].match(/;/g) || []).length >= 2 ? ';' : (text.includes('\t') ? '\t' : ',');
      rows = text.split(/\r?\n/).map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, '').trim()));
    }
    const hi = rows.findIndex((r) => r && r.some((c) => /^(jm[eé]no|meno|name)$/i.test(norm(c))));
    if (hi < 0) throw new Error('V souboru chybí sloupec „Jméno".');
    const h = rows[hi].map((c) => norm(c));
    const col = (re) => h.findIndex((c) => re.test(c));
    const cId = col(/^id$/), cName = col(/^(jmeno|meno|name)$/), cAct = col(/^aktiv/), cPos = col(/^pozic/), cTgt = col(/^cil/), cMax = col(/^max/);
    const yes = (v) => /^(true|ano|áno|1|x|yes|pravda)$/i.test(String(v).trim());
    let updated = 0, added = 0;
    for (const r of rows.slice(hi + 1)) {
      if (!r) continue;
      const name = String(r[cName] || '').trim();
      if (!name) continue;
      const id = cId >= 0 ? String(r[cId] || '').trim() : '';
      let doc = (id && state.doctors.find((d) => d.id === id)) || state.doctors.find((d) => norm(d.name) === norm(name));
      if (!doc) {
        let nid = id || norm(name).replace(/[^a-z0-9]+/g, '-');
        while (state.doctors.some((d) => d.id === nid)) nid += '-2';
        doc = { id: nid, name, active: true, positions: [], target: 4, max: null, note: '' };
        state.doctors.push(doc); added++;
      } else updated++;
      doc.name = name;
      if (cAct >= 0 && String(r[cAct]).trim() !== '') doc.active = yes(r[cAct]);
      if (cPos >= 0 && String(r[cPos]).trim() !== '') doc.positions = String(r[cPos]).split(/[,\s]+/).map((x) => x.trim()).filter((x) => state.positions.some((p) => p.id === x));
      if (cTgt >= 0 && String(r[cTgt]).trim() !== '') doc.target = +String(r[cTgt]).replace(',', '.') || 0;
      if (cMax >= 0) doc.max = String(r[cMax] ?? '').trim() === '' ? null : +r[cMax];
    }
    save(); renderAll();
    message('#docMessages', 'ok', `Seznam načten: ${updated} lékařů aktualizováno, ${added} přidáno.`);
  } catch (err) { message('#docMessages', 'err', esc(err.message)); }
};
$('#exportDocs').onclick = () => {
  const q = (v) => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lines = [['ID', 'Jméno', 'Aktivní', 'Pozice', 'Cíl', 'Max'].join(';')]
    .concat(state.doctors.map((d) => [d.id, d.name, d.active ? 'ANO' : 'NE', d.positions.join(', '), d.target ?? '', d.max ?? ''].map(q).join(';')));
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'lekari-SOUKROME.csv' });
  document.body.append(a); a.click(); a.remove();
};

$('#exportData').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `rozpis-sluzeb-zaloha-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
};
$('#importData').onchange = async (e) => {
  try {
    const data = JSON.parse(await e.target.files[0].text());
    if (!Array.isArray(data.doctors) || !Array.isArray(data.positions)) throw new Error('Neplatný soubor zálohy.');
    if (!confirm('Přepsat aktuální data zálohou?')) return;
    state = data; save(); renderMonth();
  } catch (err) { alert(err.message); }
  e.target.value = '';
};

// ---------------- Nastavenia ----------------
/** Pravidla (odpočinek, minimum na pozici, JIP, den po noční) – vždy z aktuálního stavu. */
function renderRuleSettings() {
  $('#minRest').value = state.minRestHours;
  const pmS = state.positionMin || { ...POSITION_MIN, min: 0 };
  const posOpts = (sel) => state.positions.map((p) => el('option', { value: p.id, selected: p.id === sel }, p.label));
  $('#pmPos').replaceChildren(...posOpts(pmS.position));
  $('#pmMin').value = pmS.min || '';
  $('#pmExcept').replaceChildren(el('option', { value: '' }, '— nikdo —'), ...posOpts((pmS.except || [])[0]));
  const pmSet = () => { state.positionMin = { position: $('#pmPos').value, min: +$('#pmMin').value || 0, except: $('#pmExcept').value ? [$('#pmExcept').value] : [] }; save(); pmInfo(); };
  $('#pmPos').onchange = pmSet; $('#pmMin').onchange = pmSet; $('#pmExcept').onchange = pmSet;
  pmInfo();
  const fgr = state.fixedGroup || { ...FIXED_GROUP, count: null };
  $('#fixedCount').value = fgr.count ?? '';
  $('#fixedPos').replaceChildren(...state.positions.map((p) => el('label', { style: 'margin-right:10px' },
    el('input', { type: 'checkbox', checked: (fgr.positions || []).includes(p.id), onchange: (e) => {
      const ps = new Set(fgr.positions || []);
      if (e.target.checked) ps.add(p.id); else ps.delete(p.id);
      state.fixedGroup = { ...fgr, positions: [...ps] }; save(); renderSettings(); renderDoctors();
    } }), ' ', p.label)));
  $('#afterNight').replaceChildren(...Object.entries(AFTER_NIGHT_LABELS).map(([k, v]) => el('option', { value: k, selected: k === state.afterNight }, v)));
}

function endLabel(p) {
  const t = shiftTimes(p);
  const e = t.end % 1440;
  return `${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}${t.end > 1440 ? ' (další den)' : ''}`;
}
function renderSettings() {
  renderRuleSettings();
  const tbl = $('#posTable');
  tbl.replaceChildren(
    el('tr', {}, ['Název sloupce', 'Zkratka (id)', 'Jak to lékaři píšou v požadavcích', 'Začátek', 'Délka (h)', 'Konec', 'Jen pracovní dny', ''].map((h) => el('th', {}, h))),
    ...state.positions.map((p, i) => el('tr', {},
      el('td', {}, el('input', { value: p.label, onchange: (e) => { p.label = e.target.value; save(); } })),
      el('td', {}, p.id),
      el('td', {}, el('input', { value: (p.aliases || []).join(', '), style: 'width:220px', onchange: (e) => { p.aliases = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); save(); } })),
      el('td', {}, el('input', { type: 'time', value: p.start, onchange: (e) => { p.start = e.target.value; save(); renderSettings(); } })),
      el('td', {}, el('input', { type: 'number', min: 1, max: 36, step: 0.5, value: p.hours, style: 'width:64px', onchange: (e) => { p.hours = +e.target.value; save(); renderSettings(); } })),
      el('td', { class: 'muted' }, endLabel(p)),
      el('td', {}, el('input', { type: 'checkbox', checked: p.workdaysOnly, onchange: (e) => { p.workdaysOnly = e.target.checked; save(); } })),
      el('td', {}, el('button', { class: 'danger', onclick: () => {
        if (!confirm(`Odstranit pozici ${p.label}? Rozpisy uložené pro jednotlivé měsíce se smažou.`)) return;
        state.positions.splice(i, 1);
        for (const m of Object.values(state.months)) { m.grid = null; m.locked = {}; }
        save(); renderAll();
      } }, '🗑')))),
  );
  const labels = { unfilled: 'Neobsazená služba', target: 'Odchylka od cílového počtu', overTarget: 'Služba nad cíl (navíc)', weekend: 'Nerovnoměrné víkendy/svátky',
    gap1: 'Dvě služby po sobě (po denní)', gap2: 'Služby ob den', gap3: 'Rozestup 3 dny', sameWeekend: 'Sobota i neděle', afterNight: 'Výjimka: služba den po noční/24h' };
  $('#weightsTable').replaceChildren(...Object.entries(DEFAULT_WEIGHTS).map(([k, v]) => el('tr', {},
    el('td', {}, labels[k] || k),
    el('td', {}, el('input', { type: 'number', min: 0, step: 'any', value: state.weights[k] ?? v, onchange: (e) => { state.weights[k] = +e.target.value; save(); } })))));
}
$('#addPos').onclick = () => {
  const label = prompt('Název nové pozice (sloupce):');
  if (!label) return;
  let id = norm(label).replace(/[^a-z0-9]+/g, '') || 'pos';
  while (state.positions.some((p) => p.id === id)) id += '2';
  state.positions.push({ id, label, start: '07:00', hours: 24, workdaysOnly: false, aliases: [] });
  for (const m of Object.values(state.months)) { m.grid = null; m.locked = {}; }
  save(); renderAll();
};
$('#minRest').onchange = (e) => { state.minRestHours = Math.max(0, +e.target.value || 0); save(); };
$('#afterNight').onchange = (e) => { state.afterNight = e.target.value; save(); };
$('#fixedCount').onchange = (e) => {
  const v = e.target.value === '' ? null : Math.max(1, Math.round(+e.target.value));
  state.fixedGroup = { ...(state.fixedGroup || FIXED_GROUP), count: v };
  save(); renderDoctors();
};
$('#extraHol').onchange = (e) => {
  monthData().extraHolidays = (e.target.value.match(/\d+/g) || []).map(Number);
  save(); renderAll();
};

renderMonth();
