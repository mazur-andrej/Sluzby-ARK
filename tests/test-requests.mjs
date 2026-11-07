import { readFileSync } from 'node:fs';
import { parseRequestsText } from '../js/requests.js';
import { DEFAULT_POSITIONS } from '../js/config.js';
// Smyšlení lékaři pro test parseru
const doctors = ['Novák', 'Dvořáková', 'Černý', 'Procházka', 'Kučerová'].map((name, i) => ({ id: 'd' + i, name, active: true, positions: ['l2', 'OUPd', 'OUPn'] }));
const txt = `MUDr. Jan Novák: nechce 3, 4, 10-14; chce 20, 22 OUP noc
Černý 1-5
Dvořáková – nemůže 24.12., 25.12.
Kučerová: chce 6 OUPd, 7; nemôže 15-17
neznámy text bez dní
Petr Malý: 5`;
const r = parseRequestsText(txt, doctors, DEFAULT_POSITIONS, 31);
console.log(JSON.stringify(r, null, 0));
