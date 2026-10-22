## Visa Färska Räkor (och liknande) i inköpsschemat igen

**Orsak (kontrollerat):** Beställningarna av Färska Räkor till 23/10 från Eriksberg (45) och Torslanda Torg (45) har status **Pågående**. Inköpsschemat visar i dag bara status **Ny**, så de döljs.

**Ändring:** Inköpsschemat visar alla beställningar utom de som är klara: Packad, Skickad, Levererad, Avbruten, Arkiverad (och Öppen, som aldrig visas för grossisten). Passerade leveransdagar döljs fortfarande. Produktionsschemat ändras inte. Inga beställningar ändras.

### Tekniskt
- `src/lib/purchaseOrderEligibility.ts`: `isScheduleOrderEligible` för inköp = status finns och ingår inte i {Packad, Skickad, Levererad, Avbruten, Arkiverad, Öppen}.
- `src/test/purchaseOrderEligibility.test.ts`: Ny och Pågående med; de klara statusarna och tom status ute.
- Kontrollera schemat inloggad att Färska Räkor 23/10 syns med 90.
