# Rozpis služeb lékařů

Webová aplikace pro automatické sestavení měsíčního rozpisu služeb podle požadavků lékařů.
Běží celá v prohlížeči – nic se neinstaluje a data neopouštějí počítač (ukládají se v prohlížeči).

**Aplikace:** https://mazur-andrej.github.io/Sluzby-ARK/

## Spuštění

- **Online:** GitHub Pages (Settings → Pages → Branch `main`, složka `/`).
- **Lokálně:** ve složce spusťte `python3 -m http.server` a otevřete `http://localhost:8000`.
  (Přímé otevření `index.html` dvojklikem nefunguje, prohlížeč blokuje moduly ze souborů.)

## Postup každý měsíc

1. Šipkami nahoře zvolte měsíc.
2. **Požadavky**
   - *Rozpis minulého měsíce (.docx)* – načte poslední dny minulého měsíce, aby lékař po noční 30./31. neměl službu hned 1.
     Pokud byl minulý měsíc vytvořen v aplikaci, není třeba nic načítat.
   - *Vložit soubor s požadavky* – Excel s požadavky (.xlsx, list se vybere podle měsíce), případně .docx / .txt / .csv, nebo *Vložit text*.
   - V tabulce lze klikáním doplnit nebo opravit: ✗ nechce → ✓ chce → prázdné. Pravý klik = „chce" na konkrétní pozici.
3. **Rozpis** → *Vygenerovat rozpis*. *Jiná varianta* vytvoří jiné rozložení.
   - Buňku změníte výběrem lékaře, změna se zamkne a při dalším generování zůstane.
   - Vpravo je přehled: počet služeb vs. cíl, víkendy, noční. Kliknutím na lékaře se zvýrazní jeho služby.
4. *Stáhnout .docx* – rozpis ve stejném formátu jako dosud (červené záhlaví, víkendy a svátky žlutě).

## Excel s požadavky

List pro každý měsíc, v prvním řádku data (`ne 1.11.`, `po 2.11.` …), v řádcích příjmení lékařů. Význam buněk:

| V buňce | Význam |
|---|---|
| `x`, `X`, `x kurz`, `X Konference`, `x DOV`, `CKTCH`, `NVS CKTCH` … | nechce / nemůže |
| `chci`, `Ano`, `prosím službu`, `sluzba pls`, `sloužit` … | chce sloužit (kdekoli) |
| `chci KPECH`, `A1 prosím`, `prosím OUP noc`, `OUP den` | chce sloužit na dané pozici |
| `ne OUP`, `X OUP`, `Prosím nie OUP`, `Ne OUP den` | může, ale ne na dané pozici |
| `X, nebo OUP den` | může jen na dané pozici |

Jak lékaři označují pozice (KPECH = plast, A1 = 1A …) lze upravit v Nastavení.
Aplikace sama pozná, když jsou data posunutá o sloupec oproti záhlaví (tak je to v současné tabulce), a upozorní na buňky, kterým nerozumí.

Ověřeno na listech srpen–listopad 2026 proti skutečným rozpisům: přání sedí (např. srpen 39/39), na dnech s „x" byly jen 1–3 výjimky měsíčně.

## Textové požadavky

Jeden lékař na řádek, bez klíčového slova se dny berou jako „nechce":

```
Mazúr: nechce 3, 4, 10-14; chce 20, 22 OUP noc
Suk 1-5
Zvoníčková – nemůže 24.12., 25.12.
```

## Lékaři

Na kartě **Lékaři** se pro každého lékaře nastavuje:
- na kterých pozicích může sloužit (sloupce lékař1 … OUP noc),
- **Cíl** – kolik služeb měsíčně má mít, **Max** – pevný strop,
- **Aktivní** – odškrtnout při dlouhodobé nepřítomnosti nebo odchodu. Nový lékař se přidává nahoře.

Výchozí seznam je odvozen z rozpisů květen–listopad 2026 (pozice povolená, pokud tam lékař sloužil alespoň 2×) – **je třeba ho zkontrolovat**.
Data se ukládají v prohlížeči; *Záloha (JSON)* je uloží do souboru (doporučeno pravidelně, i pro přenos na jiný počítač).

## Pravidla

Vždy dodržena:
- lékař slouží jen na povolených pozicích a ne ve dny, které si vyškrtl, ani na pozicích, které ten den nechce,
- nejvýše 1 služba denně, po noční službě následující den volno,
- tečky jen v pracovní dny (české svátky se počítají automaticky, další v Nastavení).

Optimalizováno (váhy v Nastavení): počet služeb podle cíle, férové víkendy/svátky, rozestup mezi službami, přání „chci".

## Vývoj

Bez závislostí, čistý JavaScript (ES moduly). Testy: `node tests/test-solver.mjs`, `node tests/test-requests.mjs`, `node tests/test-xlsx.mjs pozadavky.xlsx 11`.

```
index.html, css/style.css
js/app.js             rozhraní
js/solver.js          algoritmus (greedy + simulované žíhání)
js/requests.js        čtení požadavků
js/docx.js            čtení/zápis .docx
js/xlsx.js            čtení .xlsx
js/calendar.js        dny, svátky
js/config.js          pozice
js/default-doctors.js výchozí seznam lékařů
```
