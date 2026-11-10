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

// OUP jako domovské pracoviště: „OUP“ = ten den nechce službu
{
  const { parseRequestsSheet } = await import('../js/requests.js');
  const { DEFAULT_POSITIONS, GROUP_ALIASES } = await import('../js/config.js');
  const docs = [{ id: 'a', name: 'Zubíková', active: true, positions: ['2A'], oupHome: true }, { id: 'b', name: 'Kříž', active: true, positions: ['l2', 'OUPd', 'OUPn'] }];
  const hd = ['prosinec', ...Array.from({ length: 31 }, (_, i) => `${i + 1}.12.`)];
  const row = (n, a, b) => [n, a, b, ...Array(29).fill('')];
  const rows = [hd, row('Zubíková', 'OUP', 'chci'), row('Kříž', 'OUP', '')];
  const r = parseRequestsSheet(rows, docs, DEFAULT_POSITIONS, 12, GROUP_ALIASES).requests;
  const ok = r.a.off.includes(1) && r.a.want.some((w) => w.day === 2) && r.b.want.some((w) => w.day === 1 && w.pos.includes('OUPd'));
  console.log(ok ? '✔' : '✘', 'OUP = pracoviště: Zubíková „OUP“ → nechce službu; u Kříže „OUP“ → chce OUP');
  if (!ok) process.exit(1);
}
