# Arkitekturregler

- Händelsetriggers till AI-teamet: DB-triggers anropar edge-funktionen `ai_trigger` asynkront via pg_net med bara {event, table, id}; funktionen läser om källraden och dedupar via unikt index i `ai_trigger_log` — så blockeras skrivningen aldrig och anroparen behöver inte litas på.
- Personlig mobilstämpling går genom `clock-punch` med `self_punch: true` (inloggning i stället för stationssession) och styrs per arbetsplats med `work_sites.mobile_self_punch` — samma regler som klockan, ingen duplicerad logik.
- Nattlig utloggning 03:30 Stockholm körs i databasen (`nightly_logout_run` via pg_cron) och appen jämför inloggningstid mot `sessions_valid_from()` — MCP/OAuth-sessioner och klockstationer rörs inte.
