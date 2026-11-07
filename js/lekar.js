// Stránka pro lékaře: zadávání vlastních požadavků a náhled rozpisu.
import { buildMonth, MONTHS } from './calendar.js';
import { API_URL } from './online-config.js';
import { OUP_LIMIT } from './config.js';
import { buildIcs } from './ics.js';

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
const token = new URLSearchParams(location.search).get('t') || '';
let me = null;
let req = { off: [], want: [], ban: [], notes: {}, note: '' };
let dirty = false;

function fatal(msg) { $('#loading').classList.add('hidden'); const f = $('#fatal'); f.textContent = msg; f.classList.remove('hidden'); }

async function api(params) {
  const url = `${API_URL}?${new URLSearchParams({ ...params, t: token })}`;
  const r = await fetch(url);
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j;
}
async function apiSave(body) {
  // POST s text/plain (bez CORS preflight); při potížích záložně GET
  try {
    const r = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ ...body, t: token }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
    const j = await r.json();
    if (j.error) throw Object.assign(new Error(j.error), { server: true });
    return j;
  } catch (e) {
    if (e.server) throw e;
    return api({ action: 'save', payload: JSON.stringify(body) });
  }
}

// ---------------------------------------------------------------- start
async function init() {
  if (!API_URL) return fatal('Aplikace ještě není propojená s tabulkou (chybí adresa v js/online-config.js).');
  if (!token) return fatal('Chybí osobní odkaz. Otevřete stránku přes odkaz, který jste dostali od správce rozpisu.');
  try { me = await api({ action: 'me' }); } catch (e) { return fatal(e.message); }
  $('#loading').classList.add('hidden');
  $('#tab-req').classList.remove('hidden');
  $('#who').textContent = me.doctor.name;
  if (me.request) req = { off: [], want: [], ban: [], notes: {}, note: '', ...me.request };
  $('#genNote').value = req.note || '';
  $('#genNote').addEventListener('input', () => { req.note = $('#genNote').value; markDirty(); });
  setupOup();
  renderReq();
  fillSchedMonths();
  setupCalendar();
  if (!me.open && me.schedules.length) switchTab('sched');
}

// ---------------------------------------------------------------- požadavky
const ymOf = (key) => { const [y, m] = key.split('-').map(Number); return { y, m }; };
const posLabel = (id) => (me.positions.find((p) => p.id === id)?.label || id);
const myPositions = () => me.positions.filter((p) => me.doctor.positions.includes(p.id));

function stateOf(day) {
  if (req.off.map(Number).includes(day)) return { type: 'off' };
  const w = req.want.find((x) => +x.day === day);
  if (w) return { type: 'want', pos: w.pos };
  const b = req.ban.find((x) => +x.day === day);
  if (b) return { type: 'ban', pos: b.pos };
  return { type: '' };
}
function setState(day, st) {
  req.off = req.off.filter((d) => +d !== day);
  req.want = req.want.filter((w) => +w.day !== day);
  req.ban = req.ban.filter((b) => +b.day !== day);
  if (st.type === 'off') req.off.push(day);
  if (st.type === 'want') req.want.push({ day, pos: st.pos && st.pos.length ? st.pos : null });
  if (st.type === 'ban' && st.pos && st.pos.length) req.ban.push({ day, pos: st.pos });
  markDirty();
}
function markDirty() { dirty = true; $('#saveState').textContent = 'Neuložené změny'; $('#saveState').style.color = '#b45309'; }

function renderReq() {
  const { y, m } = ymOf(me.month);
  $('#sub').textContent = `Požadavky na ${MONTHS[m - 1]} ${y}`;
  const info = $('#reqInfo');
  if (!me.doctor.active) { info.className = 'msg lock'; info.textContent = 'Jste vedený/á jako neaktivní – do rozpisu se teď nezařazujete. Pokud je to chyba, ozvěte se správci.'; }
  else if (me.open) { info.className = 'msg'; info.innerHTML = `Zadáváte požadavky na <b>${MONTHS[m - 1]} ${y}</b>. Uzávěrka: <b>${me.deadline}</b> (do konce dne). Potom se rozpis připraví a po schválení vám přijde e-mailem.`; }
  else {
    info.className = 'msg lock';
    info.innerHTML = `Požadavky na <b>${MONTHS[m - 1]} ${y}</b> jsou uzamčené (uzávěrka byla ${me.deadline}). Níže vidíte, co jste zadali.`
      + (me.awaiting ? '<br>Rozpis se právě kontroluje – po schválení vám přijde e-mailem a uvidíte ho v záložce <b>Rozpis</b>.' : '');
  }
  const days = buildMonth(y, m);
  const cal = $('#cal');
  cal.classList.toggle('locked', !me.open);
  const cells = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map((d) => el('div', { class: 'dow' }, d));
  const lead = (days[0].dow + 6) % 7;
  for (let i = 0; i < lead; i++) cells.push(el('div', { class: 'day empty' }));
  for (const d of days) {
    const st = stateOf(d.day);
    const note = (req.notes || {})[d.day];
    let txt = '';
    if (st.type === 'off') txt = '✗ nemůžu';
    if (st.type === 'want') txt = '✓ chci' + (st.pos ? ' ' + st.pos.map(posLabel).join(', ') : '');
    if (st.type === 'ban') txt = '¬ ' + st.pos.map(posLabel).join(', ');
    cells.push(el('div', {
      class: `day ${d.weekend || d.holiday ? 'we' : ''} ${st.type}`,
      title: d.holiday ? 'státní svátek' : null,
      onclick: () => { if (me.open) openSheet(d); },
    }, el('div', { class: 'n' }, `${d.day}.`), note ? el('div', { class: 'nt' }, '✎ ' + note) : null, el('div', { class: 's' }, txt)));
  }
  cal.replaceChildren(...cells);
  $('#saveBtn').disabled = !me.open;
  $('#genNote').disabled = !me.open;
  lockOup();
  if (!me.open) $('#saveState').textContent = '';
  else if (!dirty) { $('#saveState').textContent = me.request ? 'Uloženo' : 'Zatím nic neuloženo'; $('#saveState').style.color = ''; }
}

function openSheet(d) {
  const st = stateOf(d.day);
  let wantSel = st.type === 'want' && st.pos ? [...st.pos] : [];
  let banSel = st.type === 'ban' ? [...st.pos] : [];
  const avail = myPositions().filter((p) => !(p.workdaysOnly && !d.workday));
  const close = () => { $('#sheet').classList.add('hidden'); $('#sheetBg').classList.add('hidden'); renderReq(); };
  const pick = (type, pos) => { setState(d.day, { type, pos }); close(); };
  const toggleBtns = (list, sel, onDone) => el('div', { class: 'opts' }, list.map((p) => el('button', {
    class: sel.includes(p.id) ? 'sel' : '',
    onclick: (e) => { const i = sel.indexOf(p.id); if (i >= 0) sel.splice(i, 1); else sel.push(p.id); e.target.classList.toggle('sel'); onDone(); },
  }, p.label)));
  const noteInput = el('textarea', { rows: 2, maxlength: 200, placeholder: 'např. kurz, dovolená, jen do 15:00…' });
  noteInput.value = (req.notes || {})[d.day] || '';
  noteInput.addEventListener('input', () => { req.notes = req.notes || {}; if (noteInput.value.trim()) req.notes[d.day] = noteInput.value.trim(); else delete req.notes[d.day]; markDirty(); });
  $('#sheet').replaceChildren(
    el('h3', {}, `${d.label}${d.holiday ? ' – svátek' : ''}`),
    el('div', { class: 'main' },
      el('button', { onclick: () => pick('off') }, '✗ Nemůžu sloužit'),
      el('button', { onclick: () => pick('want', null) }, '✓ Chci sloužit (kdekoli)'),
      el('button', { onclick: () => pick('', null) }, '○ Bez požadavku')),
    avail.length > 1 ? el('div', { class: 'group' }, 'Chci sloužit jen na:') : null,
    avail.length > 1 ? toggleBtns(avail, wantSel, () => { banSel = []; }) : null,
    avail.length > 1 ? el('button', { class: 'primary', style: 'width:100%;margin-top:6px', onclick: () => pick(wantSel.length ? 'want' : '', wantSel) }, 'Potvrdit „chci sloužit na…"') : null,
    avail.length > 1 ? el('div', { class: 'group' }, 'Můžu, ale ne na:') : null,
    avail.length > 1 ? toggleBtns(avail, banSel, () => { wantSel = []; }) : null,
    avail.length > 1 ? el('button', { style: 'width:100%;margin-top:6px', onclick: () => pick(banSel.length ? 'ban' : '', banSel) }, 'Potvrdit „ne na…"') : null,
    el('div', { class: 'group' }, 'Poznámka k tomuto dni:'), noteInput,
    el('button', { style: 'width:100%;margin-top:10px', onclick: close }, 'Zavřít'),
  );
  $('#sheet').classList.remove('hidden'); $('#sheetBg').classList.remove('hidden');
}
$('#sheetBg').onclick = () => { $('#sheet').classList.add('hidden'); $('#sheetBg').classList.add('hidden'); renderReq(); };

$('#saveBtn').onclick = async () => {
  $('#saveBtn').disabled = true; $('#saveState').textContent = 'Ukládám…';
  try {
    await apiSave({ action: 'save', month: me.month, request: req });
    dirty = false; me.request = req;
    $('#saveState').textContent = '✔ Uloženo'; $('#saveState').style.color = '#15803d';
  } catch (e) {
    $('#saveState').textContent = 'Chyba: ' + e.message; $('#saveState').style.color = '#b91c1c';
  }
  $('#saveBtn').disabled = !me.open;
};
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

// ---------------------------------------------------------------- počet OUP
function setupOup() {
  const hasOup = me.doctor.positions.some((id) => OUP_LIMIT.positions.includes(id));
  $('#oupBox').classList.toggle('hidden', !hasOup);
  if (!hasOup) return;
  const inp = $('#oupMax');
  inp.min = OUP_LIMIT.min;
  inp.value = req.oupMax || '';
  const set = (v) => {
    if (v === '' || v == null || Number.isNaN(v)) { delete req.oupMax; inp.value = ''; }
    else { req.oupMax = Math.min(31, Math.max(OUP_LIMIT.min, Math.round(v))); inp.value = req.oupMax; }
    markDirty();
  };
  inp.onchange = () => set(inp.value === '' ? '' : +inp.value);
  $('#oupMinus').onclick = () => set(req.oupMax ? req.oupMax - 1 : OUP_LIMIT.min);
  $('#oupPlus').onclick = () => set(req.oupMax ? req.oupMax + 1 : OUP_LIMIT.min);
}
function lockOup() { ['#oupMax', '#oupMinus', '#oupPlus'].forEach((x) => { $(x).disabled = !me.open; }); }

// ---------------------------------------------------------------- rozpis
function fillSchedMonths() {
  const sel = $('#schedMonth');
  sel.replaceChildren(...(me.schedules.length ? me.schedules : ['']).map((k) => {
    if (!k) return el('option', { value: '' }, me.awaiting ? 'Rozpis čeká na schválení' : 'Zatím žádný schválený rozpis');
    const { y, m } = ymOf(k); return el('option', { value: k }, `${MONTHS[m - 1]} ${y}`);
  }));
  sel.onchange = loadSchedule;
}
let schedLoaded = null;
async function loadSchedule() {
  const k = $('#schedMonth').value;
  if (!k) { $('#mine').textContent = me.awaiting ? 'Rozpis se právě kontroluje – po schválení vám přijde e-mailem a objeví se zde.' : 'Zatím nebyl schválen žádný rozpis.'; $('#schedTable').replaceChildren(); return; }
  $('#mine').textContent = 'Načítám…';
  try {
    const s = await api({ action: 'schedule', month: k });
    schedLoaded = k;
    const { y, m } = ymOf(k);
    const days = buildMonth(y, m);
    const mine = [];
    const rows = s.rows.map((r) => {
      const dm = r[0].match(/(\d{1,2})\.\s*(\d{1,2})\./);
      const d = dm && +dm[2] === m ? days[+dm[1] - 1] : null;
      const hit = r.slice(1).map((n, i) => (n === s.me ? s.header[i + 1] : null)).filter(Boolean);
      if (d && hit.length) mine.push(`${d.label} – ${hit.join(', ')}`);
      return el('tr', { class: `${d && (d.weekend || d.holiday) ? 'we' : ''} ${hit.length ? 'mine' : ''} ${!d ? 'prevrow' : ''}` },
        r.map((c, i) => el('td', { class: i > 0 && c === s.me ? 'me' : '' }, c)));
    });
    $('#schedTable').replaceChildren(el('thead', {}, el('tr', {}, s.header.map((h) => el('th', {}, h)))), el('tbody', {}, rows));
    const ver = s.version
      ? `<div class="ver">Platná verze ${s.version} · schváleno ${s.sentAt}</div>`
      : '';
    $('#mine').innerHTML = ver + (mine.length ? `<b>Moje služby (${mine.length}):</b><br>${mine.join('<br>')}` : 'V tomto rozpisu nemáte žádnou službu.');
    applyOnlyMine();
  } catch (e) { $('#mine').textContent = e.message; }
}
// ---------------------------------------------------------------- kalendář
function setupCalendar() {
  $('#calBox').classList.toggle('hidden', !me.schedules.length);
  const url = `${API_URL}?${new URLSearchParams({ action: 'ics', t: token })}`;
  $('#subUrl').value = url;
  $('#webcalLink').href = url.replace(/^https?:/, 'webcal:');
  $('#icsSubscribe').onclick = () => $('#subHelp').classList.toggle('hidden');
  $('#copySub').onclick = async () => { try { await navigator.clipboard.writeText(url); $('#copySub').textContent = '✔ Zkopírováno'; } catch { $('#subUrl').select(); } };
  $('#icsDownload').onclick = async () => {
    $('#icsDownload').disabled = true;
    try {
      // všechny schválené rozpisy od minulého měsíce dál
      const now = new Date();
      const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const keys = me.schedules.filter((k) => k >= from || k === me.schedules[0]);
      const schedules = [];
      for (const k of keys) { const sch = await api({ action: 'schedule', month: k }); schedules.push({ month: k, header: sch.header, rows: sch.rows, version: sch.version }); }
      const text = buildIcs({ schedules, positions: me.positions, name: me.doctor.name, uid: token.slice(0, 8), calName: 'Moje služby' });
      const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' })), download: 'moje-sluzby.ics' });
      document.body.append(a); a.click(); a.remove();
    } catch (e) { alert(e.message); }
    $('#icsDownload').disabled = false;
  };
}

function applyOnlyMine() {
  const only = $('#onlyMine').checked;
  document.querySelectorAll('#schedTable tbody tr').forEach((tr) => tr.classList.toggle('hide', only && !tr.classList.contains('mine')));
}
$('#onlyMine').onchange = applyOnlyMine;

function switchTab(t) {
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
  $('#tab-req').classList.toggle('hidden', t !== 'req');
  $('#tab-sched').classList.toggle('hidden', t !== 'sched');
  $('.savebar').classList.toggle('hidden', t !== 'req');
  if (t === 'sched' && schedLoaded !== $('#schedMonth').value) loadSchedule();
}
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => { if (me) switchTab(b.dataset.tab); }));

init();
