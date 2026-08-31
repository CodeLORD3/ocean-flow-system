# Roadmap

## Behovsavstämning & beslutsstöd vid inköp
- [ ] Datalager: kundbehov per vecka (wanted_date), beställt per produkt från shop_orders/shop_order_lines, utestående i andra öppna ordrar
- [ ] Ny avstämningsvy: Kundbehov / Beställt / Behovsdifferens per kategori, status Täckt/Saknas/Kontrollera/Info
- [ ] Sammanfattning som klickbara filter + "Visa endast avvikelser" + kategorifilter
- [ ] Beslutsstöd i "Ny beställning": kundbehov, redan beställt, live-täckningsindikator, dubblettskydd, sekundär info
- [ ] Manuell produktmatchning (kandidatförslag, aldrig automatisk)
- [ ] Navigation/behörighet + mobil/surfplatta, utan att ändra befintlig styling
- [ ] Verifiering: veckofilter på leveransdatum, statusfall, separation leveransavvikelse vs behovsdifferens

## Personalmodul: stämpelklocka — Etapp 3 koppling
- [x] Driftställe och kostnadsställe i stämplingsflödet
- [x] Geolocation/geofence-validering server-side
- [x] Krypterad offlinekö med plats- och kostnadskontext
- [x] Tidsbegränsat inspektörsläge med sessionsjournal
- [x] Deploy och typ-/produktionsbygge verifierat

## Dokumentation
- [x] Blueprint för stämpelklockan (kod + ordagrann beskrivning av funktioner och kopplingar) — docs/stampelklocka-blueprint.md

## PRIO: Låst dagsrapport som ändras ska räkna om hela kedjan
- [ ] Ändring i dagsrapport efter låsning ska låsa upp, räkna om och låsa igen vecko- och månadsrapport
- [ ] Ingen kvarvarande "Avviker efter låsning" — låsta summor ska ersättas med de nya
- [ ] Samma kedja åt andra hållet: ändring i vecko-/månadsrapport speglas till dagsrapport


## Rapporter: daglig butiksvy och export
- [x] Butiks-/region-dropdown på veckoöversikten
- [x] Klickbar butik med dag-för-dag-visning
- [x] Utskrift och Excel-export av rapportens siffror

## Personalmodul: Etapp 2b — härdning av stämpelklockan
- [x] F19–F21: svensk arbetsdag, unik klientstämpling och berakna_arbetstid som gemensam motor
- [x] F22–F27: stationsvakt, nyhetsbaserade avvikelser, retention-logg, attestlås, självattestspärr och realtid
- [x] Offlinefel sparas i felkö utan tyst radering, Min tid och IANA-tidszon i personalvyer
- [x] Inspektörsläge loggar faktisk PNR-dekryptering och kostnadsställeväxling stöds
- [x] Körbevisen a–w skrivna som körbart skript (supabase/verification/etapp2b_korbevis.sql)
- [ ] Acceptanskörning a–w körd med faktiska resultat (kräver att utkastet accepterats)

## Personalmodul: Etapp 5 — löneunderlag, förmåner & Fortnox-automation
- [ ] Datamodell för versionerade lönepolicyer, löneperioder, lönerader, löneartsmappning, förmåner, avdrag, skattetabeller och arbetsgivaravgifter
- [ ] Beräkningsmotor som är master för enheter; kronor endast preliminära KPI-/granskningsvärden
- [ ] Granskningsvy per bolag/period med felkö, person- och dagdetalj samt periodlås
- [ ] Fortnox lönescope/omauktorisering, idempotent export, rate limit, retry, logg och rättelseexport
- [ ] PAXml 2.2-export som lönesystemsoberoende exit-väg
- [ ] Kostnadsställe-, kontrakterade timmar- och semesterskuldsrapporter
- [ ] Förmåns-/avdragsregler, skattetabellimport och arbetsgivaravgiftsregler
- [ ] RLS-verifiering på bolags-/butiksnivå och acceptanstest enligt Etapp 5-underlaget
