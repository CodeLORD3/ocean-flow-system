/**
 * Leverantörsneutral SMS-modul. Standardleverantör: 46elks REST-API.
 *
 * SMS_TEST_MODE=true (standard när uppgifter saknas) loggar utskicket i
 * sms_log med status "testlage" och skickar aldrig något — bygge och test
 * kostar då noll kronor.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type SmsType = "otp" | "bekraftelse" | "paminnelse" | "paminnelse_tidig";

/** Alfanumerisk avsändare hos 46elks — max 11 tecken. */
function sender(): string {
  return (Deno.env.get("ELKS_FROM") ?? Deno.env.get("SMS_SENDER") ?? "Fiskbutiken").slice(0, 11);
}

export function smsTestMode(): boolean {
  const flag = (Deno.env.get("SMS_TEST_MODE") ?? "").toLowerCase();
  if (flag === "true" || flag === "1") return true;
  if (flag === "false" || flag === "0") return false;
  // Utan leverantörsuppgifter kan inget skickas: testläge är enda vettiga läget.
  return !(Deno.env.get("ELKS_API_USERNAME") && Deno.env.get("ELKS_API_PASSWORD"));
}

/** Normaliserar svenska mobilnummer till +46-format. Returnerar null vid orimligt nummer. */
export function normalizePhoneSe(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/[^\d+]/g, "");
  if (!digits) return null;
  let d = digits.replace(/^\+/, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("46")) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  if (!/^7\d{8}$/.test(d)) return null; // svenskt mobilnummer
  return `+46${d}`;
}

export async function sendSms(
  db: SupabaseClient,
  args: { phone: string; type: SmsType; text: string; orderId?: string | null },
): Promise<{ ok: boolean; testMode: boolean; error?: string }> {
  const base = {
    phone_normalized: args.phone,
    type: args.type,
    customer_order_id: args.orderId ?? null,
  };

  if (smsTestMode()) {
    console.log(`[SMS TESTLÄGE] ${args.type} → ${args.phone}: ${args.text}`);
    await db.from("sms_log").insert({ ...base, status: "testlage" });
    return { ok: true, testMode: true };
  }

  // Klipp bort radbrytningar och blanksteg — klistrade nycklar får ofta med sådant,
  // och 46elks svarar då att Basic-autentiseringen saknas.
  const user = (Deno.env.get("ELKS_API_USERNAME") ?? "").trim();
  const pass = (Deno.env.get("ELKS_API_PASSWORD") ?? "").trim();
  if (!user || !pass) {
    const msg = `46elks-uppgifter saknas (användare ${user.length} tecken, lösenord ${pass.length} tecken)`;
    await db.from("sms_log").insert({ ...base, status: "fel", error: msg });
    return { ok: false, testMode: false, error: msg };
  }
  try {
    const res = await fetch("https://api.46elks.com/a1/SMS", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${user}:${pass}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ from: sender(), to: args.phone, message: args.text }),
    });
    const body = await res.text();
    if (!res.ok) {
      await db.from("sms_log").insert({ ...base, status: "fel", error: body.slice(0, 500) });
      return { ok: false, testMode: false, error: body };
    }
    let parsed: any = {};
    try {
      parsed = JSON.parse(body);
    } catch { /* leverantören svarade i annat format */ }
    await db.from("sms_log").insert({
      ...base,
      status: "skickad",
      provider_id: parsed?.id ?? null,
      cost: parsed?.cost != null ? Number(parsed.cost) / 10000 : null,
    });
    return { ok: true, testMode: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("sms_log").insert({ ...base, status: "fel", error: msg.slice(0, 500) });
    return { ok: false, testMode: false, error: msg };
  }
}
