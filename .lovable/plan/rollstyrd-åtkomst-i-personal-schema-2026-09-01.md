# Rollstyrd åtkomst i Personal & Schema

Idag styrs Personal & Schema bara av vilken portal man är i, inte av vem man är. Alla i butiksportalen ser hela personalmodulen. Det ändras så att en vanlig anställd bara ser sitt eget.

## Nivåer

| Nivå | Ser |
| --- | --- |
| Anställd (standard) | Mina pass (inkl. ansök om pass/byte), Min tid, Frånvaro (egna ansökningar), Min profil |
| Butikschef / Flerbutikschef | Allt för sin butik: personal, schema + schemaplanering, rapporterad tid, frånvarobeslut, attest. Inte lön, regler/OB, integrationer, personalregister |
| Bolags-/region-/koncernadmin, plattformsadmin, admin-portal | Hela modulen som idag |

Konton utan satt roll behandlas som vanlig anställd. Chefer får sin roll i Personal → behörighet, som redan finns.

## Vad som byggs

1. En liten regelfil för personalmodulens nivåer: läser rollen från inloggad personal och svarar på "får den här personen se den här sidan".
2. Navigeringen (Personal & Schema-hubben, flikraden i modulen och sidomenyerna) visar bara sidor nivån får se — tomma grupper faller bort.
3. Direktlänkar och öppna flikar spärras med samma regel, så en anställd som skriver in adressen ändå möts av "Ingen behörighet" istället för sidan.
4. Anställdvyn får en egen ingång: hubben visar fyra tydliga kort (Mina pass, Min tid, Frånvaro, Min profil) istället för hela modulen.
5. Frånvarosidan visar för en anställd endast egna ansökningar och knappen "Ansök om frånvaro" — besluts- och bemanningsdelarna göms.
6. Chefsvyn döljer lönedelar (Granska lön, Löneunderlag), Regler & OB, Personalkollen, Klocka vs PK, Stämpelklockestationer och Personalregister.

## Tekniska noter

- Ny fil `src/lib/staffModuleAccess.ts` med nivåer (`employee` | `manager` | `admin`) och `canOpenStaffPage(level, path)`. Nivån härleds ur `primary_role` + `is_platform_admin` + `portal_access`.
- `StaffAuthContext` kompletteras med `primary_role` och `is_platform_admin` från vyn `staff_access` (fälten finns redan i vyn) så klienten kan avgöra nivå utan extra anrop.
- `staffGroupsForSite(site)` får ett nivåargument och filtrerar på både portal och nivå. `StaffModuleNav`, `PersonalHub`, `AppSidebar`, `ShopSidebar`, `ProductionSidebar` skickar med nivån.
- `KeepAliveTabs`-spärren kompletteras med nivåkontrollen för personalmodulens rutter; övriga rutter påverkas inte.
- `HrControl` och `StaffSchedule` får läsläge för nivå `employee` respektive dölja lön/attest för `manager`.
- Ingen ändring i databasen eller RLS i den här körningen — serverns scope-regler gäller redan. Om du vill att servern också ska neka en anställd att läsa andras tider tar vi det som ett separat steg.
