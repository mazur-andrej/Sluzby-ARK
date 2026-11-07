# Rozpis služeb lékařů

Webová aplikace pro automatické sestavení měsíčního rozpisu služeb podle požadavků lékařů.
Běží celá v prohlížeči – nic se neinstaluje a data neopouštějí počítač (ukládají se v prohlížeči).

**Aplikace:** https://mazur-andrej.github.io/Sluzby-ARK/

## Ochrana osobních údajů

Tento repozitář je veřejný, proto v něm **nejsou jména lékařů** – výchozí seznam obsahuje jen anonymní „Dr. 01 …" se strukturou pozic a cílů.
Skutečná jména má správce v soukromém souboru (`lekari-SOUKROME.xlsx`, ID `lekar-01 …` odpovídá „Dr. 01 …") a načítá je:

- do **offline nástroje**: karta *Lékaři* → *Načíst seznam lékařů (Excel/CSV)* – uloží se jen v prohlížeči správce,
- do **Google tabulky**: *Soubor → Importovat → Vložit nové listy* (list *Lékaři*) ještě před *Počátečním nastavením*.

Lékaři vidí jména jen přes svůj osobní odkaz (data jdou z Google tabulky správce) a v e-mailu s rozpisem.
Soubory se jmény, požadavky ani vygenerované rozpisy do repozitáře nepatří.

## Online režim – lékaři zadávají požadavky sami

Každý lékař má **osobní odkaz** (`lekar.html?t=…`), přes který zadává požadavky na příští měsíc a vidí hotový rozpis.
Vidí a mění jen své požadavky. Data jsou v Google tabulce správce.

- Požadavky na příští měsíc se zadávají **do 12. dne** v měsíci (včetně, nastavitelné v listu *Nastavení*).
- V noci po uzávěrce (cca 1:00) se požadavky **automaticky uzamknou a vygeneruje se rozpis** (list *Rozpis RRRR-MM*). Správci přijde e-mail.
- Rozpis lze v tabulce ručně upravit – lékaři vidí vždy aktuální stav.
- 1. dne dalšího měsíce se otevřou požadavky na následující měsíc.
- Po vygenerování dostane každý lékař, který má v listu *Lékaři* vyplněný **e-mail**, zprávu se svými službami, celým rozpisem (se jmény) a odkazem na svou stránku.
- **Všichni mají vždy stejnou verzi:** každé rozeslání má číslo verze (v e-mailu i na stránce lékaře) a uloží se.
  Když správce rozpis po rozeslání upraví, rozešle se nová verze – menu *Rozeslat rozpis lékařům e-mailem*, nebo automaticky v noci.
  Lékař, jehož se změna týká, dostane e-mail „ZMĚNA ve vašich službách" s přesným výpisem změn; ostatní dostanou novou verzi také.
  Pokud je v rozpisu jméno, které neodpovídá seznamu lékařů (překlep), nerozešle se nic a správce dostane upozornění.
  Rozesílání lze vypnout v listu *Nastavení* (pak lékaři vidí rozpis jen přes svůj odkaz).

### Jednorázové nastavení (správce, cca 10 minut)

1. Založte novou Google tabulku (https://sheets.new), pojmenujte ji např. *Rozpis služeb*.
   Importujte do ní soukromý seznam lékařů: *Soubor → Importovat → Nahrát → lekari-SOUKROME.xlsx → Vložit nové listy*. Doplňte e-maily.
2. **Rozšíření → Apps Script**. Smažte obsah souboru `Kód.gs` a vložte celý obsah souboru
   [`apps-script/Kod.gs`](apps-script/Kod.gs) (tlačítko *Copy raw file*). Uložte (Ctrl+S).
3. Vraťte se do tabulky a obnovte stránku (F5). Objeví se menu **Rozpis služeb** → **Počáteční nastavení**.
   Google si vyžádá povolení (*Zkontrolovat oprávnění → účet → Rozšířené → Přejít na projekt*), pak akci spusťte znovu.
   Vytvoří se listy *Lékaři, Pozice, Požadavky, Stav, Nastavení*, osobní odkazy a noční automatika.
4. V Apps Script: **Nasadit → Nové nasazení → ozubené kolečko → Webová aplikace**.
   *Spustit jako:* **Já**, *Kdo má přístup:* **Kdokoli**. Nasadit a zkopírujte **URL webové aplikace** (končí `/exec`).
5. URL vložte do souboru [`js/online-config.js`](js/online-config.js) (nebo ji pošlete správci repozitáře).
6. V listu *Lékaři* zkontrolujte pozice a cíle a rozešlete lékařům odkazy ze sloupce *Osobní odkaz pro lékaře*.

### Běžná správa v tabulce

- **Nový lékař:** nový řádek – Jméno, zaškrtnout *Aktivní*, Pozice (zkratky: `l1, l2, 1A, 2A, plast, t1, t2, OUPd, OUPn`), Cíl → menu *Doplnit odkazy nově přidaným lékařům*.
- **Odchod / dlouhodobá nepřítomnost:** odškrtnout *Aktivní*.
- **Ukradený/přeposlaný odkaz:** smazat buňku *Token* a dát *Doplnit odkazy* – vznikne nový odkaz, starý přestane fungovat.
- *Přehled požadavků na příští měsíc* – tabulka lékaři × dny (jako dosavadní Excel), včetně toho, kdo ještě nezadal.
- *Vygenerovat rozpis příštího měsíce teď* / *Znovu otevřít požadavky* – ruční zásah mimo automatiku.
- Po změně `Kod.gs` je třeba v Apps Script dát *Nasadit → Spravovat nasazení → upravit → Nová verze*.

## Spuštění offline nástroje (správce)

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
Novák: nechce 3, 4, 10-14; chce 20, 22 OUP noc
Černý 1-5
Dvořáková – nemůže 24.12., 25.12.
```

## Lékaři

Na kartě **Lékaři** se pro každého lékaře nastavuje:
- na kterých pozicích může sloužit (sloupce lékař1 … OUP noc),
- **Cíl** – kolik služeb měsíčně má mít, **Max** – pevný strop,
- **Aktivní** – odškrtnout při dlouhodobé nepřítomnosti nebo odchodu. Nový lékař se přidává nahoře.

Výchozí seznam je odvozen z rozpisů květen–listopad 2026 (pozice povolená, pokud tam lékař sloužil alespoň 2×) – **je třeba ho zkontrolovat**.
Data se ukládají v prohlížeči; *Záloha (JSON)* je uloží do souboru (doporučeno pravidelně, i pro přenos na jiný počítač).

## Typy služeb

| Pozice | Čas | Délka |
|---|---|---|
| lékař1–4 (JIP, anestezie), lékař5 = plast (KPECH) | 7:30 – 7:30 další den | 24 h |
| OUP den / OUP noc | 7:00 – 19:00 / 19:00 – 7:00 | 12 h |
| tečka1 | 7:30 – 17:30 | 10 h |
| tečka2 | 9:30 – 17:30 | 8 h |

Časy jdou změnit v Nastavení (offline nástroj) nebo v listu *Pozice* (Google tabulka). Z nich se počítá odpočinek mezi službami a odpracované hodiny v přehledu.

## Pravidla

Vždy dodržena:
- lékař slouží jen na povolených pozicích a ne ve dny, které si vyškrtl, ani na pozicích, které ten den nechce,
- nejvýše 1 služba denně a mezi koncem jedné a začátkem další služby aspoň 11 h odpočinku (nastavitelné);
  po službě přes noc (24h služby, OUP noc) má lékař celý další den volno – výjimku (např. 24h a večer OUP noc) program použije jen tehdy, když by jinak zůstala služba neobsazená, a vypíše ji; po OUP den nebo tečce lze další den sloužit,
- tečky jen v pracovní dny (české svátky se počítají automaticky, další v Nastavení).

Počet OUP služeb (OUP den + OUP noc dohromady) si může každý lékař zvolit v požadavcích – program mu jich nedá víc a snaží se dát aspoň 2.
Kdo nevyplní, rozhodne program. V přehledu požadavků je součet zvolených OUP oproti potřebě měsíce (cca 62).

Optimalizováno (váhy v Nastavení): počet služeb podle cíle, férové víkendy/svátky, rozestup mezi službami, přání „chci".

## Vývoj

Bez závislostí, čistý JavaScript (ES moduly). Testy: `node tests/test-oup.mjs` (zvolený počet OUP), `node tests/test-rest.mjs` (odpočinek podle časů služeb), `node tests/test-gas.mjs` (online část s napodobeným Googlem), `node tests/test-solver.mjs`, `node tests/test-requests.mjs`, `node tests/test-xlsx.mjs pozadavky.xlsx 11`.

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
lekar.html, js/lekar.js, css/lekar.css   stránka pro lékaře
js/online-config.js   adresa Google webové aplikace
apps-script/server.js serverová část (Google Apps Script)
apps-script/Kod.gs    hotový soubor pro vložení do Google (node tools/build-gas.mjs)
```
