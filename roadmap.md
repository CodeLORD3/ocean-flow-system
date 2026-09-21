# Mobilanpassning — sida för sida

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
