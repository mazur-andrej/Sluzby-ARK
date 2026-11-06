// Predvolené pozície (stĺpce rozpisu).
// night = služba cez noc (nasledujúci deň musí mať lekár voľno)
// workdaysOnly = slúži sa len v pracovné dni (nie víkend/sviatok)
export const DEFAULT_POSITIONS = [
  { id: 'l1', label: 'lékař1', night: true, workdaysOnly: false },
  { id: 'l2', label: 'lékař2', night: true, workdaysOnly: false },
  { id: '1A', label: 'lékař3=1A', night: true, workdaysOnly: false },
  { id: '2A', label: 'lékař4=2A', night: true, workdaysOnly: false },
  { id: 'plast', label: 'lékař5=plast', night: true, workdaysOnly: false },
  { id: 't1', label: 'tečka1', night: false, workdaysOnly: true },
  { id: 't2', label: 'tečka2', night: false, workdaysOnly: true },
  { id: 'OUPd', label: 'OUP den', night: false, workdaysOnly: false },
  { id: 'OUPn', label: 'OUP noc', night: true, workdaysOnly: false },
];
