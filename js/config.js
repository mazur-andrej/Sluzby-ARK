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

// Počet OUP služieb, ktorý si lekár sám volí v požiadavkách (ako maximum; najmenej `min`).
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
