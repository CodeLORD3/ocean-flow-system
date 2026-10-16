# Stämplingar stoppas idag efter att oktober låstes

## Vad som hände
Igår kväll låstes löneperiod 2026-10 (16/9–15/10) för alla butiker. Spärren för stämplingar räknar perioden som en vanlig kalendermånad. Den tror alltså att idag, 16/10, hör till den låsta oktoberperioden. Därför nekas varje ny stämpling: "Perioden är låst".

- Klockan i Särö visar att den har stämplat, men stämplingen sparas inte. Den hamnar som "Kunde inte spara" i felkön.
- Idag ligger 3 nekade stämplingar från Särö och 1 från Ålstens Fisk i kön. Där finns Erik Franzen och Melker Björndal.
- Samma sak gäller hämtningen från Personalkollen och attesten. Alla butiker påverkas fram till 31/10.

## Åtgärd
1. Ändra låskontrollen så att den följer svensk löneperiod: dag 16 och senare hör till nästa månads period. Då räknas 16/10 till period 2026-11, som inte är låst. Låset för 16/9–15/10 är kvar.
2. Spara de stämplingar i felkön som nekades idag med sin riktiga tid. Ingen stämpling hittas på och inget raderas.
3. Kontrollera att Erik och Melker syns under Dagens pass. Kontrollera också att en stämpling daterad 15/10 fortfarande nekas.

Inget ändras i lönerna, i oktoberperioden eller i Fortnox.

## Tekniskt
- `period_is_locked(_store_id, _date)`: period = `to_char(_date + (case when extract(day from _date)>=16 then interval '1 month' else interval '0' end), 'YYYY-MM')`. Funktionen används av `block_locked_time_entry`, `block_locked_attestation` och `pk_import_run`.
- Öppna `clock_sync_failures` från idag med `reason='Kunde inte spara stämplingen.'` spelas upp igen genom den befintliga lösningsvägen. Status sätts till löst med `resolved_entry_id`.
