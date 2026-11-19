# Visa "Utbetalas till kontot" per person i Granska lön

## Vad som byggs
On each person's row in Granska lön, a third amount is added under Brutto and Kostnad:

- **Utbetalas till kontot ca X kr**: the gross pay minus preliminary tax from the person's tax table and column, which are stored on their employment.
- If the employment has no tax table, the row shows "Skattetabell saknas – nettot kan inte räknas", so a wrong amount is never shown. Right now 63 of 128 active employments have a tax table.
- If the employment has a tax adjustment (jämkning), it is used.
- The amount is marked as approximate. The exact net pay is still calculated in Fortnox Lön.
- The amount is also added as a column in the Excel file.
- The top summary gets "Utbetalas till kontot (summa)" for the people who have a tax table.

## Technical details
- Tax deduction uses Skatteverket's monthly tax tables for 2026 (table 29–42, column 1–6) from a static table in `src/lib/taxTables.ts`. It looks up the gross amount's interval in steps of 100 kr, and above the top of the table it uses the percentage.
- Fetch `tax_table, tax_column, tax_adjustment` in the existing employments query in `PayrollReview.tsx`.
- `src/lib/netPay.ts` with `netPay(gross, table, column, adjustment)`, plus a test using known values from Skatteverket's table.
- No changes to the database, the pay calculation or Fortnox.
