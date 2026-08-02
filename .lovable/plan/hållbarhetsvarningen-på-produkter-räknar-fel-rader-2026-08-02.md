# Hållbarhetsvarningen på Produkter räknar fel rader

## Vad som är fel
Varningen räknar bara toppnivårader (paraply-/överkategorirader) och struntar i varianterna under dem:

- 37 aktiva toppnivåprodukter saknar hållbarhet — men 10 av dem är rena paraplyrader med varianter under sig, som aldrig ska ha eget hållbarhetsvärde.
- Samtidigt missas 33 aktiva varianter som faktiskt saknar hållbarhet, eftersom de ligger under en förälder.

Alltså: varningen visar 37 medan det verkliga antalet rader som behöver åtgärdas är 60 (varav 15 i kategorier som normalt inte behöver datum: Emballage & Förbrukning och Råvaror & Storhushåll).

## Ändring
1. Räkna på hela produktlistan (både föräldrar och varianter), inte bara toppnivån.
2. Uteslut paraplyrader — en produkt som har varianter under sig räknas inte.
3. Uteslut kategorierna "Emballage & Förbrukning" och "Råvaror & Storhushåll" (icke-färskvaror) från varningen.
4. Uppdatera texten så den blir tydlig, t.ex.: "N produkter saknar hållbarhet — ange antal dagar direkt i tabellen för att aktivera automatiskt utgångsdatum." Samma siffra används i statusraden längre ner.

Med reglerna ovan blir varningen 45 rader i stället för 37, och paraplyraderna spökar inte längre.

## Teknisk detalj
- `src/pages/Products.tsx`: byt `productsMissingShelfLife` till att utgå från `allProducts`, filtrera bort rader som är förälder till någon annan produkt (`allProducts.some(c => c.parent_product_id === p.id)`) samt kategorierna ovan. Ingen datamodelländring behövs.
