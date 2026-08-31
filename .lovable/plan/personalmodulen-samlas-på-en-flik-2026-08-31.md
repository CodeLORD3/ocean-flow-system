# Personalmodulen samlas på EN flik

Allt som är byggt kring personal, tid, schema, frånvaro och lön finns redan som sidor, men de ligger utspridda som 16 separata poster i sidomenyn. Planen samlar dem i en enda ingång, organiserad enligt etappstrukturen vi byggt.

## Ny ingång: "Personal & Schema"

Sidomenyn får en enda post, `Personal & Schema` → `/personal`. Den öppnar en navsida med sex kort/rubriker, i samma ordning som etapperna:

```text
1. Personal            Personal (kort/profiler), Personalregister (anställningar, personnummer)
2. Tid & Stämpling     Stämpelklocka/stationer, Rapporterad tid, Min tid, På plats nu, Klocka vs PK
3. Schema              Schema, Schemaplanering, Mina pass
4. Frånvaro            Frånvaro & bemanning (sjuk, semester, saldon, notiser)
5. Attest & Regler     Attest, Regler & OB
6. Lön                 Löneunderlag (export), Granska lön
7. Integration         Personalkollen
```

Varje kort visar rubrik, kort beskrivning och länkar direkt till den befintliga sidan. Inget innehåll byggs om — sidorna behålls som de är och nås både från navsidan och via sin nuvarande URL.

## Undernavigering på alla personalsidor

Alla personalsidor får en gemensam flikrad högst upp (grupperna 1–7 ovan) så man kan hoppa mellan t.ex. Schema och Attest utan att gå via menyn. Aktiv sida markeras. Raden är horisontellt skrollbar på mobil/surfplatta.

## Behörighet

Navsidan och flikraden visar bara de delar användaren får se, enligt den behörighetskarta som redan finns:
- Admin ser allt.
- Butik/grossist ser Personal, Min tid, Schema, Mina pass, Frånvaro & bemanning.
- Sidor som är admin-begränsade (Personalregister, Stämpelklocka, Rapporterad tid, Regler & OB, Löneunderlag, Granska lön, Klocka vs PK, På plats nu, Personalkollen) visas inte för butikskonton.

Butiksportalens och grossistportalens sidomenyer får samma samlade ingång, filtrerad på det de har rätt till.

## Teknisk detalj

- Ny sida `src/pages/PersonalHub.tsx` + ny komponent `src/components/staff/StaffModuleNav.tsx` (flikraden), driven av en delad grupplista.
- Route `/personal` registreras i `src/components/KeepAliveTabs.tsx`; `/personal` läggs i `src/lib/pageAccess.ts` som butik+grossist+admin (innehållet filtreras per post).
- `src/components/AppSidebar.tsx`: `staffNav` ersätts av en enda post `Personal & Schema` → `/personal` (Personal-gruppen tas bort ur sektionslistan). Samma post läggs i `ShopSidebar.tsx`.
- Flikraden monteras i de befintliga personalsidorna via en tunn wrapper så att inga sidfunktioner ändras.
- Manualinnehållet (`src/lib/manualContent.ts`) uppdateras med den nya ingången.

Inga databasändringar och ingen befintlig funktionalitet tas bort.
