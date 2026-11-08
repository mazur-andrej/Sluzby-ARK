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

// Lekári, ktorí slúžia LEN na týchto pozíciách (JIP = lékař1, lékař2), majú presne `count` služieb mesačne.
// count = null → pravidlo vypnuté.
const FIXED_GROUP = { label: 'JIP', positions: ['l1', 'l2'], count: 4 };

// Počet OUP služieb, ktorý si lekár sám volí v požiadavkách (ako maximum; najmenej `min`).
const OUP_LIMIT = { label: 'OUP', positions: ['OUPd', 'OUPn'], min: 2 };

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
// Výchozí seznam lékařů – ANONYMIZOVANÝ (struktura pozic a cílů z rozpisů 2026, bez jmen).
// Skutečná jména jsou jen v Google tabulce správce a v prohlížeči správce (karta Lékaři → Načíst seznam).
const DEFAULT_DOCTORS = [
 {
  "id": "lekar-01",
  "name": "Dr. 01",
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
  "id": "lekar-02",
  "name": "Dr. 02",
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
  "id": "lekar-03",
  "name": "Dr. 03",
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
  "id": "lekar-04",
  "name": "Dr. 04",
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
  "id": "lekar-05",
  "name": "Dr. 05",
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
  "id": "lekar-06",
  "name": "Dr. 06",
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
  "id": "lekar-07",
  "name": "Dr. 07",
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
  "id": "lekar-08",
  "name": "Dr. 08",
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
  "id": "lekar-09",
  "name": "Dr. 09",
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
  "id": "lekar-10",
  "name": "Dr. 10",
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
  "id": "lekar-11",
  "name": "Dr. 11",
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
  "id": "lekar-12",
  "name": "Dr. 12",
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
  "id": "lekar-13",
  "name": "Dr. 13",
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
  "id": "lekar-14",
  "name": "Dr. 14",
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
  "id": "lekar-15",
  "name": "Dr. 15",
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
  "id": "lekar-16",
  "name": "Dr. 16",
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
  "id": "lekar-17",
  "name": "Dr. 17",
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
  "id": "lekar-18",
  "name": "Dr. 18",
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
  "id": "lekar-19",
  "name": "Dr. 19",
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
  "id": "lekar-20",
  "name": "Dr. 20",
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
  "id": "lekar-21",
  "name": "Dr. 21",
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
  "id": "lekar-22",
  "name": "Dr. 22",
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
  "id": "lekar-23",
  "name": "Dr. 23",
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
  "id": "lekar-24",
  "name": "Dr. 24",
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
  "id": "lekar-25",
  "name": "Dr. 25",
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
  "id": "lekar-26",
  "name": "Dr. 26",
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
  "id": "lekar-27",
  "name": "Dr. 27",
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
  "id": "lekar-28",
  "name": "Dr. 28",
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
  "id": "lekar-29",
  "name": "Dr. 29",
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
  "id": "lekar-30",
  "name": "Dr. 30",
  "active": true,
  "positions": [
   "plast"
  ],
  "target": 4,
  "max": null,
  "note": ""
 },
 {
  "id": "lekar-31",
  "name": "Dr. 31",
  "active": true,
  "positions": [
   "plast"
  ],
  "target": 3,
  "max": null,
  "note": ""
 },
 {
  "id": "lekar-32",
  "name": "Dr. 32",
  "active": true,
  "positions": [
   "plast"
  ],
  "target": 3,
  "max": null,
  "note": ""
 },
 {
  "id": "lekar-33",
  "name": "Dr. 33",
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
  "id": "lekar-34",
  "name": "Dr. 34",
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
  "id": "lekar-35",
  "name": "Dr. 35",
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
  "id": "lekar-36",
  "name": "Dr. 36",
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
  "id": "lekar-37",
  "name": "Dr. 37",
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
  "id": "lekar-38",
  "name": "Dr. 38",
  "active": true,
  "positions": [
   "1A"
  ],
  "target": 3,
  "max": null,
  "note": ""
 },
 {
  "id": "lekar-39",
  "name": "Dr. 39",
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
  "id": "lekar-40",
  "name": "Dr. 40",
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
 },
 {
  "id": "lekar-41",
  "name": "Dr. 41",
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
  "id": "lekar-42",
  "name": "Dr. 42",
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
  "id": "lekar-43",
  "name": "Dr. 43",
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
  "id": "lekar-44",
  "name": "Dr. 44",
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
  "id": "lekar-45",
  "name": "Dr. 45",
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
  "id": "lekar-46",
  "name": "Dr. 46",
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
  "id": "lekar-47",
  "name": "Dr. 47",
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
  "id": "lekar-48",
  "name": "Dr. 48",
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
  "id": "lekar-49",
  "name": "Dr. 49",
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
  "id": "lekar-50",
  "name": "Dr. 50",
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
  "id": "lekar-51",
  "name": "Dr. 51",
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
  "id": "lekar-52",
  "name": "Dr. 52",
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
  "id": "lekar-53",
  "name": "Dr. 53",
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
  "id": "lekar-54",
  "name": "Dr. 54",
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
  "id": "lekar-55",
  "name": "Dr. 55",
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
  "id": "lekar-56",
  "name": "Dr. 56",
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
  "id": "lekar-57",
  "name": "Dr. 57",
  "active": false,
  "positions": [
   "1A"
  ],
  "target": 2,
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
//  - neprekročí sa počet OUP služieb, ktorý si lekár zvolil (oupMax)
//  - lekár, ktorý slúži len na JIP (fixedGroup), nemá viac než fixedGroup.count služieb
// Mäkké pravidlá (optimalizujú sa):
//  - počet služieb čo najbližšie k cieľu lekára
//  - férové rozdelenie víkendov/sviatkov
//  - služby rozložené v čase (nie 2 dni po sebe, ideálne aspoň 3 dni rozostup)
//  - vyplnené všetky pozície
//  - ak si lekár zvolil počet OUP, dostane ich aspoň OUP_LIMIT.min
//  - lekár len na JIP má presne fixedGroup.count služieb (menej len keď to nejde)
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
  oupMin: 150,     // za každú chýbajúcu OUP službu do minima (ak si lekár zvolil počet)
  fixedMissing: 800, // lekár len na JIP: za každú službu chýbajúcu do presného počtu
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
 *   fixedGroup: { positions:[id], count } – lekári len na týchto pozíciách majú presne count služieb (null = vypnuté),
 *   doctors: [{id, name, positions:[posId], target, max}],
 *   requests: { [doctorId]: { off:[day], want:[{day, pos?: id|[id]}], ban:[{day, pos:[id]}], oupMax?: number } },
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
  // Lekári len na JIP: presný počet služieb (max tvrdo, cieľ = počet)
  const fg = input.fixedGroup === undefined ? FIXED_GROUP : input.fixedGroup;
  const fixedOf = docs.map((d) => {
    if (!fg || !(fg.count > 0)) return null;
    const ps = d.positions || [];
    return ps.length && ps.every((id) => fg.positions.includes(id)) ? +fg.count : null;
  });
  const maxOf = docs.map((d, i) => Math.min(d.max != null && d.max !== '' ? +d.max : Infinity, fixedOf[i] ?? Infinity));
  // OUP: počet zvolený lekárom = maximum, minimum OUP_LIMIT.min
  const oupSet = new Set(OUP_LIMIT.positions.map((id) => posIndex.get(id)).filter((x) => x !== undefined));
  const oupMax = docs.map((d) => {
    const v = Number((input.requests || {})[d.id]?.oupMax);
    return Number.isFinite(v) && v > 0 ? Math.max(OUP_LIMIT.min, Math.round(v)) : null;
  });
  const oupCount = (i) => { let c = 0; for (const p of docDay[i].values()) if (oupSet.has(p)) c++; return c; };
  const targetOf = docs.map((d, i) => fixedOf[i] ?? (d.target != null && d.target !== '' ? +d.target : 0));

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
    if (oupMax[i] != null && oupSet.has(p) && oupCount(i) >= oupMax[i]) return false;
    return true;
  }
  function place(i, day, p) { assign[day - 1][p] = i; docDay[i].set(day, p); }
  function unplace(day, p) { const i = assign[day - 1][p]; if (i >= 0) { docDay[i].delete(day); assign[day - 1][p] = -1; } return i; }

  // Cena jedného lekára
  function docCost(i) {
    const n = docDay[i].size;
    const tgt = targetOf[i];
    let c = W.target * (n - tgt) * (n - tgt);
    if (fixedOf[i] != null && n < fixedOf[i]) c += W.fixedMissing * (fixedOf[i] - n);
    if (oupMax[i] != null) {
      const minO = Math.min(OUP_LIMIT.min, oupMax[i]);
      const o = oupCount(i);
      if (o < minO) c += W.oupMin * (minO - o);
    }
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
  for (let i = 0; i < N; i++) {
    if (fixedOf[i] != null && docDay[i].size < fixedOf[i]) warnings.push(`${docs[i].name} (jen ${fg.label || 'JIP'}) má jen ${docDay[i].size} služeb místo ${fixedOf[i]} – víc to nešlo kvůli vyškrtnutým dnům a odpočinku`);
    if (oupMax[i] != null && oupCount(i) < Math.min(OUP_LIMIT.min, oupMax[i])) warnings.push(`${docs[i].name} má jen ${oupCount(i)} ${OUP_LIMIT.label} (chtěl/a ${OUP_LIMIT.min}–${oupMax[i]}) – jinak to nešlo kvůli vyškrtnutým dnům a odpočinku`);
  }
  for (const w of wantResults) if (!w.ok) warnings.push(`Nesplněné přání: ${docs[w.doc].name} chtěl(a) ${w.day}.${w.pos ? ' (' + w.pos.join('/') + ')' : ''}${w.reason ? ' – ' + w.reason : ''}`);

  const stats = docs.map((doc, i) => {
    let we = 0;
    let hours = 0;
    for (const [d, p] of docDay[i]) { if (isWe[d - 1]) we++; hours += times[p].hours; }
    return { id: doc.id, name: doc.name, count: docDay[i].size, target: targetOf[i], weekends: we, hours, oup: oupCount(i), oupMax: oupMax[i], fixed: fixedOf[i] };
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
  // lekári len na JIP: presný počet
  const fg = input.fixedGroup === undefined ? FIXED_GROUP : input.fixedGroup;
  if (fg && fg.count > 0) {
    for (const d of input.doctors) {
      const ps = d.positions || [];
      if (!ps.length || !ps.every((id) => fg.positions.includes(id))) continue;
      const n = (perDoc.get(d.id) || []).filter((x) => !x.prev).length;
      if (n !== +fg.count) issues.push({ day: null, pos: null, kind: 'fixed', level: n > fg.count ? 'error' : 'warn', msg: `${d.name} (jen ${fg.label || 'JIP'}) má ${n} služeb, má mít ${fg.count}` });
    }
  }
  return issues;
}

// ----- js/ics.js -----
// Kalendář (.ics, iCalendar) se službami jednoho lékaře.
// Používá stránka lékaře (stažení) i Google část (odběr kalendáře, který se sám aktualizuje).

const pad = (n) => String(n).padStart(2, '0');
const escIcs = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const utf8len = (ch) => { const c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; };
/** Řádky delší než 75 bajtů (UTF-8) se podle normy lámou; pokračování začíná mezerou. */
function fold(line) {
  const out = [];
  let cur = '', len = 0;
  for (const ch of line) {
    const l = utf8len(ch);
    if (len + l > 75) { out.push(cur); cur = ' '; len = 1; }
    cur += ch; len += l;
  }
  out.push(cur);
  return out.join('\r\n');
}

/** Místní čas (Praha) jako text YYYYMMDDTHHMMSS; minutes = minuty od půlnoci daného dne (může přesáhnout 24 h). */
function localStamp(year, month, day, minutes) {
  const d = new Date(Date.UTC(year, month - 1, day, 0, 0) + minutes * 60000);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
}

function startMinutes(start) {
  const m = String(start || '').match(/(\d{1,2})[:.](\d{2})/);
  return m ? (+m[1]) * 60 + (+m[2]) : 450;
}

const VTIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Prague',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];

/**
 * schedules: [{ month: 'RRRR-MM', header: ['', 'lékař1', …], rows: [['po 1. 12.', jméno, …]], version }]
 * positions: [{ label, start: 'HH:MM', hours }]
 * name: jméno lékaře, uid: stabilní identifikátor lékaře (aby se události při aktualizaci nahradily)
 * Vrací text souboru .ics.
 */
function buildIcs({ schedules, positions, name, uid, calName = 'Moje služby' }) {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rozpis sluzeb//CS', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escIcs(calName)}`, 'X-WR-TIMEZONE:Europe/Prague', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H', ...VTIMEZONE];
  for (const sch of schedules || []) {
    const [year, month] = String(sch.month).split('-').map(Number);
    for (const row of sch.rows || []) {
      const dm = String(row[0]).match(/(\d{1,2})\.\s*(\d{1,2})\./);
      if (!dm || +dm[2] !== month) continue;
      const day = +dm[1];
      row.forEach((cell, i) => {
        if (i === 0 || String(cell).trim() !== name) return;
        const label = sch.header[i];
        const pos = (positions || []).find((p) => p.label === label) || {};
        const start = startMinutes(pos.start);
        const hours = Number(String(pos.hours ?? '').replace(',', '.')) || 24;
        lines.push('BEGIN:VEVENT',
          `UID:${escIcs(`${sch.month}-${pad(day)}-${label}-${uid}`.replace(/[^\w.-]+/g, '_'))}@rozpis-sluzeb`,
          `DTSTAMP:${stamp}`,
          `DTSTART;TZID=Europe/Prague:${localStamp(year, month, day, start)}`,
          `DTEND;TZID=Europe/Prague:${localStamp(year, month, day, start + Math.round(hours * 60))}`,
          `SUMMARY:${escIcs(`Služba: ${label}`)}`,
          `DESCRIPTION:${escIcs(`Rozpis služeb${sch.version ? `, verze ${sch.version}` : ''}`)}`,
          'TRANSP:OPAQUE', 'END:VEVENT');
      });
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
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
  ['Den kontroly rozpisu (v noci před ním se uzamknou požadavky a vygeneruje rozpis; víkend/svátek → nejbližší pracovní den)', 12],
  ['E-mail pro upozornění (prázdné = vlastník tabulky)', ''],
  ['Adresa stránky pro lékaře', 'https://mazur-andrej.github.io/Sluzby-ARK/lekar.html'],
  ['Minimální odpočinek mezi službami (hodiny)', 11],
  ['Den po službě přes noc (24h, OUP noc): VŽDY VOLNO / VÝJIMEČNĚ / NE', 'VÝJIMEČNĚ'],
  ['Při schválení rozeslat rozpis lékařům e-mailem (ANO/NE)', 'ANO'],
  ['Připomenout lékařům bez požadavků – kolik dní před uzávěrkou (0 = v den uzávěrky; NE = nepřipomínat)', '3, 0'],
  ['Lékaři jen na JIP mají přesně tolik služeb měsíčně (0 = pravidlo vypnuto)', 4],
  ['Pozice JIP pro předchozí pravidlo (zkratky oddělené čárkou)', 'l1, l2'],
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
    .addItem('✔ Schválit a rozeslat rozpis lékařům', 'schvalitTed')
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
const checkDay = () => Number(getSetting(0)) || 12;
function adminEmail() { return getSetting(1) || Session.getEffectiveUser().getEmail(); }

/**
 * Den kontroly pro cílový měsíc = den N (výchozí 12.) v předchozím měsíci;
 * připadne-li na víkend nebo svátek, posune se na nejbližší pracovní den.
 * Uzávěrka požadavků = den před dnem kontroly (do konce dne).
 */
function checkDayOf(key) {
  const { year, month } = parseKey(key);
  const p = prevMonthOf(year, month);
  const days = buildMonth(p.year, p.month);
  let d = Math.min(Math.max(2, checkDay()), days.length);
  while (d < days.length && !days[d - 1].workday) d++;
  return { year: p.year, month: p.month, day: d };
}
function deadlineOf(key) {
  const c = checkDayOf(key);
  return { year: c.year, month: c.month, day: c.day - 1 };
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
/** Pravidlo „jen JIP = přesně N služeb“ z Nastavení (null = vypnuto). */
function fixedGroupSetting() {
  const n = Number(getSetting(7));
  if (!(n > 0)) return null;
  const ps = String(getSetting(8)).split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  return { label: 'JIP', positions: ps.length ? ps : FIXED_GROUP.positions, count: n };
}
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
  // doplní chybějící řádky nastavení (i do tabulky založené starší verzí), existující hodnoty nemění
  SETTINGS_DEFAULT.forEach((row, i) => {
    if (!setS.getRange(i + 1, 1).getValue()) setS.getRange(i + 1, 1, 1, 2).setValues([row]);
  });
  setS.setColumnWidth(1, 520); setS.setColumnWidth(2, 360);
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

// ---------------------------------------------------------------- připomínka požadavků
/** Dny před uzávěrkou, kdy se připomíná (z Nastavení, např. "3, 0"). */
function reminderDays() {
  if (/^\s*(ne|no|false)\b/i.test(String(getSetting(6)))) return [];
  return String(getSetting(6) ?? '').split(/[,;\s]+/).map((x) => x.trim()).filter((x) => x !== '').map(Number).filter((n) => Number.isInteger(n) && n >= 0);
}
/** Kolik dní zbývá do uzávěrky (0 = dnes je poslední den). */
function daysToDeadline(key) {
  const d = deadlineOf(key), t = todayParts();
  return Math.round((Date.UTC(d.year, d.month - 1, d.day) - Date.UTC(t.year, t.month - 1, t.day)) / 86400000);
}
/**
 * Spouští se každou noc: v nastavené dny před uzávěrkou pošle e-mail aktivním lékařům,
 * kteří ještě nezadali požadavky. Každá připomínka jde nejvýš jednou (pamatuje si ji).
 */
function pripomenoutPozadavky(key) {
  if (!isOpen(key)) return null;
  const left = daysToDeadline(key);
  if (!reminderDays().includes(left)) return null;
  const props = PropertiesService.getScriptProperties();
  const flag = `pripominka-${key}-${left}`;
  if (props.getProperty(flag)) return null;
  props.setProperty(flag, Utilities.formatDate(new Date(), TZ, 'd. M. yyyy HH:mm'));
  const reqs = readRequests(key);
  const { year, month } = parseKey(key);
  const dl = deadlineOf(key);
  const base = String(getSetting(2));
  const out = { sent: 0, noEmail: [], error: '' };
  for (const d of readDoctors().filter((x) => x.active && !reqs[x.id])) {
    if (!d.email) { out.noEmail.push(d.name); continue; }
    const link = `${base}?t=${d.token}`;
    const when = left === 0 ? 'dnes' : `${dl.day}. ${dl.month}. ${dl.year}`;
    const text = `Dobrý den,\n\nzatím jste nezadal/a požadavky na služby na ${MONTHS[month - 1]} ${year}. `
      + `Uzávěrka je ${when} (do konce dne).\n\nZadat je můžete zde: ${link}\n\n`
      + 'Pokud žádné požadavky nemáte, stačí stránku otevřít a stisknout „Uložit požadavky" – připomínky pak přestanou.';
    try {
      MailApp.sendEmail({ to: d.email, subject: `${left === 0 ? 'Dnes je uzávěrka' : 'Připomínka'}: požadavky na služby – ${MONTHS[month - 1]} ${year}`, body: text, name: 'Rozpis služeb' });
      out.sent++;
    } catch (e) { out.error = String(e.message || e); break; }
  }
  writeState(key, readState(key).status, `připomínka (${left} dní před uzávěrkou): ${out.sent} e-mailů${out.noEmail.length ? `, bez e-mailu ${out.noEmail.length}` : ''}${out.error ? `, CHYBA ${out.error}` : ''}`);
  return out;
}

// ---------------------------------------------------------------- automatika
/** Spouští se každou noc v 1:00. Po uzávěrce zamkne požadavky a vygeneruje rozpis. */
function denniKontrola() {
  const key = targetMonth();
  const st = readState(key).status;
  pripomenoutPozadavky(key);
  // ručně znovu otevřeno = čeká se na ruční generování; už vygenerováno = nic
  if (deadlinePassed(key) && st !== 'otevřeno' && !sheet(scheduleSheetName(key))) { generovat(key, true); return; }
  pripomenout();
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
  info(`Rozpis ${key} vygenerován, požadavky jsou uzamčeny. Lékaři ho uvidí až po „Schválit a rozeslat".${res.warnings.length ? '\n\nUpozornění:\n' + res.warnings.join('\n') : ''}`);
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
    const res = solve({ days, positions, doctors, requests, prev, seed: 1, restarts: 3, minRestHours: minRestHours(), afterNight: afterNightSetting(), fixedGroup: fixedGroupSetting() });
    writeSchedule(key, days, positions, doctors, res, prev);
    const missing = doctors.filter((d) => !requests[d.id]).map((d) => d.name);
    const note = [`vygenerováno`, res.warnings.length ? `${res.warnings.length} upozornění` : 'bez upozornění',
      missing.length ? `nezadali požadavky: ${missing.join(', ')}` : ''].filter(Boolean).join('; ');
    writeState(key, 'uzamčeno', note);
    if (notify) {
      try {
        MailApp.sendEmail(adminEmail(), `Rozpis služeb ${key} čeká na schválení`,
          `Požadavky na ${key} byly uzamčeny a rozpis je vygenerovaný v listu „${scheduleSheetName(key)}".\n` +
          `Lékaři ho zatím nevidí. Zkontrolujte ho, případně upravte, a pak v menu Rozpis služeb dejte „Schválit a rozeslat rozpis lékařům".\n\n` +
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


/** Co čeká na schválení: měsíce s rozpisem, jehož obsah se liší od poslední schválené verze. */
function pendingApprovals() {
  const cur = todayParts();
  const out = [];
  for (const k of [monthKey(cur.year, cur.month), targetMonth()]) {
    const snap = scheduleSnapshot(k);
    if (!snap) continue;
    const prev = lastSent(k);
    if (!prev) out.push({ key: k, first: true, changes: 0 });
    else if (prev.json !== JSON.stringify(snap)) out.push({ key: k, first: false, changes: diffSnapshots(JSON.parse(prev.json), snap).length, version: prev.version });
  }
  return out;
}

/** Menu: zobrazí, co se schválí, a po potvrzení schválí a rozešle. */
function schvalitTed() {
  const todo = pendingApprovals();
  if (!todo.length) { info('Není nic ke schválení – lékaři mají aktuální verzi.'); return; }
  const desc = todo.map((t) => (t.first ? `${t.key}: první verze rozpisu` : `${t.key}: verze ${t.version + 1} (${t.changes} změn oproti verzi ${t.version})`)).join('\n');
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { /* z editoru */ }
  if (ui) {
    const r = ui.alert(`Schválit a zveřejnit lékařům${sendSetting() ? ' (a rozeslat e-mailem)' : ''}?\n\n${desc}`, ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
  }
  info(todo.map((t) => schvalit(t.key)).join('\n\n'));
}

/** Schválí aktuální obsah rozpisu: uloží ho jako novou verzi (tu vidí lékaři) a rozešle e-mailem. */
function schvalit(key) {
  const r = rozeslat(key, { force: true, noEmail: !sendSetting() });
  if (r.error) return `${key}: NESCHVÁLENO – ${r.error}`;
  return `${key}: schválena verze ${r.version}${r.changes ? ` (${r.changes} změn)` : ''}` +
    (sendSetting() ? `, rozesláno ${r.sent} lékařům` : ', zveřejněno na stránkách lékařů (e-maily vypnuté)') +
    (r.noEmail.length && sendSetting() ? `\nbez e-mailu: ${r.noEmail.join(', ')}` : '') + (r.mailError ? `\nCHYBA odesílání: ${r.mailError}` : '');
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
    if (opts.noEmail) continue;
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

/** Noční připomínka správci: rozpis čeká na schválení nebo má neschválené změny. Lékařům se nic neposílá. */
function pripomenout() {
  const todo = pendingApprovals();
  if (!todo.length) return;
  const lines = todo.map((t) => (t.first ? `${t.key}: rozpis čeká na schválení – lékaři ho zatím nevidí` : `${t.key}: ${t.changes} neschválených změn – lékaři vidí verzi ${t.version}`));
  try {
    MailApp.sendEmail(adminEmail(), 'Rozpis služeb – čeká na schválení',
      lines.join('\n') + '\n\nPo kontrole dejte v menu Rozpis služeb „Schválit a rozeslat rozpis lékařům".\n\n' + ss().getUrl());
  } catch (e) { /* nevadí */ }
}

// ---------------------------------------------------------------- webové API
function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

function doGet(e) {
  const p = e.parameter || {};
  if (p.action === 'ics') {
    // odběr kalendáře: služby lékaře ze schválených rozpisů (Google/Apple kalendář si ho sám obnovuje)
    try { return ContentService.createTextOutput(icsFeed(String(p.t || ''))).setMimeType(ContentService.MimeType.ICAL); }
    catch (err) { return ContentService.createTextOutput(String(err.message || err)).setMimeType(ContentService.MimeType.TEXT); }
  }
  try { return json(handle(p, null)); } catch (err) { return json({ error: String(err.message || err) }); }
}

function icsFeed(token) {
  const doc = readDoctors().find((d) => d.token && d.token === token);
  if (!doc) throw new Error('Neplatný odkaz.');
  const t = todayParts();
  const from = monthKey(...Object.values(prevMonthOf(t.year, t.month)));
  const keys = ss().getSheets().map((s) => s.getName()).filter((n) => /^Rozpis \d{4}-\d{2}$/.test(n)).map((n) => n.slice(7))
    .filter((k) => k >= from && lastSent(k)).sort();
  const schedules = keys.map((k) => { const ls = lastSent(k); const snap = JSON.parse(ls.json); return { month: k, header: snap.header, rows: snap.rows, version: ls.version }; });
  return buildIcs({ schedules, positions: readPositions(), name: doc.name, uid: doc.id, calName: 'Moje služby' });
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
      schedules: ss().getSheets().map((s) => s.getName()).filter((n) => /^Rozpis \d{4}-\d{2}$/.test(n)).map((n) => n.slice(7)).filter((k) => lastSent(k)).sort().reverse(),
      awaiting: !!sheet(scheduleSheetName(key)) && !lastSent(key),
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
    // lékaři vidí jen poslední SCHVÁLENOU verzi, ne rozpracované úpravy v listu
    const m = String(p.month || '');
    const ls = /^\d{4}-\d{2}$/.test(m) ? lastSent(m) : null;
    if (!ls) return { error: 'Rozpis pro tento měsíc zatím nebyl schválen.' };
    const snap = JSON.parse(ls.json);
    return { month: m, header: snap.header, rows: snap.rows, me: doc.name, version: ls.version, sentAt: ls.at };
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
