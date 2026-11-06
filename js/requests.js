// Spracovanie požiadaviek lekárov z textu alebo z tabuľky v dokumente.

export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Nájde lekára podľa mena v texte (porovnáva bez diakritiky, priezvisko). */
export function findDoctor(text, doctors) {
  const t = norm(text);
  if (!t) return null;
  let best = null, bestLen = 0;
  for (const d of doctors) {
    const n = norm(d.name);
    const surname = n.split(/\s+/).pop();
    const re = new RegExp(`(^|[^a-z])${surname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`);
    if (re.test(t) && surname.length > bestLen) { best = d; bestLen = surname.length; }
  }
  return best;
}

function findPosition(token, positions) {
  const t = norm(token).replace(/\s+/g, '');
  if (!t) return null;
  for (const p of positions) {
    const cands = [p.id, p.label, p.label.split('=').pop()].map((x) => norm(x).replace(/\s+/g, ''));
    if (cands.includes(t)) return p.id;
  }
  return null;
}

/** Z reťazca "1, 3-5, 12." vytiahne čísla dní. */
export function parseDays(s, maxDay = 31) {
  const out = [];
  // odstráň dátumy typu 12.11. -> 12
  const clean = String(s).replace(/(\d{1,2})\.\s*\d{1,2}\.(\s*\d{4})?/g, '$1');
  const re = /(\d{1,2})\s*(?:[-–—]|až|do)\s*(\d{1,2})|(\d{1,2})/g;
  let m;
  while ((m = re.exec(clean))) {
    if (m[1]) { const a = +m[1], b = +m[2]; for (let d = Math.min(a, b); d <= Math.max(a, b); d++) if (d >= 1 && d <= maxDay) out.push(d); }
    else if (+m[3] >= 1 && +m[3] <= maxDay) out.push(+m[3]);
  }
  return [...new Set(out)];
}

const OFF_WORDS = /(nechce|nechcem|nemoze|nemuze|nemozem|nemuzu|nemam|nie|ne\b|volno|dovolena|dovolenka|absence|nepritom|x\b)/;
const WANT_WORDS = /(chce|chcem|chci|preferuje|ano|ano\b|\+)/;

/**
 * Text požiadaviek, jeden lekár na riadok, napr.:
 *   Mazúr: nechce 3, 4, 10-14; chce 20, 22 OUPn
 *   Novák 1-5
 * Bez kľúčového slova sa dni berú ako "nechce".
 * Vráti { requests: {id:{off,want,note}}, unknown:[riadky] }
 */
export function parseRequestsText(text, doctors, positions, maxDay = 31) {
  const requests = {};
  const unknown = [];
  let current = null;
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const doc = findDoctor(line.split(/[:\t]/)[0], doctors) || findDoctor(line, doctors);
    let rest = line;
    if (doc) {
      current = doc;
      const surname = norm(doc.name).split(/\s+/).pop();
      const idx = norm(line).indexOf(surname);
      rest = line.slice(idx + surname.length).replace(/^[^:\t]*?[:\t]/, ' ');
      // ak je pred menom titul / krstné meno, nevadí
    } else if (!current || !/\d/.test(line) || !/^(\d|nechce|nemůže|nemôže|chce|chcem|chci|[-–+;,])/i.test(line)) {
      // riadok bez známeho mena, ktorý nie je pokračovaním predchádzajúceho
      unknown.push(line); current = null; continue;
    }
    const req = requests[current.id] || (requests[current.id] = { off: [], want: [], note: '' });
    // rozdeľ na časti podľa kľúčových slov
    const parts = rest.split(/;|\|/);
    let mode = 'off';
    for (const part of parts) {
      const segs = part.split(/(?=\b(?:nechce|nechcem|nemůže|nemôže|chce|chcem|chci|preferuje)\b)/i);
      for (const seg of segs) {
        const n = norm(seg);
        if (OFF_WORDS.test(n) && !/^\s*(chce|chcem|chci|preferuje)/.test(n)) mode = 'off';
        else if (WANT_WORDS.test(n)) mode = 'want';
        if (mode === 'want') {
          // dni s prípadnou pozíciou: "20 OUPn, 22"
          for (const chunk of seg.split(/,/)) {
            const ds = parseDays(chunk, maxDay);
            const words = chunk.replace(/[\d.\-–]+/g, ' ').replace(/\b(chce|chcem|chci|preferuje)\b/gi, ' ').trim();
            const posTok = findPosition(words, positions)
              || words.split(/\s+/).map((tk) => findPosition(tk, positions)).find(Boolean);
            for (const d of ds) req.want.push({ day: d, pos: posTok || null });
          }
        } else {
          req.off.push(...parseDays(seg, maxDay));
        }
      }
    }
    req.off = [...new Set(req.off)].sort((a, b) => a - b);
    if (!/\d/.test(rest)) req.note = (req.note ? req.note + '; ' : '') + rest.trim();
  }
  return { requests, unknown };
}

/**
 * Tabuľka požiadaviek: v prvom stĺpci meno, v hlavičke čísla dní 1..31,
 * v bunkách značka (X / N / - = nechce, S / C / + / ✓ = chce, prípadne skratka pozície).
 */
export function parseRequestsTable(rows, doctors, positions, maxDay = 31) {
  const hi = rows.findIndex((r) => r.filter((c) => /^\s*\d{1,2}\.?\s*$/.test(c)).length >= 10);
  if (hi < 0) return null;
  const dayCols = rows[hi].map((c) => (/^\s*\d{1,2}\.?\s*$/.test(c) ? parseInt(c, 10) : null));
  const requests = {};
  const unknown = [];
  for (const r of rows.slice(hi + 1)) {
    const nameCell = r.find((c, i) => dayCols[i] == null && c.trim()) || '';
    const doc = findDoctor(nameCell, doctors);
    if (!doc) { if (r.some((c) => c.trim())) unknown.push(nameCell || r.join(' ')); continue; }
    const req = requests[doc.id] || (requests[doc.id] = { off: [], want: [], note: '' });
    r.forEach((c, i) => {
      const day = dayCols[i];
      const v = norm(c);
      if (day == null || !v || day > maxDay) return;
      const pos = findPosition(c, positions);
      if (pos || /^(s|c|\+|✓|v|a|ano|chce|sl)$/.test(v)) req.want.push({ day, pos });
      else req.off.push(day);
    });
  }
  return { requests, unknown };
}

/** Spojí požiadavky (novšie prepíšu staršie pre toho istého lekára). */
export function mergeRequests(base, add) {
  const out = { ...base };
  for (const [id, r] of Object.entries(add)) out[id] = { off: [...r.off], want: [...r.want], note: r.note || '' };
  return out;
}
