## Tekniska detaljer

Berörd kod: `src/pages/ShopOrders.tsx` (butikens beställning till grossisten, `OrdersRouter` → `ShopOrders` på `/orders`), samt `useCustomerDemand` i `src/hooks/useStoreReplenishment`-familjen.

**Steg 1 — instrumenterad reproduktion (Playwright, 390×844, is_mobile):** logga rendercount i `ShopOrders`, `document.body` `pointer-events`/`style`, antal `[role=dialog]`, samt `pageerror`/`console.error` direkt efter `addProduct`. Skiljer "låst overlay" (body `pointer-events: none` kvar från Radix) från "renderloop" (tråden upptagen, rendercount rusar).

**Kandidat 1 — effekten på rad 509.** `useEffect([customerDemand])` skriver `setOrderLines` när kundbeställningar finns. React Query ger ny `Map`-identitet vid varje refetch; om en nyss tillagd manuell rad matchar samma `product_id` konverteras den till `source: "customer"` och `quantity` räknas om (`customerQty + topUp`). Härda: `useMemo`-stabilisera nyckeln (signatur av produkt-id + mängd) och gör jämförelsen fullständig innan `changed = true`, så effekten inte kan skriva om och om.

**Kandidat 2 — fokushoppet rad 646–665.** `addProduct` sätter `focusProductId`, effekten beror på `[focusProductId, groupedOrderLines]` och kör `el.focus()` + `el.select()` på en `type="number"`-input; `startNewOrder`/"Fler produkter" kör dessutom `scrollIntoView({behavior:"smooth"})` i `setTimeout`. Kombinationen mjuk rullning + fokusbyte + mobiltangentbord är en känd hängningskälla i iOS Safari. Byt till `requestAnimationFrame`, `block: "nearest"` utan smooth vid fokus, och rensa `focusProductId` även när elementet saknas.

**Kandidat 3 — kvarliggande overlay.** Produktförhandsvisningen (`previewProduct`-dialogen) och `Select` ("Kopiera tidigare order") är Radix-komponenter; om en stängs medan listan renderas om kan `pointer-events: none` ligga kvar på `body`. Åtgärd om mätningen visar det: `modal={false}` på ögon-dialogen och en säkerhetsrensning av `body.style.pointerEvents` när ingen dialog är öppen.

**Steg 3 — utkastet överlever omladdning.** Spara `orderLines`, `desiredDeliveryDate` och `orderNote` i `sessionStorage` per butik (nyckel `shop-order-draft-<storeId>`), återställ vid mount, rensa när beställningen skickats.

**Verifiering:** Playwright i mobilvyn — lägg tre varor, ändra antal med +/−, ta bort en rad, ladda om (raderna ska ligga kvar), skicka. Kontrollera noll `pageerror`, `body` `pointer-events: auto` och att rendercount planar ut. Därefter `tsgo`.
