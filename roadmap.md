# Mobilanpassning — sida för sida

## Project monitoring — 13 fynd
- [x] 1 AI-triggerbehörighet (kontrollerad mot livefunktion)
- [x] 2 Transportlagrets leveransdatum (testat)
- [x] 3 Fortnox-undermappar — beständig mapp-/filkö och bolagslås; fyra återupptagningstester passerade, ingen verklig import startad
- [ ] 4 Historiska kassafrågetimeouter — saknar identifierad långsam fråga; befintligt index och 128 rader ger inte stöd för angiven orsak
- [x] 5 Avtalets chefsuppgifter (livefunktion rättad, ingen signering startad)
- [x] 6 Butiksavgränsa uppgiftsändringar och bevara historik (testat utan dataskrivning)
- [x] 7 Återställ svenska vid språkbyte (testat)
- [x] 8 Tillverkningens prisöversättningar
- [x] 9 Rättelsemarkering i rapportmejl (testat utan utskick)
- [x] 10 Utskriftens återförsök och visningstid (testat)
- [x] 11 Uteslut oskickade utkast från dagsavslut (båda livefunktioner rättade)
- [x] 12 Uppdatera orderlistan efter borttagning (testat utan dataskrivning)
- [x] 13 Visa begränsade uppgifter för inkommande orderflytt (RPC och åtkomst kontrollerad)
- [ ] Inloggad slutkontroll — användaren behöver logga in i preview; egen testsession kunde inte skapas

Stil: som inventeringen. Tryckytor ≥56 px, primärknappar 64 px, brödtext ≥18 px
på mobil, kort i stället för tabeller, inget sidoscroll vid 360–390 px.
Dator lämnas oförändrad (allt görs med `sm:`-brytpunkten eller separata mobilvyer).

## Steg 1 — Menyer och byggstenar
- [x] Sidomenyn (butik/produktion/admin): rader ≥56 px, 18 px text, bredare panel
- [x] Rubriker i menyn läsbara på mobil
- [x] Bottenmenyn: ikon + text, aktivt läge tydligare
- [x] Delade byggstenar: ResponsiveTable (kortläge ≥56 px, 18 px), MobileActionBar
- [x] Globala mobilregler: inget sidoscroll, 48 px radhöjd, 16 px formulärfält,
      44 px minsta tryckyta, dialoger max 92 % höjd

## Steg 2 — Butikens dagliga sidor
- [ ] /store-map (Översikt)
- [ ] /uppgifter + /uppgift/:id
- [ ] /customer-orders
- [ ] /inventory, /dagens-bestallning, /inkomna-bestallningar, /receiving
- [ ] /dagsrapport
- [ ] /viktiga-papper
- [ ] /personal, /my-shifts, /my-time, /clock

## Steg 3 — Inköp och produktion
- [x] /customers (kundlistor som kort på mobil)
- [x] /suppliers
- [x] /stock-transfers, /waste-reports
- [ ] /orders, /wishes
- [ ] /vehicles, /invoices, /barcodes (inline-redigering kräver egen mobilvy)
- [ ] /produktion*, /purchase*, /pricing, /products

## Steg 4 — Organisation, rapporter, admin
- [ ] /organisation, /companies, /legal-entities, /establishments
- [ ] /reports, /payroll*, /attestations, /audit
- [ ] Inställningssidor (booking, map, about, contact, landing, fortnox)

## Steg 5 — Kontroll
- [ ] Genomgång vid 360×800 och 390×844: inget sidoscroll, alla ytor ≥56 px

## Layout — mindre skrollning
- [ ] Min sida och områdessidor: tydliga rubriker, kompakta avsnitt, inget långt skrollande

## Fortnox-inkorg DE No.1
- [x] Jobb fortnox-inbox-de-no1 (15,45) + manuell körning
- [x] integration-intake + integration_log + /integration-log
