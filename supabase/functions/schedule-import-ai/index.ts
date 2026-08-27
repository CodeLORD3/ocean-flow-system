/**
 * schedule-import-ai — AI-fallback för schemaimport.
 *
 * Används bara när filen inte matchar mallen (t.ex. pivotformat med namn som
 * rader och veckodagar som kolumner). Funktionen mappar om innehållet till
 * standardformatet och returnerar rader — resultatet går ALLTID vidare till
 * samma granskningsvy som den deterministiska parsern, aldrig direkt till
 * shifts.
 */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM = `Du normaliserar schemafiler till Makrilltrades standardformat.
Svara enbart med JSON: { "rows": [ { "datum": "ÅÅÅÅ-MM-DD", "starttid": "HH:MM", "sluttid": "HH:MM", "rast_min": 30, "anstallningsnummer": "", "namn": "", "enhet": "", "skifttyp": "", "notering": "" } ] }
Regler: tolka pivotformat (personer som rader, dagar som kolumner) till en rad per pass.
Hoppa över tomma celler och celler som betyder ledigt (L, -, ledig, sem).
Gissa aldrig personnummer. Lämna fält tomma om de inte framgår av filen.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json({ error: "AI-nyckel saknas i projektet." }, 401);

  const body = await req.json().catch(() => ({}));
  const table: unknown = body.table;
  const context: string = body.context ?? "";
  if (!table) return json({ error: "Ingen tabell att tolka." }, 400);

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.7-flash",
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `${context}\n\nFilinnehåll som JSON-tabell:\n${JSON.stringify(table).slice(0, 120_000)}`,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) return json({ error: "AI-tjänsten är tillfälligt överbelastad. Försök igen." }, 429);
    if (res.status === 402) return json({ error: "AI-krediterna är slut — fyll på i Lovable." }, 402);
    if (res.status === 403) return json({ error: "AI är avstängt för arbetsytan." }, 403);
    return json({ error: `AI-tolkningen misslyckades (${res.status}): ${text.slice(0, 300)}` }, 500);
  }

  const payload = await res.json();
  const content: string = payload?.choices?.[0]?.message?.content ?? "{}";
  let parsed: { rows?: Record<string, string>[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    return json({ error: "AI svarade i ett format som inte kunde läsas." }, 502);
  }

  return json({ rows: parsed.rows ?? [], source: "ai_fallback" });
});
