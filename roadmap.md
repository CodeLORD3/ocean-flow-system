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
- [ ] Blueprint för stämpelklockan (kod + ordagrann beskrivning av funktioner och kopplingar) — docs/stampelklocka-blueprint.md
