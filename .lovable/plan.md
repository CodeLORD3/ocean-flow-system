# Lagerrörelser, partispårbarhet, kostpris och prissättning

Byggprompten godkänns i sin helhet, med de justeringar som framgår nedan. Arbetet
levereras i tre etapper. Varje etapp är körbar i drift innan nästa startar.

## Ändringar mot den uppladdade filen

**AP-0 utgår, den är redan klar.** `cutModels.ts` använder redan `speciesKey()` med
ASCII-normalisering, alla nycklar i `SPECIES_CUT_MODEL` är ASCII, och
täckningskontrollen finns under Inställningar. Ingen kod behöver ändras.

**AP-7 ersätter golvprismodellen helt.** Residuallogik och `floor_price` tas ut ur
`filletMath.ts`. Priserna sätts manuellt per prislista och kommer från marknaden,
aldrig från kostnaden. En detalj utan pris blockerar prissättningen och visar
"Pris saknas" — ingen beräknad fallback. Startpriser torsk butik inklusive moms:
rygg 798, kontrarygg 398, benfri filé 249, slag 198.

**Kassan byggs inte.** Butikernas kassor är externa och rapporterar inte in.
Utflödet ur butikslagret bokförs i stället enbart via inventeringen: skillnaden
mellan inlevererat och räknat blir en samlad rörelse med angiven orsak. Rörelsetypen
`forsaljning` finns kvar i modellen men används inte förrän en kassakoppling finns.

**Tre nya arbetspaket tillkommer:** svinn och kassation, etikett och skyltunderlag,
plock och utleverans till kund.

**AP-20 Fortnox** planeras till etapp 3 och byggs inte nu.

**Designprinciperna** gäller alla nya vyer. Befintliga vyer byggs inte om i den här
omgången. i18n läggs upp redan i etapp 1 så inga ledtexter hårdkodas: svenska,
engelska, arabiska.

## Etapp 1 — Fundament

Utan detta är inget ovanför korrekt.

1. **Lagerrörelser.** Ny huvudbok `stock_movements` med typ, kvantitet, lagerplats,
   parti, referens, kostpris och användare. `product_stock_locations` blir ett
   materialiserat saldo som bara en trigger får skriva. Direktskrivning spärras.
   Befintliga saldon förs in som ingående balans. Rörelser raderas aldrig, de motbokas.
2. **Ett saldobegrepp.** Grossisten läggs upp som enhet med egna lagerplatser i samma
   tvånivåstruktur som butikerna. Inleveransrader får lagerplats. De globala saldona
   flyttas till grossistens kyllager. Överföring till butik ger två rörelser med
   samma referens.
3. **Partier och spårbarhet.** `lots` med FAO-kod, latinskt namn, fångstområde,
   redskap, fartyg, fångstdatum, sortering, presentation, certifikat och bäst före.
   `lot_transformations` binder moderparti till utdetaljer. Spårbarhetsplikt sätts av
   varunummer, med datumstyrt undantag för tredjelandsprodukter. Ny sida Spårbarhet
   med sökning bakåt och framåt.
4. **Viktat snittkostpris.** Snittkostpris och lagervärde per lagerplats, uppdaterade
   av samma trigger som saldot. Negativt saldo blockeras. Kostpris per parti sparas
   för partivärdering.
5. **Inventering med differens.** Förväntat saldo ur rörelserna, räknat saldo, och
   differens i kilo och kronor per rad. Differens över 5 procent eller 500 kronor
   kräver orsak. Godkänd inventering skapar en rörelse, aldrig en överskrivning.
   Detta är också butikernas utflödesbokföring.
6. **Svinn och kassation.** Egen vy för att kassera vara med orsak och bild, som
   bokför en svinnrörelse med värde. Rapport per period och enhet.

## Etapp 2 — Kalkyl och inflöde

7. **Partibindning i tillverkning.** Källparti krävs. Utdetaljerna ärver art,
   fångstområde, redskap, fångstdatum, fartyg och certifikat. Summakontroll:
   utdetaljer plus svinn motsvarar konsumerad kvantitet. Blandning av två partier
   blockeras.
8. **NRV-prissättning.** Kostnaden fördelas på intäktsandel, inte jämnt per kilo.
   Marginal per detalj och för hela partiet, med varning när partiet understiger
   regionens mål eller när ett pris avviker mer än 25 procent från senast satta.
   Föreslagna priser skrivs aldrig över automatiskt.
9. **Prislistor per kanal.** Butik Göteborg 45 procent inklusive moms med
   slutsiffreavrundning, grossist 22 procent exklusive moms utan avrundning.
   Stockholm flyttas från butik till grossist. Momssatser alltid ur `vat_rates`.
10. **Följesedelsinläsning.** PDF från de två stora leverantörerna tolkas till
    partier, inleveransrader och rörelser. Omatchade artiklar kopplas manuellt och
    kopplingen sparas. Levererad vikt gäller, larm vid avvikelse över 10 procent.
    Nollpris blockerar godkännande.
11. **Fakturamatchning.** Preliminärt inköpspris bekräftas mot faktura.
    Avvikelsen ger en korrigeringsrörelse och nytt snittkostpris. Redan sålda
    kvantiteter korrigeras inte bakåt. Larm på rader som stått preliminära i 30 dagar.
12. **Etikett och skyltunderlag.** Utskrift med stor text, produktbild, streckkod,
    partiuppgifter och allergener. Skyltunderlaget hämtar handelsbeteckning, latinskt
    namn, fångstområde, redskap och upptinad-status ur partiet i disken.

## Etapp 3 — Regelverk och styrning

13. **FEFO och hållbarhetsstyrning.** Tidigast bäst före föreslås vid uttag, avvikelse
    kräver orsak. Passerade partier går bara till svinn. Nyckeltal för vara som
    utgår inom två dagar.
14. **Plock och utleverans.** Plocklista i FEFO-ordning och följesedel till kund med
    partiuppgifter, som bokför uttaget.
15. **Återkallelse och spårbarhetsövning.** Full kedja bakåt och framåt, disposition
    per rad, spärrade partier kan inte plockas, och övningsläge som loggas till
    HACCP-underlaget.
16. **MSC och chain of custody.** Certifiering per parti, giltig kedja krävs för
    märkning, sammanblandning nollställer certifieringen på utdetaljerna.
17. **Allergener och recept.** EU:s fjorton allergener, recept för egenproducerat,
    arv uppåt genom receptet, deklaration på etikett och i disk.
18. **Exportunderlag för fångstintyg.** PDF och CSV med alla fält Catch kräver.
    Referensnummer noteras efter registrering.
19. **Utbytesavvikelse och efterkalkyl.** Planerat mot faktiskt i kilo, procent och
    kronor, med orsak vid avvikelse över 5 procentenheter och möjlighet att sätta
    uppmätt snitt som standard.
20. **Catch weight.** Registrering i både kilo och styck, lagervärdering alltid på
    kilo, snittvikt kalibreras mot de tio senaste vägningarna.
21. **Butiksorder och påfyllnad.** Trösklar per butik och produkt, tillgängligt saldo
    hos grossisten per rad, restnotering när saldot inte räcker.
22. **Kundprisavtal.** Avtalspris slår kanalpris, CHF för exportkunden, kursen sparas
    på fakturaraden.
23. **Fortnox.** Fakturautkast, aldrig bokfört automatiskt. Nycklar i backend.
    Systemet fungerar utan kopplingen.

## Teknisk sammanfattning

Nya tabeller: `stock_movements`, `lots`, `lot_transformations`,
`supplier_document_imports`, `supplier_article_map`, `supplier_invoices`,
`supplier_invoice_lines`, `stock_thresholds`, `recalls`, `recall_affected_items`,
`allergens`, `product_allergens`, `recipes`, `customer_price_agreements`.
Utökade tabeller: `product_stock_locations` (snittkostpris, lagervärde),
`incoming_delivery_lines` (lagerplats, prisstatus, slutpris),
`inventory_report_lines` (förväntat, räknat, differens, orsak),
`production_orders` och `production_order_lines` (parti in och ut),
`products` (FAO-kod, catch weight, nominell vikt, certifieringsbarhet),
`margin_targets` (prislista, tillämpas på), `detail_prices` (prislista),
`yield_actuals` (avvikelse, orsak), `delivery_notes` (fångstintyg, exportland).
Sammanslagning: `byproduct_prices` migreras in i `detail_prices` och tas bort.
Alla nya tabeller får RLS: butik ser egen enhet, grossist ser inköp och produktion,
admin ser allt. Saldon härleds ur rörelserna via trigger, aldrig genom överskrivning.
