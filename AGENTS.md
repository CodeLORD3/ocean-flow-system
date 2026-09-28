# Arkitekturregler

- Händelsetriggers till AI-teamet: DB-triggers anropar edge-funktionen `ai_trigger` asynkront via pg_net med bara {event, table, id}; funktionen läser om källraden och dedupar via unikt index i `ai_trigger_log` — så blockeras skrivningen aldrig och anroparen behöver inte litas på.
