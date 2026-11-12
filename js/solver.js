// Algoritmus rozpisu služieb.
//
// Poradie dôležitosti:
//  1. Tvrdé pravidlá (nikdy sa neporušia):
//     - lekár slúži len na povolených pozíciách, max. 1 služba denne
//     - odpočinok medzi službami aspoň minRestHours; po službe cez noc celý ďalší deň voľno (afterNight = 'hard')
//     - vyškrtnuté dni a „nie na pozícii" (ban) z požiadaviek lekára
//     - Max lekára, zvolené maximum OUP (oupMax), pevný počet „len JIP" (fixedGroup)
//  2. Priania „chcem slúžiť" – umiestnia sa prvé, pred ostatné mäkké pravidlá, ale najviac do počtu služieb lekára.
//  3. Mäkké pravidlá (optimalizujú sa):
//     - všetky služby obsadené
//     - 24 h služby a tečky zvlášť podľa obvyklého počtu lekára (planTargets)
//     - OUP: každý aspoň OUP_LIMIT.min; kto si zvolil viac, dostane prednostne ďalšie
//     - minimum na pozícii (positionMin, napr. 2A aspoň 2× pre lekárov bez 1A)
//     - víkendy a sviatky (len 24 h, piatok = ½ víkendu): aspoň 1 víkend mesačne, vyrovnanie za 12 mesiacov
//     - služby rozložené v čase; deň po službe cez noc len výnimočne (afterNight = 'soft')

import { shiftTimes, DEFAULT_MIN_REST_HOURS, afterNightMode, MIX_PAIRS, JUNIOR_FIRST, OUP_LIMIT, FIXED_GROUP, POSITION_MIN, CATEGORIES, FAIRNESS, FAIR_BASE_MONTHS, weekendWeight } from './config.js';

export const DEFAULT_WEIGHTS = {
  unfilled: 1000,  // neobsadená služba
  target: 40,      // lekár len na JIP: * (počet - pevný počet)^2
  even: 60,        // * (24h služby - cieľ)^2
  evenRange: 250,  // za každú 24h službu mimo rozsahu ⌊cieľ⌋–⌈cieľ⌉
  tEven: 30,       // * (tečky - cieľ)^2; cieľ = rovnaká záťaž (24h + tečky) v poole, mínus 24h služby lekára
  tRange: 100,     // za každú tečku mimo rozsahu ⌊cieľ⌋–⌈cieľ⌉
  oupWant: 25,     // za každú OUP chýbajúcu do počtu, ktorý si lekár zvolil
  oupExtra: 30,    // * (OUP nad minimum)^2 u lekárov, ktorí si viac nezvolili (pool 1A/plast a 2A/tečky)
  oupExtraJip: 200, // to isté u ostatných (lekári s JIP) – OUP navyše dostanú len výnimočne
  mix: 20,         // JIP1/JIP2, tečka 1/2, OUP deň/noc nerovnomerne (napr. 2× JIP1 namiesto 1+1), * (rozdiel/2)^2
  junior: 6,       // za každú tečku / 2A u zkúsenejšieho lekára (× senirita 0–1) – pri nedostatku ich dostanú menej skúsení
  exactMissing: 500, // tento měsíc chybí služba na pozici, kterou má lékař mít přesně (req.exact)
  emergency: 600,  // služba na pozícii „len v núdzi“ (napr. 1A u Bartošíka) – menej ako neobsadená služba
  together: 8,     // tí istí dvaja lekári spolu na 24h službách v jeden deň opakovane: * (počet spoločných dní - 1)^2
  weFair: 40,      // * (víkendy 24h za 12 mes. - férový podiel)^2
  holFair: 120,    // * (sviatky 24h za 12 mes. - férový podiel)^2
  holSame: 150,    // 24h na ten istý sviatok ako vlani (Vianoce, Nový rok …) – striedanie
  weMin: 800,       // lekár bez víkendovej 24h služby v mesiaci
  weMulti: 60,     // * (víkendy v mesiaci - 1)^2 – rozložiť víkendy na čo najviac ľudí
  gap1: 30,        // služba deň po dennej službe
  gap2: 6,         // služby ob deň
  gap3: 1.5,
  sameWeekend: 15, // 2 služby v jednom víkende (so+ne)
  oupMin: 150,     // za každú chýbajúcu OUP službu do minima (ak si lekár zvolil počet)
  posMinMissing: 300, // za každú chýbajúcu službu do minima na pozícii (positionMin)
  fixedMissing: 800, // lekár len na JIP: za každú službu chýbajúcu do presného počtu
  afterNight: 400, // výnimka: služba v deň, keď končí služba cez noc (len pri afterNight = 'soft')
};

/** Pevný počet služieb pre lekára „len na JIP" (min. s jeho Max), inak null. */
export function fixedCountOf(doc, fixedGroup = FIXED_GROUP) {
  const ps = doc.positions || [];
  if (!fixedGroup || !(fixedGroup.count > 0) || !ps.length || !ps.every((id) => (fixedGroup.positions || []).includes(id))) return null;
  return doc.max != null && doc.max !== '' ? Math.min(+fixedGroup.count, +doc.max) : +fixedGroup.count;
}
/** Platí pre lekára pravidlo „minimum na pozícii"? Vráti minimum alebo null. */
/** Pravidlá „minimum na pozícii“ ako zoznam (prijme jedno pravidlo, zoznam alebo null), len zapnuté. */
export function positionMinRules(x = POSITION_MIN) {
  return [].concat(x || []).filter((r) => r && r.position && +r.min > 0);
}
/** Minimum pre lekára podľa jedného pravidla, alebo null. */
export function positionMinOf(doc, positionMin) {
  const ps = doc.positions || [];
  if (!positionMin || !(positionMin.min > 0) || !ps.includes(positionMin.position)) return null;
  return (positionMin.except || []).some((x) => ps.includes(x)) ? null : +positionMin.min;
}

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
 *   closed: [{ day, pos }] – pozice ten den neslouží (např. plastika o svátcích), volitelné,
 *   minRestHours: minimálny odpočinok medzi službami (predvolene 11),
 *   afterNight: 'hard' | 'soft' | 'off' – deň po službe cez noc (pozri config.js),
 *   fairHistory: { [doctorId]: { n24, we, hol, noWe } } – 24 h služby / víkendové / sviatočné / mesiace bez víkendu za predchádzajúcich 12 mesiacov,
 *   month: číslo měsíce (1–12) – pro střídání svátků rok od roku (volitelné; den může mít vlastní `month`),
 *   positionMin: [{ position, min, except:[id] }] – minimá služieb na pozíciách (jedno pravidlo alebo zoznam; null = vypnuté),
 *   fixedGroup: { positions:[id], count } – lekári len na týchto pozíciách majú presne count služieb (null = vypnuté),
 *   doctors: [{id, name, positions:[posId], target, max}],
 *   requests: { [doctorId]: { off:[day], want:[{day, pos?: id|[id]}], ban:[{day, pos:[id]}], oupMax?: number } },
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
  // úpravy na tento měsíc z požadavků: req.max = nejvýš služeb tento měsíc (přepíše Max lékaře)
  const docs = input.doctors.map((d) => { const m = Number((input.requests || {})[d.id]?.max); return m > 0 ? { ...d, max: m } : d; });
  const N = docs.length;
  const docIndex = new Map(docs.map((d, i) => [d.id, i]));
  const posIndex = new Map(P.map((p, i) => [p.id, i]));
  const rand = mulberry32(input.seed ?? 12345);
  const warnings = [];

  // Sloty: day 1..D, pozícia aktívna v daný deň
  const isClosed = closedSet(input.closed);
  const slotActive = days.map((d, t) => P.map((p) => !(p.workdaysOnly && !d.workday) && !isClosed(t + 1, p.id)));

  // běžné pozice + pozice „jen v nouzi“ (doc.emergency, např. 1A) – ty jen když by služba jinak zůstala neobsazená
  const regular = docs.map((doc) => new Set((doc.positions || []).map((id) => posIndex.get(id)).filter((x) => x !== undefined)));
  const emerg = docs.map((doc, i) => new Set((doc.emergency || []).map((id) => posIndex.get(id)).filter((x) => x !== undefined && !regular[i].has(x))));
  const eligible = docs.map((_, i) => new Set([...regular[i], ...emerg[i]]));
  const off = docs.map(() => new Set());
  const ban = docs.map(() => new Set()); // "den|posIdx"
  const wants = [];
  for (const [id, req] of Object.entries(input.requests || {})) {
    const i = docIndex.get(id);
    if (i === undefined) continue;
    (req.off || []).forEach((d) => off[i].add(+d));
    (req.want || []).forEach((w) => wants.push({ doc: i, day: +w.day, pos: w.pos == null ? null : [].concat(w.pos), ...(w.group ? { group: w.group } : {}) }));
    (req.ban || []).forEach((b) => [].concat(b.pos).forEach((id) => { const p = posIndex.get(id); if (p !== undefined) ban[i].add(`${+b.day}|${p}`); }));
  }
  // req.exact = { plast: 1 } – tento měsíc přesně tolik služeb na pozici (nejvýš tvrdě, méně = velká penalizace)
  const exactOf = docs.map((d) => new Map(Object.entries((input.requests || {})[d.id]?.exact || {})
    .map(([id, n]) => [posIndex.get(id), +n]).filter(([p, n]) => p !== undefined && n >= 0)));
  // přání sa plnia v poradí zoznamu lekárov = podľa skúsenosti (skúsenejší má prednosť), v rámci lekára podľa dňa
  wants.sort((a, b) => a.doc - b.doc || a.day - b.day);
  // Lekári len na JIP: presný počet služieb (max tvrdo, cieľ = počet)
  const fg = input.fixedGroup === undefined ? FIXED_GROUP : input.fixedGroup;
  const fixedOf = docs.map((d) => fixedCountOf(d, fg));
  // Minimum na pozícii (napr. 2A aspoň 2× pre lekárov, ktorí nemajú 1A)
  const pm = input.positionMin === undefined ? POSITION_MIN : input.positionMin;
  const pmRules = positionMinRules(pm).map((r) => ({ ...r, idx: posIndex.get(r.position) })).filter((r) => r.idx !== undefined);
  // pre každého lekára zoznam { idx, min }
  const pmOf = docs.map((d) => pmRules.map((r) => ({ idx: r.idx, min: positionMinOf(d, r) })).filter((x) => x.min != null));
  const posCount = (i, idx) => { let c = 0; for (const p of docDay[i].values()) if (p === idx) c++; return c; };
  // Max = všetky služby; lekár len na JIP: pevný počet 24h služieb (OUP v núdzi / na žiadosť sa počíta zvlášť)
  const maxOf = docs.map((d) => (d.max != null && d.max !== '' ? +d.max : Infinity));
  // OUP: počet zvolený lekárom = maximum, minimum OUP_LIMIT.min
  const oupSet = new Set(OUP_LIMIT.positions.map((id) => posIndex.get(id)).filter((x) => x !== undefined));
  const oupMax = docs.map((d) => {
    const v = Number((input.requests || {})[d.id]?.oupMax);
    return Number.isFinite(v) && v > 0 ? Math.max(OUP_LIMIT.min, Math.round(v)) : null;
  });
  const oupCount = (i) => { let c = 0; for (const p of docDay[i].values()) if (oupSet.has(p)) c++; return c; };
  const catSet = Object.fromEntries(Object.entries(CATEGORIES).map(([k, c]) => [k, new Set(c.positions.map((id) => posIndex.get(id)).filter((x) => x !== undefined))]));
  const catCount = (i, k) => { let c = 0; for (const p of docDay[i].values()) if (catSet[k].has(p)) c++; return c; };
  const oupEligible = docs.map((d) => (d.positions || []).some((id) => OUP_LIMIT.positions.includes(id)));
  const has = (d, ids) => (d.positions || []).some((id) => (ids || []).includes(id));
  const oupExtraW = docs.map((d) => (has(d, OUP_LIMIT.extraFrom) && !has(d, OUP_LIMIT.extraNot) ? W.oupExtra : W.oupExtraJip));
  // Dvojice pozícií (JIP1/2, tečka 1/2, OUP deň/noc): kto môže obe, má ich mať čo najrovnomernejšie
  const mixPairs = MIX_PAIRS.map((pair) => pair.map((id) => posIndex.get(id))).filter(([a, b]) => a !== undefined && b !== undefined);
  const mixOf = docs.map((d, i) => mixPairs.filter(([a, b]) => regular[i].has(a) && regular[i].has(b)));
  // senirita podľa poradia v zozname (prvý = najskúsenejší): 1 … 0
  const senior = docs.map((_, i) => (N > 1 ? 1 - i / (N - 1) : 0));
  const juniorSet = new Set(JUNIOR_FIRST.map((id) => posIndex.get(id)).filter((x) => x !== undefined));

  // Cieľové počty 24h služieb a tečiek pre každého lekára
  const plan = planTargets({ days, positions: P, doctors: docs, fixedGroup: fg, positionMin: pm, closed: input.closed });
  const tgt24 = docs.map((d) => plan[d.id]?.h24 || null);
  const tgtT = docs.map((d) => plan[d.id]?.tecky || null);

  // Spravodlivosť víkendov a sviatkov (24 h): história + tento mesiac
  const fh = input.fairHistory || {};
  const hist = docs.map((d) => ({ n24: +(fh[d.id]?.n24 || 0), we: +(fh[d.id]?.we || 0), hol: +(fh[d.id]?.hol || 0), noWe: +(fh[d.id]?.noWe || 0) }));
  // sviatky, na ktoré mal lekár 24h vlani: tento mesiac ich má radšej niekto iný (podľa dňa v mesiaci)
  const holMonth = input.month ?? null;
  const holSameDays = docs.map((d) => new Set(fh[d.id]?.hd || []));
  const holKey = days.map((d) => (d.holiday && (d.month ?? holMonth) != null ? `${d.month ?? holMonth}-${d.day}` : null));
  let slots24 = 0, we24 = 0, hol24 = 0;
  for (let t = 0; t < D; t++) for (const p of catSet.h24) if (slotActive[t][p]) { slots24++; we24 += weekendWeight(days[t]); if (days[t].holiday) hol24++; }
  const sumH = hist.reduce((a, h) => ({ n24: a.n24 + h.n24, we: a.we + h.we, hol: a.hol + h.hol }), { n24: 0, we: 0, hol: 0 });
  const gWe = (sumH.we + we24) / Math.max(1, sumH.n24 + slots24);
  const gHol = (sumH.hol + hol24) / Math.max(1, sumH.n24 + slots24);
  const in24 = docs.map((d) => (d.positions || []).some((id) => CATEGORIES.h24.positions.includes(id)));
  // má mať tento mesiac aspoň 1 službu 24 h (pravidlo víkendu sa ho týka bez ohľadu na to, koľko ich nakoniec dostane)
  const expects24 = docs.map((d, i) => in24[i] && ((fixedOf[i] ?? 0) > 0 || (tgt24[i]?.hi ?? 0) > 0) && maxOf[i] > 0);
  /** víkendové a sviatočné 24 h služby lekára v tomto mesiaci */
  const fairNow = (i) => {
    let n = 0, we = 0, hol = 0;
    for (const [d, p] of docDay[i]) if (catSet.h24.has(p)) { n++; we += weekendWeight(days[d - 1]); if (days[d - 1].holiday) hol++; }
    return { n, we, hol };
  };

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

  // Časy služieb v minútach; -1 = neznáma pozícia z minulého mesiaca (berie sa ako 24 h od 7:30)
  const times = P.map(shiftTimes);
  const timeOf = (p) => (p >= 0 ? times[p] : { start: 450, end: 450 + 1440 });
  const minRest = (input.minRestHours ?? DEFAULT_MIN_REST_HOURS) * 60;
  const anMode = afterNightMode(input);
  const nextDayOff = anMode === 'hard';
  /** pozícia služby lekára v daný deň (aj z minulého mesiaca) alebo undefined */
  const serviceAt = (i, day) => {
    if (day >= 1 && day <= D) return docDay[i].get(day);
    if (day <= 0) { const x = prevByDoc[i].find((y) => y.day === day); return x ? x.p : undefined; }
    return undefined;
  };
  /** dodrží sa odpočinok voči službe deň pred a deň po? */
  function restOk(i, day, p) {
    const before = serviceAt(i, day - 1);
    if (before !== undefined) {
      if (nextDayOff && timeOf(before).end > 1440) return false;
      if (1440 + times[p].start - timeOf(before).end < minRest) return false;
    }
    const after = serviceAt(i, day + 1);
    if (after !== undefined) {
      if (nextDayOff && times[p].end > 1440) return false;
      if (1440 + timeOf(after).start - times[p].end < minRest) return false;
    }
    return true;
  }

  function canAssign(i, day, p) {
    if (!eligible[i].has(p)) return false;
    if (!slotActive[day - 1][p]) return false;
    if (off[i].has(day)) return false;
    if (ban[i].has(`${day}|${p}`)) return false;
    if (docDay[i].has(day)) return false;
    if (!restOk(i, day, p)) return false;
    if (docDay[i].size >= maxOf[i]) return false;
    if (fixedOf[i] != null && catSet.h24.has(p) && catCount(i, 'h24') >= fixedOf[i]) return false;
    if (exactOf[i].has(p) && posCount(i, p) >= exactOf[i].get(p)) return false;
    if (oupMax[i] != null && oupSet.has(p) && oupCount(i) >= oupMax[i]) return false;
    return true;
  }
  // Spoločné 24h služby dvojíc lekárov (aby nesložili stále tí istí spolu) – počíta sa priebežne pri place/unplace
  const together = new Uint8Array(N * N);
  let pairCost = 0;
  const tf = (k) => (k > 1 ? W.together * (k - 1) * (k - 1) : 0);
  function pairs(i, day, p, dir) {
    if (!catSet.h24.has(p) || !W.together) return;
    const row = assign[day - 1];
    for (const q of catSet.h24) {
      const j = row[q];
      if (q === p || j < 0 || j === i) continue;
      const k = together[i * N + j];
      pairCost += tf(k + dir) - tf(k);
      together[i * N + j] = together[j * N + i] = k + dir;
    }
  }
  function place(i, day, p) { pairs(i, day, p, 1); assign[day - 1][p] = i; docDay[i].set(day, p); }
  function unplace(day, p) { const i = assign[day - 1][p]; if (i >= 0) { assign[day - 1][p] = -1; pairs(i, day, p, -1); docDay[i].delete(day); } return i; }

  // Cena jedného lekára
  function docCost(i) {
    const n = docDay[i].size;
    let c = 0;
    // 24h služby
    const m = catCount(i, 'h24');
    if (fixedOf[i] != null) {
      c += W.target * (m - fixedOf[i]) * (m - fixedOf[i]);
      if (m < fixedOf[i]) c += W.fixedMissing * (fixedOf[i] - m);
    } else if (tgt24[i]) {
      const t = tgt24[i];
      c += W.even * (m - t.avg) * (m - t.avg) + W.evenRange * (Math.max(0, t.lo - m) + Math.max(0, m - t.hi));
    }
    // tečky
    if (tgtT[i]) {
      const k = catCount(i, 'tecky'), t = tgtT[i];
      // cieľ tečiek podľa skutočných 24h služieb v mesiaci: kto má o 24h viac, má o tečku menej (nie pod minimum)
      const goal = t.load != null ? Math.max(t.min || 0, t.load - m) : t.avg;
      if (t.min && k < t.min) c += W.posMinMissing * (t.min - k);
      c += W.tEven * (k - goal) * (k - goal) + W.tRange * (Math.max(0, t.lo - k) + Math.max(0, k - t.hi));
    }
    for (const r of pmOf[i]) { const k = posCount(i, r.idx); if (k < r.min) c += W.posMinMissing * (r.min - k); }
    // OUP: minimum pre každého, kto OUP slúži; zvolený počet = maximum (tvrdo) a prednosť pri ďalších OUP
    if (oupEligible[i]) {
      const o = oupCount(i);
      const minO = oupMax[i] != null ? Math.min(OUP_LIMIT.min, oupMax[i]) : OUP_LIMIT.min;
      if (o < minO) c += W.oupMin * (minO - o);
      if (oupMax[i] != null) { if (o < oupMax[i]) c += W.oupWant * (oupMax[i] - o); }
      else if (o > minO) c += oupExtraW[i] * (o - minO) * (o - minO);
    }
    if (emerg[i].size) for (const p of docDay[i].values()) if (emerg[i].has(p)) c += W.emergency;
    for (const [p, n] of exactOf[i]) { const k = posCount(i, p); if (k < n) c += W.exactMissing * (n - k); }
    if (W.junior && senior[i] > 0) { let k = 0; for (const p of docDay[i].values()) if (juniorSet.has(p)) k++; c += W.junior * senior[i] * k; }
    for (const [a, b] of mixOf[i]) {
      let na = 0, nb = 0;
      for (const p of docDay[i].values()) { if (p === a) na++; else if (p === b) nb++; }
      const ex = Math.abs(na - nb) - ((na + nb) % 2); // 0 = vyrovnané (1+1, 2+1, …)
      if (ex > 0) c += W.mix * (ex / 2) * (ex / 2);
    }
    // víkendy a sviatky (24 h) – za 12 mesiacov pomerne k počtu 24 h služieb
    if (in24[i]) {
      const f = fairNow(i), h = hist[i];
      const nC = h.n24 + f.n;
      const dWe = h.we + f.we - gWe * nC, dHol = h.hol + f.hol - gHol * nC;
      c += W.weFair * dWe * dWe + W.holFair * dHol * dHol;
      // bez víkendu: čím viac mesiacov už bez víkendu bol, tým väčšia prednosť (striedanie)
      // (piatok = 0,5 → kto nemá sobotu/nedeľu, aspoň piatok zmierni chýbajúci víkend)
      if (expects24[i] && f.we < FAIRNESS.weekendMin) c += W.weMin * (1 + 2 * h.noWe) * (FAIRNESS.weekendMin - f.we);
      if (f.we > 1) c += W.weMulti * (f.we - 1) * (f.we - 1);
      if (holSameDays[i].size) for (const [day, p] of docDay[i]) if (day > 0 && holKey[day - 1] && catSet.h24.has(p) && holSameDays[i].has(holKey[day - 1])) c += W.holSame;
    }
    const ds = [...prevByDoc[i].map((x) => x.day), ...docDay[i].keys()].sort((a, b) => a - b);
    if (anMode === 'soft') {
      for (const d of docDay[i].keys()) {
        const b = serviceAt(i, d - 1);
        if (b !== undefined && timeOf(b).end > 1440) c += W.afterNight;
      }
    }
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

  // 2) Priania "chce slúžiť" – majú prednosť pred ostatnými pravidlami (víkendy, sviatky, minimá…),
  //    s výnimkou počtu služieb: priania sa splnia najviac do počtu služieb lekára v danej kategórii.
  // OUP nemá kategóriu: jej maximum (zvolené lekárom) stráži canAssign
  const catOfPos = (p) => (catSet.h24.has(p) ? 'h24' : catSet.tecky.has(p) ? 'tecky' : null);
  const capOf = (i, cat) => (cat === 'h24' ? (fixedOf[i] ?? tgt24[i]?.hi ?? Infinity) : (tgtT[i]?.hi ?? Infinity));
  const capLabel = (i, cat) => (cat === 'h24' ? `${capOf(i, cat)}× 24h` : `${capOf(i, cat)}× tečka`);
  const wantResults = [];
  // „jeden z“: přání se stejnou skupinou (group) = lékař chce jen jeden z těch dnů; po splnění ostatní dny volno
  const groupDone = new Set();
  const wishAt = new Map(); // 'den|pozice' → { doc, cands } – místa obsazená přáním (pro případný přesun)
  for (const w of wants) {
    if (w.day < 1 || w.day > D) continue;
    const gk = w.group ? `${w.doc}|${w.group}` : null;
    if (gk && groupDone.has(gk)) { off[w.doc].add(w.day); wantResults.push({ ...w, ok: true, other: true }); continue; }
    if (docDay[w.doc].has(w.day)) { wantResults.push({ ...w, ok: true }); if (gk) groupDone.add(gk); continue; }
    // „chci / prosím službu“ bez pozice = služba (24h nebo OUP), ne tečka
    let cands = w.pos ? w.pos.map((id) => posIndex.get(id)).filter((x) => x !== undefined) : [...regular[w.doc]].filter((p) => !catSet.tecky.has(p));
    cands = cands.filter((p) => assign[w.day - 1][p] === -1 && canAssign(w.doc, w.day, p));
    const beforeCap = cands.slice();
    cands = cands.filter((p) => { const cat = catOfPos(p); return !cat || catCount(w.doc, cat) < capOf(w.doc, cat); });
    if (!cands.length && beforeCap.length) {
      const cat = catOfPos(beforeCap[0]);
      wantResults.push({ ...w, ok: false, reason: `už má plný počet služeb (${capLabel(w.doc, cat)}) – přání nad počet se nesplní` });
      continue;
    }
    // uprednostni pozíciu, na ktorej lekárovi chýba minimum (napr. lékař2 aspoň 1×), potom tú s najmenej kandidátmi
    const needs = (p) => (pmOf[w.doc].some((r) => r.idx === p && posCount(w.doc, p) < r.min) ? 0 : 1);
    // „prosím službu“ bez pozice: přednostně 24h, když to nejde, OUP noc, až potom OUP den
    const oupN = posIndex.get(OUP_LIMIT.positions[1]);
    const kind = (p) => (w.pos ? 0 : catSet.h24.has(p) ? 0 : p === oupN ? 1 : 2);
    cands.sort((a, b) => kind(a) - kind(b) || needs(a) - needs(b) || countCands(w.day, a) - countCands(w.day, b));
    // když je volné místo obsazené dřívějším přáním někoho jiného, který může jinam, přesunout ho
    if (!cands.length) {
      const mine = w.pos ? w.pos.map((id) => posIndex.get(id)).filter((x) => x !== undefined) : [...regular[w.doc]].filter((p) => !catSet.tecky.has(p));
      for (const p of mine) {
        const o = wishAt.get(`${w.day}|${p}`);
        if (o == null) continue;
        unplace(w.day, p); locked[w.day - 1][p] = false;
        if (!canAssign(w.doc, w.day, p)) { place(o.doc, w.day, p); locked[w.day - 1][p] = true; continue; }
        place(w.doc, w.day, p);
        const pref = (q) => (catSet.h24.has(q) ? 0 : q === posIndex.get(OUP_LIMIT.positions[1]) ? 1 : 2);
        const alt = [...o.cands].sort((x, y) => pref(x) - pref(y)).find((q) => q !== p && assign[w.day - 1][q] === -1 && canAssign(o.doc, w.day, q));
        if (alt === undefined) { unplace(w.day, p); place(o.doc, w.day, p); locked[w.day - 1][p] = true; continue; }
        place(o.doc, w.day, alt); locked[w.day - 1][alt] = true; locked[w.day - 1][p] = true;
        wishAt.delete(`${w.day}|${p}`); wishAt.set(`${w.day}|${alt}`, o);
        const r = wantResults.find((x) => x.doc === o.doc && x.day === w.day); if (r) r.pos = [P[alt].id];
        cands = [p]; unplace(w.day, p); // znovu umístí kód níže
        break;
      }
    }
    if (cands.length) {
      place(w.doc, w.day, cands[0]); locked[w.day - 1][cands[0]] = true;
      wantResults.push({ ...w, ok: true, pos: [P[cands[0]].id] });
      wishAt.set(`${w.day}|${cands[0]}`, { doc: w.doc, cands: w.pos ? w.pos.map((id) => posIndex.get(id)).filter((x) => x !== undefined) : [...regular[w.doc]].filter((q) => !catSet.tecky.has(q)) });
      if (gk) groupDone.add(gk);
    } else {
      const notEligible = w.pos && w.pos.every((id) => !eligible[w.doc].has(posIndex.get(id)));
      wantResults.push({ ...w, ok: false, reason: notEligible ? 'tuto pozici nemá v seznamu povolených' : 'ten den to nejde (obsazeno / odpočinek po službě)' });
    }
  }
  // „přesně N× pozice“ (req.exact): chybějící služby na té pozici umístit hned po přáních – do dne,
  // kdy je na tu pozici nejvíc jiných kandidátů (tam chybět nebude)
  for (let i = 0; i < N; i++) for (const [p, n] of exactOf[i]) {
    while (posCount(i, p) < n) {
      const opts = [];
      for (let t = 1; t <= D; t++) if (assign[t - 1][p] === -1 && canAssign(i, t, p)) opts.push([t, countCands(t, p)]);
      if (!opts.length) break;
      opts.sort((a, b) => b[1] - a[1]);
      const [t] = opts[0];
      place(i, t, p); locked[t - 1][p] = true;
    }
  }
  function countCands(day, p) { let c = 0; for (let i = 0; i < N; i++) if (canAssign(i, day, p)) c++; return c; }

  const baseAssign = assign.map((r) => r.slice());

  const slots = [];
  for (let t = 1; t <= D; t++) for (let p = 0; p < P.length; p++) if (slotActive[t - 1][p] && !locked[t - 1][p]) slots.push([t, p]);

  // víkendové a všední 24h sloty – cílená výměna mezi nimi pomáhá rozdělit víkendy
  const weSlots = slots.filter(([t, p]) => catSet.h24.has(p) && days[t - 1].weekend);
  const wdSlots = slots.filter(([t, p]) => catSet.h24.has(p) && !days[t - 1].weekend);

  function resetToBase() {
    for (let i = 0; i < N; i++) docDay[i].clear();
    together.fill(0); pairCost = 0;
    for (const row of assign) row.fill(-1);
    for (let t = 1; t <= D; t++) for (let p = 0; p < P.length; p++) if (baseAssign[t - 1][p] >= 0) place(baseAssign[t - 1][p], t, p);
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
        const before = docCost(i), pc = pairCost;
        place(i, t, p);
        const delta = docCost(i) - before + pairCost - pc + rand() * 8;
        unplace(t, p);
        if (delta < bc) { bc = delta; bi = i; }
      }
      place(bi, t, p);
    }
  }

  function totalCost() {
    let c = pairCost;
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
      const directed = weSlots.length && wdSlots.length && rand() < 0.15;
      const [t, p] = directed ? weSlots[(rand() * weSlots.length) | 0] : slots[(rand() * slots.length) | 0];
      const cur = assign[t - 1][p];
      const pc0 = pairCost;
      if (!directed && rand() < 0.5) {
        // presun: slot dostane iného lekára
        const i = (rand() * N) | 0;
        if (i === cur) continue;
        if (cur >= 0) unplace(t, p);
        if (!canAssign(i, t, p)) { if (cur >= 0) place(cur, t, p); continue; }
        place(i, t, p);
        const ci = docCost(i), cc = cur >= 0 ? docCost(cur) : 0;
        const delta = (ci - costs[i]) + (cur >= 0 ? cc - costs[cur] : -W.unfilled) + pairCost - pc0;
        if (delta <= 0 || rand() < Math.exp(-delta / T)) { costs[i] = ci; if (cur >= 0) costs[cur] = cc; }
        else { unplace(t, p); if (cur >= 0) place(cur, t, p); }
      } else {
        // výmena dvoch slotov
        // cielene: víkend ↔ všedný deň (rozdelenie víkendov), alebo výmena v ten istý deň (JIP1↔JIP2, tečka 1↔2 …)
        const same = !directed && rand() < 0.3;
        const [t2, p2] = directed ? wdSlots[(rand() * wdSlots.length) | 0] : same ? [t, (rand() * P.length) | 0] : slots[(rand() * slots.length) | 0];
        if (same && (p2 === p || !slotActive[t - 1][p2] || locked[t - 1][p2])) continue;
        const other = assign[t2 - 1][p2];
        if (cur < 0 || other < 0 || cur === other) continue;
        unplace(t, p); unplace(t2, p2);
        const ok1 = canAssign(other, t, p);
        if (ok1) place(other, t, p);
        const ok2 = ok1 && canAssign(cur, t2, p2);
        if (!ok2) { if (ok1) unplace(t, p); place(cur, t, p); place(other, t2, p2); continue; }
        place(cur, t2, p2);
        const c1 = docCost(cur), c2 = docCost(other);
        const delta = c1 - costs[cur] + c2 - costs[other] + pairCost - pc0;
        if (delta <= 0 || rand() < Math.exp(-delta / T)) { costs[cur] = c1; costs[other] = c2; }
        else { unplace(t, p); unplace(t2, p2); place(cur, t, p); place(other, t2, p2); }
      }
    }
  }

  // Oprava neobsazených služeb řetězem: lékař i vezme prázdnou službu a jednu svou jinou službu předá lékaři j
  // (náhodné hledání tohle najde jen zřídka – např. Bartošík vezme 11. lékař1, jeho 29. převezme Růžek).
  function repair() {
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      for (const [t, p] of slots) {
        if (assign[t - 1][p] >= 0) continue;
        let done = false;
        const before = totalCost();
        for (let i = 0; i < N && !done; i++) {
          if (!eligible[i].has(p) || off[i].has(t)) continue;
          for (const [t2, p2] of [...docDay[i]]) {
            if (t2 < 1 || t2 === t || locked[t2 - 1][p2]) continue;
            unplace(t2, p2);
            if (!canAssign(i, t, p)) { place(i, t2, p2); continue; }
            place(i, t, p);
            for (let j = 0; j < N && !done; j++) {
              if (j === i || !canAssign(j, t2, p2)) continue;
              place(j, t2, p2);
              if (totalCost() < before - 1e-9) done = true; else unplace(t2, p2);
            }
            if (done) break;
            unplace(t, p); place(i, t2, p2);
          }
        }
        if (done) changed = true;
      }
      if (!changed) break;
    }
    // „přesně N× pozice“ (req.exact): lékař i vezme tu pozici v jiný den a jednu svou službu předá dál
    for (let i = 0; i < N; i++) for (const [p, n] of exactOf[i]) {
      for (let tries = 0; tries < n && posCount(i, p) < n; tries++) {
        const before = totalCost();
        let done = false;
        for (let t = 1; t <= D && !done; t++) {
          if (!slotActive[t - 1][p] || locked[t - 1][p] || assign[t - 1][p] === i || off[i].has(t)) continue;
          const j0 = assign[t - 1][p];
          for (const [t2, p2] of [...docDay[i]]) {
            if (t2 < 1 || p2 === p || locked[t2 - 1][p2]) continue;
            if (j0 >= 0) unplace(t, p);
            unplace(t2, p2);
            if (!canAssign(i, t, p)) { place(i, t2, p2); if (j0 >= 0) place(j0, t, p); continue; }
            place(i, t, p);
            const order = j0 >= 0 ? [j0, ...Array.from({ length: N }, (_, k) => k).filter((k) => k !== j0)] : Array.from({ length: N }, (_, k) => k);
            for (const j of order) {
              if (j === i || !canAssign(j, t2, p2)) continue;
              place(j, t2, p2);
              if (totalCost() < before - 1e-9) { done = true; break; }
              unplace(t2, p2);
            }
            if (done) break;
            unplace(t, p); place(i, t2, p2); if (j0 >= 0) place(j0, t, p);
          }
        }
        if (!done) break;
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
    repair();
    const c = totalCost();
    if (c < bestCost) { bestCost = c; best = assign.map((row) => row.slice()); }
  }
  // obnov najlepší stav
  for (let i = 0; i < N; i++) docDay[i].clear();
  together.fill(0); pairCost = 0;
  for (const row of assign) row.fill(-1);
  for (let t = 1; t <= D; t++) for (let p = 0; p < P.length; p++) if (best[t - 1][p] >= 0) place(best[t - 1][p], t, p);

  // Výsledok
  const unfilled = [];
  for (const [t, p] of slots) if (assign[t - 1][p] < 0) unfilled.push({ day: t, pos: P[p].id });
  for (const u of unfilled) warnings.push(`Neobsazeno: ${u.day}. – ${P[posIndex.get(u.pos)].label} (nikdo volný nesplňuje pravidla)`);
  for (let i = 0; i < N; i++) for (const [p, n] of exactOf[i]) if (posCount(i, p) !== n) warnings.push(`${docs[i].name} má ${posCount(i, p)}× ${P[p].label}, má mít přesně ${n}`);
  for (let i = 0; i < N; i++) for (const [d, p] of docDay[i]) if (d > 0 && emerg[i].has(p) && !locked[d - 1][p]) warnings.push(`V nouzi: ${docs[i].name} má ${d}. ${P[p].label} (normálně tuto pozici neslouží)`);
  if (anMode !== 'hard') {
    for (let i = 0; i < N; i++) for (const [d, p] of docDay[i]) {
      const b = serviceAt(i, d - 1);
      if (b !== undefined && timeOf(b).end > 1440) warnings.push(`Výjimka: ${docs[i].name} má ${d}. ${P[p].label} hned po službě přes noc (${b >= 0 ? P[b].label : 'minulý měsíc'})`);
    }
  }
  for (let i = 0; i < N; i++) {
    for (const r of pmOf[i]) if (posCount(i, r.idx) < r.min) warnings.push(`${docs[i].name} má jen ${posCount(i, r.idx)}× ${P[r.idx].label} (minimum ${r.min}) – víc to nešlo kvůli vyškrtnutým dnům a odpočinku`);
    if (fixedOf[i] != null && catCount(i, 'h24') < fixedOf[i]) warnings.push(`${docs[i].name} (jen ${fg.label || 'JIP'}) má jen ${catCount(i, 'h24')} služeb místo ${fixedOf[i]} – víc to nešlo kvůli vyškrtnutým dnům a odpočinku`);
    if (oupEligible[i] && oupCount(i) < OUP_LIMIT.min) warnings.push(`${docs[i].name} má jen ${oupCount(i)} ${OUP_LIMIT.label} (minimum ${OUP_LIMIT.min}) – víc to nešlo kvůli vyškrtnutým dnům a odpočinku`);
    if (tgtT[i]?.min && catCount(i, 'tecky') < tgtT[i].min) warnings.push(`${docs[i].name} má jen ${catCount(i, 'tecky')} tečky (aspoň ${tgtT[i].min}) – víc to nešlo kvůli vyškrtnutým dnům a odpočinku`);
    if (tgt24[i] && catCount(i, 'h24') < tgt24[i].lo) warnings.push(`${docs[i].name} má jen ${catCount(i, 'h24')}× 24h (obvykle ${tgt24[i].label}) – víc to nešlo kvůli vyškrtnutým dnům a odpočinku`);
    if (tgt24[i] && catCount(i, 'h24') > tgt24[i].hi) warnings.push(`${docs[i].name} má ${catCount(i, 'h24')}× 24h, víc než obvykle (${tgt24[i].label}) – jinak by zůstala služba neobsazená`);
  }
  for (const w of wantResults) if (!w.ok) warnings.push(`Nesplněné přání: ${docs[w.doc].name} chtěl(a) ${w.day}.${w.pos ? ' (' + w.pos.join('/') + ')' : ''}${w.reason ? ' – ' + w.reason : ''}`);

  const stats = docs.map((doc, i) => {
    let hours = 0;
    for (const p of docDay[i].values()) hours += times[p].hours;
    const f = fairNow(i);
    return { id: doc.id, name: doc.name, count: docDay[i].size, h24: catCount(i, 'h24'), tecky: catCount(i, 'tecky'),
      exp24: fixedOf[i] != null ? `${fixedOf[i]} (JIP)` : tgt24[i]?.label || '', expT: tgtT[i]?.label || '',
      hours, oup: oupCount(i), oupMax: oupMax[i], fixed: fixedOf[i],
      we24: f.we, hol24: f.hol, weYear: hist[i].we + f.we, holYear: hist[i].hol + f.hol };
  });

  return {
    grid: assign.map((row) => row.map((i) => (i >= 0 ? docs[i].id : null))),
    cost: Math.round(bestCost),
    warnings, stats, unfilled, plan, fair: { weekendSlots: we24, noWeekend: docs.filter((_, i) => expects24[i] && fairNow(i).we === 0).map((d) => d.id),
      onlyFriday: docs.filter((_, i) => expects24[i] && fairNow(i).we > 0 && fairNow(i).we < FAIRNESS.weekendMin).map((d) => d.id) }, wants: wantResults.map((w) => ({ doctorId: docs[w.doc].id, day: w.day, ok: w.ok, pos: w.pos, reason: w.reason || '' })),
  };
}

/**
 * Cieľové počty pre každého lekára: 24h služby podľa obvyklého počtu, tečky rovnomerne v poole (balancePlan);
 * (typical24) prepočítaného tak, aby súčet sedel s počtom služieb v mesiaci.
 * Lekár bez obvyklého počtu dostane priemer ostatných. Lekár len na JIP sa do 24h nepočíta (pevný počet).
 * Vráti { [doctorId]: { h24?: {avg, lo, hi, label}, tecky?: {…} } }.
 */
/** Uzavřené pozice v jednotlivé dny: [{ day, pos }] → funkce (day, posId) → true/false. */
function closedSet(closed) {
  const s = new Set((closed || []).map((c) => `${+c.day}|${c.pos}`));
  return (day, pos) => s.has(`${day}|${pos}`);
}

/** Strop 24h služieb za mesiac pri prepočte navyše (kto mal obvykle viac, ten svoj počet). */
const CAP_24 = 4;

export function planTargets({ days, positions, doctors, fixedGroup, positionMin, closed }) {
  const isClosed = closedSet(closed);
  const fgx = fixedGroup === undefined ? FIXED_GROUP : fixedGroup;
  const pmx = positionMin === undefined ? POSITION_MIN : positionMin;
  const out = {};
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    const inCat = (id) => cat.positions.includes(id);
    let slots = 0;
    days.forEach((d, t) => { for (const p of positions) if (inCat(p.id) && !(p.workdaysOnly && !d.workday) && !isClosed(t + 1, p.id)) slots++; });
    let reserved = 0;
    const members = [];
    for (const d of doctors) {
      if (!(d.positions || []).some(inCat)) continue;
      const fixed = fixedCountOf(d, fgx);
      if (fixed != null && key === 'h24') { reserved += fixed; continue; }
      const v = cat.field ? Number(d[cat.field]) : NaN;
      members.push({ id: d.id, doc: d, w: v > 0 ? v : null, zero: cat.field ? d[cat.field] === 0 : false });
    }
    if (cat.balance) { balancePlan(key, members, slots, out, cat.min || 0); continue; }
    const known = members.filter((m) => m.w != null);
    const avgW = known.length ? known.reduce((a, m) => a + m.w, 0) / known.length : 1;
    for (const m of members) if (m.w == null) m.w = m.zero ? 0 : avgW;
    // prepočet na počet služieb v mesiaci; keď je služieb viac ako obvykle, nikto nemá ísť nad 4
    // (alebo nad svoj obvyklý počet, ak je vyšší) – navyše dostanú tí, čo majú menej
    const need = Math.max(0, slots - reserved);
    const cap = (m) => (key === 'h24' ? Math.max(CAP_24, m.w) : Infinity);
    const capped = new Set();
    let scale = 0;
    for (let k = 0; k < members.length + 1; k++) {
      const free = members.filter((m) => !capped.has(m));
      const sumFree = free.reduce((a, m) => a + m.w, 0);
      const fixedSum = [...capped].reduce((a, m) => a + cap(m), 0);
      scale = sumFree > 0 ? Math.max(0, need - fixedSum) / sumFree : 0;
      const over = free.filter((m) => m.w * scale > cap(m) + 1e-9);
      if (!over.length || scale <= 1) break;
      over.forEach((m) => capped.add(m));
    }
    for (const m of members) {
      let avg = capped.has(m) ? cap(m) : m.w * scale;
      // blízko celého čísla (napr. 4,08) → presne to číslo
      let lo = Math.floor(avg + 0.1), hi = Math.ceil(avg - 0.1);
      if (hi < lo) hi = lo;
      // výslovné pravidlo „minimum na pozícii“ má prednosť pred zvyklosťou
      const pmin = key !== 'h24' ? null : positionMinRules(pmx).filter((r) => cat.positions.includes(r.position))
        .reduce((a, r) => { const v = positionMinOf(m.doc, r); return v == null ? a : (a ?? 0) + v; }, null);
      if (pmin != null && hi < pmin) { lo = Math.max(lo, pmin); hi = pmin; avg = Math.max(avg, pmin); }
      (out[m.id] ||= {})[key] = { avg, lo, hi, label: lo === hi ? String(lo) : `${lo}–${hi}` };
    }
  }
  return out;
}

/**
 * Tečky v poole: všetci majú mať v mesiaci podobný počet služieb (24h + tečky; OUP sa nepočíta) –
 * kto má viac 24h služieb, má menej tečiek; každý aspoň `min` tečiek. Navyše ich dostávajú skôr menej skúsení
 * (poradie v zozname = skúsenosť; najskúsenejší má cieľ o SENIOR_TECKY služby nižší).
 * Vráti pri každom lekárovi aj `load` – cieľ 24h + tečky (solver podľa neho dopočíta tečky zo skutočných 24h).
 */
const SENIOR_TECKY = 1;
function balancePlan(key, members, slots, out, min = 0) {
  if (!members.length) return;
  const e24 = (m) => out[m.id]?.h24?.avg ?? fixedCountOf(m.doc) ?? 0;
  const shift = members.map((_, j) => (members.length > 1 ? SENIOR_TECKY * (1 - j / (members.length - 1)) : 0));
  const base = members.map((m, j) => e24(m) + shift[j]);
  const mn = Math.min(min, slots / members.length); // když je teček málo, minimum se úměrně sníží
  // úroveň L tak, aby súčet max(min, L - base) = počet tečiek
  const sum = (L) => base.reduce((a, b) => a + Math.max(mn, L - b), 0);
  let lo = 0, hi = Math.max(...base) + slots + 1;
  for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (sum(mid) < slots) lo = mid; else hi = mid; }
  const L = (lo + hi) / 2;
  members.forEach((m, j) => {
    const avg = Math.max(mn, L - base[j]);
    let a = Math.floor(avg + 0.2), b = Math.ceil(avg - 0.2);
    if (b < a) b = a;
    (out[m.id] ||= {})[key] = { avg, lo: a, hi: b, label: a === b ? String(a) : `${a}–${b}`, load: L - shift[j], min: Math.floor(mn) };
  });
}

/** Predchádzajúci mesiac ku kľúču 'RRRR-MM'. */
function prevKey(key, n = 1) {
  let [y, m] = key.split('-').map(Number);
  for (let i = 0; i < n; i++) { m--; if (m < 1) { m = 12; y--; } }
  return `${y}-${String(m).padStart(2, '0')}`;
}
/**
 * História víkendov/sviatkov (24 h) za posledných FAIRNESS.windowMonths mesiacov pred targetKey.
 * past: [{ key, days, header: [label…], rows: [[id|null…]] }] – uložené rozpisy (stĺpce = pozície podľa header);
 * mesiace z FAIR_BASE_MONTHS sa neberú z `past`, ale z poľa `fair` pri lekárovi (počiatočný stav po mesiacoch).
 * hd = sviatky ('M-D'), na ktoré mal lekár 24h službu – aby sa napr. Vianoce striedali rok čo rok.
 */
export function buildFairHistory({ targetKey, past, doctors, positions }) {
  const win = new Set(Array.from({ length: FAIRNESS.windowMonths }, (_, i) => prevKey(targetKey, i + 1)));
  const out = {};
  const add = (id, k, v) => { (out[id] ||= { n24: 0, we: 0, hol: 0, noWe: 0, hd: [] })[k] += v; };
  const addHd = (id, v) => { add(id, 'n24', 0); out[id].hd.push(v); };
  for (const d of doctors) for (const [key, f] of Object.entries(d.fair || {})) {
    if (!win.has(key) || !FAIR_BASE_MONTHS.includes(key) || !f) continue;
    for (const k of ['n24', 'we', 'hol', 'noWe']) add(d.id, k, +f[k] || 0);
    for (const h of f.hd || []) addHd(d.id, h);
  }
  const h24labels = new Set(positions.filter((p) => CATEGORIES.h24.positions.includes(p.id)).map((p) => p.label));
  for (const pm of past || []) {
    if (!win.has(pm.key) || FAIR_BASE_MONTHS.includes(pm.key)) continue;
    const month = {};
    pm.rows.forEach((row, t) => {
      const day = pm.days[t];
      if (!day) return;
      row.forEach((id, c) => {
        if (!id || !h24labels.has(pm.header[c])) return;
        const w = weekendWeight(day);
        add(id, 'n24', 1); add(id, 'we', w); if (day.holiday) { add(id, 'hol', 1); addHd(id, `${+pm.key.slice(5)}-${t + 1}`); }
        (month[id] ||= { n: 0, we: 0 }).n++; month[id].we += w;
      });
    });
    for (const [id, x] of Object.entries(month)) if (x.n > 0 && x.we < FAIRNESS.weekendMin) add(id, 'noWe', FAIRNESS.weekendMin - x.we);
  }
  return out;
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
    if (doc && !(doc.positions || []).includes(pos.id)) {
      if ((doc.emergency || []).includes(pos.id)) issues.push({ day, pos: pos.id, level: 'warn', msg: `${name} má ${pos.label} jen v nouzi` });
      else issues.push({ day, pos: pos.id, msg: `${name} nemá povolenou pozici ${pos.label}` });
    }
    if ((pos.workdaysOnly && !days[t].workday) || closedSet(input.closed)(day, pos.id)) issues.push({ day, pos: pos.id, msg: `${pos.label} se v tento den neslouží` });
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
        const ta = a.p >= 0 ? shiftTimes(P[a.p]) : { end: 450 + 1440 };
        const rest = (1440 + shiftTimes(P[b.p]).start - ta.end) / 60;
        if (rest < (input.minRestHours ?? DEFAULT_MIN_REST_HOURS)) issues.push({ day: b.day, pos: P[b.p].id, msg: `${name} má jen ${Math.max(0, rest)} h odpočinku po předchozí službě` });
        else if (ta.end > 1440 && afterNightMode(input) !== 'off') {
          const soft = afterNightMode(input) === 'soft';
          issues.push({ day: b.day, pos: P[b.p].id, kind: 'afterNight', level: soft ? 'warn' : 'error', msg: `${name} slouží den po noční/24h službě${soft ? ' (výjimka)' : ''}` });
        }
      }
    }
    const doc = byId.get(id);
    const n = list.filter((x) => !x.prev).length;
    const om = Number((input.requests || {})[id]?.oupMax);
    if (om > 0) {
      const o = list.filter((x) => !x.prev && OUP_LIMIT.positions.includes(P[x.p]?.id)).length;
      if (o > Math.max(OUP_LIMIT.min, om)) issues.push({ day: null, pos: null, msg: `${name} má ${o} ${OUP_LIMIT.label}, chtěl/a nejvýš ${Math.max(OUP_LIMIT.min, om)}` });
    }
    if (doc && doc.max != null && doc.max !== '' && n > +doc.max) issues.push({ day: null, pos: null, msg: `${name} má ${n} služeb (max ${doc.max})` });
  }
  // 24h služby podle obvyklého počtu a OUP minimum
  {
    const plan = planTargets({ days, positions: P, doctors: input.doctors.map((d) => { const m = Number((input.requests || {})[d.id]?.max); return m > 0 ? { ...d, max: m } : d; }), fixedGroup: input.fixedGroup, positionMin: input.positionMin, closed: input.closed });
    const in24 = (p) => CATEGORIES.h24.positions.includes(P[p]?.id);
    for (const d of input.doctors) {
      const mine = (perDoc.get(d.id) || []).filter((x) => !x.prev);
      const oup = mine.filter((x) => OUP_LIMIT.positions.includes(P[x.p]?.id)).length;
      const t = plan[d.id]?.h24;
      const h = mine.filter((x) => in24(x.p)).length;
      if (t && (h < t.lo || h > t.hi)) issues.push({ day: null, pos: null, kind: 'even', level: 'warn', msg: `${d.name} má ${h}× 24h, obvykle ${t.label}` });
      if ((d.positions || []).some((id) => OUP_LIMIT.positions.includes(id)) && oup < OUP_LIMIT.min) issues.push({ day: null, pos: null, kind: 'oup', level: 'warn', msg: `${d.name} má ${oup} ${OUP_LIMIT.label}, minimum je ${OUP_LIMIT.min}` });
    }
  }
  // minimum na pozícii
  const pmv = input.positionMin === undefined ? POSITION_MIN : input.positionMin;
  for (const rule of positionMinRules(pmv)) {
    const pmi = P.findIndex((x) => x.id === rule.position);
    if (pmi < 0) continue;
    for (const d of input.doctors) {
      const min = positionMinOf(d, rule);
      const k = (perDoc.get(d.id) || []).filter((x) => !x.prev && x.p === pmi).length;
      if (min != null && k < min) issues.push({ day: null, pos: null, kind: 'posMin', level: 'warn', msg: `${d.name} má ${k}× ${P[pmi].label}, minimum je ${min}` });
    }
  }
  // lekári len na JIP: presný počet
  const fg = input.fixedGroup === undefined ? FIXED_GROUP : input.fixedGroup;
  for (const d0 of input.doctors) {
    const m = Number((input.requests || {})[d0.id]?.max);
    const d = m > 0 ? { ...d0, max: m } : d0; // Max na tento měsíc z požadavků
    const want = fixedCountOf(d, fg);
    if (want == null) continue;
    const n = (perDoc.get(d.id) || []).filter((x) => !x.prev && CATEGORIES.h24.positions.includes(P[x.p].id)).length; // 24h (OUP zvlášť)
    if (n !== want) issues.push({ day: null, pos: null, kind: 'fixed', level: n > want ? 'error' : 'warn', msg: `${d.name} (jen ${fg.label || 'JIP'}) má ${n} služeb, má mít ${want}` });
  }
  return issues;
}
