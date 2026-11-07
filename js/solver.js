// Algoritmus rozpisu služieb.
//
// Tvrdé pravidlá (nikdy sa neporušia):
//  - lekár slúži len na pozíciách, ktoré má povolené
//  - lekár neslúži v dni, ktoré si vyškrtol
//  - v daný deň neslúži na pozícii, ktorú vylúčil (napr. "ne OUP")
//  - max. 1 služba za deň
//  - medzi koncom jednej a začiatkom ďalšej služby je aspoň minRestHours hodín odpočinku
//    (z časov služieb: po 24 h službe alebo OUP noci je nasledujúci deň voľno)
//  - neprekročí sa maximum služieb za mesiac (ak je zadané)
// Mäkké pravidlá (optimalizujú sa):
//  - počet služieb čo najbližšie k cieľu lekára
//  - férové rozdelenie víkendov/sviatkov
//  - služby rozložené v čase (nie 2 dni po sebe, ideálne aspoň 3 dni rozostup)
//  - vyplnené všetky pozície

import { shiftTimes, DEFAULT_MIN_REST_HOURS } from './config.js';

export const DEFAULT_WEIGHTS = {
  unfilled: 1000,
  target: 40,      // * (počet - cieľ)^2
  overTarget: 60,  // navyše za každú službu nad cieľ
  weekend: 25,     // * (víkendy - očakávané)^2
  gap1: 30,        // služba deň po dennej službe
  gap2: 6,         // služby ob deň
  gap3: 1.5,
  sameWeekend: 15, // 2 služby v jednom víkende (so+ne)
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * input = {
 *   days: [{day, weekend, holiday, workday}],
 *   positions: [{id, label, start, hours, workdaysOnly}],
 *   minRestHours: minimálny odpočinok medzi službami (predvolene 11),
 *   doctors: [{id, name, positions:[posId], target, max}],
 *   requests: { [doctorId]: { off:[day], want:[{day, pos?: id|[id]}], ban:[{day, pos:[id]}] } },
 *   prev: [{doctorId, day, posId}]  // služby z konca minulého mesiaca, day <= 0 (0 = posledný deň)
 *   locked: { "den|posId": doctorId } // ručne zadané bunky, ktoré sa nemenia
 *   weights, seed, iterations, restarts
 * }
 */
export function solve(input) {
  const W = { ...DEFAULT_WEIGHTS, ...(input.weights || {}) };
  const days = input.days;
  const D = days.length;
  const P = input.positions;
  const docs = input.doctors;
  const N = docs.length;
  const docIndex = new Map(docs.map((d, i) => [d.id, i]));
  const posIndex = new Map(P.map((p, i) => [p.id, i]));
  const rand = mulberry32(input.seed ?? 12345);
  const warnings = [];

  // Sloty: day 1..D, pozícia aktívna v daný deň
  const slotActive = days.map((d) => P.map((p) => !(p.workdaysOnly && !d.workday)));
  const isWe = days.map((d) => d.weekend || d.holiday);

  const eligible = docs.map((doc) => new Set((doc.positions || []).map((id) => posIndex.get(id)).filter((x) => x !== undefined)));
  const off = docs.map(() => new Set());
  const ban = docs.map(() => new Set()); // "den|posIdx"
  const wants = [];
  for (const [id, req] of Object.entries(input.requests || {})) {
    const i = docIndex.get(id);
    if (i === undefined) continue;
    (req.off || []).forEach((d) => off[i].add(+d));
    (req.want || []).forEach((w) => wants.push({ doc: i, day: +w.day, pos: w.pos == null ? null : [].concat(w.pos) }));
    (req.ban || []).forEach((b) => [].concat(b.pos).forEach((id) => { const p = posIndex.get(id); if (p !== undefined) ban[i].add(`${+b.day}|${p}`); }));
  }
  const maxOf = docs.map((d) => (d.max != null && d.max !== '' ? +d.max : Infinity));
  const targetOf = docs.map((d) => (d.target != null && d.target !== '' ? +d.target : 0));

  // Očakávaný podiel víkendových slotov pre každého lekára (podľa jeho pozícií)
  const weRatio = docs.map((_, i) => {
    let all = 0, we = 0;
    for (let t = 0; t < D; t++) for (const p of eligible[i]) if (slotActive[t][p]) { all++; if (isWe[t]) we++; }
    return all ? we / all : 0;
  });

  // Služby z minulého mesiaca (len pre pravidlo odpočinku a rozostupy)
  const prevByDoc = docs.map(() => []);
  for (const pr of input.prev || []) {
    const i = docIndex.get(pr.doctorId);
    const p = posIndex.get(pr.posId);
    if (i !== undefined) prevByDoc[i].push({ day: +pr.day, p: p !== undefined ? p : -1 });
  }

  // Stav
  const assign = Array.from({ length: D }, () => new Array(P.length).fill(-1));
  const locked = Array.from({ length: D }, () => new Array(P.length).fill(false));
  const docDay = docs.map(() => new Map()); // den -> posIdx

  // Časy služieb v minútach; -1 = neznáma pozícia z minulého mesiaca (berie sa ako 24 h od 7:00)
  const times = P.map(shiftTimes);
  const timeOf = (p) => (p >= 0 ? times[p] : { start: 420, end: 420 + 1440 });
  const minRest = (input.minRestHours ?? DEFAULT_MIN_REST_HOURS) * 60;
  /** pozícia služby lekára v daný deň (aj z minulého mesiaca) alebo undefined */
  const serviceAt = (i, day) => {
    if (day >= 1 && day <= D) return docDay[i].get(day);
    if (day <= 0) { const x = prevByDoc[i].find((y) => y.day === day); return x ? x.p : undefined; }
    return undefined;
  };
  /** dodrží sa odpočinok voči službe deň pred a deň po? */
  function restOk(i, day, p) {
    const before = serviceAt(i, day - 1);
    if (before !== undefined && 1440 + times[p].start - timeOf(before).end < minRest) return false;
    const after = serviceAt(i, day + 1);
    if (after !== undefined && 1440 + timeOf(after).start - times[p].end < minRest) return false;
    return true;
  }

  function canAssign(i, day, p, ignoreOff = false) {
    if (!eligible[i].has(p)) return false;
    if (!slotActive[day - 1][p]) return false;
    if (!ignoreOff && off[i].has(day)) return false;
    if (ban[i].has(`${day}|${p}`)) return false;
    if (docDay[i].has(day)) return false;
    if (!restOk(i, day, p)) return false;
    if (docDay[i].size >= maxOf[i]) return false;
    return true;
  }
  function place(i, day, p) { assign[day - 1][p] = i; docDay[i].set(day, p); }
  function unplace(day, p) { const i = assign[day - 1][p]; if (i >= 0) { docDay[i].delete(day); assign[day - 1][p] = -1; } return i; }

  // Cena jedného lekára
  function docCost(i) {
    const n = docDay[i].size;
    const tgt = targetOf[i];
    let c = W.target * (n - tgt) * (n - tgt);
    if (n > tgt) c += W.overTarget * (n - tgt);
    const ds = [...prevByDoc[i].map((x) => x.day), ...docDay[i].keys()].sort((a, b) => a - b);
    let we = 0;
    for (const d of docDay[i].keys()) if (isWe[d - 1]) we++;
    const exp = n * weRatio[i];
    c += W.weekend * (we - exp) * (we - exp);
    for (let k = 1; k < ds.length; k++) {
      const g = ds[k] - ds[k - 1];
      if (g === 1) c += W.gap1; else if (g === 2) c += W.gap2; else if (g === 3) c += W.gap3;
      // sobota + nedeľa toho istého víkendu
      if (g === 1 && ds[k] >= 1 && days[ds[k] - 1].dow === 0) c += W.sameWeekend;
    }
    return c;
  }

  // 1) Ručne zamknuté bunky
  for (const [key, docId] of Object.entries(input.locked || {})) {
    const [dStr, posId] = key.split('|');
    const day = +dStr, p = posIndex.get(posId), i = docIndex.get(docId);
    if (p === undefined || i === undefined || day < 1 || day > D) continue;
    if (assign[day - 1][p] !== -1) continue;
    place(i, day, p); locked[day - 1][p] = true;
  }

  // 2) Priania "chce slúžiť"
  const wantResults = [];
  for (const w of wants) {
    if (w.day < 1 || w.day > D) continue;
    if (docDay[w.doc].has(w.day)) { wantResults.push({ ...w, ok: true }); continue; }
    let cands = w.pos ? w.pos.map((id) => posIndex.get(id)).filter((x) => x !== undefined) : [...eligible[w.doc]];
    cands = cands.filter((p) => assign[w.day - 1][p] === -1 && canAssign(w.doc, w.day, p));
    // uprednostni pozíciu s najmenej kandidátmi
    cands.sort((a, b) => countCands(w.day, a) - countCands(w.day, b));
    if (cands.length) {
      place(w.doc, w.day, cands[0]); locked[w.day - 1][cands[0]] = true;
      wantResults.push({ ...w, ok: true, pos: [P[cands[0]].id] });
    } else {
      const notEligible = w.pos && w.pos.every((id) => !eligible[w.doc].has(posIndex.get(id)));
      wantResults.push({ ...w, ok: false, reason: notEligible ? 'tuto pozici nemá v seznamu povolených' : 'ten den to nejde (obsazeno / odpočinek po službě)' });
    }
  }
  function countCands(day, p) { let c = 0; for (let i = 0; i < N; i++) if (canAssign(i, day, p)) c++; return c; }

  const baseAssign = assign.map((r) => r.slice());

  const slots = [];
  for (let t = 1; t <= D; t++) for (let p = 0; p < P.length; p++) if (slotActive[t - 1][p] && !locked[t - 1][p]) slots.push([t, p]);

  function resetToBase() {
    for (let i = 0; i < N; i++) docDay[i].clear();
    for (let t = 1; t <= D; t++) for (let p = 0; p < P.length; p++) {
      assign[t - 1][p] = -1;
      if (baseAssign[t - 1][p] >= 0) place(baseAssign[t - 1][p], t, p);
    }
  }

  // 3) Greedy: vždy najťažší slot (najmenej kandidátov)
  function greedy() {
    const open = new Set(slots.map((s, k) => k));
    while (open.size) {
      let best = null, bestCands = null;
      for (const k of open) {
        const [t, p] = slots[k];
        const cands = [];
        for (let i = 0; i < N; i++) if (canAssign(i, t, p)) cands.push(i);
        if (!best || cands.length < bestCands.length) { best = k; bestCands = cands; if (!cands.length) break; }
      }
      open.delete(best);
      const [t, p] = slots[best];
      if (!bestCands.length) continue;
      let bi = -1, bc = Infinity;
      for (const i of bestCands) {
        const before = docCost(i);
        place(i, t, p);
        const delta = docCost(i) - before + rand() * 8;
        unplace(t, p);
        if (delta < bc) { bc = delta; bi = i; }
      }
      place(bi, t, p);
    }
  }

  function totalCost() {
    let c = 0;
    for (let i = 0; i < N; i++) c += docCost(i);
    for (const [t, p] of slots) if (assign[t - 1][p] < 0) c += W.unfilled;
    return c;
  }

  // 4) Lokálne vylepšovanie (simulované žíhanie)
  function improve(iters) {
    const costs = docs.map((_, i) => docCost(i));
    let T = 30;
    const cool = Math.pow(0.05 / T, 1 / iters);
    for (let it = 0; it < iters; it++, T *= cool) {
      const [t, p] = slots[(rand() * slots.length) | 0];
      const cur = assign[t - 1][p];
      if (rand() < 0.5) {
        // presun: slot dostane iného lekára
        const i = (rand() * N) | 0;
        if (i === cur) continue;
        if (cur >= 0) unplace(t, p);
        if (!canAssign(i, t, p)) { if (cur >= 0) place(cur, t, p); continue; }
        place(i, t, p);
        const ci = docCost(i), cc = cur >= 0 ? docCost(cur) : 0;
        const delta = (ci - costs[i]) + (cur >= 0 ? cc - costs[cur] : -W.unfilled);
        if (delta <= 0 || rand() < Math.exp(-delta / T)) { costs[i] = ci; if (cur >= 0) costs[cur] = cc; }
        else { unplace(t, p); if (cur >= 0) place(cur, t, p); }
      } else {
        // výmena dvoch slotov
        const [t2, p2] = slots[(rand() * slots.length) | 0];
        const other = assign[t2 - 1][p2];
        if (cur < 0 || other < 0 || cur === other) continue;
        unplace(t, p); unplace(t2, p2);
        const ok1 = canAssign(other, t, p);
        if (ok1) place(other, t, p);
        const ok2 = ok1 && canAssign(cur, t2, p2);
        if (!ok2) { if (ok1) unplace(t, p); place(cur, t, p); place(other, t2, p2); continue; }
        place(cur, t2, p2);
        const c1 = docCost(cur), c2 = docCost(other);
        const delta = c1 - costs[cur] + c2 - costs[other];
        if (delta <= 0 || rand() < Math.exp(-delta / T)) { costs[cur] = c1; costs[other] = c2; }
        else { unplace(t, p); unplace(t2, p2); place(cur, t, p); place(other, t2, p2); }
      }
    }
  }

  const restarts = input.restarts ?? 4;
  const iterations = input.iterations ?? 150000;
  let best = null, bestCost = Infinity;
  for (let r = 0; r < restarts; r++) {
    resetToBase();
    greedy();
    improve(iterations);
    const c = totalCost();
    if (c < bestCost) { bestCost = c; best = assign.map((row) => row.slice()); }
  }
  // obnov najlepší stav
  for (let i = 0; i < N; i++) docDay[i].clear();
  for (let t = 1; t <= D; t++) for (let p = 0; p < P.length; p++) {
    assign[t - 1][p] = -1;
    if (best[t - 1][p] >= 0) place(best[t - 1][p], t, p);
  }

  // Výsledok
  const unfilled = [];
  for (const [t, p] of slots) if (assign[t - 1][p] < 0) unfilled.push({ day: t, pos: P[p].id });
  for (const u of unfilled) warnings.push(`Neobsazeno: ${u.day}. – ${P[posIndex.get(u.pos)].label} (nikdo volný nesplňuje pravidla)`);
  for (const w of wantResults) if (!w.ok) warnings.push(`Nesplněné přání: ${docs[w.doc].name} chtěl(a) ${w.day}.${w.pos ? ' (' + w.pos.join('/') + ')' : ''}${w.reason ? ' – ' + w.reason : ''}`);

  const stats = docs.map((doc, i) => {
    let we = 0;
    let hours = 0;
    for (const [d, p] of docDay[i]) { if (isWe[d - 1]) we++; hours += times[p].hours; }
    return { id: doc.id, name: doc.name, count: docDay[i].size, target: targetOf[i], weekends: we, hours };
  });

  return {
    grid: assign.map((row) => row.map((i) => (i >= 0 ? docs[i].id : null))),
    cost: Math.round(bestCost),
    warnings, stats, unfilled, wants: wantResults.map((w) => ({ doctorId: docs[w.doc].id, day: w.day, ok: w.ok, pos: w.pos })),
  };
}

/** Kontrola ručne upraveného rozpisu – vráti zoznam porušení pravidiel. */
export function validate(input, grid) {
  const P = input.positions, days = input.days;
  const byId = new Map(input.doctors.map((d) => [d.id, d]));
  const issues = [];
  const perDoc = new Map();
  grid.forEach((row, t) => row.forEach((id, p) => {
    if (!id) return;
    const day = t + 1, doc = byId.get(id), pos = P[p];
    const name = doc ? doc.name : id;
    if (doc && !(doc.positions || []).includes(pos.id)) issues.push({ day, pos: pos.id, msg: `${name} nemá povolenou pozici ${pos.label}` });
    if (pos.workdaysOnly && !days[t].workday) issues.push({ day, pos: pos.id, msg: `${pos.label} se v tento den neslouží` });
    const req = (input.requests || {})[id];
    if (req && (req.off || []).map(Number).includes(day)) issues.push({ day, pos: pos.id, msg: `${name} si ${day}. vyškrtl(a)` });
    if (req && (req.ban || []).some((b) => +b.day === day && [].concat(b.pos).includes(pos.id))) issues.push({ day, pos: pos.id, msg: `${name} nechce ${day}. sloužit na ${pos.label}` });
    if (!perDoc.has(id)) perDoc.set(id, []);
    perDoc.get(id).push({ day, p });
  }));
  for (const pr of input.prev || []) {
    if (!perDoc.has(pr.doctorId)) continue;
    const p = P.findIndex((x) => x.id === pr.posId);
    perDoc.get(pr.doctorId).push({ day: +pr.day, p, prev: true });
  }
  for (const [id, list] of perDoc) {
    const name = byId.get(id)?.name || id;
    list.sort((a, b) => a.day - b.day);
    for (let k = 1; k < list.length; k++) {
      const a = list[k - 1], b = list[k];
      if (a.day === b.day && !b.prev) issues.push({ day: b.day, pos: P[b.p].id, msg: `${name} má 2 služby ve stejný den` });
      if (b.day - a.day === 1 && !b.prev) {
        const ta = a.p >= 0 ? shiftTimes(P[a.p]) : { end: 420 + 1440 };
        const rest = (1440 + shiftTimes(P[b.p]).start - ta.end) / 60;
        if (rest < (input.minRestHours ?? DEFAULT_MIN_REST_HOURS)) issues.push({ day: b.day, pos: P[b.p].id, msg: `${name} má jen ${Math.max(0, rest)} h odpočinku po předchozí službě` });
      }
    }
    const doc = byId.get(id);
    const n = list.filter((x) => !x.prev).length;
    if (doc && doc.max != null && doc.max !== '' && n > +doc.max) issues.push({ day: null, pos: null, msg: `${name} má ${n} služeb (max ${doc.max})` });
  }
  return issues;
}
