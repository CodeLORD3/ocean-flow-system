# Toppraden på iPhone — fixa överlappet och höjden

## Vad som händer nu

På iPhone lägger appen redan in extra utrymme för klockan/batteriraden, men den plockas i fel lager: utrymmet läggs runt hela sidan medan appskalet samtidigt sägs vara exakt en skärmhöjd. Summan blir högre än skärmen, så innehållet skjuts uppåt — rubriken "Översikt", hamburgaren, klockikonen och profilbilden hamnar under iPhones statusrad, och längst ned klipps sista raden av. Dessutom är toppraden bara 48 px hög med små ikoner, vilket är trångt för en tumme.

## Så löser vi det

1. **Flytta utrymmet till toppraden.** Sidan får inte längre extra utrymme runt hela ytan. I stället reserverar själva toppraden plats för statusraden, så appskalet fortsätter vara exakt en skärmhöjd och inget klipps nedtill.
2. **Högre topprad på telefon.** 56 px i stället för 48, med lite mer luft mellan hamburgare, rubrik, notiser och profilbild. Datorvyn behåller sitt kompakta utseende.
3. **Rubriken får plats.** Sidnamnet blir något större och kortas med tre punkter i stället för att knuffa undan ikonerna.
4. **Samma regel i helskärmsflödena.** Auktionsinköp, butiksordrar och räkningen använder redan sin egen lösning — de ses över så de matchar den nya toppraden och inte lägger på utrymmet två gånger.
5. **Kontroll i telefonstorlek (390 px).** Skärmbilder före/efter som visar att toppraden är hel, att bottenmenyn syns i sin helhet och att inget klipps.

## Tekniskt

- `src/index.css`: ta bort `padding-top: env(safe-area-inset-top)` från `body` (vänster/höger behålls). `.safe-top` behålls som verktygsklass.
- `src/components/AppLayout.tsx`: skalet `h-[100dvh]` orört; `<header>` får `pt-[env(safe-area-inset-top)]` plus `h-14 sm:h-12` (via `min-h` så det säkra utrymmet adderas i stället för att äta höjden), större gap och `text-base sm:text-sm` på mobilrubriken.
- När sidomenyn öppnas på mobil (`SheetContent` i `sidebar.tsx`) kontrolleras att dess toppinnehåll också ligger under statusraden.
- `src/pages/AuctionMobile.tsx` och `src/pages/ShopOrders.tsx`: behåller `pt-[env(safe-area-inset-top)]` (de ligger `fixed inset-0`, så de påverkas inte av body-ändringen) — verifieras bara.
- Verifiering med Playwright i 390×844 och simulerad säker yta.
