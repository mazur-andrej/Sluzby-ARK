// História služieb za posledných 12 mesiacov: dáta + grafy (bez knižníc, čisté HTML).
// Zdroj: pri mesiacoch z FAIR_BASE_MONTHS pole `fair` pri lekárovi (ručné rozpisy), inak rozpis vygenerovaný v programe.
import { buildMonth, keyOf } from './calendar.js';
import { el } from './dom.js';
import { CATEGORIES, OUP_LIMIT, FAIR_BASE_MONTHS } from './config.js';

const MONTHS_CS = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
export const monthLabel = (key) => { const [y, m] = key.split('-').map(Number); return `${MONTHS_CS[m - 1]} ${String(y).slice(2)}`; };

/** Posledných `count` mesiacov končiacich mesiacom endKey (vrátane). */
function windowKeys(endKey, count = 12) {
  let [y, m] = endKey.split('-').map(Number);
  const out = [];
  for (let i = 0; i < count; i++) { out.unshift(keyOf(y, m)); if (--m < 1) { m = 12; y--; } }
  return out;
}

const empty = () => ({ n24: 0, t: 0, o: 0, sat: 0, sun: 0, fri: 0, hol: 0, hd: [], noWe: 0 });

/**
 * Štatistiky po lekároch a mesiacoch.
 * @returns {{ keys: string[], have: string[], per: { [id]: { months: {[key]: stat}, sum: stat, monthsWith: number } } }}
 */
export function historyStats({ doctors, positions, months, endKey, count = 12 }) {
  const keys = windowKeys(endKey, count);
  const h24 = new Set(CATEGORIES.h24.positions), tt = new Set(CATEGORIES.tecky.positions), oup = new Set(OUP_LIMIT.positions);
  const per = {};
  const have = new Set();
  const slot = (id, key) => { const p = (per[id] ||= { months: {}, sum: empty(), monthsWith: 0 }); return (p.months[key] ||= empty()); };
  for (const key of keys) {
    if (FAIR_BASE_MONTHS.includes(key)) {
      for (const d of doctors) {
        const f = d.fair?.[key];
        if (!f) continue;
        have.add(key);
        const s = slot(d.id, key);
        for (const k of ['n24', 't', 'o', 'sat', 'sun', 'fri', 'hol', 'noWe']) s[k] += +f[k] || 0;
        s.hd.push(...(f.hd || []));
      }
      continue;
    }
    const md = months?.[key];
    if (!md?.grid) continue;
    have.add(key);
    const [y, m] = key.split('-').map(Number);
    const days = buildMonth(y, m, md.extraHolidays || []);
    md.grid.forEach((row, t) => row.forEach((id, pi) => {
      const pos = positions[pi]; const d = days[t];
      if (!id || !pos || !d) return;
      const s = slot(id, key);
      if (h24.has(pos.id)) {
        s.n24++;
        if (d.holiday) { s.hol++; s.hd.push(`${m}-${d.day}`); } else if (d.dow === 6) s.sat++; else if (d.dow === 0) s.sun++; else if (d.dow === 5) s.fri++;
      } else if (tt.has(pos.id)) s.t++;
      else if (oup.has(pos.id)) s.o++;
    }));
    for (const [id, p] of Object.entries(per)) { const s = p.months[key]; if (s && s.n24 > 0 && s.sat + s.sun + s.hol === 0) s.noWe = 1; }
  }
  for (const p of Object.values(per)) {
    for (const [key, s] of Object.entries(p.months)) {
      if (!keys.includes(key)) continue;
      if (s.n24 + s.t + s.o > 0) p.monthsWith++;
      for (const k of ['n24', 't', 'o', 'sat', 'sun', 'fri', 'hol', 'noWe']) p.sum[k] += s[k];
      p.sum.hd.push(...s.hd);
    }
  }
  return { keys, have: keys.filter((k) => have.has(k)), per };
}

// ---------------- vykreslenie ----------------
const fmt = (v) => (Math.round(v * 10) / 10).toLocaleString('cs-CZ');
const HOL_NAMES = { '1-1': 'Nový rok', '5-1': '1. máj', '5-8': '8. máj', '7-5': 'Cyril a Metod', '7-6': 'Jan Hus', '9-28': 'sv. Václav', '10-28': '28. říjen', '11-17': '17. listopad', '12-24': 'Štědrý den', '12-25': '1. svátek vánoční', '12-26': '2. svátek vánoční' };
const holName = (h) => { const [m, d] = h.split('-'); return HOL_NAMES[h] || `${d}. ${m}. (Velikonoce)`; };

/** Jeden tooltip pre celé okno histórie. */
function tooltip(root) {
  const tip = el('div', { class: 'h-tip', role: 'status' });
  root.append(tip);
  const show = (e, lines) => {
    tip.replaceChildren(...lines.map(([val, label, color]) => el('div', { class: 'h-tip-row' },
      color ? el('span', { class: 'h-key', style: `background:${color}` }) : null, el('b', {}, val), ' ', el('span', {}, label))));
    tip.style.display = 'block';
    const r = root.getBoundingClientRect();
    const x = (e.clientX ?? e.target.getBoundingClientRect().right) - r.left + 12, y = (e.clientY ?? e.target.getBoundingClientRect().top) - r.top + 12;
    tip.style.left = `${Math.min(x, r.width - 240)}px`; tip.style.top = `${y}px`;
  };
  const hide = () => { tip.style.display = 'none'; };
  return { show, hide };
}

/** Vodorovný (skladaný) stĺpcový graf: rows = [{ name, values: [..], tip: [[val,label,color]...] }]. */
function hbar(title, sub, series, rows, tip) {
  const max = Math.max(1, ...rows.map((r) => r.values.reduce((a, b) => a + b, 0)));
  const legend = series.length > 1 ? el('div', { class: 'h-legend' }, series.map((s) => el('span', {}, el('span', { class: 'h-sw', style: `background:${s.color}` }), s.label))) : null;
  const body = rows.map((r) => {
    const total = r.values.reduce((a, b) => a + b, 0);
    const segs = r.values.map((v, i) => (v > 0 ? el('span', { class: 'h-seg', style: `flex:${v} 1 0;background:${series[i].color}` }) : null)).filter(Boolean);
    const lines = r.tip || series.map((s, i) => [fmt(r.values[i]), s.label, s.color]);
    const row = el('div', { class: 'h-row', tabindex: 0, onpointermove: (e) => tip.show(e, [[r.name, ''], ...lines]), onpointerleave: tip.hide, onfocus: (e) => tip.show(e, [[r.name, ''], ...lines]), onblur: tip.hide },
      el('span', { class: 'h-name' }, r.name),
      el('span', { class: 'h-track' }, el('span', { class: 'h-bar', style: `width:calc((100% - 48px) * ${(total / max).toFixed(4)})` }, segs), el('span', { class: 'h-val' }, fmt(total))));
    return row;
  });
  return el('div', { class: 'card h-chart' }, el('h3', {}, title), sub ? el('p', { class: 'muted' }, sub) : null, legend, el('div', { class: 'h-rows' }, body));
}

/** Tepelná mapa lekár × mesiac (počet 24h). */
function heatmap(title, sub, keys, rows, tip) {
  const max = Math.max(1, ...rows.flatMap((r) => r.cells.map((c) => c ?? 0)));
  const ramp = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
  const color = (v) => (v == null ? null : v === 0 ? '#f0efec' : ramp[Math.min(ramp.length - 1, Math.round(((v - 1) / Math.max(1, max - 1)) * (ramp.length - 1)))]);
  const ink = (v) => (v != null && v > 0 && ramp.indexOf(color(v)) >= 3 ? '#fff' : '#0b0b0b');
  const head = el('tr', {}, el('th', { class: 'name' }, ''), keys.map((k) => el('th', {}, monthLabel(k))), el('th', {}, 'Σ'));
  const body = rows.map((r) => el('tr', {}, el('td', { class: 'name' }, r.name),
    r.cells.map((v, i) => el('td', {
      class: 'h-cell', tabindex: 0, style: v == null ? '' : `background:${color(v)};color:${ink(v)}`,
      onpointermove: (e) => tip.show(e, [[r.name, monthLabel(keys[i])], [v == null ? '—' : String(v), v == null ? 'bez dat' : '× 24h']]), onpointerleave: tip.hide,
    }, v == null ? '' : String(v))),
    el('td', { class: 'h-sum' }, fmt(r.cells.reduce((a, b) => a + (b ?? 0), 0)))));
  return el('div', { class: 'card h-chart' }, el('h3', {}, title), sub ? el('p', { class: 'muted' }, sub) : null,
    el('div', { class: 'table-wrap h-heat' }, el('table', { class: 'grid' }, el('thead', {}, head), el('tbody', {}, body))));
}

const tile = (label, value, note) => el('div', { class: 'h-tile' }, el('div', { class: 'muted' }, label), el('div', { class: 'h-big' }, value), note ? el('div', { class: 'muted' }, note) : null);

/**
 * Vykreslí okno Historie.
 * opts: { doctors (všetci), groups: [{id,label,test(doc)}], group, perMonth, activeOnly, onChange(opts) }
 */
export function renderHistory(root, stats, opts) {
  const C = { blue: '#2a78d6', orange: '#eb6834', aqua: '#1baf7a' };
  const docs = opts.doctors.filter((d) => (!opts.activeOnly || d.active) && (opts.groups.find((g) => g.id === opts.group)?.test(d) ?? true) && stats.per[d.id]?.monthsWith);
  const pm = (id, v) => (opts.perMonth ? v / Math.max(1, stats.per[id].monthsWith) : v);
  const S = (d) => stats.per[d.id].sum;
  root.replaceChildren();
  const tip = tooltip(root);

  // ovládanie
  const sel = el('select', { onchange: (e) => opts.onChange({ group: e.target.value }) }, opts.groups.map((g) => el('option', { value: g.id, selected: g.id === opts.group }, g.label)));
  const per = el('label', {}, el('input', { type: 'checkbox', checked: opts.perMonth, onchange: (e) => opts.onChange({ perMonth: e.target.checked }) }), ' průměr na měsíc (kvůli lékařům, kteří nebyli celý rok)');
  const act = el('label', {}, el('input', { type: 'checkbox', checked: opts.activeOnly, onchange: (e) => opts.onChange({ activeOnly: e.target.checked }) }), ' jen aktivní');
  const missing = stats.keys.filter((k) => !stats.have.includes(k));
  root.append(el('div', { class: 'toolbar' }, el('label', {}, 'Skupina: ', sel), per, act),
    el('p', { class: 'muted' }, `Období ${monthLabel(stats.keys[0])} – ${monthLabel(stats.keys.at(-1))}. `,
      missing.length ? `Bez dat: ${missing.map(monthLabel).join(', ')} (rozpis není v programu ani v historii).` : 'Data za všechny měsíce.'));

  if (!docs.length) { root.append(el('p', {}, 'Pro zvolenou skupinu nejsou žádná data.')); return; }

  // dlaždice
  const tot = (k) => docs.reduce((a, d) => a + S(d)[k], 0);
  const wTot = tot('sat') + tot('sun');
  const byWe = [...docs].sort((a, b) => (S(b).sat + S(b).sun) / Math.max(1, S(b).n24) - (S(a).sat + S(a).sun) / Math.max(1, S(a).n24));
  const noWe = [...docs].sort((a, b) => S(b).noWe - S(a).noWe)[0];
  root.append(el('div', { class: 'h-tiles' },
    tile('24h služeb celkem', fmt(tot('n24')), `${fmt(tot('t'))} teček · ${fmt(tot('o'))} OUP`),
    tile('Víkendových 24h (so + ne)', fmt(wTot), `${Math.round((wTot / Math.max(1, tot('n24'))) * 100)} % všech 24h služeb`),
    tile('24h na svátky', fmt(tot('hol'))),
    tile('Nejvíc víkendů vůči službám', byWe[0].name, `${Math.round(((S(byWe[0]).sat + S(byWe[0]).sun) / Math.max(1, S(byWe[0]).n24)) * 100)} % jeho 24h`),
    noWe && S(noWe).noWe ? tile('Nejčastěji měsíc bez víkendu', noWe.name, `${fmt(S(noWe).noWe)}× za období`) : null));

  const unit = opts.perMonth ? ' (průměr na měsíc)' : '';
  // 1) služby celkom
  const r1 = docs.map((d) => ({ name: d.name, values: [pm(d.id, S(d).n24), pm(d.id, S(d).t), pm(d.id, S(d).o)], months: stats.per[d.id].monthsWith }))
    .sort((a, b) => b.values.reduce((x, y) => x + y, 0) - a.values.reduce((x, y) => x + y, 0));
  r1.forEach((r) => { r.tip = [[fmt(r.values[0]), '24h', C.blue], [fmt(r.values[1]), 'teček', C.orange], [fmt(r.values[2]), 'OUP', C.aqua], [String(r.months), 'měsíců se službou']]; });
  root.append(hbar(`Kdo měl kolik služeb${unit}`, 'Seřazeno od nejvíc služeb. 24h = JIP, anestezie, KPECH.', [{ label: '24h', color: C.blue }, { label: 'tečky', color: C.orange }, { label: 'OUP', color: C.aqua }], r1, tip));

  // 2) víkendy so + ne (+ piatok)
  const r2 = docs.filter((d) => S(d).n24 > 0).map((d) => {
    const s = S(d);
    return { name: d.name, values: [pm(d.id, s.sat), pm(d.id, s.sun), pm(d.id, s.fri)],
      tip: [[fmt(pm(d.id, s.sat)), 'sobot', C.blue], [fmt(pm(d.id, s.sun)), 'nedělí', C.orange], [fmt(pm(d.id, s.fri)), 'pátků', C.aqua], [`${Math.round(((s.sat + s.sun) / Math.max(1, s.n24)) * 100)} %`, 'jeho 24h připadá na víkend'], [fmt(s.noWe), 'měsíců bez víkendu']] };
  }).sort((a, b) => b.values[0] + b.values[1] - (a.values[0] + a.values[1]));
  root.append(hbar(`Víkendy – 24h služby v sobotu a v neděli${unit}`, 'Pátek (počítá se jako půl víkendu) je zvlášť. Víkend, který je svátkem, je v grafu svátků.', [{ label: 'sobota', color: C.blue }, { label: 'neděle', color: C.orange }, { label: 'pátek', color: C.aqua }], r2, tip));

  // 3) sviatky
  const r3 = docs.filter((d) => S(d).n24 > 0).map((d) => ({ name: d.name, values: [pm(d.id, S(d).hol)], tip: [[fmt(pm(d.id, S(d).hol)), 'svátků'], ...S(d).hd.map((h) => [h.split('-').reverse().join('. ') + '.', holName(h)])] }))
    .sort((a, b) => b.values[0] - a.values[0]);
  const zero = r3.filter((r) => !r.values[0]).map((r) => r.name);
  const hc = hbar(`Svátky – 24h služby${unit}`, 'Najeďte na řádek: které svátky to byly. Program je za rok vyrovnává a střídá rok od roku.', [{ label: 'svátky', color: C.blue }], r3.filter((r) => r.values[0]), tip);
  if (zero.length) hc.append(el('p', { class: 'muted', style: 'margin-top:10px' }, `Bez svátku (${zero.length}): ${zero.join(', ')}`));
  root.append(hc);

  // 4) tepelná mapa
  const r4 = docs.filter((d) => S(d).n24 > 0).map((d) => ({ name: d.name, cells: stats.keys.map((k) => (stats.have.includes(k) ? stats.per[d.id].months[k]?.n24 ?? 0 : null)) }));
  root.append(heatmap('24h služby po měsících', 'Čím tmavší, tím víc služeb v měsíci. Šedá = 0, prázdné = bez dat.', stats.keys, r4, tip));

  // 5) tabuľka (prístupnosť + export očami)
  const cols = [['24h', 'n24'], ['teček', 't'], ['OUP', 'o'], ['so', 'sat'], ['ne', 'sun'], ['pá', 'fri'], ['svátky', 'hol'], ['měs. bez víkendu', 'noWe']];
  const tb = el('table', { class: 'grid' },
    el('thead', {}, el('tr', {}, el('th', { class: 'name' }, 'Lékař'), el('th', {}, 'měsíců'), cols.map(([l]) => el('th', {}, l)))),
    el('tbody', {}, docs.map((d) => el('tr', {}, el('td', { class: 'name' }, d.name), el('td', {}, String(stats.per[d.id].monthsWith)), cols.map(([, k]) => el('td', { class: 'h-num' }, fmt(pm(d.id, S(d)[k]))))))));
  root.append(el('details', { class: 'card' }, el('summary', {}, `Tabulka${unit}`), el('div', { class: 'table-wrap' }, tb)));
}
