# Lagret idag — ritning, luckor och åtgärder

## Del 1 — Så fungerar lagret nu

### Fem nivåer
Varan vandrar alltid åt samma håll:

```text
Inköpslager  →  Grossistlager  →  Produktionslager
(köpt, ej hemma)  (fysiskt i Gbg)   (filé/externt uppdrag)
                       │
                       ▼
             Transportlager per butik  →  Butikens lager
             (skickat, ej mottaget)        (disk/kyl/frys)
```

Idag finns 19 aktiva lagerplatser: ett inköpslager, ett grossistlager, ett produktionslager, samt transport- och butikslager per butik.

### En enda skrivväg
Saldot ändras aldrig direkt. Varje förändring skrivs som en rörelse (inleverans, överföring in/ut, tillverkning in/ut, försäljning, kundbeställning, svinn, justering, inventering) och saldot räknas fram av databasen. Partinummer följer med varje flytt, och uttag sker efter äldsta bäst före-datum först.

### Vad som händer i praktiken
- **Inköp:** följesedel bokförs in på inköpslagret, "registrera ankomst" flyttar till grossistlagret.
- **Butiksorder:** order markerad skickad flyttar varan från grossistlagret till butikens transportlager; butiken godkänner inleveransen och varan hamnar på butikens lager.
- **Kundbeställning:** när en rad packas dras varan från butikens lager.
- **Kassan (Nimpos/SumUp):** varje kvitto drar varan ur butikens försäljningslager.
- **Svinn:** eget formulär med obligatorisk orsak.
- **Inventering:** butiken öppnar ett tillfälle (flera per dag går bra), räknar per lagerplats, sätter hållbarhet, markerar kategorier klara och låser. Vid låsning bokförs skillnaden som inventeringsrörelse och bäst före sparas.

## Del 2 — Luckorna jag hittade (kontrollerat mot databasen)

1. **Uppstartsläget "obegränsat lager" är fortfarande påslaget.** När grossistlagret inte räcker till en butiksorder skapas varan ur tomma luften som en justering in på transportlagret. Saldot blir därför aldrig sant.
2. **92 rader har negativt saldo** — 78 rader (−746 kg) i butikernas försäljningslager och 14 rader (−490 kg) på grossistlagret. Det är uttag utan motsvarande inleverans, alltså varor som sålts men aldrig bokförts in.
3. **Fiskskaldjur Marstrand saknar både butikslager och transportlager.** Butiken kan inte ta emot leveranser eller packa kundbeställningar alls.
4. **Kassan hittar lagerplatsen på namn** ("...örsäljningslager") och kan träffa en avstängd plats, eller ingen alls. Hittas ingen plats hoppas avdraget tyst över — försäljningen syns men lagret minskar inte.
5. **Kundbeställningar bokförs på "första lagerplatsen" i butiken**, inte uttalat på butikslagret. Fel plats får saldot om ordningen ändras.
6. **Återlämning av en packad kundbeställningsrad drar av varan en andra gång** i stället för att lägga den tillbaka. Ren räknefel i koden.
7. **Annullerade Fortnox-fakturor** skapar en rörelsetyp som lagerhistoriken inte kan namnge (visas som rå kod för personalen).
8. **Inventeringen rör bara rader som räknats.** Produkter som finns i saldot men inte räknats står kvar med gammalt tal, utan att någon ser att de hoppades över.
9. **Ingen varning för negativt eller osannolikt saldo** någonstans i lagervyn, så felen ovan har kunnat ligga kvar obemärkta.

## Del 3 — Åtgärder, i ordning

### Steg 1 — Täta hålen i bokföringen
- Rätta återlämningen så varan går tillbaka in i lagret.
- Kundbeställning och kassa slår upp butikens lagerplats på nivå (butikslager), aldrig på namn eller ordning; hittas ingen plats blir det ett tydligt fel i stället för tyst hopp över.
- Skapa butiks- och transportlager för Marstrand.
- Namnge alla rörelsetyper i historiken, inklusive fakturaannulleringar.

### Steg 2 — Nollställ och stäng uppstartsläget
- Visa en lista över alla negativa saldon per butik och produkt för godkännande.
- Rätta dem som inventeringsrörelser med noten "Nollställning inför skarpt lagerläge" — inga saldon skrivs om, allt är spårbart.
- Slå av "obegränsat lager". Därefter stoppas en utleverans som saknar täckning med ett begripligt meddelande i stället för att uppfinna vara.

### Steg 3 — Gör saldot användbart för personalen
- Lagervyn får en varningsrad högst upp: antal negativa saldon, produkter under miniminivå och produkter som passerat bäst före — med knapp direkt till raden.
- Varje produktrad visar var varan finns, saldo, bäst före och när den senast inventerades.
- Butiken ser bara sitt eget transport- och butikslager; grossistleden visas låsta.

### Steg 4 — Härda inventeringen
- Vid låsning visas en sammanställning innan man bekräftar: räknade rader, ej räknade rader med saldo, och total skillnad i kg och kronor.
- Ej räknade rader måste antingen räknas, nollas eller aktivt hoppas över med orsak — inget lämnas tyst.
- Efter låsning visas resultatet: vad som ändrades, av vem och när, och skillnaden sparas i historiken.

### Steg 5 — Kontroller som håller det tätt
Automatiska tester för: utleverans utan täckning nekas, återlämning ökar saldot, kassauttag landar på butikslagret, inventeringslåsning bokför exakt räknad skillnad, och ingen kodväg skriver saldot direkt.

## Tekniska noteringar
- `stock_movements` förblir enda skrivvägen; `product_stock_locations` skrivs bara av triggern (och `min_stock`/`expiry_date` som inställningar).
- Uppslag går via `locationIdForLevel` i `src/lib/locations.ts`. Namnuppslagen i `supabase/functions/_shared/nimpos.ts` och `sumup-process.ts` samt `primaryStoreLocationId` i `src/lib/customerOrders.ts` byts mot nivåuppslag på `location_type` + `active`.
- `reverseLine` i `src/lib/customerOrders.ts` byter till en inflödestyp.
- `infinite_stock` i `system_settings` sätts till `{ "enabled": false }` efter nollställningen.
- Nollställning och nya lagerplatser körs som datauppdateringar, inte schemaändringar.
