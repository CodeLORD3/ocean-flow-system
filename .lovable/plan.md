# Ludvig Wickström blir Stockholmsansvarig

## Läget i dag
- Ludvig är **Butikschef** och har två enheter: Fiskskaldjur Kungsholmen och Administration DE No.1. Han kommer bara åt butiksdelen.
- En butikschef får bara se en enhet. Med två enheter och utan rollen Flerbutikschef kan han i praktiken bli utestängd från båda.
- Stockholm består av hela DE No.1: Ålstens Fisk, Fiskskaldjur Kungsholmen och Administration DE No.1. Inga andra bolag ingår.

## Ändring
Han blir **Bolagsadmin för DE No.1**, som är rollen för "allt inom ett bolag":
- Han ser alla tre Stockholmsenheterna, alltså Ålstens Fisk, Kungsholmen och Administration DE No.1.
- Han får grossist- och beställningsdelen med order, beställningar och leveranser för Stockholm.
- Han får också produktion och lager inom DE No.1.
- Han har kvar butiksdelen med rapporter, schema, personal och attest för Stockholms enheter.
- Han ser ingenting i FSAB (Göteborg) eller Componia (Schweiz).

Han blir **inte** plattformsadmin. Han ser alltså inte andra bolag och kan inte ändra systeminställningar. Ingen kod ändras, och ingen affärsdata rörs.

## Teknisk detalj
- `user_roles`: ersätt `store_manager` med `company_admin` för hans konto. Rollen ligger i den skyddade rolltabellen och prövas på serversidan.
- `user_scopes`: ta bort de två butiksscopen och lägg till `entity:de-no1`, plus portalerna `shop`, `wholesale` och `production`.
- Kontroll efteråt: logga in som Ludvig i förhandsvisningen och bekräfta att alla tre Stockholmsenheterna och orderlistan syns, och att Göteborgs butiker inte gör det.
