# Lägesrapport: personalmodulen (ingen kod byggd)

Allt nedan är kontrollerat mot skarp databas och kod i dag. Där körbevis saknas står det "byggt men otestat".

## 1. Personalregister

| Del | Status | Bevis |
| --- | --- | --- |
| Personer och anställningar | **Klart och verifierat** | 111 personer (100 aktiva), 121 anställningsrader: 35 DE No.1, 82 FSAB Sverige, 4 FSAB Schweiz, 4 utan bolag |
| Import av anställningsnummer från lönefilerna | **Klart och verifierat** | Alla 114 rader i de två lönefilerna matchade 94 personer; nummer satta på samtliga bolagsrader (DE No.1 002–037, FSAB 1–92) |
| Koppling person → Personalkollen | **Klart men delvis** | 43 poster i Personalkollen, 39 kopplade till person, 4 okopplade |
| Koppling anställning → Fortnox-post | **Påbörjat** | Bara 23 av 121 anställningar har Fortnox-kopplingen satt; funktionen finns och fungerar men har inte körts för alla |
| Klockidentiteter | **Lucka** | 12 personer saknar personnummer i registret (testpersoner) och kan inte stämpla. Inga alternativa kort/brickor är registrerade (0 st), så personnummer är enda inloggningen |
| Skräprader | **Kvar att besluta** | 4 anställningsrader utan bolag, 3 avmarkerade FSAB-rader (Marcus Alm 1010101, Gustav Heijel 13, tom Ewa-dubblett) |

## 2. Stämpelklockan

Trycktestet kördes skarpt på POS-upplösning (1024×768 och 768×1024) med skärmdumpar.

**Åtgärdat och verifierat:** sifferknappsats med 76×76 px knappar, maskerat personnummer utan tangentbord, bekräftelsevy, längdvalidering, dubbeltrycksskydd (90 sekunder + unikt tryck-id), servertid som facit, offline-kö som behåller trycktiden och töms automatiskt, datumbyte över midnatt i vyn, kioskläge utan navigering eller dataläckage, spärr under aktivering, hastighetsspärr bara för okända nummer.

**Kvar (inte testat):** två personer som stämplar samtidigt, omstart av enheten med köade tryck, skyddad identitet/samordningsnummer, stämpling över midnatt hela vägen till löneunderlaget, loggning när en station avaktiveras. Beslut kvar: ska rasttryck vara kvar eller stängas av.

**Stationer:** 4 aktiva (test1 och TEST i samma butik, Kungsholmen kassa (pilot), Maebel), 2 avaktiverade testrader. Alltså **ingen bredd** — endast 2 skarpa butiker har en station.

Stämplad tid i systemet: 101 rader, 14 personer, 4 butiker — varav 53 är korrigerings-/nollningsrader från tester och 49 rader saknar butik. Det är testdata, inte drift.

## 3. Tider och attest

- Parallellkörningsvyn mot Personalkollen: **byggt men otestat i drift**. Vyn finns, Personalkollen-data finns (2 339 loggade tider, 704 pass), men det finns ingen skarp period där både klockan och Personalkollen körts parallellt, så det går inte att redovisa gröna/gula/röda rader per butik. Det är den största luckan mot go/no-go.
- Attestflödet: **påbörjat** — 6 attestrader totalt, från test. Används inte.
- Periodlåsning: **byggt, aldrig använt** — 0 låsta perioder.

## 4. OB och policytabeller

- Handels-nivåerna finns som referens per bolag (OB 50 vardag 18:15–20:00, OB 70 kväll/natt och lördag från 12:00, OB 100 söndag/helgdag) och löneberäkningen läser dem.
- **Fynd: dubbletter.** 8 policyrader för två bolag, med två olika versioner av nivåerna. Vilken som gäller avgörs av giltighetsdatum — det behöver rensas innan en skarp körning.
- **Fynd: inga per-person-flaggor.** Anställningsraden har ingen OB-flagga alls. Beräkningen antar därför samma OB-regler för alla i bolaget. Eftersom lönefilerna visar OB aktivt för de flesta timanställda i FSAB men avstängt för månadsavlönade och flera i DE No.1, kommer vår beräkning **räkna OB på personer som inte ska ha det**. Detta är ett rent fel som måste byggas bort.
- Egna OB-fönster per bolag: 5 rader men utan bolagskoppling — oanvända.
- Har en beräkning körts mot verklig stämplad tid? **Nej.** En period (DE No.1, 2026-09) är beräknad men gav 0 lönerader, eftersom det inte finns attesterad tid.

## 5. Löneberäkning och Fortnox-export

- Hela kedjan stämpling → attest → lönerader → Fortnox → AGI → LF → SIE: **inte körd**. 0 lönerader, 0 löneexporter, 0 LF-exporter.
- Fortnox-koppling: **FSAB ansluten**, **DE No.1 frånkopplad** — måste kopplas om.
- Löneartstabellen: **ifylld**, 79 rader per bolag (FSAB och DE No.1) med både Fortnox-kod och PAXml-kod. Inte verifierad mot en skarp export.
- Export till lönefilformat (PAXml 2.2) finns byggd som torrkörning. **AGI-underlag, LF-pensionsfil och SIE finns inte i koden alls** — de är inte byggda.

## 6. Lagkraven

| Krav | Status |
| --- | --- |
| Personalliggare (grossisten) | **Inte byggt** — beslut om lösning saknas |
| Övertidsjournal enligt ATL | **Inte byggt** — övertid räknas, men ingen journal med 48/50-timmarsgränser |
| Semestersaldon | **Byggt men tomt** — tabell och beräkningsfunktion finns, 0 saldon |
| Sjuklöneberäkning | **Byggt men tomt** — 0 sjukperioder registrerade |
| Frånvaro/ledighet | **Byggt men oanvänt** — 0 ansökningar |
| 7-årsarkivering | **Inte byggt** |
| GDPR-registerutdrag | **Delvis** — personnummer skyddat och loggat vid uppslag, men inget utdrag på begäran |

## 7. Prioriterad återstående lista

1. **Rätt OB per person** (kod + ditt beslut): flagga per anställning som styr om OB ska räknas, satt från lönefilerna. Blockerar all löneberäkning.
2. **Rensa dubbla OB-policyer** (kod): en gällande rad per bolag.
3. **Två stämmande lönemånader i parallelldrift** (extern + kod): kräver stationer i butikerna, att personalen faktiskt stämplar, och att jämförelsevyn körs varje vecka. Detta är den långa punkten — minst två månader kalendertid.
4. **Stationer i alla butiker som ska växlas** (extern åtgärd): i dag bara 2 skarpa.
5. **Attest i skarp drift + periodlåsning** (kod + rutin): måste användas av butikschefer, annars blir lönerader tomma.
6. **Koppla DE No.1 mot Fortnox igen och koppla alla anställningar till Fortnox-posten** (extern + kod): 98 av 121 saknar koppling.
7. **Verifierad Fortnox-export** (kod + extern): en riktig torrkörning mot båda bolagen och avstämning mot Fortnox lönebild.
8. **AGI-underlag, LF-pensionsfil och SIE** (kod): finns inte alls i dag.
9. **Personalliggarbeslut för grossisten** (ditt beslut, sedan kod).
10. **Övertidsjournal ATL** (kod).
11. **Semester och sjuklön i drift** (kod + underlag från dig: ingående saldon).
12. **Arkivering 7 år och GDPR-utdrag** (kod).
13. **Städa registret** (ditt beslut): 4 bolagslösa rader, 3 avmarkerade FSAB-rader, 12 testpersoner.
14. **Kvarvarande klocktester** (kod): samtidiga tryck, omstart med kö, midnatt hela vägen till lön, skyddad identitet, rastbeslut.

Punkt 1–3 är de som verkligen blockerar en växling. Resten kan köras parallellt.
