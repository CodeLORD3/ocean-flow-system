# Correct company cost, menu review in Personal & Schema, review of all clock-ins

## Del 1 – Correct employer's contribution and cost for the company (built and recalculated)

**What is wrong today:** both FSAB and DE No.1 AB have a 10,21 % rule with no age limit. The calculation always picks the lowest rate that fits, so everyone gets 10,21 % instead of 31,42 %. Cost for the company is therefore about 16 % too low for almost everyone.

There are also more errors in Granska lön:
- The fixed monthly salary is always multiplied by 31,42 %, regardless of age and holiday pay.
- The total box "Arbetsgivaravgift 31,42 %" and the gross amount at the top are calculated backwards from the cost with 31,42 %. They will be wrong as soon as anyone has a different rate.

**What I will do:**
1. Add the age limit "born 1958 or earlier" to the 10,21 % rule for FSAB and DE No.1 AB.
2. Youth discount 20,81 % (born 2003–2007, 1 April 2026 – 30 September 2027): apply the reduced rate only to pay up to 25 000 kr/month and 31,42 % on the part above, as the law says. Today the whole discount disappears once pay goes over 25 000 kr.
3. People with no date of birth get 31,42 % and are listed as "Födelsedatum saknas".
4. Granska lön: each person's employer's contribution and cost are calculated per person from their own rate, the monthly salary included. The totals at the top become the sum of the people. The label shows "Arbetsgivaravgift" without a fixed percentage.
5. Recalculate November (16 Oct – 15 Nov) for FSAB and DE No.1 AB. Earlier attest decisions are kept and nothing is sent to Fortnox.
6. Tests for each rule: 66 years old gives 10,21 %; 45 years old gives 31,42 %; 20 years old at 30 000 kr gives 20,81 % on 25 000 and 31,42 % on 5 000; missing date of birth gives 31,42 %.
7. Check twice afterwards: recalculate 5 people by hand (one of them the person in your picture) and compare with what Granska lön shows.

## Del 2 – Review of all menus in Personal & Schema (report, nothing changed)

All 18 pages are reviewed: Personal, Personalregister, Min profil, Stämpelklocka, Rapporterad tid, Min tid, På plats nu, Klocka vs PK, Schema, Schemaplanering, Månadskalender, Mina pass, Frånvaro & bemanning, Attest, Regler & OB, Granska lön, Personalkollen, plus the start page.

For each page I note what it shows, where the numbers come from, and whether it duplicates another page. I also check whether two pages give different answers to the same question, for example hours, pay or schedule. You get a list like "these do the same thing – keep X, remove Y" with a recommendation. I change nothing until you have chosen.

## Del 3 – Review of all clock-ins against the schedule (report, nothing changed)

For November (16 Oct – 15 Nov), every person and every day is compared using the rules:
- Within the schedule counts as approved, and up to 7 minutes counts as schedule time.
- Extra time before or after the schedule only counts after attest.
- Arriving late or leaving early: the manager chooses clocked time or schedule time.
- A forgotten clock-out is closed at the store's closing time + 30 min; a closed day is left for review.

I check that the system actually did this on every day. I look for days with:
- clocking but no schedule, or schedule but no clocking
- double passes
- the 12-hour automatic end
- a fixed start time that conflicts with the schedule, such as Maebel's 08:00
- duplicate people, such as Keven Bekit

The comparison is done twice, independently: once in the database and once with a separate count from the raw clock records. The two results must match. Deviations are listed per person. Nothing is changed in the data without your OK.

## Technical details
- Migration: update `employer_contribution_rules` (set `birth_year_to=1958` on the two 10.21 rows) — a data UPDATE is run via the query tool, not as a migration.
- `payroll-compute` `contributionRate`/`costOf`: split the youth rate at `salary_cap` (amount up to cap at the reduced rate, the rest at the ordinary rate) and put the rate on the line (`contribution_rate` in `note` or a new column). Redeploy and run per company.
- `PayrollReview.tsx`: remove hard-coded 1.3142/0.3142; employer's contribution per person = rate from the lines, fixed salary × (1+vacation) × (1+rate).
- Tests in `src/test/` for the rate selection (extracted into a shared pure function).
- Del 2/3 are delivered as a report in the chat plus an Excel file in Files (`revision-personal-schema.xlsx`, `revision-stampling-nov.xlsx`).
