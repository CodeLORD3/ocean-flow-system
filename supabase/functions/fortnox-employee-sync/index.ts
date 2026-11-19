// Skriver anställda till Fortnox Lön på uttrycklig begäran av admin:
// lägga upp saknade anställda, rätta timlön/månadslön och markera inaktiv.
// "inspect" läser bara; "apply" skriver. Personnummer returneras aldrig och lagras aldrig i klartext.
import { adminClient, requireUser, fortnoxRequest, json, corsHeaders, LEGAL_ENTITIES } from "../_shared/fortnox.ts";

type Op =
  | { kind: "inspect"; employment_id: string }
  | { kind: "create"; employment_id: string; template_employment_id: string }
  | { kind: "set_salary"; employment_id: string; first_day: string; hourly_pay?: number; monthly_salary?: number; salary_form?: "TIM" | "MAN" }
  | { kind: "deactivate"; employment_id: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (v: unknown) => String(v ?? "").trim().replace(/^0+(?=\d)/, "");

/** Fortnox vill ha tolv siffror (ÅÅÅÅMMDD-NNNN); århundradet tas från födelsedatumet. */
function fortnoxPnr(pnr: string, birthDate: string | null, today = new Date()): string | null {
  const d = pnr.replace(/\D/g, "");
  if (d.length === 12) return `${d.slice(0, 8)}-${d.slice(8)}`;
  if (d.length !== 10) return null;
  let century: string;
  if (birthDate && birthDate.slice(2, 4) === d.slice(0, 2)) century = birthDate.slice(0, 2);
  else {
    const yy = Number(d.slice(0, 2));
    const cy = today.getFullYear() % 100;
    century = pnr.includes("+") || yy > cy ? "19" : "20";
  }
  return `${century}${d.slice(0, 6)}-${d.slice(6)}`;
}

const pick = (f: any) => ({
  employee_id: f.EmployeeId ?? null, name: `${f.FirstName ?? ""} ${f.LastName ?? ""}`.trim(),
  inactive: f.Inactive === true, salary_form: f.SalaryForm ?? null,
  monthly_salary: f.MonthlySalary ?? null, hourly_pay: f.HourlyPay ?? null,
  employment_date: f.EmploymentDate ?? null, employment_form: f.EmploymentForm ?? null,
  tax_allowance: f.TaxAllowance ?? null, tax_table: f.TaxTable ?? null, tax_column: f.TaxColumn ?? null,
  dated_wages: f.DatedWages ?? null,
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Metoden stöds inte" }, 405);
  const user = await requireUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => null);
  const entity = typeof body?.legal_entity_code === "string" ? body.legal_entity_code.trim() : "";
  const ops: Op[] = Array.isArray(body?.ops) ? body.ops : [];
  if (!LEGAL_ENTITIES[entity]) return json({ error: "Okänt bolag" }, 400);
  if (!ops.length || ops.length > 20) return json({ error: "1–20 åtgärder krävs" }, 400);

  const sb = adminClient();
  const [{ data: isAdmin }, { data: isPa }, { data: access }] = await Promise.all([
    sb.rpc("has_role", { _user_id: user.id, _role: "admin" }),
    sb.rpc("is_platform_admin", { _user_id: user.id }),
    sb.rpc("has_company_access", { _user_id: user.id, _legal_entity_id: entity }),
  ]);
  if (!(isAdmin || isPa) || !access) return json({ error: "Endast admin med åtkomst till bolaget" }, 403);

  const results: any[] = [];
  let fnIds: string[] | null = null;
  const loadIds = async () => {
    if (fnIds) return fnIds;
    const list: string[] = [];
    for (let page = 1; page <= 50; page++) {
      const res = await fortnoxRequest<any>(sb, entity, "GET", `/employees?limit=100&page=${page}`);
      const rows: any[] = res?.Employees ?? [];
      rows.forEach((e) => list.push(String(e.EmployeeId ?? "")));
      const tp = res?.MetaInformation?.["@TotalPages"];
      if (!rows.length || !tp || page >= tp) break;
    }
    fnIds = list;
    return list;
  };

  for (const op of ops) {
    const row: any = { kind: op.kind, employment_id: op.employment_id };
    try {
      const { data: em, error } = await sb.from("employments")
        .select("id, employee_id, legal_entity_id, pay_type, monthly_salary, hourly_rate, start_date, fortnox_employee_id, employment_number, employees!inner(id, first_name, last_name, email, phone, address_street, postal_code, city, birth_date)")
        .eq("id", op.employment_id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!em || em.legal_entity_id !== entity) throw new Error("Anställningen finns inte i bolaget");
      const e: any = (em as any).employees;
      row.name = `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim();
      await sleep(260);

      if (op.kind === "create") {
        if (em.fortnox_employee_id) throw new Error(`Redan kopplad till Fortnox nr ${em.fortnox_employee_id}`);
        const pnrRaw = (await sb.rpc("service_get_employee_pnr", { _employee_id: em.employee_id })).data as string | null;
        const pnr = pnrRaw ? fortnoxPnr(pnrRaw, e.birth_date ?? null) : null;
        if (!pnr) throw new Error("Personnummer saknas i appen");
        const ids = await loadIds();
        const width = Math.max(...ids.map((id) => id.length), 1);
        const next = Math.max(0, ...ids.map((id) => Number(norm(id))).filter(Number.isFinite)) + 1;
        const hasPad = ids.some((id) => /^0\d/.test(id));
        const newId = hasPad ? String(next).padStart(Math.min(width, 3), "0") : String(next);
        const hourly = em.pay_type !== "monthly";
        // Avtalsfälten (anställningsform, personaltyp, schema, Fora) kopieras från en befintlig anställd i samma bolag.
        const { data: tpl } = await sb.from("employments").select("legal_entity_id, fortnox_employee_id").eq("id", op.template_employment_id).maybeSingle();
        if (!tpl?.fortnox_employee_id || tpl.legal_entity_id !== entity) throw new Error("Mall-anställd saknas i bolaget");
        const tplId = ids.find((id) => norm(id) === norm(tpl.fortnox_employee_id)) ?? tpl.fortnox_employee_id;
        const tplEmp = (await fortnoxRequest<any>(sb, entity, "GET", `/employees/${encodeURIComponent(tplId)}`))?.Employee ?? {};
        await sleep(260);
        const payload: Record<string, unknown> = {
          EmploymentForm: tplEmp.EmploymentForm, PersonelType: tplEmp.PersonelType, ScheduleId: tplEmp.ScheduleId,
          ForaType: tplEmp.ForaType, Country: tplEmp.Country ?? "Sverige",
          PayslipType: tplEmp.PayslipType,
          EmployeeId: newId, PersonalIdentityNumber: pnr,
          FirstName: e.first_name ?? "", LastName: e.last_name ?? "",
          SalaryForm: hourly ? "TIM" : "MAN",
        };
        if (hourly && em.hourly_rate) payload.HourlyPay = Number(em.hourly_rate);
        if (!hourly && em.monthly_salary) payload.MonthlySalary = Number(em.monthly_salary);
        if (em.start_date) payload.EmploymentDate = em.start_date;
        if (e.email) payload.Email = e.email;
        if (e.phone) payload.Phone1 = e.phone;
        if (e.address_street) payload.Address1 = e.address_street;
        if (e.postal_code) payload.PostCode = e.postal_code;
        if (e.city) payload.City = e.city;
        const res = await fortnoxRequest<any>(sb, entity, "POST", "/employees", { Employee: payload });
        const created = res?.Employee ?? {};
        const fid = String(created.EmployeeId ?? newId);
        fnIds = [...ids, fid];
        const upd: Record<string, string> = { fortnox_employee_id: fid };
        if (!em.employment_number) upd.employment_number = fid;
        const { error: uErr } = await sb.from("employments").update(upd).eq("id", em.id);
        if (uErr) throw new Error(`Upplagd i Fortnox som ${fid} men kopplingen kunde inte sparas: ${uErr.message}`);
        row.status = "upplagd"; row.fortnox = pick(created);
      } else {
        if (!em.fortnox_employee_id) throw new Error("Saknar Fortnox-nummer");
        const ids = await loadIds();
        const fid = ids.find((id) => norm(id) === norm(em.fortnox_employee_id)) ?? em.fortnox_employee_id;
        const path = `/employees/${encodeURIComponent(fid)}`;
        if (op.kind === "inspect") {
          const det = await fortnoxRequest<any>(sb, entity, "GET", path);
          row.status = "läst"; row.fortnox = pick(det?.Employee ?? {});
          // Övriga fält (utan personnummer, adress och bankuppgifter) för att kunna kopiera bolagets avtal vid uppläggning.
          const SENSITIVE = /PersonalIdentityNumber|Address|PostCode|City|Phone|Email|Clearing|BankAccount|FirstName|LastName|FullName/i;
          row.other = Object.fromEntries(Object.entries(det?.Employee ?? {}).filter(([k]) => !SENSITIVE.test(k) && k !== "DatedWages" && k !== "DatedSchedules"));
        } else if (op.kind === "set_salary") {
          // Lön ändras alltid från ett datum (Fortnox DatedWages) så att tidigare perioder behåller sin lön.
          if (!/^\d{4}-\d{2}-\d{2}$/.test(op.first_day ?? "")) throw new Error("Datum (first_day) krävs");
          const hourly = typeof op.hourly_pay === "number" && op.hourly_pay > 0 ? op.hourly_pay : null;
          const monthly = typeof op.monthly_salary === "number" && op.monthly_salary > 0 ? op.monthly_salary : null;
          if (!hourly && !monthly) throw new Error("Ingen lön angiven");
          const det = await fortnoxRequest<any>(sb, entity, "GET", path);
          const current: any[] = (det?.Employee?.DatedWages ?? []).filter((w: any) => w.FirstDay !== op.first_day);
          const dated = [...current.map((w: any) => ({ EmployeeId: fid, FirstDay: w.FirstDay, MonthlySalary: w.MonthlySalary, HourlyPay: w.HourlyPay })),
            { EmployeeId: fid, FirstDay: op.first_day, MonthlySalary: monthly, HourlyPay: hourly }];
          const payload: Record<string, unknown> = { DatedWages: dated };
          if (op.salary_form) payload.SalaryForm = op.salary_form;
          row.before = pick(det?.Employee ?? {});
          await sleep(260);
          const res = await fortnoxRequest<any>(sb, entity, "PUT", path, { Employee: payload });
          row.status = "uppdaterad"; row.fortnox = pick(res?.Employee ?? {});
        } else if (op.kind === "deactivate") {
          const res = await fortnoxRequest<any>(sb, entity, "PUT", path, { Employee: { Inactive: true } });
          row.status = "inaktiv"; row.fortnox = pick(res?.Employee ?? {});
        } else {
          throw new Error("Okänd åtgärd");
        }
      }
    } catch (err) {
      row.status = "fel"; row.error = err instanceof Error ? err.message : String(err);
    }
    results.push(row);
  }
  return json({ ok: true, entity, results });
});
