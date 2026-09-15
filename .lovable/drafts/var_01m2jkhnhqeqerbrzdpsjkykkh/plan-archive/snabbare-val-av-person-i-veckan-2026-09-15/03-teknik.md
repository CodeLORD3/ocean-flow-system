## Tekniskt

- Ny hook `src/hooks/useFrequentStaff.ts`: läser `staff_shifts` för valt `store_id` de senaste 12 veckorna, räknar pass per `employee_id`, returnerar topplistan sorterad på antal. Inga schemaändringar i databasen.
- `src/pages/SchedulePlanner.tsx`: `Select`-fältet vid "Lägg till person i veckan" byts mot `Popover` + `Command` (shadcn `CommandInput`/`CommandList`) för sökbar lista över `addablePeople`.
- Ovanför sökfältet renderas upp till fem snabbvalsknappar från hookens topplista, filtrerade mot `addablePeople` så redan tillagda inte dubbleras. Klick anropar samma `setExtraRows`-logik som idag.
- Tokens och Industry-primitiver enligt Verktygstema v1; inga hårdkodade färger. Endast presentation och en läsande hook — ingen ändring i schemalogik, publicering eller lönevägar.
