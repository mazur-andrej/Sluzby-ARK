// Čítanie .xlsx bez externých knižníc. Vráti hárky ako 2D pole textov.
import { unzip } from './docx.js';

const decodeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
const textOf = (xml) => decodeXml((xml.match(/<t(?:\s[^>]*)?>[^<]*<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join(''));

function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Excelové sériové číslo dátumu -> "d.m." */
function serialToDate(v) {
  const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
}

/** @returns {Promise<Array<{name:string, rows:string[][]}>>} */
export async function readXlsx(buffer) {
  const files = await unzip(buffer);
  const dec = new TextDecoder();
  const get = (n) => (files.has(n) ? dec.decode(files.get(n)) : '');
  const shared = (get('xl/sharedStrings.xml').match(/<si>[\s\S]*?<\/si>/g) || []).map(textOf);
  const wb = get('xl/workbook.xml');
  const rels = get('xl/_rels/workbook.xml.rels');
  const relMap = new Map([...rels.matchAll(/<Relationship [^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  // niektoré súbory majú poradie atribútov Target pred Id
  for (const m of rels.matchAll(/<Relationship [^>]*?Target="([^"]+)"[^>]*?Id="([^"]+)"/g)) relMap.set(m[2], m[1]);
  const sheets = [];
  for (const m of wb.matchAll(/<sheet [^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"/g)) {
    let target = relMap.get(m[2]) || '';
    target = target.replace(/^\/?xl\//, '').replace(/^\//, '');
    const xml = get(`xl/${target}`);
    if (!xml) continue;
    const rows = [];
    for (const r of xml.match(/<row[ >][\s\S]*?<\/row>/g) || []) {
      const ri = +(r.match(/<row [^>]*?r="(\d+)"/) || [])[1] - 1 || rows.length;
      const row = [];
      for (const c of r.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
        const ref = (c.match(/ r="([A-Z]+\d+)"/) || [])[1];
        if (!ref) continue;
        const t = (c.match(/ t="([^"]+)"/) || [])[1];
        const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let val = '';
        if (t === 's') val = shared[+v] ?? '';
        else if (t === 'inlineStr') val = textOf(c);
        else if (t === 'str' || t === 'b') val = v != null ? decodeXml(v) : '';
        else if (v != null) { const num = +v; val = num > 30000 && num < 80000 ? serialToDate(num) : String(v); }
        row[colIndex(ref)] = String(val).trim();
      }
      rows[ri] = Array.from(row, (x) => x ?? '');
    }
    sheets.push({ name: decodeXml(m[1]), rows: Array.from(rows, (x) => x ?? []) });
  }
  return sheets;
}
