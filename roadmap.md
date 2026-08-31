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

## Personalmodul: Etapp 5 — löneunderlag, förmåner & Fortnox-automation
- [ ] Datamodell för versionerade lönepolicyer, löneperioder, lönerader, löneartsmappning, förmåner, avdrag, skattetabeller och arbetsgivaravgifter
- [ ] Beräkningsmotor som är master för enheter; kronor endast preliminära KPI-/granskningsvärden
- [ ] Granskningsvy per bolag/period med felkö, person- och dagdetalj samt periodlås
- [ ] Fortnox lönescope/omauktorisering, idempotent export, rate limit, retry, logg och rättelseexport
- [ ] PAXml 2.2-export som lönesystemsoberoende exit-väg
- [ ] Kostnadsställe-, kontrakterade timmar- och semesterskuldsrapporter
- [ ] Förmåns-/avdragsregler, skattetabellimport och arbetsgivaravgiftsregler
- [ ] RLS-verifiering på bolags-/butiksnivå och acceptanstest enligt Etapp 5-underlaget
