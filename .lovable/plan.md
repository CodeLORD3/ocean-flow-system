# Ordervyn på mobilen – andra versionen

Vad som är fel i den första versionen:
- Kategoriknapparna tar halva skärmen.
- Huvudet står still, så varorna får bara en liten remsa att skrollas i.
- Priserna kan vara fel, till exempel "1 SEK/kg" på Kokta Havskräftor. Det beror på ett pris på 1 kr i butikens prislista. Priset är markerat som uppskattat, inte låst.

## Ändringar

1. **Hela sidan skrollar som en sida, som i HM-appen.**
   - Rubriken och leveransraden följer med upp när man skrollar.
   - Bara sökrutan och en kompakt kategorirad ligger kvar överst.
   - Kundvagnsraden ligger fast längst ner.
2. **Kategorier tar högst en rad.**
   - Raden visar "Mest beställt", den kategori som är vald och knappen "Alla kategorier".
   - "Alla kategorier" öppnar en lista nerifrån där man väljer kategori.
   - Raden scrollar inte i sidled.
3. **Större produktkort med mer luft.**
   - Bilden är större och namnet får två rader.
   - "brukar: 6 kg" står direkt under namnet.
   - Knappen "Lägg till" blir en rund "+" i bildens hörn, som i nätbutiker.
   - När varan ligger i vagnen visas antalet på bilden och − / + under den.
4. **Priser visas bara när de är säkra.**
   - På korten och i vagnen visas bara låsta priser.
   - Uppskattade priser visas inte. Vagnens värde blir "ca … kr (X varor utan pris)".
   - Prislistan ändras inte.
5. **Leveransdagen blir tydligare.**
   - Är ingen dag vald visas en tydlig ruta överst: "Välj leveransdag först – då kommer kundernas beställningar med i vagnen".
   - Rutan försvinner när man valt dag.
6. **Kundvagnsraden visar en liten bild av de senast tillagda varorna.**
   - Antalet hoppar till när man lägger till en vara.

## Att kontrollera

- Allt kontrolleras i 393 px bredd, samma som din skärm.
- Jag kontrollerar att det inte finns någon skroll i sidled och att alla tryckytor är minst 44 px.
- Inga riktiga beställningar skickas.

## Fråga till er (påverkar inte bygget)

Kokta Havskräftor 11-15 M står för 1 kr/kg i Göteborgs prislista. Det priset behöver någon rätta i prislistan. Jag ändrar inte priset själv.

## Tekniska detaljer

- Bara `src/components/orders/mobile/StoreShopView.tsx` ändras.
  - Huvudet och leveransraden ligger i samma skrollcontainer som rutnätet. Sök och kategorirad är `sticky top-0`.
  - Kategorilistan är en panel nerifrån inuti den befintliga helskärmsportalen, på z-[90].
- Prisfiltret använder `lock_mode === "locked"` från `useStoreTierPrices`, som redan returnerar hela raden.
- Sparlogiken, databasfunktionen för "mest beställt" och datorvyn ändras inte.
