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
const WANT_WORDS = /(chce|chcem|chci|preferuje|ano|\+)/;

/**
 * Text požiadaviek, jeden lekár na riadok, napr.:
 *   Novák: nechce 3, 4, 10-14; chce 20, 22 OUPn
 *   Černý 1-5
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

/** Spojí požiadavky (novšie prepíšu staršie pre toho istého lekára; zvolený počet OUP zostane). */
export function mergeRequests(base, add) {
  const out = { ...base };
  for (const [id, r] of Object.entries(add)) {
    out[id] = { off: [...r.off], want: [...r.want], ban: [...(r.ban || [])], notes: { ...(r.notes || {}) }, note: r.note || '' };
    for (const k of ['oupMax', 'max', 'exact']) { const v = r[k] ?? base[id]?.[k]; if (v) out[id][k] = v; } // volby na měsíc zůstanou
  }
  return out;
}

// ---------------- Excel tabuľka požiadaviek ----------------

const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Nájde pozície spomenuté v texte (podľa id, názvu a aliasov). */
export function mentionedPositions(text, positions, groupAliases = {}) {
  const t = ` ${norm(text)} `;
  const found = new Set();
  const matches = (alias) => {
    const a = norm(alias).split(/\s+/).map(reEsc).join('\\s*');
    return a && new RegExp(`(^|[^a-z0-9])${a}($|[^a-z0-9])`).test(t);
  };
  for (const p of positions) {
    if ([p.id, p.label, ...(p.aliases || [])].some(matches)) found.add(p.id);
  }
  // skupina (napr. "OUP") len ak nebola spomenutá konkrétna pozícia zo skupiny
  for (const [alias, ids] of Object.entries(groupAliases)) {
    if (ids.some((id) => found.has(id))) continue;
    if (matches(alias)) ids.forEach((id) => found.add(id));
  }
  return [...found];
}

const EXTERNAL = /(kurz|konferen|dov|dovol|svatb|cktch|nvs|cplb|nah|rehabil|skoleni|školen|po sluzbe|nemoc|ocr)/;
const WANT = /(chci|chce|chcem|^chi\b|ano|prosim|prosím|slouzit|sloužit|sluzb|služb|pls|^\+$|^ok$|^sl\.?$)/;

/**
 * Rozpozná význam bunky z tabuľky požiadaviek.
 * Vráti {type:'off'} | {type:'want', pos:[]|null} | {type:'ban', pos:[]} | {type:'unknown'} | null
 */
export function classifyCell(raw, positions, groupAliases = {}) {
  const t = norm(raw).replace(/\s+/g, ' ');
  if (!t) return null;
  const pos = mentionedPositions(t, positions, groupAliases);
  const startsX = /^x+\b|^x[,.\-\s]|^x$/.test(t);
  const neg = /(^|\s)(ne|nie|nechci|nechce|bez)\s/.test(` ${t} `) || /^ne\b/.test(t);
  if (/ne odd/.test(t)) return { type: 'off' };
  // „x“ s jakoukoli poznámkou („X OUP“, „x kurz“, „x cktch noc“…) = ten den žádná služba
  if (startsX) return { type: 'off' };
  if (neg && pos.length) return { type: 'ban', pos };
  if (neg) return { type: 'off' };
  if (EXTERNAL.test(t)) return { type: 'off' };
  if (WANT.test(t) || pos.length) return { type: 'want', pos: pos.length ? pos : null };
  return { type: 'unknown' };
}

const DATE_RE = /(\d{1,2})\.\s*(\d{1,2})\./;

/** Vyberie z hárkov ten, ktorý obsahuje dni daného mesiaca. */
export function pickSheet(sheets, month) {
  let best = null, bestCount = 0;
  for (const s of sheets) {
    for (const row of s.rows.slice(0, 10)) {
      const c = row.filter((x) => { const m = String(x).match(DATE_RE); return m && +m[2] === month; }).length;
      if (c > bestCount) { best = s; bestCount = c; }
    }
  }
  return bestCount >= 10 ? best : null;
}

/**
 * Hárok požiadaviek: hlavička s dátumami ("ne 1.11."), v riadkoch mená lekárov.
 * Stĺpce iného mesiaca sa ignorujú.
 */
export function parseRequestsSheet(rows, doctors, positions, month, groupAliases = {}) {
  const hi = rows.findIndex((r) => r.filter((c) => DATE_RE.test(String(c))).length >= 10);
  if (hi < 0) return null;
  const header = rows[hi];
  const nameCol = (r) => r.findIndex((c) => /[a-zá-ž]{3}/i.test(String(c)) && !DATE_RE.test(String(c)));
  // Detekcia posunu: v niektorých tabuľkách sú dáta o stĺpec vedľa hlavičky.
  // Zvolí sa posun, pri ktorom najmenej vyplnených buniek padne mimo stĺpcov s dátumom.
  const dateAt = (i) => DATE_RE.test(String(header[i] ?? ''));
  let shift = 0, bestMiss = Infinity;
  for (const s of [0, 1, -1]) {
    // + stĺpec s dátumom, pod ktorým by nebolo nič vyplnené (pri 50 lekároch nepravdepodobné)
    let miss = 0;
    const filled = new Set();
    for (const r of rows.slice(hi + 1)) {
      if (!r) continue;
      const nc = nameCol(r);
      if (nc < 0) continue;
      r.forEach((c, i) => {
        if (i <= nc || !String(c).trim()) return;
        if (dateAt(i - s)) filled.add(i - s); else miss++;
      });
    }
    header.forEach((h, i) => {
      const m = String(h ?? '').match(DATE_RE);
      if (m && +m[2] === month && !filled.has(i)) miss += 3;
    });
    if (miss < bestMiss) { bestMiss = miss; shift = s; }
  }
  const dayCols = header.map((_, i) => { const m = String(header[i - shift] ?? '').match(DATE_RE); return m && +m[2] === month ? +m[1] : null; });
  for (let i = header.length; i < header.length + 2; i++) { const m = String(header[i - shift] ?? '').match(DATE_RE); dayCols[i] = m && +m[2] === month ? +m[1] : null; }
  const requests = {}, unknown = [], unclear = [], inactive = [];
  const order = []; // ID lékařů v pořadí řádků = podle zkušenosti
  // kopie tabulky tak, jak ji lékaři vyplnili (texty buněk podle dne) – k zobrazení v aplikaci
  const dayLabel = {};
  header.forEach((h, i) => { const m = String(h ?? '').match(DATE_RE); if (m && +m[2] === month) dayLabel[+m[1]] = String(h).trim(); });
  const table = { days: Object.keys(dayLabel).map(Number).sort((a, b) => a - b), labels: dayLabel, rows: [] };
  for (const r of rows.slice(hi + 1)) {
    if (!r || !r.some((c) => String(c).trim())) continue;
    const nc = nameCol(r);
    const nameCell = nc >= 0 && dayCols[nc] == null ? String(r[nc]) : '';
    const trow = { name: nameCell.trim(), cells: {} };
    r.forEach((c, i) => { const day = dayCols[i]; if (day != null && String(c).trim()) trow.cells[day] = String(c).trim(); });
    if (trow.name || Object.keys(trow.cells).length) table.rows.push(trow);
    if (!nameCell) continue; // riadok bez mena (napr. pomocné značky)
    const doc = findDoctor(nameCell, doctors);
    if (doc) trow.id = doc.id;
    if (!doc) { unknown.push(nameCell); continue; }
    if (!order.includes(doc.id)) order.push(doc.id);
    if (!doc.active) { inactive.push(doc.name); continue; }
    const req = { off: [], want: [], ban: [], notes: {}, note: '' };
    r.forEach((c, i) => {
      const day = dayCols[i];
      if (day == null || !String(c).trim()) return;
      const raw = String(c).trim();
      // OUP je domovské pracoviště lékaře: „OUP“ v buňce = ten den je na OUP, službu nechce
      const k = doc.oupHome && /(^|[^a-z])oup/.test(norm(raw)) ? { type: 'off' } : classifyCell(raw, positions, groupAliases);
      if (!/^x+$/i.test(raw)) req.notes[day] = raw;
      if (!k) return;
      if (k.type === 'off') req.off.push(day);
      // „jen jeden z …“ / „jednu z …“ = z těchto dnů chce lékař jen jeden
      else if (k.type === 'want') req.want.push({ day, pos: k.pos, ...(/(jeden|jedna|jednu|jen 1|1 z)/.test(norm(raw)) ? { group: 'jeden' } : {}) });
      else if (k.type === 'ban') req.ban.push({ day, pos: k.pos });
      else unclear.push(`${doc.name} ${day}.: „${raw}"`);
    });
    requests[doc.id] = req;
  }
  return { requests, unknown, unclear, inactive, shift, order, table };
}
