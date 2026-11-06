# Rozpis služieb lekárov

Webová aplikácia na automatické vytvorenie mesačného rozpisu služieb podľa požiadaviek lekárov.
Beží celá v prehliadači – nič sa neinštaluje a dáta neopúšťajú počítač (ukladajú sa v prehliadači).

## Spustenie

- **Online:** zapnite GitHub Pages (Settings → Pages → Branch `main`, priečinok `/`). Aplikácia potom beží na `https://<účet>.github.io/<repozitár>/`.
- **Lokálne:** v priečinku spustite `python3 -m http.server` a otvorte `http://localhost:8000`.
  (Priame otvorenie `index.html` dvojklikom nefunguje, prehliadač blokuje moduly zo súborov.)

## Postup každý mesiac

1. Šípkami hore zvoľte mesiac.
2. **Požiadavky**
   - *Rozpis minulého mesiaca (.docx)* – načíta posledné dni minulého mesiaca, aby lekár po nočnej 30./31. nemal službu hneď 1.
     Ak bol minulý mesiac vytvorený v aplikácii, netreba nič načítať.
   - *Vložiť dokument s požiadavkami* – Excel s požiadavkami (.xlsx, hárok sa vyberie podľa mesiaca), prípadne .docx / .txt / .csv alebo *Vložiť text*.
   - V tabuľke sa dá klikaním doplniť alebo opraviť: ✗ nechce → ✓ chce → prázdne. Pravý klik = „chce" na konkrétnej pozícii.
3. **Rozpis** → *Vygenerovať rozpis*. *Iná varianta* vytvorí iné rozloženie.
   - Bunku zmeníte výberom lekára, zmena sa zamkne a pri ďalšom generovaní ostane.
   - Vpravo je prehľad: počet služieb vs. cieľ, víkendy, nočné. Kliknutím na lekára sa zvýraznia jeho služby.
4. *Stiahnuť .docx* – rozpis v rovnakom formáte ako doteraz (červená hlavička, víkendy a sviatky žlté).

## Excel s požiadavkami

Hárok na mesiac, v prvom riadku dátumy (`ne 1.11.`, `po 2.11.` …), v riadkoch priezviská lekárov. Význam buniek:

| V bunke | Význam |
|---|---|
| `x`, `X`, `x kurz`, `X Konference`, `x DOV`, `CKTCH`, `NVS CKTCH` … | nechce / nemôže |
| `chci`, `Ano`, `prosím službu`, `sluzba pls`, `sloužit` … | chce slúžiť (kdekoľvek) |
| `chci KPECH`, `A1 prosím`, `prosím OUP noc`, `OUP den` | chce slúžiť na danej pozícii |
| `ne OUP`, `X OUP`, `Prosím nie OUP`, `Ne OUP den` | môže, ale nie na danej pozícii |
| `X, nebo OUP den` | môže len na danej pozícii |

Ako lekári označujú pozície (KPECH = plast, A1 = 1A …) sa dá upraviť v Nastaveniach.
Aplikácia sama rozpozná, ak sú dáta posunuté o stĺpec oproti hlavičke (tak je to v súčasnej tabuľke) a upozorní na bunky, ktorým nerozumie.

Overené na hárkoch august–november 2026 proti skutočným rozpisom: priania sedia (napr. august 39/39), na „x" dňoch boli len 1–3 výnimky mesačne.

## Formát textových požiadaviek

Jeden lekár na riadok, bez kľúčového slova sa dni berú ako „nechce":

```
Mazúr: nechce 3, 4, 10-14; chce 20, 22 OUP noc
Suk 1-5
Zvoníčková – nemůže 24.12., 25.12.
```

Tabuľka v dokumente: mená v prvom stĺpci, čísla dní 1–31 v hlavičke, v bunkách `X` = nechce, `S` / `C` / `+` alebo skratka pozície = chce.

## Lekári

Na karte **Lekári** sa nastavuje pre každého lekára:
- na ktorých pozíciách môže slúžiť (stĺpce lékař1 … OUP noc),
- **Cieľ** – koľko služieb mesačne má mať, **Max** – tvrdý strop,
- **Aktívny** – odškrtnúť pri dlhodobej neprítomnosti alebo odchode. Nový lekár sa pridáva hore.

Predvolený zoznam je odvodený z rozpisov máj–november 2026 (pozícia povolená, ak tam lekár slúžil aspoň 2×) – **treba ho skontrolovať**.
Dáta sa ukladajú v prehliadači; *Záloha (JSON)* ich uloží do súboru (odporúčané pravidelne, aj na prenos na iný počítač).

## Pravidlá

Vždy dodržané:
- lekár slúži len na povolených pozíciách a nie v dni, ktoré si vyškrtol,
- najviac 1 služba denne, po nočnej službe nasledujúci deň voľno,
- tečky len v pracovné dni (české sviatky sa počítajú automaticky, ďalšie v Nastaveniach).

Optimalizované (váhy v Nastaveniach): počet služieb podľa cieľa, férové víkendy/sviatky, rozostup medzi službami, priania „chce".

## Vývoj

Bez závislostí, čistý JavaScript (ES moduly). Testy: `node tests/test-solver.mjs`, `node tests/test-requests.mjs`, `node tests/test-xlsx.mjs požiadavky.xlsx 11`.

```
index.html, css/style.css
js/app.js             rozhranie
js/solver.js          algoritmus (greedy + simulované žíhanie)
js/requests.js        čítanie požiadaviek
js/docx.js            čítanie/zápis .docx
js/xlsx.js            čítanie .xlsx
js/calendar.js        dni, sviatky
js/config.js          pozície
js/default-doctors.js východiskový zoznam lekárov
```
