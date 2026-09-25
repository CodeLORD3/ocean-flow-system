import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { admin, buildPdf, scrive, splitName, syncFromScrive, BUCKET } from "../_shared/scrive.ts";

const Body = z.object({
  contract_id: z.string().uuid(),
  action: z.enum(["send", "cancel", "preview", "refresh"]),
});

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Du är inte inloggad." }, 401);
    const userDb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u, error: uErr } = await userDb.auth.getUser(auth.slice(7));
    if (uErr || !u.user) return json({ error: "Du är inte inloggad." }, 401);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: "Felaktig förfrågan." }, 400);
    const { contract_id, action } = parsed.data;

    // Behörighet: RLS avgör om personen ser avtalet. Ändringar kräver chefsrätt.
    const { data: visible } = await userDb.from("employment_contracts").select("id").eq("id", contract_id).maybeSingle();
    if (!visible) return json({ error: "Avtalet finns inte eller så saknar du behörighet." }, 403);
    if (action !== "refresh" && action !== "preview") {
      const [{ data: mgr }, { data: sm }] = await Promise.all([
        userDb.rpc("is_staff_manager"),
        userDb.rpc("has_role", { _user_id: u.user.id, _role: "store_manager" }),
      ]);
      if (!mgr && !sm) return json({ error: "Bara chefer kan skicka eller avbryta avtal." }, 403);
    }

    const db = admin();
    const { data: c } = await db.from("employment_contracts").select("*").eq("id", contract_id).single();

    if (action === "refresh") {
      if (!c.scrive_document_id) return json({ ok: true });
      return json(await syncFromScrive(db, c));
    }

    if (action === "cancel") {
      if (!c.scrive_document_id || !["skickat", "delvis_signerat"].includes(c.status)) return json({ error: "Avtalet går inte att avbryta." }, 400);
      await scrive(`/documents/${c.scrive_document_id}/cancel`, { method: "POST" });
      await db.from("employment_contracts").update({ status: "avbrutet" }).eq("id", c.id);
      return json({ ok: true });
    }

    const { data: signers, error: sErr } = await db.rpc("contract_signer_data", { _contract_id: c.id });
    if (sErr) throw sErr;
    const pnr = signers?.employee?.pnr ?? "";
    const sections = (c.sections ?? []).map((s: any) => ({ ...s, body: String(s.body).replaceAll("{{personnummer}}", pnr || "saknas") }));
    const pdf = await buildPdf(c.title, sections);

    if (action === "preview") {
      const path = `${c.employee_id}/forhandsvisning_${c.id}.pdf`;
      await db.storage.from(BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
      const { data: s } = await db.storage.from(BUCKET).createSignedUrl(path, 600);
      return json({ url: s?.signedUrl });
    }

    // send
    if (c.status !== "utkast") return json({ error: "Avtalet är redan skickat." }, 400);
    const emp = signers?.employee, mgr = signers?.manager;
    const missing: string[] = [];
    if (!emp?.email) missing.push("den anställdes e-post");
    if (!emp?.pnr) missing.push("den anställdes personnummer");
    if (!mgr) missing.push("en butikschef för butiken");
    else {
      if (!mgr.email) missing.push("butikschefens e-post");
      if (!mgr.pnr) missing.push("butikschefens personnummer");
    }
    if (missing.length) {
      const msg = `Avtalet kan inte skickas. Det saknas ${missing.join(", ")}.`;
      await db.from("employment_contracts").update({ error: msg }).eq("id", c.id);
      return json({ error: msg }, 400);
    }

    const form = new FormData();
    form.append("file", new Blob([pdf], { type: "application/pdf" }), "anstallningsavtal.pdf");
    const created = await (await scrive("/documents/new", { method: "POST", body: form })).json();

    const party = (p: { name: string; email: string; pnr: string }) => {
      const n = splitName(p.name);
      return {
        signatory_role: "signing_party",
        delivery_method: "email",
        authentication_method_to_sign: "se_bankid",
        fields: [
          { type: "name", order: 1, value: n.first },
          { type: "name", order: 2, value: n.last },
          { type: "email", value: p.email },
          { type: "personal_number", value: p.pnr.replace(/\D/g, "") },
        ],
      };
    };
    const author = { ...(created.parties?.[0] ?? {}), signatory_role: "viewer" };
    const callback = `${Deno.env.get("SUPABASE_URL")}/functions/v1/scrive-callback?contract=${c.id}`;
    const upd = new FormData();
    upd.append("document", JSON.stringify({
      title: c.title,
      lang: "sv",
      api_callback_url: callback,
      parties: [author, party(emp), party(mgr)],
    }));
    await scrive(`/documents/${created.id}/update`, { method: "POST", body: upd });
    await scrive(`/documents/${created.id}/start`, { method: "POST" });

    const pdfPath = `${c.employee_id}/avtal_${c.id}.pdf`;
    await db.storage.from(BUCKET).upload(pdfPath, pdf, { contentType: "application/pdf", upsert: true });
    await db.from("employment_contracts").update({
      status: "skickat",
      scrive_document_id: String(created.id),
      pdf_path: pdfPath,
      sent_at: new Date().toISOString(),
      error: null,
      signatories: [
        { role: "anstalld", name: emp.name, email: emp.email, signed_at: null },
        { role: "butikschef", name: mgr.name, email: mgr.email, signed_at: null },
      ],
    }).eq("id", c.id);
    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Okänt fel" }, 500);
  }
});
