// Predvolené pozície (stĺpce rozpisu).
// night = služba cez noc (nasledujúci deň musí mať lekár voľno)
// workdaysOnly = slúži sa len v pracovné dni (nie víkend/sviatok)
// aliases = ako lekári pozíciu píšu v požiadavkách (napr. "chci KPECH" = plast)
export const DEFAULT_POSITIONS = [
  { id: 'l1', label: 'lékař1', night: true, workdaysOnly: false, aliases: ['lekar1', 'lékař 1'] },
  { id: 'l2', label: 'lékař2', night: true, workdaysOnly: false, aliases: ['lekar2', 'lékař 2'] },
  { id: '1A', label: 'lékař3=1A', night: true, workdaysOnly: false, aliases: ['A1', '1A'] },
  { id: '2A', label: 'lékař4=2A', night: true, workdaysOnly: false, aliases: ['A2', '2A'] },
  { id: 'plast', label: 'lékař5=plast', night: true, workdaysOnly: false, aliases: ['KPECH', 'plast', 'plastika'] },
  { id: 't1', label: 'tečka1', night: false, workdaysOnly: true , aliases: ['tečka 1', 'tecka1', 't1'] },
  { id: 't2', label: 'tečka2', night: false, workdaysOnly: true , aliases: ['tečka 2', 'tecka2', 't2'] },
  { id: 'OUPd', label: 'OUP den', night: false, workdaysOnly: false, aliases: ['OUP den', 'OUPden'] },
  { id: 'OUPn', label: 'OUP noc', night: true, workdaysOnly: false, aliases: ['OUP noc', 'OUPnoc'] },
];

// Skupinové označenia: "OUP" samotné = obe OUP pozície.
export const GROUP_ALIASES = { OUP: ['OUPd', 'OUPn'], 'tečka': ['t1', 't2'], tecka: ['t1', 't2'] };
