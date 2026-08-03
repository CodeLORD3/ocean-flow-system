# Spårbarhet per parti och leverantör — utan kassan

## Svar på frågan

Bilden visar en spårbarhetsvy med leverantör (Bremnes Seashore med flera), art, fångstdatum, fångstområde, MSC/ASC och parti-ID. Den vyn finns kvar i koden, men enbart som en kassafunktion som läser en extern cache. Den kopplas inte till systemets egna inleveranser.

I systemets egna flöden finns däremot redan partiuppgifterna:

- `incoming_delivery_lines` har `batch_number`, `best_before`, `faktiskt_fangstomrade`, `redskapskategori`, `upptinad`, `unit_cost` per rad.
- `incoming_deliveries` binder raderna till leverantör och mottagningsdatum.
- `src/lib/labelData.ts` läser redan senaste partirad per produkt för skyltunderlag.

Det som saknas är att uppgifterna används som en spårbarhetsvy per produkt och parti med leverantören i fokus, och att `claude-kravgranskning-prompt.md` beskriver detta.

## Vad jag föreslår

Ny version av underlaget, `/mnt/documents/claude-kravgranskning-prompt_v2.md`, i övrigt identiskt med nuvarande fil. Kassan lämnas helt utanför. Tillägg:

1. **Nulägesavsnittet om inleverans** kompletteras med partifälten på inleveransraden och med att `labelData.ts` redan använder senaste partiuppgift per produkt för skyltunderlag. Här anges också att leverantören alltid är känd via inleveransen.
2. **Kända luckor** får en punkt om att partiuppgifterna finns per inleveransrad men inte är sökbara eller visningsbara som en spårbarhetsvy per produkt: man kan inte se vilka partier av en produkt som finns, från vilken leverantör, med vilket fångstområde, redskap, bäst-före och inköpspris, och inte heller vilka partier som förbrukats i tillverkning eller levererats till butik.
3. **Frågorna till Claude** kompletteras med: vilka fält ett internt partiregister behöver för att bära spårbarhet från leverantör till butik, hur partiet ska bindas till lagerrörelser och tillverkningsorder, och hur en spårbarhetsvy per produkt bör se ut med leverantörsnamn, fångstuppgifter och kvarvarande kvantitet per parti.

Bilagans tabellöversikt kompletteras så att partifälten på `incoming_delivery_lines` framgår explicit.

## Teknisk not

Ingen kod ändras i detta steg — bara ett nytt dokument under `/mnt/documents`. Originalfilen lämnas orörd.
