# Schema vecka & dag enligt designleveransen

Designspecen ändrar inte målet — Personal & Schema (`/staff-schedule`) byggs om visuellt — men den ersätter min gissning med exakta mått, regler och tokens. Planen nedan följer designleveransens avsnitt 0a, 3b och 10 samt designkoden i avsnitt B. Ingen ändring i schemalogik, kostnadsberäkning, behörigheter eller databas.

## Vad specen slår fast som jag inte hade med

- **Funktionsfärger som tokens** (alert/warn/ok i tre steg: 100 platta, 600 kant/prick, 800 text). Text får aldrig sättas i ett 600-steg.
- **Status = 3 px mättad vänsterkant plus textetikett.** Färg är aldrig ensam bärare.
- **Färg kodar status, aldrig enhet.** Enheter får monokoder i grå platta (B01–B07, GRO, ADM) med namnet primärt och koden sekundärt.
- **Alla tal i mono, tabulära, högerställda.** Tid som `8 h 11 min`, aldrig `8,11`.
- **Alla belopp märks preliminära, märkningen sitter på talet.**
- **Luft istället för linjer** — sektionsetiketter, inte ramar och zebra.
- **Tomläget föreslår**: en oschemalagd vecka visar tre förslag (Kopiera vecka N med passantal, Importera från fil, Börja tomt) — aldrig ett tomt rutnät med plusknapp.
- **Publicering är en handling för hela veckan** med kostnaden i knappen: "Publicera vecka 36 — 318,5 timmar, 62 940 kr preliminärt".
- **Dagvyn** är banor per person över en tidsaxel, med panelen "Kommer och går" till höger (328 px).

## Vyerna som byggs

**Veckovy.** Person mot veckodag. Vänsterkolumn 176 px med namn och anställningsform. Sju dagkolumner, helgen med sänkt bakgrund. Högerkolumn 132 px med veckans timmar mot avtalstak som tal plus delad stapel där mertidsdelen är bärnsten. Nederst en täckningsrad per dag, bemanning mot behov. Passen i cellerna: 3 px vänsterkant i statusfärg, tid i mono, grundpasskod under. Regelbrott får dessutom hel 1,5 px ram och orsaken förkortad ("Vila 7 h").

**Dagvy.** Banor per person över tidsaxel 04–18 (eller enhetens öppettider plus två timmar). Pass som block med grundpass och kostnadsställe. Under banorna en bemanningsgraf per halvtimme mot kapacitet, där överbelastning är alert-färgad med minuttalet skrivet.

**Kopplingspanel vid valt pass.** Person, tider, kostnadsställen, lönekostnad (preliminär), veckans timmar mot grad, regelstatus med paragrafhänvisning och alltid två åtgärdsförslag — aldrig bara ett nej.

**Beslutsrad överst.** Ett larm, ett verktyg och ett mätvärde ser olika ut — inte tre likvärdiga kort.
