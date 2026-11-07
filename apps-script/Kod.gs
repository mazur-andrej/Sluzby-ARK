// ===== Rozpis služeb – Kod.gs =====
// VYGENEROVÁNO z repozitáře (node tools/build-gas.mjs). Neupravujte ručně – změny dělejte ve zdrojových souborech.

// ----- js/calendar.js -----
// Kalendár: dni v mesiaci, víkendy, české štátne sviatky.

const DAY_ABBR = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen',
  'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];

function easterSunday(year) {
  // Anonymný gregoriánsky algoritmus
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Vráti množinu sviatkov v tvare "M-D" pre daný rok (ČR). */
function czechHolidays(year) {
  const fixed = ['1-1', '5-1', '5-8', '7-5', '7-6', '9-28', '10-28', '11-17', '12-24', '12-25', '12-26'];
  const set = new Set(fixed);
  const easter = easterSunday(year);
  const add = (offset) => {
    const d = new Date(easter.getTime() + offset * 86400000);
    set.add(`${d.getUTCMonth() + 1}-${d.getUTCDate()}`);
  };
  add(-2); // Veľký piatok
  add(1);  // Veľkonočný pondelok
  return set;
}

/**
 * Vytvorí zoznam dní mesiaca.
 * month: 1-12. extraHolidays: pole čísel dní, ktoré sa majú brať ako sviatok navyše.
 */
function buildMonth(year, month, extraHolidays = []) {
  const hol = czechHolidays(year);
  const n = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days = [];
  for (let d = 1; d <= n; d++) {
    const dow = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const holiday = hol.has(`${month}-${d}`) || extraHolidays.includes(d);
    days.push({
      day: d, dow, weekend, holiday,
      workday: !weekend && !holiday,
      label: `${DAY_ABBR[dow]} ${d}. ${month}.`,
    });
  }
  return days;
}

function prevMonthOf(year, month) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

// ----- js/config.js -----
// Predvolené pozície (stĺpce rozpisu).
// start  = začiatok služby (HH:MM), hours = dĺžka v hodinách
//          (z toho program počíta odpočinok medzi službami a odpracované hodiny)
// workdaysOnly = slúži sa len v pracovné dni (nie víkend/sviatok)
// aliases = ako lekári pozíciu píšu v požiadavkách (napr. "chci KPECH" = plast)
const DEFAULT_POSITIONS = [
  { id: 'l1', label: 'lékař1', start: '07:30', hours: 24, workdaysOnly: false, aliases: ['lekar1', 'lékař 1'] },
  { id: 'l2', label: 'lékař2', start: '07:30', hours: 24, workdaysOnly: false, aliases: ['lekar2', 'lékař 2'] },
  { id: '1A', label: 'lékař3=1A', start: '07:30', hours: 24, workdaysOnly: false, aliases: ['A1', '1A'] },
  { id: '2A', label: 'lékař4=2A', start: '07:30', hours: 24, workdaysOnly: false, aliases: ['A2', '2A'] },
  { id: 'plast', label: 'lékař5=plast', start: '07:30', hours: 24, workdaysOnly: false, aliases: ['KPECH', 'plast', 'plastika'] },
  { id: 't1', label: 'tečka1', start: '07:30', hours: 10, workdaysOnly: true, aliases: ['tečka 1', 'tecka1', 't1'] },
  { id: 't2', label: 'tečka2', start: '09:30', hours: 8, workdaysOnly: true, aliases: ['tečka 2', 'tecka2', 't2'] },
  { id: 'OUPd', label: 'OUP den', start: '07:00', hours: 12, workdaysOnly: false, aliases: ['OUP den', 'OUPden'] },
  { id: 'OUPn', label: 'OUP noc', start: '19:00', hours: 12, workdaysOnly: false, aliases: ['OUP noc', 'OUPnoc'] },
];

// Minimálny odpočinok medzi koncom jednej a začiatkom ďalšej služby (hodiny).
const DEFAULT_MIN_REST_HOURS = 11;
// Deň po službe, ktorá končí až nasledujúci deň (24 h, OUP noc):
//   'hard' = celý deň voľno vždy
//   'soft' = výnimočne smie mať večer ďalšiu službu (napr. 24 h do 7:30 a OUP noc od 19:00 = 11,5 h),
//            ale len keď by inak služba ostala neobsadená; každá výnimka sa nahlási
//   'off'  = stačí minimálny odpočinok v hodinách
const DEFAULT_AFTER_NIGHT = 'soft';
const AFTER_NIGHT_LABELS = {
  hard: 'Vždy celý další den volno',
  soft: 'Výjimečně – jen když by jinak zůstala služba neobsazená',
  off: 'Stačí minimální odpočinek v hodinách',
};
/** převod starého nastavení (true/false) na nový režim */
const afterNightMode = (input) => (input.afterNight || (input.nextDayOff === false ? 'off' : input.nextDayOff === true ? 'hard' : DEFAULT_AFTER_NIGHT));

// Skupinové označenia: "OUP" samotné = obe OUP pozície.
const GROUP_ALIASES = { OUP: ['OUPd', 'OUPn'], 'tečka': ['t1', 't2'], tecka: ['t1', 't2'] };

/**
 * Časy služby v minútach od polnoci dňa, kedy služba začína: { start, end, hours, night }.
 * Pre staršie uložené dáta bez času sa použije predvolená pozícia s rovnakým id,
 * inak príznak night (24 h) / deň (12 h).
 */
function shiftTimes(p) {
  const def = DEFAULT_POSITIONS.find((d) => d.id === p.id) || {};
  const startStr = p.start || def.start || '07:00';
  const m = String(startStr).match(/(\d{1,2})[:.](\d{2})/);
  const start = m ? (+m[1]) * 60 + (+m[2]) : 420;
  let hours = Number(p.hours);
  if (!(hours > 0)) hours = def.hours || (p.night ? 24 : 12);
  const end = start + Math.round(hours * 60);
  return { start, end, hours, night: end > 1440 };
}

// ----- js/default-doctors.js -----
// Predvolený zoznam lekárov (odvodený z rozpisov máj–november 2026).
// Upravuje sa v aplikácii na karte Lekári; tento súbor slúži len ako východiskový stav.
const DEFAULT_DOCTORS = [
 {
  "id": "bartos",
  "name": "Bartoš",
  "active": true,
  "positions": [
   "1A",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "target": 6,
  "max": null,
  "note": ""
 },
 {
  "id": "bartosik",
  "name": "Bartošík",
  "active": true,
  "positions": [
   "l1",
   "l2"
  ],
  "target": 3,
  "max": null,
  "note": ""
 },
 {
  "id": "bencat",
  "name": "Benčat",
  "active": true,
  "positions": [
   "2A",
   "t2",
   "OUPn"
  ],
  "target": 6,
  "max": null,
  "note": ""
 },
 {
  "id": "chobola",
  "name": "Chobola",
  "active": true,
  "positions": [
   "l1",
   "l2",
   "plast"
  ],
  "target": 4,
  "max": null,
  "note": ""
 },
 {
  "id": "cundrle",
  "name": "Čundrle",
  "active": true,
  "positions": [
   "l1",
   "l2"
  ],
  "target": 4,
  "max": null,
  "note": ""
 },
 {
  "id": "dadak",
  "name": "Dadák",
  "active": true,
  "positions": [
   "plast"
  ],
  "target": 3,
  "max": null,
  "note": ""
 },
 {
  "id": "fabian",
  "name": "Fabián",
  "active": true,
  "positions": [
   "1A",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "target": 6,
  "max": null,
  "note": ""
 },
 {
  "id": "fencl",
  "name": "Fencl",
  "active": true,
  "positions": [
   "l1",
   "l2"
  ],
  "target": 3,
  "max": null,
  "note": ""
 },
 {
  "id": "fischer",
  "name": "Fischer",
  "active": true,
  "positions": [
   "1A",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "target": 6,
  "max": null,
  "note": ""
 },
 {
  "id": "grac",
  "name": "Grác",
  "active": true,
  "positions": [
   "1A",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "target": 6,
  "max": null,
  "note": ""
 },
 {
  "id": "halmova",
  "name": "Halmová",
  "active": false,
  "positions": [
   "l2",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "target": 6,
  "max": null,
  "note": ""
 },
 {
  "id": "hasara",
  "name": "Hasara",
  "active": true,
  "positions": [
   "l2",
   "1A",
   "plast"
  ],
  "target": 3,
  "max": null,
  "note": ""
 },
 {
  "id": "helan",
  "name": "Helán",
  "active": true,
  "positions": [
   "l2",
   "OUPd"
  ],
  "target": 1,
  "max": null,
  "note": ""
 },
 {
  "id": "hereta",
  "name": "Hereta",
  "active": false,
  "positions": [
   "plast",
   "OUPd",
   "OUPn"
  ],
  "target": 5,
  "max": null,
  "note": ""
 },
 {
  "id": "hric",
  "name": "Hric",
  "active": true,
  "positions": [
   "2A",
   "t1",
   "t2"
  ],
  "target": 6,
  "max": null,
  "note": ""
 },
 {
  "id": "hruda",
  "name": "Hruda",
  "active": true,
  "positions": [
   "l1",
   "l2",
   "OUPd"
  ],
  "target": 5,
  "max": null,
  "note": ""
 },
 {
  "id": "jelinek",
  "name": "Jelínek",
  "active": true,
  "positions": [
   "l1",
   "l2",
   "plast"
  ],
  "target": 4,
  "max": null,
  "note": ""
 },
 {
  "id": "kissova",
  "name": "Kiššová",
  "active": true,
  "positions": [
   "2A",
   "t1",
   "t2"
  ],
  "target": 6,
  "max": null,
  "note": ""
 },
 {
  "id": "kolodejova",
  "name": "Kolodějová",
  "active": false,
  "positions": [
   "l2",
   "1A",
   "plast"
  ],
  "target": 3,
  "max": null,
  "note": ""
 },
 {
  "id": "kremeckova",
  "name": "Křemečková",
  "active": true,
  "positions": [
   "1A",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "target": 5,
  "max": null,
  "note": ""
 },
 {
  "id": "kriz",
  "name": "Kříž",
  "active": true,
  "positions": [
   "l2",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "target": 6,
  "max": null,
  "note": ""
 },
 {
  "id": "marecek",
  "name": "Mareček",
  "active": true,
  "positions": [
   "1A",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "target": 6,
  "max": null,
  "note": ""
 },
 {
  "id": "mazur",
  "name": "Mazúr",
  "active": true,
  "positions": [
   "l2",
   "1A",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "target": 5,
  "max": null,
  "note": ""
 },
 {
  "id": "michnacova",
  "name": "Michnáčová",
  "active": true,
  "positions": [
   "1A",
   "2A",
   "t1",
   "OUPd",
   "OUPn"
  ],
  "target": 6,
  "max": null,
  "note": ""
 },
 {
  "id": "molcanova",
  "name": "Molčanová",
  "active": true,
  "positions": [
   "2A",
   "t1",
   "t2"
  ],
  "target": 6,
  "max": null,
  "note": ""
 },
 {
  "id": "mrazek",
  "name": "Mrázek",
  "active": true,
  "positions": [
   "2A",
   "t2"
  ],
  "target": 6,
  "max": null,
  "note": ""
 },
 {
  "id": "niedobova",
  "name": "Niedobová",
  "active": true,
  "positions": [
   "l1",
   "l2",
   "1A",
   "plast"
  ],
  "target": 4,
  "max": null,
  "note": ""
 },
 {
  "id": "paulovicova",
  "name": "Paulovičová",
  "active": true,
  "positions": [
   "1A",
   "2A",
   "t1",
   "OUPd",
   "OUPn"
  ],
  "target": 5,
  "max": null,
  "note": ""
 },
 {
  "id": "pavlikova",
  "name": "Pavlíková",
  "active": true,
  "positions": [
   "1A"
  ],
  "target": 3,
  "max": null,
  "note": ""
 },
 {
  "id": "pavlunova",
  "name": "Pavlunová",
  "active": true,
  "positions": [
   "l2",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "target": 6,
  "max": null,
  "note": ""
 },
 {
  "id": "pitrova",
  "name": "Pitrová",
  "active": true,
  "positions": [
   "1A",
   "2A",
   "t1",
   "OUPd",
   "OUPn"
  ],
  "target": 6,
  "max": null,
  "note": ""
 },
 {
  "id": "pokorny",
  "name": "Pokorný",
  "active": true,
  "positions": [
   "l2",
   "1A",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "target": 6,
  "max": null,
  "note": ""
 },
 {
  "id": "pokrivcak",
  "name": "Pokrivčák",
  "active": false,
  "positions": [
   "1A",
   "t1",
   "OUPd",
   "OUPn"
  ],
  "target": 9,
  "max": null,
  "note": ""
 },
 {
  "id": "predac",
  "name": "Predáč",
  "active": true,
  "positions": [
   "l2",
   "1A",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "target": 5,
  "max": null,
  "note": ""
 },
 {
  "id": "prochazkova",
  "name": "Procházková",
  "active": false,
  "positions": [
   "1A"
  ],
  "target": 2,
  "max": null,
  "note": ""
 },
 {
  "id": "ruzek",
  "name": "Růžek",
  "active": true,
  "positions": [
   "l1",
   "l2",
   "OUPd",
   "OUPn"
  ],
  "target": 4,
  "max": null,
  "note": ""
 },
 {
  "id": "reznickova",
  "name": "Řezníčková",
  "active": true,
  "positions": [
   "1A",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "target": 5,
  "max": null,
  "note": ""
 },
 {
  "id": "schroderova",
  "name": "Schröderová",
  "active": true,
  "positions": [
   "plast"
  ],
  "target": 4,
  "max": null,
  "note": ""
 },
 {
  "id": "skotalek",
  "name": "Skotálek",
  "active": true,
  "positions": [
   "2A",
   "t1",
   "OUPd",
   "OUPn"
  ],
  "target": 6,
  "max": null,
  "note": ""
 },
 {
  "id": "suk",
  "name": "Suk",
  "active": true,
  "positions": [
   "l1",
   "l2"
  ],
  "target": 4,
  "max": null,
  "note": ""
 },
 {
  "id": "svoboda",
  "name": "Svoboda",
  "active": true,
  "positions": [
   "l2",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "target": 6,
  "max": null,
  "note": ""
 },
 {
  "id": "simova",
  "name": "Šimová",
  "active": true,
  "positions": [
   "1A",
   "2A",
   "t1"
  ],
  "target": 4,
  "max": null,
  "note": ""
 },
 {
  "id": "skuligova",
  "name": "Škuligová",
  "active": true,
  "positions": [
   "2A",
   "t1",
   "t2"
  ],
  "target": 6,
  "max": null,
  "note": ""
 },
 {
  "id": "stetka",
  "name": "Štětka",
  "active": true,
  "positions": [
   "l1",
   "OUPd"
  ],
  "target": 5,
  "max": null,
  "note": ""
 },
 {
  "id": "tomancova",
  "name": "Tomancová",
  "active": true,
  "positions": [
   "2A",
   "t1",
   "t2",
   "OUPd",
   "OUPn"
  ],
  "target": 8,
  "max": null,
  "note": ""
 },
 {
  "id": "tomaskova",
  "name": "Tomášková",
  "active": true,
  "positions": [
   "1A",
   "OUPd",
   "OUPn"
  ],
  "target": 4,
  "max": null,
  "note": ""
 },
 {
  "id": "trnkocyova",
  "name": "Trnkócyová",
  "active": true,
  "positions": [
   "2A",
   "t1",
   "t2"
  ],
  "target": 6,
  "max": null,
  "note": ""
 },
 {
  "id": "trebova",
  "name": "Třebová",
  "active": false,
  "positions": [
   "1A",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "target": 7,
  "max": null,
  "note": ""
 },
 {
  "id": "valachova",
  "name": "Valachová",
  "active": true,
  "positions": [
   "1A",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "target": 5,
  "max": null,
  "note": ""
 },
 {
  "id": "valouchova",
  "name": "Valouchová",
  "active": true,
  "positions": [
   "plast"
  ],
  "target": 3,
  "max": null,
  "note": ""
 },
 {
  "id": "vilhan",
  "name": "Vilhan",
  "active": true,
  "positions": [
   "2A",
   "t1",
   "t2"
  ],
  "target": 5,
  "max": null,
  "note": ""
 },
 {
  "id": "volava",
  "name": "Volavá",
  "active": true,
  "positions": [
   "2A",
   "t1",
   "t2"
  ],
  "target": 5,
  "max": null,
  "note": ""
 },
 {
  "id": "volcik",
  "name": "Volčík",
  "active": true,
  "positions": [
   "l1",
   "l2",
   "OUPd"
  ],
  "target": 5,
  "max": null,
  "note": ""
 },
 {
  "id": "zimmer",
  "name": "Zimmer",
  "active": true,
  "positions": [
   "l2",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "target": 5,
  "max": null,
  "note": ""
 },
 {
  "id": "zubikova",
  "name": "Zubíková",
  "active": true,
  "positions": [
   "2A",
   "t2"
  ],
  "target": 5,
  "max": null,
  "note": ""
 },
 {
  "id": "zvonickova",
  "name": "Zvoníčková",
  "active": true,
  "positions": [
   "l2",
   "1A"
  ],
  "target": 4,
  "max": null,
  "note": ""
 },
 {
  "id": "zabkova",
  "name": "Žabková",
  "active": true,
  "positions": [
   "2A",
   "t1",
   "OUPd",
   "OUPn"
  ],
  "target": 7,
  "max": null,
  "note": ""
 }
];

// ----- js/solver.js -----
// Algoritmus rozpisu služieb.
//
// Tvrdé pravidlá (nikdy sa neporušia):
//  - lekár slúži len na pozíciách, ktoré má povolené
//  - lekár neslúži v dni, ktoré si vyškrtol
//  - v daný deň neslúži na pozícii, ktorú vylúčil (napr. "ne OUP")
//  - max. 1 služba za deň
//  - medzi koncom jednej a začiatkom ďalšej služby je aspoň minRestHours hodín odpočinku
//  - po službe končiacej až nasledujúci deň (24 h, OUP noc) je celý ten deň voľno (afterNight = 'hard')
//  - neprekročí sa maximum služieb za mesiac (ak je zadané)
// Mäkké pravidlá (optimalizujú sa):
//  - počet služieb čo najbližšie k cieľu lekára
//  - férové rozdelenie víkendov/sviatkov
//  - služby rozložené v čase (nie 2 dni po sebe, ideálne aspoň 3 dni rozostup)
//  - vyplnené všetky pozície
//  - služba deň po službe cez noc len výnimočne (afterNight = 'soft')



const DEFAULT_WEIGHTS = {
  unfilled: 1000,
  target: 40,      // * (počet - cieľ)^2
  overTarget: 60,  // navyše za každú službu nad cieľ
  weekend: 25,     // * (víkendy - očakávané)^2
  gap1: 30,        // služba deň po dennej službe
  gap2: 6,         // služby ob deň
  gap3: 1.5,
  sameWeekend: 15, // 2 služby v jednom víkende (so+ne)
  afterNight: 400, // výnimka: služba v deň, keď končí služba cez noc (len pri afterNight = 'soft')
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
 *   afterNight: 'hard' | 'soft' | 'off' – deň po službe cez noc (pozri config.js),
 *   doctors: [{id, name, positions:[posId], target, max}],
 *   requests: { [doctorId]: { off:[day], want:[{day, pos?: id|[id]}], ban:[{day, pos:[id]}] } },
 *   prev: [{doctorId, day, posId}]  // služby z konca minulého mesiaca, day <= 0 (0 = posledný deň)
 *   locked: { "den|posId": doctorId } // ručne zadané bunky, ktoré sa nemenia
 *   weights, seed, iterations, restarts
 * }
 */
function solve(input) {
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
    if (anMode === 'soft') {
      for (const d of docDay[i].keys()) {
        const b = serviceAt(i, d - 1);
        if (b !== undefined && timeOf(b).end > 1440) c += W.afterNight;
      }
    }
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
  if (anMode !== 'hard') {
    for (let i = 0; i < N; i++) for (const [d, p] of docDay[i]) {
      const b = serviceAt(i, d - 1);
      if (b !== undefined && timeOf(b).end > 1440) warnings.push(`Výjimka: ${docs[i].name} má ${d}. ${P[p].label} hned po službě přes noc (${b >= 0 ? P[b].label : 'minulý měsíc'})`);
    }
  }
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
function validate(input, grid) {
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
        const ta = a.p >= 0 ? shiftTimes(P[a.p]) : { end: 450 + 1440 };
        const rest = (1440 + shiftTimes(P[b.p]).start - ta.end) / 60;
        if (rest < (input.minRestHours ?? DEFAULT_MIN_REST_HOURS)) issues.push({ day: b.day, pos: P[b.p].id, msg: `${name} má jen ${Math.max(0, rest)} h odpočinku po předchozí službě` });
        else if (ta.end > 1440 && afterNightMode(input) !== 'off') {
          const soft = afterNightMode(input) === 'soft';
          issues.push({ day: b.day, pos: P[b.p].id, level: soft ? 'warn' : 'error', msg: `${name} slouží den po noční/24h službě${soft ? ' (výjimka)' : ''}` });
        }
      }
    }
    const doc = byId.get(id);
    const n = list.filter((x) => !x.prev).length;
    if (doc && doc.max != null && doc.max !== '' && n > +doc.max) issues.push({ day: null, pos: null, msg: `${name} má ${n} služeb (max ${doc.max})` });
  }
  return issues;
}

// ----- apps-script/server.js -----
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
  const docS = ensureSheet(SH.DOC, ['ID', 'Jméno', 'Aktivní', 'Pozice (zkratky oddělené čárkou)', 'Cíl služeb/měsíc', 'Max', 'Token (neměnit)', 'Osobní odkaz pro lékaře']);
  if (docS.getLastRow() < 2) {
    const rows = DEFAULT_DOCTORS.map((d) => [d.id, d.name, !!d.active, d.positions.join(', '), d.target, d.max == null ? '' : d.max, newToken(), '']);
    docS.getRange(2, 1, rows.length, 8).setValues(rows);
    docS.getRange(2, 3, Math.max(rows.length, 200), 1).insertCheckboxes();
    docS.setColumnWidth(2, 140); docS.setColumnWidth(4, 220); docS.setColumnWidth(8, 420);
  }
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
  if (!deadlinePassed(key)) return;
  if (st === 'otevřeno') return; // ručně znovu otevřeno – čeká se na ruční generování
  if (sheet(scheduleSheetName(key))) return; // už vygenerováno
  generovat(key, true);
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
    if (notify) {
      try {
        MailApp.sendEmail(adminEmail(), `Rozpis služeb ${key} vygenerován`,
          `Požadavky na ${key} byly uzamčeny a rozpis je vygenerovaný v listu „${scheduleSheetName(key)}".\n\n` +
          (res.warnings.length ? `Upozornění:\n${res.warnings.join('\n')}\n\n` : 'Všechny služby obsazeny bez upozornění.\n\n') +
          (missing.length ? `Požadavky nezadali: ${missing.join(', ')}\n\n` : '') + ss().getUrl());
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
  const stats = [['Lékař', 'Služby', 'Cíl', 'Víkendy/svátky', 'Hodiny']].concat(res.stats.map((x) => [x.name, x.count, x.target, x.weekends, x.hours]));
  s.getRange(1, sc, stats.length, 5).setValues(stats).setFontSize(9);
  s.getRange(1, sc, 1, 5).setFontWeight('bold').setBackground('#eeeeee');
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
  const rows = [['Lékař'].concat(days.map((d) => d.label))];
  const colors = [rows[0].map((_, i) => (i && (days[i - 1].weekend || days[i - 1].holiday) ? YELLOW : '#eeeeee'))];
  for (const d of doctors) {
    const r = reqs[d.id];
    const row = [r ? d.name : `${d.name} (nezadal/a)`];
    const col = ['#ffffff'];
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
  s.getRange(1, 1, rows.length, rows[0].length).setValues(rows).setBackgrounds(colors).setFontSize(9);
  s.setFrozenRows(1); s.setFrozenColumns(1);
  s.activate();
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
    return { month: m, header: v[0].slice(0, width), rows, me: doc.name };
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
  };
}
