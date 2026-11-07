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
export function buildIcs({ schedules, positions, name, uid, calName = 'Moje služby' }) {
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
