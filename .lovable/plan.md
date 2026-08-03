# Spårbarhetsvyn i kassan: finns kvar, men saknas i Claude-underlaget

## Svar på frågan

Ja, funktionen finns kvar i koden.

- `src/pos/pages/PosRegister.tsx` visar en `OriginChip` på varje kundvagnsrad och öppnar `TraceabilityModal`.
- `src/pos/components/TraceabilityModal.tsx` hämtar data via `scomberClient.traceability(...)`.
- Edge-funktionen `supabase/functions/scomber-traceability/index.ts` slår upp `pos_products`, sedan `makrilltrade_articles_cache` och listar aktiva partier ur `makrilltrade_batches_cache` (FIFO på fångstdatum, `quantity_remaining > 0`).
- Cachetabellerna fylls bara av `scomber-makrilltrade-sync`. Utan en körd synk visar modalen sina tomma tillstånd ("Ingen artikeldata i Makrilltrade-cachen", "Inga aktiva batcher tillgängliga").

I `claude-kravgranskning-prompt.md` nämns kassan bara som `pos_*`-tabeller. Spårbarhet beskrivs där som en lucka, utan att det framgår att en färdig visningsyta och ett cache-baserat partikoncept redan finns. Claude riskerar därför att föreslå en helt ny spårbarhetsvy i kassan i stället för att koppla den befintliga till riktiga partier.

## Vad jag föreslår

Uppdatera underlaget till en ny version, `/mnt/documents/claude-kravgranskning-prompt_v2.md`, med tre tillägg och i övrigt oförändrat innehåll:

1. **Nulägesavsnittet "Kassa och portaler"** utökas med spårbarhetskedjan: ursprungschip per kundvagnsrad, spårbarhetsmodal med leverantör, art, fångstdatum, fartyg, fångstområde, MSC/ASC, bäst-före och parti-ID, samt att data läses ur `makrilltrade_articles_cache` och `makrilltrade_batches_cache` via edge-funktionen.
2. **Kända luckor** får en ny punkt: visningsytan finns men matas av en extern cache som inte hänger samman med systemets egna inleveranser, lagerplatser och tillverkningsorder. Kopplingen partirad i inleverans till parti i kassan saknas.
3. **Frågorna till Claude** kompletteras med en fråga om hur den befintliga kassavyn bör återanvändas när ett riktigt partiregister införs: vilka fält som måste finnas på ett internt parti för att modalen ska kunna fyllas utan att gränssnittet byggs om, och hur cachetabellerna bör avvecklas eller fyllas från de egna tabellerna.

Bilagans tabellöversikt utökas med raden för Makrilltrade-cachen så Claude inte hittar på egna namn.

## Teknisk not

Ingen kod ändras i detta steg — bara ett nytt dokument under `/mnt/documents`. Originalfilen lämnas kvar orörd.
