// Tillfällig diagnosfunktion: läser en artikel från Fortnox för att verifiera Typ/lagervara.
import { adminClient, requireUser, fortnoxRequest, json, corsHeaders } from "../_shared/fortnox.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const user = await requireUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { legal_entity_code, article_number } = await req.json().catch(() => ({}));
  if (!legal_entity_code || !article_number) return json({ error: "legal_entity_code och article_number krävs" }, 400);

  const sb = adminClient();
  try {
    const res = await fortnoxRequest<any>(
      sb,
      legal_entity_code,
      "GET",
      `/articles/${encodeURIComponent(article_number)}`,
    );
    const a = res?.Article ?? {};
    return json({
      ok: true,
      ArticleNumber: a.ArticleNumber,
      Description: a.Description,
      Type: a.Type,
      StockGoods: a.StockGoods,
      Active: a.Active,
      QuantityInStock: a.QuantityInStock,
      EAN: a.EAN,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
