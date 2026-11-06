import { readFileSync } from 'node:fs';
import { parseRequestsText } from '../js/requests.js';
import { DEFAULT_POSITIONS } from '../js/config.js';
import { DEFAULT_DOCTORS } from '../js/default-doctors.js';
const doctors = DEFAULT_DOCTORS;
const txt = `MUDr. Andrej Mazúr: nechce 3, 4, 10-14; chce 20, 22 OUP noc
Suk 1-5
Zvoníčková – nemůže 24.12., 25.12.
Pitrová: chce 6 OUPd, 7; nemôže 15-17
neznámy text bez dní
Kristián Novák: 5`;
const r = parseRequestsText(txt, doctors, DEFAULT_POSITIONS, 31);
console.log(JSON.stringify(r, null, 0));
