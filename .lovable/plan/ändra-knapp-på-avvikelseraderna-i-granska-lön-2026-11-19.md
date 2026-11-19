# "Ändra"-knapp på avvikelseraderna i Granska lön

## Vad som byggs
- Every day in the "Avvikelser mot schemat" list gets a third button, **Ändra**, next to Stämplad tid/Schematid and Godkänn/Neka.
- **Ändra** opens the same "Ändra dag" box that already exists in Granska lön, already filled in with the right person and day. There you can:
  - type the hours that should count, or
  - turn the day into sick leave, holiday, VAB and so on.
  A comment is required, and the change is saved with your name.
- Once the day has been changed, its deviations show "Hela dagen beslutad" and no longer wait for approval.
- On the phone, the buttons wrap onto a new line so the page never scrolls sideways.

## Technical details
- `DeviationParts` gets an optional `onEdit` prop. When it is set, an "Ändra" button is shown on each row (ghost variant, 44 px high).
- `PayrollReview.tsx` passes `onEdit={() => setEditDay({ employeeId, date: a.date })}`, which opens the existing `PayrollDayEditDialog`.
- After saving, `payroll-clocked` is refreshed so the list updates. This already happens in the dialog.
- No changes to the database or the pay calculation.
