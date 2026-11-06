// Čítanie a zápis .docx bez externých knižníc (ZIP + WordprocessingML).

// ---------- ZIP ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Rozbalí ZIP, vráti Map(názov -> Uint8Array). */
export async function unzip(buffer) {
  const u8 = new Uint8Array(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Soubor není platný .docx/.xlsx (ZIP).');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = new Map();
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    const lnlen = dv.getUint16(local + 26, true), lelen = dv.getUint16(local + 28, true);
    const start = local + 30 + lnlen + lelen;
    const data = u8.subarray(start, start + csize);
    files.set(name, method === 0 ? data.slice() : method === 8 ? await inflateRaw(data) : null);
    p += 46 + nlen + elen + clen;
  }
  return files;
}

/** Zabalí súbory (Map/obj názov -> string|Uint8Array) do ZIP bez kompresie. */
export function zip(entries) {
  const enc = new TextEncoder();
  const list = Object.entries(entries).map(([name, data]) => ({
    name: enc.encode(name), data: typeof data === 'string' ? enc.encode(data) : data,
  }));
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of list) {
    const crc = crc32(f.data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
    h.setUint16(8, 0, true); h.setUint32(14, crc, true);
    h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true);
    h.setUint16(26, f.name.length, true);
    parts.push(new Uint8Array(h.buffer), f.name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true);
    c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true);
    c.setUint16(28, f.name.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), f.name);
    offset += 30 + f.name.length + f.data.length;
  }
  const csize = central.reduce((s, a) => s + a.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, list.length, true); e.setUint16(10, list.length, true);
  e.setUint32(12, csize, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)],
    { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

// ---------- Čítanie obsahu ----------
const decodeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function paragraphsText(xml) {
  const paras = xml.match(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g) || [];
  return paras.map((p) => {
    const marked = p.replace(/<w:tab\/>/g, '<w:t>\t</w:t>').replace(/<w:br\/>/g, '<w:t>\n</w:t>');
    const runs = marked.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) || [];
    return decodeXml(runs.map((r) => r.replace(/<[^>]+>/g, '')).join(''));
  });
}

/** Načíta .docx: { tables: [[[bunka]]], paragraphs: [text], text } */
export async function readDocx(buffer) {
  const files = await unzip(buffer);
  const doc = files.get('word/document.xml');
  if (!doc) throw new Error('V souboru chybí word/document.xml.');
  const xml = new TextDecoder().decode(doc);
  const tables = [];
  // Tabuľky (bez vnorených tabuliek)
  const tblRe = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
  for (const t of xml.match(tblRe) || []) {
    const rows = (t.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []).map((r) =>
      (r.match(/<w:tc>[\s\S]*?<\/w:tc>|<w:tc [\s\S]*?<\/w:tc>/g) || [])
        .map((c) => paragraphsText(c).join('\n').trim()));
    tables.push(rows);
  }
  const body = xml.replace(tblRe, '');
  const paragraphs = paragraphsText(body).filter((p) => p.trim());
  const text = [...paragraphs, ...tables.flat().map((r) => r.join('\t'))].join('\n');
  return { tables, paragraphs, text };
}

/**
 * Z tabuľky rozpisu vytiahne riadky s dátumom.
 * Vráti { header: [...], rows: [{day, month, cells:[...]}] }
 */
export function parseScheduleTable(tables) {
  for (const t of tables) {
    const hi = t.findIndex((r) => r.some((c) => /lékař|tečka|OUP/i.test(c)));
    if (hi < 0) continue;
    const header = t[hi];
    const rows = [];
    for (const r of t.slice(hi + 1)) {
      const m = (r[0] || '').match(/(\d{1,2})\.\s*(\d{1,2})\./);
      if (m) rows.push({ day: +m[1], month: +m[2], cells: r.slice(1) });
    }
    return { header, rows };
  }
  return null;
}

// ---------- Zápis rozpisu ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function cell(text, width, fill) {
  const shd = fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '';
  const rpr = '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>';
  const b = '<w:top w:val="single" w:sz="6" w:space="0" w:color="CCCCCC"/><w:left w:val="single" w:sz="6" w:space="0" w:color="CCCCCC"/><w:bottom w:val="single" w:sz="6" w:space="0" w:color="CCCCCC"/><w:right w:val="single" w:sz="6" w:space="0" w:color="CCCCCC"/>';
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:tcBorders>${b}</w:tcBorders>${shd}<w:tcMar><w:left w:w="40" w:type="dxa"/></w:tcMar><w:vAlign w:val="bottom"/></w:tcPr>`
    + `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>${rpr}</w:pPr>`
    + (text ? `<w:r>${rpr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>` : '') + '</w:p></w:tc>';
}

/**
 * Vytvorí .docx s rozpisom v rovnakom formáte ako doterajšie rozpisy.
 * rows: [{label, cells:[...], fill:'EA9999'|'FCE8B2'|null}]
 */
export function buildScheduleDocx(header, rows, title) {
  const total = 10200;
  const first = 900;
  const w = Math.floor((total - first) / (header.length - 1));
  const widths = header.map((_, i) => (i === 0 ? first : w));
  const grid = widths.map((x) => `<w:gridCol w:w="${x}"/>`).join('');
  const tr = (cells, fill) => `<w:tr><w:trPr><w:trHeight w:val="300"/></w:trPr>${cells.map((c, i) => cell(c, widths[i], typeof fill === 'function' ? fill(i) : fill)).join('')}</w:tr>`;
  let body = '';
  if (title) {
    body += `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>${esc(title)}</w:t></w:r></w:p>`;
  }
  body += `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>`;
  body += tr(header, 'EA9999');
  for (const r of rows) body += tr([r.label, ...r.cells], r.fill);
  body += '</w:tbl><w:p/>';
  const sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}${sect}</w:body></w:document>`;
  return zip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': documentXml,
  });
}
