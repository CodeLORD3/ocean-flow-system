/**
 * fortnox-payroll-export — exporterar ett granskat löneunderlag till Fortnox Lön
 * och kan alternativt generera PAXml 2.2 för ett fristående lönesystem.
 *
 * Ansvarsgräns: Makrilltrade skickar ENHETER (timmar, dagar, omfattning, antal).
 * Fortnox Lön räknar bruttolön, skatt och utbetalning. Preliminära kronor i
 * payroll_lines följer aldrig med som lönebelopp, bara som belopp på rader som
 * per definition är belopp (förmåner, avdrag, ersättningar).
 *
 * Läge:
 *  - mode "fortnox" (standard): postar rad för rad till Fortnox Lön.
 *      attendance → /attendancetransactions
 *      absence    → /absencetransactions
 *      salary     → /salarytransactions
 *  - mode "paxml": returnerar PAXml 2.2 som text, utan att röra Fortnox.
 *
 * Idempotens: varje rad loggas i payroll_export_log med request_key
 * "<period_id>:<line_id>". En rad som redan har en lyckad logg skickas aldrig om.
 * Rättelse: rader vars underlag ändrats efter export får export_status
 * "corrected" av omräkningen och skickas då som ny transaktion.
 */
import { adminClient, requireUser, fortnoxRequest, FortnoxError, json, corsHeaders } from "../_shared/fortnox.ts";

interface PayrollLineRow {
  id: string;
  period_id: string;
  legal_entity_id: string;
  store_id: string | null;
  employee_id: string;
  employment_id: string | null;
  line_type: string;
  line_date: string;
  quantity: number;
  extent_pct: number | null;
  unit_amount: number | null;
  cost_center: string | null;
  note: string | null;
  export_status: string;
}

interface WageCode {
  line_type: string;
  agreement_area: string;
  fortnox_code: string;
  paxml_code: string | null;
  transaction_type: string;
  active: boolean;
}

const xmlEscape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const hours = (value: number) => Number(value ?? 0).toFixed(2);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const user = await requireUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const roleCheck = adminClient();
  const { data: roleRows } = await roleCheck.from("user_roles").select("role").eq("user_id", user.id);
  const roles = new Set(((roleRows ?? []) as { role: string }[]).map((r) => r.role));
  if (!["admin", "company_admin", "platform_admin"].some((r) => roles.has(r))) {
    return json({ error: "Behörighet saknas för löneexport" }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const legalEntityId: string | undefined = body?.legal_entity_id;
  const period: string | undefined = body?.period;
  const mode: string = body?.mode === "paxml" ? "paxml" : "fortnox";
  if (!legalEntityId || !period || !/^\d{4}-\d{2}$/.test(period)) {
    return json({ error: "legal_entity_id och period (YYYY-MM) krävs" }, 400);
  }

  const sb = adminClient();

  const { data: periodRow, error: periodErr } = await sb
    .from("payroll_periods")
    .select("id, status, legal_entity_id, period")
    .eq("legal_entity_id", legalEntityId)
    .eq("period", period)
    .maybeSingle();
  if (periodErr) return json({ error: periodErr.message }, 500);
  if (!periodRow) return json({ error: "Perioden är inte beräknad ännu" }, 404);
  if (!["reviewed", "exported", "reexported"].includes(periodRow.status)) {
    return json({ error: "Perioden måste vara granskad innan export" }, 409);
  }

  const { data: lineRows, error: lineErr } = await sb
    .from("payroll_lines")
    .select("id, period_id, legal_entity_id, store_id, employee_id, employment_id, line_type, line_date, quantity, extent_pct, unit_amount, cost_center, note, export_status")
    .eq("period_id", periodRow.id)
    .in("export_status", ["pending", "error", "corrected"])
    .order("line_date", { ascending: true });
  if (lineErr) return json({ error: lineErr.message }, 500);
  const lines = (lineRows ?? []) as PayrollLineRow[];

  const { data: mapRows } = await sb
    .from("fortnox_wage_code_map")
    .select("line_type, agreement_area, fortnox_code, paxml_code, transaction_type, active")
    .eq("legal_entity_id", legalEntityId)
    .eq("active", true);
  const wageCodes = new Map<string, WageCode>();
  ((mapRows ?? []) as WageCode[]).forEach((m) => wageCodes.set(m.line_type, m));

  const { data: employmentRows } = await sb
    .from("employments")
    .select("id, employee_id, fortnox_employee_id, cost_center")
    .eq("legal_entity_id", legalEntityId);
  const fortnoxEmployee = new Map<string, string | null>();
  ((employmentRows ?? []) as { employee_id: string; fortnox_employee_id: string | null }[]).forEach((e) => {
    if (!fortnoxEmployee.get(e.employee_id)) fortnoxEmployee.set(e.employee_id, e.fortnox_employee_id);
  });

  // Blockerande brister — samma regler som granskningsvyn visar.
  const blocking: { kind: string; detail: string; employee_id?: string }[] = [];
  for (const line of lines) {
    if (!wageCodes.has(line.line_type)) {
      blocking.push({ kind: "missing_wage_code", detail: line.line_type, employee_id: line.employee_id });
    }
    if (!fortnoxEmployee.get(line.employee_id)) {
      blocking.push({ kind: "missing_fortnox_employee_id", detail: line.employee_id, employee_id: line.employee_id });
    }
  }
  if (blocking.length > 0) {
    const unique = [...new Map(blocking.map((b) => [`${b.kind}|${b.detail}`, b])).values()];
    return json({ error: "Löneunderlaget har brister som måste rättas före export", issues: unique }, 409);
  }

  if (mode === "paxml") {
    const rows = lines
      .map((line) => {
        const code = wageCodes.get(line.line_type);
        const employeeId = fortnoxEmployee.get(line.employee_id) ?? line.employee_id;
        const paxml = code?.paxml_code ?? code?.fortnox_code ?? line.line_type;
        const kind = code?.transaction_type ?? "attendance";
        if (kind === "absence") {
          return `      <frånvarotransaktion anstid="${xmlEscape(employeeId)}" frånvarotyp="${xmlEscape(paxml)}" datum="${line.line_date}" omfattning="${Number(line.extent_pct ?? 100)}" />`;
        }
        if (kind === "salary") {
          return `      <lönetransaktion anstid="${xmlEscape(employeeId)}" löneart="${xmlEscape(paxml)}" datum="${line.line_date}" antal="${hours(line.quantity)}" belopp="${Number(line.unit_amount ?? 0).toFixed(2)}"${line.cost_center ? ` kostnadsställe="${xmlEscape(line.cost_center)}"` : ""} />`;
        }
        return `      <tidtransaktion anstid="${xmlEscape(employeeId)}" tidkod="${xmlEscape(paxml)}" datum="${line.line_date}" timmar="${hours(line.quantity)}"${line.cost_center ? ` kostnadsställe="${xmlEscape(line.cost_center)}"` : ""} />`;
      })
      .join("\n");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<paxml xmlns="http://www.paxml.se/2.2/">
  <header>
    <format>LÖNIN</format>
    <version>2.2</version>
    <datum>${new Date().toISOString()}</datum>
    <programnamn>Makrilltrade</programnamn>
  </header>
  <tidtransaktioner>
${rows}
  </tidtransaktioner>
</paxml>`;
    await sb.from("payroll_export_log").insert({
      payroll_period_id: periodRow.id,
      legal_entity_id: legalEntityId,
      transaction_type: "paxml",
      request_key: `${periodRow.id}:paxml:${new Date().toISOString()}`,
      payload: { lines: lines.length, period },
      status: "sent",
      created_by: user.id,
    });
    return json({ mode: "paxml", period, lines: lines.length, xml });
  }

  // Redan skickade rader hoppas över via request_key i loggen.
  const { data: sentLogs } = await sb
    .from("payroll_export_log")
    .select("request_key")
    .eq("payroll_period_id", periodRow.id)
    .eq("status", "sent");
  const alreadySent = new Set(((sentLogs ?? []) as { request_key: string | null }[]).map((l) => l.request_key));

  let sent = 0;
  let skipped = 0;
  const failures: { line_id: string; message: string }[] = [];

  for (const line of lines) {
    const requestKey = `${periodRow.id}:${line.id}`;
    if (alreadySent.has(requestKey)) {
      skipped += 1;
      continue;
    }
    const code = wageCodes.get(line.line_type);
    const employeeId = fortnoxEmployee.get(line.employee_id);
    if (!code || !employeeId) {
      skipped += 1;
      continue;
    }

    let path = "/attendancetransactions";
    let payload: Record<string, unknown>;
    if (code.transaction_type === "absence") {
      path = "/absencetransactions";
      payload = {
        AbsenceTransaction: {
          EmployeeId: employeeId,
          CauseCode: code.fortnox_code,
          Date: line.line_date,
          Extent: Number(line.extent_pct ?? 100),
          Hours: hours(line.quantity),
          CostCenter: line.cost_center ?? undefined,
        },
      };
    } else if (code.transaction_type === "salary") {
      path = "/salarytransactions";
      payload = {
        SalaryTransaction: {
          EmployeeId: employeeId,
          SalaryCode: code.fortnox_code,
          Date: line.line_date,
          Number: Number(line.quantity ?? 0),
          Amount: Number(line.unit_amount ?? 0),
          TextRow: line.note ?? undefined,
          CostCenter: line.cost_center ?? undefined,
        },
      };
    } else {
      payload = {
        AttendanceTransaction: {
          EmployeeId: employeeId,
          CauseCode: code.fortnox_code,
          Date: line.line_date,
          Hours: hours(line.quantity),
          CostCenter: line.cost_center ?? undefined,
        },
      };
    }

    try {
      const result = await fortnoxRequest<Record<string, Record<string, unknown>>>(sb, legalEntityId, "POST", path, payload);
      const created = result?.AttendanceTransaction ?? result?.AbsenceTransaction ?? result?.SalaryTransaction ?? {};
      const resultId = created?.["@url"] ?? created?.["EmployeeId"] ?? null;
      await sb.from("payroll_export_log").insert({
        payroll_period_id: periodRow.id,
        legal_entity_id: legalEntityId,
        transaction_type: code.transaction_type,
        request_key: requestKey,
        payload: payload as unknown as Record<string, unknown>,
        response_payload: result as unknown as Record<string, unknown>,
        http_status: 200,
        fortnox_result_id: resultId ? String(resultId) : null,
        status: "sent",
        created_by: user.id,
      });
      await sb
        .from("payroll_lines")
        .update({ export_status: "sent", fortnox_transaction_id: resultId ? String(resultId) : null })
        .eq("id", line.id);
      sent += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Okänt fel mot Fortnox";
      const status = e instanceof FortnoxError ? e.status : null;
      await sb.from("payroll_export_log").insert({
        payroll_period_id: periodRow.id,
        legal_entity_id: legalEntityId,
        transaction_type: code.transaction_type,
        request_key: requestKey,
        payload: payload as unknown as Record<string, unknown>,
        http_status: status,
        status: "error",
        error_message: message,
        created_by: user.id,
      });
      await sb.from("payroll_lines").update({ export_status: "error" }).eq("id", line.id);
      failures.push({ line_id: line.id, message });
      // Avbryt vid auth-/behörighetsfel: resten kommer att falla på samma sätt.
      if (status === 401 || status === 403) break;
    }
  }

  const { count: remaining } = await sb
    .from("payroll_lines")
    .select("id", { count: "exact", head: true })
    .eq("period_id", periodRow.id)
    .in("export_status", ["pending", "error", "corrected"]);

  const allDone = (remaining ?? 0) === 0;
  await sb
    .from("payroll_periods")
    .update({
      status: allDone ? (periodRow.status === "exported" ? "reexported" : "exported") : periodRow.status,
      exported_at: allDone ? new Date().toISOString() : null,
      fortnox_batch_ref: allDone ? `${legalEntityId}-${period}` : null,
    })
    .eq("id", periodRow.id);

  return json({
    mode: "fortnox",
    period,
    sent,
    skipped,
    failures,
    remaining: remaining ?? 0,
    status: allDone ? "exported" : periodRow.status,
  });
});
