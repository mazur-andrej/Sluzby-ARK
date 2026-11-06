import { buildMonth, prevMonthOf, MONTHS } from './calendar.js';
import { readDocx, parseScheduleTable, buildScheduleDocx } from './docx.js';
import { solve, validate, DEFAULT_WEIGHTS } from './solver.js';
import { parseRequestsText, parseRequestsTable, mergeRequests, findDoctor, norm } from './requests.js';
import { DEFAULT_POSITIONS } from './config.js';
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
  const head = el('tr', {}, el('th', { class: 'name' }, 'Lekár'),
    ds.map((d) => el('th', { class: d.weekend || d.holiday ? 'we' : '', title: d.holiday ? 'sviatok' : '' }, `${d.day}`, el('br'), d.label.split(' ')[0])),
    el('th', {}, '✗'), el('th', {}, '✓'));
  const body = activeDoctors().map((doc) => {
    const req = md.requests[doc.id] || { off: [], want: [] };
    const offSet = new Set(req.off.map(Number));
    const wantMap = new Map(req.want.map((w) => [+w.day, w]));
    return el('tr', {}, el('td', { class: 'name', title: req.note || '' }, doc.name + (req.note ? ' 📝' : '')),
      ds.map((d) => {
        const w = wantMap.get(d.day);
        const cls = offSet.has(d.day) ? 'off' : w ? 'want' : '';
        const txt = offSet.has(d.day) ? '✗' : w ? (w.pos ? posShort(w.pos) : '✓') : '';
        return el('td', {
          class: `c ${cls} ${d.weekend || d.holiday ? 'we' : ''}`,
          onclick: () => cycleReq(doc.id, d.day),
          oncontextmenu: (e) => { e.preventDefault(); posMenu(e, doc, d.day); },
        }, txt);
      }),
      el('td', { class: 'cnt' }, String(offSet.size)), el('td', { class: 'cnt' }, String(wantMap.size)));
  });
  tbl.replaceChildren(el('thead', {}, head), el('tbody', {}, body));
  const prev = prevServices();
  $('#prevInfo').textContent = prev.length
    ? `Koniec minulého mesiaca (kvôli odpočinku po službe): ${prev.filter((p) => p.day === 0).map((p) => docById(p.doctorId)?.name || p.doctorId).join(', ')}`
    : 'Rozpis minulého mesiaca nie je načítaný – pravidlo odpočinku po službe sa na 1. deň mesiaca neuplatní.';
}
const posShort = (id) => id;

function cycleReq(docId, day) {
  const md = monthData();
  const req = md.requests[docId] || (md.requests[docId] = { off: [], want: [], note: '' });
  const isOff = req.off.map(Number).includes(day);
  const isWant = req.want.some((w) => +w.day === day);
  req.off = req.off.filter((d) => +d !== day);
  req.want = req.want.filter((w) => +w.day !== day);
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
    if (pos !== undefined) req.want.push({ day, pos });
    menu.classList.add('hidden'); save(); renderRequests();
  };
  menu.replaceChildren(
    el('div', { class: 'muted', style: 'padding:4px 10px' }, `${doc.name}, ${day}. – chce slúžiť:`),
    el('button', { onclick: () => setWant(null) }, 'kdekoľvek'),
    ...state.positions.filter((p) => doc.positions.includes(p.id)).map((p) => el('button', { onclick: () => setWant(p.id) }, p.label)),
    el('button', { onclick: () => setWant(undefined) }, '— zrušiť —'),
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
  let html = `<b>${esc(source)}:</b> načítané požiadavky ${names.length} lekárov (${esc(names.join(', '))}).`;
  if (parsed.unknown.length) html += `<br>Tieto riadky som nepriradil k žiadnemu lekárovi – skontrolujte ich alebo lekára pridajte na karte Lekári:${list(parsed.unknown.slice(0, 30))}`;
  message('#reqMessages', parsed.unknown.length ? 'warn' : 'ok', html);
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
      if (/\.docx$/i.test(f.name)) {
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
    } catch (err) { message('#reqMessages', 'err', `Súbor ${esc(f.name)} sa nepodarilo načítať: ${esc(err.message)}`); }
  }
  e.target.value = '';
};
$('#reqClear').onclick = () => {
  if (!confirm('Naozaj vymazať všetky požiadavky pre tento mesiac?')) return;
  monthData().requests = {}; save(); renderRequests();
};
$('#prevFile').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  try {
    const doc = await readDocx(await f.arrayBuffer());
    const sch = parseScheduleTable(doc.tables);
    if (!sch) throw new Error('V dokumente som nenašiel tabuľku rozpisu.');
    const pm = prevMonthOf(state.current.year, state.current.month);
    const rows = sch.rows.filter((r) => r.month === pm.month);
    if (!rows.length) throw new Error(`V dokumente nie sú dni z mesiaca ${pm.month}.`);
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
    message('#reqMessages', 'ok', `Načítaný koniec minulého mesiaca (${last - 1}. a ${last}. ${pm.month}.).${unknown.size ? ' Neznámi lekári: ' + esc([...unknown].join(', ')) : ''}`);
  } catch (err) { message('#reqMessages', 'err', esc(err.message)); }
};

// ---------------- Rozpis ----------------
let highlightDoc = null;
function solverInput() {
  const md = monthData();
  return {
    days: days(), positions: state.positions, doctors: activeDoctors(),
    requests: md.requests, prev: prevServices(), locked: md.locked,
    weights: state.weights, seed: md.seed,
  };
}

function generate(newSeed) {
  const md = monthData();
  if (newSeed) md.seed = (md.seed || 1) + 1;
  $('#genStatus').textContent = 'Počítam…';
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
    message('#schedMessages', 'warn', 'Rozpis ešte nie je vygenerovaný. Skontrolujte požiadavky a kliknite na <b>Vygenerovať rozpis</b>.');
    return;
  }
  const input = solverInput();
  const issues = validate(input, md.grid);
  const badCells = new Map();
  for (const i of issues) if (i.day) badCells.set(`${i.day}|${i.pos}`, i.msg);
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
        const offIds = new Set(Object.entries(md.requests).filter(([, r]) => (r.off || []).map(Number).includes(d.day)).map(([id]) => id));
        const sel = el('select', { onchange: (e) => setCell(t, pi, e.target.value), title: badCells.get(key) || '' },
          el('option', { value: '' }, ''),
          docs.filter((x) => x.positions.includes(p.id) || x.id === cur)
            .map((x) => el('option', { value: x.id, selected: x.id === cur }, x.name + (offIds.has(x.id) ? ' ✗' : ''))));
        const cls = [d.weekend || d.holiday ? 'we' : '', md.locked[key] ? 'locked' : '', cur && wishSet.has(`${d.day}|${cur}`) ? 'wish' : '',
          badCells.has(key) ? 'bad' : '', !cur ? 'empty' : '', highlightDoc && cur === highlightDoc ? 'hl' : ''].join(' ');
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
    if (pi < 0 || (w.pos && P[pi].id !== w.pos)) unmet.push(`${docById(id)?.name || id} chcel(a) ${w.day}.${w.pos ? ' (' + posShort(w.pos) + ')' : ''}`);
  }
  let html = '';
  if (!empty.length && !issues.length && !unmet.length) html = '<div class="msg ok">✔ Všetky služby sú obsadené, pravidlá aj priania lekárov sú dodržané.</div>';
  if (empty.length) html += `<div class="msg err"><b>Neobsadené služby (${empty.length})</b> – nikto voľný nespĺňa pravidlá, doplňte ručne:${list(empty)}</div>`;
  if (issues.length) html += `<div class="msg err"><b>Porušenia pravidiel (${issues.length})</b> – po ručnej úprave:${list(issues.map((i) => (i.day ? i.day + '. ' : '') + i.msg))}</div>`;
  if (unmet.length) html += `<div class="msg warn"><b>Nesplnené priania (${unmet.length})</b>:${list(unmet)}</div>`;
  html += '<p class="muted">Bunku zmeníte výberom lekára – zmena sa zamkne (modrá) a pri ďalšom generovaní ostane. Zelená = prianie lekára. ✗ pri mene = lekár si deň vyškrtol.</p>';
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
    let n = 0, we = 0, night = 0;
    md.grid.forEach((row, t) => row.forEach((id, pi) => {
      if (id !== doc.id) return;
      n++; if (ds[t].weekend || ds[t].holiday) we++; if (P[pi].night) night++;
    }));
    const req = md.requests[doc.id] || { off: [], want: [] };
    return { doc, n, we, night, off: req.off.length, diff: n - (+doc.target || 0) };
  });
  const tbl = $('#statsTable');
  tbl.replaceChildren(
    el('thead', {}, el('tr', {}, ['Lekár', 'Služby', 'Cieľ', 'Víkend/sv.', 'Nočné', 'Vyškrtol'].map((h) => el('th', {}, h)))),
    el('tbody', {}, rows.map((r) => el('tr', {
      class: highlightDoc === r.doc.id ? 'sel' : '',
      title: 'Kliknutím zvýrazníte služby lekára v rozpise',
      onclick: () => { highlightDoc = highlightDoc === r.doc.id ? null : r.doc.id; renderSchedule(); },
    },
    el('td', {}, r.doc.name),
    el('td', { class: `num ${r.diff > 0 ? 'diff-pos' : r.diff < 0 ? 'diff-neg' : ''}` }, String(r.n)),
    el('td', { class: 'num' }, String(r.doc.target ?? '')),
    el('td', { class: 'num' }, String(r.we)),
    el('td', { class: 'num' }, String(r.night)),
    el('td', { class: 'num' }, String(r.off))))),
  );
}

$('#exportDocx').onclick = () => {
  const md = monthData();
  if (!md.grid) { alert('Najprv vygenerujte rozpis.'); return; }
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

// ---------------- Lekári ----------------
function renderDoctors() {
  const P = state.positions;
  const tbl = $('#docTable');
  const sorted = [...state.doctors].sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name, 'cs'));
  const head = el('tr', {}, el('th', {}, 'Meno'), el('th', {}, 'Aktívny'), P.map((p) => el('th', {}, p.label)),
    el('th', {}, 'Cieľ'), el('th', {}, 'Max'), el('th', {}, 'Poznámka'), el('th', {}, ''));
  const counts = P.map((p) => activeDoctors().filter((d) => d.positions.includes(p.id)).length);
  const sumTarget = activeDoctors().reduce((s, d) => s + (+d.target || 0), 0);
  const slotsCount = days().reduce((s, d) => s + P.filter((p) => !(p.workdaysOnly && !d.workday)).length, 0);
  const foot = el('tr', {}, el('td', {}, el('b', {}, 'Spolu aktívnych')), el('td', {}, String(activeDoctors().length)),
    counts.map((c) => el('td', {}, String(c))),
    el('td', { title: `Služieb v mesiaci: ${slotsCount}` }, el('b', { style: sumTarget < slotsCount ? 'color:#dc2626' : '' }, `${sumTarget}/${slotsCount}`)), el('td'), el('td'), el('td'));
  const upd = (doc, fn) => (e) => { fn(e); save(); };
  const body = sorted.map((doc) => el('tr', { class: doc.active ? '' : 'inactive' },
    el('td', { class: 'name' }, el('input', { value: doc.name, onchange: upd(doc, (e) => { doc.name = e.target.value.trim(); }) })),
    el('td', {}, el('input', { type: 'checkbox', checked: doc.active, onchange: upd(doc, (e) => { doc.active = e.target.checked; renderDoctors(); }) })),
    P.map((p) => el('td', {}, el('input', {
      type: 'checkbox', checked: doc.positions.includes(p.id),
      onchange: upd(doc, (e) => { doc.positions = e.target.checked ? [...doc.positions, p.id] : doc.positions.filter((x) => x !== p.id); }),
    }))),
    el('td', {}, el('input', { type: 'number', min: 0, value: doc.target ?? '', onchange: upd(doc, (e) => { doc.target = e.target.value === '' ? 0 : +e.target.value; renderDoctors(); }) })),
    el('td', {}, el('input', { type: 'number', min: 0, value: doc.max ?? '', onchange: upd(doc, (e) => { doc.max = e.target.value === '' ? null : +e.target.value; }) })),
    el('td', {}, el('input', { class: 'note', value: doc.note || '', onchange: upd(doc, (e) => { doc.note = e.target.value; }) })),
    el('td', {}, el('button', { class: 'danger', title: 'Odstrániť lekára', onclick: () => {
      if (!confirm(`Odstrániť lekára ${doc.name}? (Ak má len prestávku, radšej odškrtnite „Aktívny".)`)) return;
      state.doctors = state.doctors.filter((d) => d !== doc); save(); renderDoctors();
    } }, '🗑'))));
  tbl.replaceChildren(el('thead', {}, head), el('tbody', {}, body), el('tfoot', {}, foot));
}

$('#addDoc').onclick = () => {
  const name = $('#newDocName').value.trim();
  if (!name) return;
  if (state.doctors.some((d) => norm(d.name) === norm(name))) { alert('Lekár s týmto menom už existuje.'); return; }
  let id = norm(name).replace(/[^a-z0-9]+/g, '-');
  while (state.doctors.some((d) => d.id === id)) id += '-2';
  state.doctors.push({ id, name, active: true, positions: [], target: 4, max: null, note: '' });
  $('#newDocName').value = '';
  save(); renderDoctors();
  alert(`Lekár ${name} pridaný. Nezabudnite zaškrtnúť pozície, na ktorých môže slúžiť.`);
};
$('#newDocName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#addDoc').click(); });

$('#exportData').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `rozpis-sluzieb-zaloha-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
};
$('#importData').onchange = async (e) => {
  try {
    const data = JSON.parse(await e.target.files[0].text());
    if (!Array.isArray(data.doctors) || !Array.isArray(data.positions)) throw new Error('Neplatný súbor zálohy.');
    if (!confirm('Prepísať aktuálne dáta zálohou?')) return;
    state = data; save(); renderMonth();
  } catch (err) { alert(err.message); }
  e.target.value = '';
};

// ---------------- Nastavenia ----------------
function renderSettings() {
  const tbl = $('#posTable');
  tbl.replaceChildren(
    el('tr', {}, ['Názov stĺpca', 'Skratka (id)', 'Nočná', 'Len pracovné dni', ''].map((h) => el('th', {}, h))),
    ...state.positions.map((p, i) => el('tr', {},
      el('td', {}, el('input', { value: p.label, onchange: (e) => { p.label = e.target.value; save(); } })),
      el('td', {}, p.id),
      el('td', {}, el('input', { type: 'checkbox', checked: p.night, onchange: (e) => { p.night = e.target.checked; save(); } })),
      el('td', {}, el('input', { type: 'checkbox', checked: p.workdaysOnly, onchange: (e) => { p.workdaysOnly = e.target.checked; save(); } })),
      el('td', {}, el('button', { class: 'danger', onclick: () => {
        if (!confirm(`Odstrániť pozíciu ${p.label}? Rozpisy uložené pre jednotlivé mesiace sa vymažú.`)) return;
        state.positions.splice(i, 1);
        for (const m of Object.values(state.months)) { m.grid = null; m.locked = {}; }
        save(); renderAll();
      } }, '🗑')))),
  );
  const labels = { unfilled: 'Neobsadená služba', target: 'Odchýlka od cieľového počtu', overTarget: 'Služba nad cieľ (navyše)', weekend: 'Nerovnomerné víkendy/sviatky',
    gap1: 'Dve služby po sebe (po dennej)', gap2: 'Služby ob deň', gap3: 'Rozostup 3 dni', sameWeekend: 'Sobota aj nedeľa' };
  $('#weightsTable').replaceChildren(...Object.entries(DEFAULT_WEIGHTS).map(([k, v]) => el('tr', {},
    el('td', {}, labels[k] || k),
    el('td', {}, el('input', { type: 'number', min: 0, step: 'any', value: state.weights[k] ?? v, onchange: (e) => { state.weights[k] = +e.target.value; save(); } })))));
}
$('#addPos').onclick = () => {
  const label = prompt('Názov novej pozície (stĺpca):');
  if (!label) return;
  let id = norm(label).replace(/[^a-z0-9]+/g, '') || 'pos';
  while (state.positions.some((p) => p.id === id)) id += '2';
  state.positions.push({ id, label, night: true, workdaysOnly: false });
  for (const m of Object.values(state.months)) { m.grid = null; m.locked = {}; }
  save(); renderAll();
};
$('#extraHol').onchange = (e) => {
  monthData().extraHolidays = (e.target.value.match(/\d+/g) || []).map(Number);
  save(); renderAll();
};

renderMonth();
