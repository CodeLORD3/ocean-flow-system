// Speglar FSAB:s anställda från Fortnox Lön till Makrilltrade och kopplar anställningsnummer.
// Fortnox är master för anställda — vi skriver aldrig tillbaka.
import { adminClient, requireUser, fortnoxRequest, json, corsHeaders, LEGAL_ENTITIES } from "../_shared/fortnox.ts";

type PlanRow = {
  employee_number: string;
  fortnox_name: string | null;
  pnr_last4: string | null;
  inactive: boolean;
  action: "already_linked" | "link" | "no_match" | "no_employment";
  match_method: string | null;
  employee_id: string | null;
  makrilltrade_name: string | null;
  employment_id: string | null;
  current_number: string | null;
};

function digits(v?: string | null): string | null {
  if (!v) return null;
  const d = v.replace(/\D/g, "");
  return d.length >= 10 ? d : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Metoden stöds inte" }, 405);

  const user = await requireUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => null);
  const entity = typeof body?.legal_entity_code === "string" ? body.legal_entity_code.trim() : "";
  const mode = body?.mode === "sync" || body?.mode === "link" || body?.mode === "plan" ? body.mode : "";
  if (!entity || !LEGAL_ENTITIES[entity]) return json({ error: "Okänt bolag" }, 400);
  if (!mode) return json({ error: "Ogiltigt importläge" }, 400);

  const links = Array.isArray(body?.links) ? body.links : [];
  if (mode === "link" && (links.length === 0 || links.length > 500 || links.some((l: any) =>
    typeof l?.employee_number !== "string" || !l.employee_number.trim() ||
    typeof l?.employee_id !== "string" || !/^[0-9a-f-]{36}$/i.test(l.employee_id)))) {
    return json({ error: "Ogiltiga eller för många kopplingar" }, 400);
  }

  const sb = adminClient();
  const { data: canSeeCompany } = await sb.rpc("has_company_access", {
    _user_id: user.id,
    _legal_entity_id: entity,
  });
  if (!canSeeCompany) return json({ error: "Du saknar åtkomst till bolaget" }, 403);

  try {
    let synced = 0;

    if (mode === "sync") {
      let page = 1;
      while (page <= 100) {
        const res = await fortnoxRequest<any>(sb, entity, "GET", `/employees?limit=100&page=${page}`);
        const list: any[] = res?.Employees ?? [];
        if (list.length === 0) break;

        for (const e of list) {
          const pnr = digits(e.PersonalIdentityNumber);
          let pnrHash: string | null = null;
          if (pnr) {
            const { data } = await sb.rpc("pnr_hash", { _pnr: pnr });
            pnrHash = (data as string | null) ?? null;
          }
          const row = {
            legal_entity_code: entity,
            employee_number: String(e.EmployeeId ?? e.EmployeeID ?? ""),
            first_name: e.FirstName ?? null,
            last_name: e.LastName ?? null,
            pnr_hash: pnrHash,
            pnr_last4: pnr ? pnr.slice(-4) : null,
            employment_date: e.EmploymentDate ?? null,
            inactive: e.Inactive === true,
            // Spara aldrig Fortnox-svaret i sin helhet eftersom det kan innehålla personnummer.
            raw: {
              EmployeeId: e.EmployeeId ?? e.EmployeeID ?? null,
              FirstName: e.FirstName ?? null,
              LastName: e.LastName ?? null,
              EmploymentDate: e.EmploymentDate ?? null,
              Inactive: e.Inactive === true,
            },
            synced_at: new Date().toISOString(),
          };
          if (!row.employee_number) continue;
          const { error } = await sb.from("fortnox_employees")
            .upsert(row, { onConflict: "legal_entity_code,employee_number" });
          if (error) return json({ error: error.message }, 500);
          synced++;
        }

        const meta = res?.MetaInformation;
        if (meta && meta["@TotalPages"] && page >= meta["@TotalPages"]) break;
        page++;
      }
    }

    if (mode === "link") {
      const links: { employee_number: string; employee_id: string }[] = Array.isArray(body?.links) ? body.links : [];
      if (!links.length) return json({ error: "Inga rader valda" }, 400);
      const results: unknown[] = [];
      let linked = 0, failed = 0;
      for (const l of links) {
        const { data, error } = await sb.rpc("fortnox_link_employee", {
          p_entity: entity,
          p_employee_number: String(l.employee_number).trim(),
          p_employee_id: l.employee_id,
          p_actor_id: user.id,
        });
        if (error) {
          failed++;
          results.push({ employee_number: l.employee_number, error: error.message });
        } else {
          linked++;
          results.push({ employee_number: l.employee_number, employment_id: data });
        }
      }
      const plan = await loadPlan(sb, entity, user.id);
      return json({ ok: true, mode, summary: { linked, failed }, results, ...plan });
    }

    const plan = await loadPlan(sb, entity, user.id);
    return json({ ok: true, mode, synced, ...plan });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 502);
  }
});

async function loadPlan(sb: ReturnType<typeof adminClient>, entity: string, userId: string) {
  const [{ data: plan, error }, { data: missing, error: mErr }] = await Promise.all([
    sb.rpc("fortnox_match_employees", { p_entity: entity, p_actor_id: userId }),
    sb.from("employments")
      .select("id, employee_id, fortnox_employee_id, is_active")
      .eq("legal_entity_id", entity)
      .eq("is_active", true),
  ]);
  if (error) throw new Error(error.message);
  if (mErr) throw new Error(mErr.message);

  const rows = (plan ?? []) as PlanRow[];
  const active = missing ?? [];
  return {
    plan: rows,
    summary: {
      total: rows.length,
      already_linked: rows.filter((r) => r.action === "already_linked").length,
      link: rows.filter((r) => r.action === "link").length,
      no_match: rows.filter((r) => r.action === "no_match").length,
      no_employment: rows.filter((r) => r.action === "no_employment").length,
      active_employments: active.length,
      employments_missing_number: active.filter((e) => !e.fortnox_employee_id).length,
    },
  };
}
