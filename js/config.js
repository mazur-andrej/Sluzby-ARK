// Predvolené pozície (stĺpce rozpisu).
// start  = začiatok služby (HH:MM), hours = dĺžka v hodinách
//          (z toho program počíta odpočinok medzi službami a odpracované hodiny)
// workdaysOnly = slúži sa len v pracovné dni (nie víkend/sviatok)
// aliases = ako lekári pozíciu píšu v požiadavkách (napr. "chci KPECH" = plast)
export const DEFAULT_POSITIONS = [
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
export const DEFAULT_MIN_REST_HOURS = 11;
// Deň po službe, ktorá končí až nasledujúci deň (24 h, OUP noc):
//   'hard' = celý deň voľno vždy
//   'soft' = výnimočne smie mať večer ďalšiu službu (napr. 24 h do 7:30 a OUP noc od 19:00 = 11,5 h),
//            ale len keď by inak služba ostala neobsadená; každá výnimka sa nahlási
//   'off'  = stačí minimálny odpočinok v hodinách
export const DEFAULT_AFTER_NIGHT = 'soft';
export const AFTER_NIGHT_LABELS = {
  hard: 'Vždy celý další den volno',
  soft: 'Výjimečně – jen když by jinak zůstala služba neobsazená',
  off: 'Stačí minimální odpočinek v hodinách',
};
/** převod starého nastavení (true/false) na nový režim */
export const afterNightMode = (input) => (input.afterNight || (input.nextDayOff === false ? 'off' : input.nextDayOff === true ? 'hard' : DEFAULT_AFTER_NIGHT));

// Lekári, ktorí slúžia LEN na týchto pozíciách (JIP = lékař1, lékař2), majú presne `count` služieb mesačne.
// count = null → pravidlo vypnuté.
export const FIXED_GROUP = { label: 'JIP', positions: ['l1', 'l2'], count: 4 };

// Minimum služieb na pozícii: každý lekár s pozíciou `position`, ktorý NEMÁ žiadnu z `except`,
// má mesačne aspoň `min` služieb na tejto pozícii (napr. 2A aspoň 2×, okrem tých, čo slúžia aj 1A).
// min = 0 / null → pravidlo vypnuté.
export const POSITION_MIN = { position: '2A', min: 2, except: ['1A'] };

// ROZDELENIE PODĽA ZVYKLOSTÍ: 24 h služby a tečky sa rozdeľujú každé zvlášť podľa toho,
// koľko ich lekár obvykle mal (typical24 pri lekárovi, prepočítané na počet služieb v mesiaci); tečky rovnomerne (balance).
// Lekár bez zadaného obvyklého počtu dostane priemer. OUP sa rieši zvlášť (OUP_LIMIT).
export const CATEGORIES = {
  h24: { label: '24h', positions: ['l1', 'l2', '1A', '2A', 'plast'], field: 'typical24' },
  // tečky: rovnoměrně v celém poolu lékařů s tečkou; kdo má víc 24h služeb, má méně teček (a naopak), za 12 měsíců vyrovnaně
  tecky: { label: 'tečky', positions: ['t1', 't2'], balance: true },
};

// Dvojice pozic, které má lékař (pokud může obě) dostávat rovnoměrně: 2 služby = 1× + 1×, 3 = 2 + 1.
export const MIX_PAIRS = [['l1', 'l2'], ['t1', 't2'], ['OUPd', 'OUPn']];

// OUP: každý lekár s OUP pozíciou má aspoň `min` OUP služieb; kto chce viac, zvolí si počet v požiadavkách (= maximum).
export const OUP_LIMIT = { label: 'OUP', positions: ['OUPd', 'OUPn'], min: 2 };

// Skupinové označenia: "OUP" samotné = obe OUP pozície.
export const GROUP_ALIASES = { OUP: ['OUPd', 'OUPn'], 'tečka': ['t1', 't2'], tecka: ['t1', 't2'] };

/**
 * Časy služby v minútach od polnoci dňa, kedy služba začína: { start, end, hours, night }.
 * Pre staršie uložené dáta bez času sa použije predvolená pozícia s rovnakým id,
 * inak príznak night (24 h) / deň (12 h).
 */
export function shiftTimes(p) {
  const def = DEFAULT_POSITIONS.find((d) => d.id === p.id) || {};
  const startStr = p.start || def.start || '07:00';
  const m = String(startStr).match(/(\d{1,2})[:.](\d{2})/);
  const start = m ? (+m[1]) * 60 + (+m[2]) : 420;
  let hours = Number(p.hours);
  if (!(hours > 0)) hours = def.hours || (p.night ? 24 : 12);
  const end = start + Math.round(hours * 60);
  return { start, end, hours, night: end > 1440 };
}

// SPRAVODLIVOSŤ VÍKENDOV A SVIATKOV (len 24 h služby, nie OUP ani tečky):
// víkendy a sviatky sa vyrovnávajú za posledných `windowMonths` mesiacov, pomerne k počtu 24 h služieb;
// každý lekár má mesačne aspoň 1 víkendovú 24 h službu, ak to počty dovolia (inak striedanie).
// Počiatočný stav je pri lekárovi v poli `fair` (z rozpisov za mesiace FAIR_BASE_MONTHS).
// Váha dňa pre víkend: sobota/nedeľa = 1, piatok = 0,5 („pol víkendu“), ostatné 0.
export const FAIRNESS = { windowMonths: 12, weekendMin: 1, fridayWeight: 0.5 };
export const weekendWeight = (day) => (day.weekend ? 1 : day.dow === 5 ? FAIRNESS.fridayWeight : 0);
export const FAIR_BASE_MONTHS = ['2026-05', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
