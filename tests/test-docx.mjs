// node tests/test-docx.mjs cesta/k/rozpisu.docx – overí načítanie rozpisu z Wordu
import { readFileSync } from 'node:fs';
import { readDocx, parseScheduleTable } from '../js/docx.js';
const f = process.argv[2];
const doc = await readDocx(readFileSync(f));
const s = parseScheduleTable(doc.tables);
console.log(s.header.join(' | '));
console.log(s.rows.length, 'dní;', s.rows[0], s.rows.at(-1));
