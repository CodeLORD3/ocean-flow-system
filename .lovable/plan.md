# Tre tydliga belopp per person i Granska lön

## What changes
In each person's row, the amounts on the right are replaced with three lines of the same size, all in the same order:

```text
Brutto                    35 000 kr
Kostnad för bolag         45 997 kr
Utbetalt till konto    ca 27 653 kr
```

- The cost for the company gets its own clearly visible line instead of small grey text.
- "Utbetalas till kontot" becomes "Utbetalt till konto". If the tax table is missing, it says "Skattetabell saknas".
- For monthly salary, a small note "varav fast månadslön X kr" stays underneath.
- The labels sit on the left and the amounts on the right, with digits aligned. On a phone it wraps without sideways scrolling.
- The totals at the top and the Excel export get the same names: "Brutto", "Kostnad för bolag", "Utbetalt till konto".

## Technical details
- Only presentation code in `src/pages/PayrollReview.tsx` (row block around line 597, DecisionMetric labels and the Excel column names). The calculations are not changed.
