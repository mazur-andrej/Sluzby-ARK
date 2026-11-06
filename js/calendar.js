// Kalendár: dni v mesiaci, víkendy, české štátne sviatky.

export const DAY_ABBR = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
export const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen',
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
export function czechHolidays(year) {
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
export function buildMonth(year, month, extraHolidays = []) {
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

export function prevMonthOf(year, month) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}
