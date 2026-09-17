import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Läser av ett kvitto, en följesedel, faktura, brev eller anteckning och
 * returnerar fälten som behövs i Ekonomi → Viktiga papper.
 * Klienten skickar filen som base64 data-URL, precis som i inköpsrapporteringen.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { dataUrl, fileName, kind } = await req.json();
    // kind = "card" -> fotot är ett betalkort, inte ett papper.
    const isCard = String(kind ?? "") === "card";
    if (!dataUrl) throw new Error("dataUrl is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const isPdf = String(dataUrl).startsWith("data:application/pdf");
    const fileContent = isPdf
      ? { type: "file", file: { filename: fileName || "dokument.pdf", file_data: dataUrl } }
      : { type: "image_url", image_url: { url: dataUrl } };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: isCard
              ? `Du läser av ett foto av ett betalkort i en fiskbutik.

Fyll bara i det som syns på kortet. Gissa aldrig.
- card_brand: Visa, Mastercard, Maestro, Amex, Twint, Postfinance eller det som står på kortet
- card_last4: BARA de fyra sista siffrorna i kortnumret. Returnera aldrig hela kortnumret.
- card_holder: namnet som är tryckt på kortet
- company_name: banken eller utgivaren om den syns

Allt annat lämnas tomt.`
              : `Du läser papper i en svensk/schweizisk fiskbutik: kvitton, följesedlar, fakturor, brev och anteckningar.

Fyll bara i det som faktiskt står på pappret. Gissa aldrig.
- paper_type: kvitto | foljesedel | faktura | brev | anteckning | kort
- kort = bilden är ett betalkort (bankkort/kreditkort), inte ett papper. Fyll då bara i card_brand, card_last4 (bara fyra sista siffrorna, aldrig hela numret), card_holder och company_name (banken).
- company_name: företaget som utfärdat pappret
- company_website: företagets webbadress om den står på pappret, bara domänen (t.ex. "coop.ch")
- paper_date: datum på pappret, YYYY-MM-DD
- document_number: kvitto-, följesedels- eller fakturanummer
- net_amount / vat_amount / gross_amount: belopp som siffror utan valuta
- currency: valutakoden som står på dokumentet, t.ex. CHF, SEK, DKK, NOK, EUR, GBP eller USD
- payment_method: kort om kort/karte/carte/visa/mastercard/twint står, kontant om kontant/bar/cash står, annars null
- card_brand: Visa, Mastercard, Maestro, Amex, Twint, Postfinance eller liknande som står på kvittot
- card_last4: exakt fyra sista siffrorna i kortnumret om det står (t.ex. "**** 4321" -> "4321"), annars null
- card_holder: namnet på kortinnehavaren om det står
- line_items: varje köpt rad med name, quantity och amount — det som köptes
- expense_category: kort kostnadsslag, t.ex. Livsmedel, Förbrukningsmaterial, Frakt, Reparation, Kontor
- title: kort rubrik, t.ex. "Frukt och grönt"
- description: en kort mening om vad pappret innehåller, på svenska`,
          },
          {
            role: "user",
            content: [
              fileContent as any,
              { type: "text", text: isCard ? "Läs av kortet: korttyp, de fyra sista siffrorna och namnet." : "Läs av pappret och fyll i fälten." },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_paper",
              description: "Fälten på pappret",
              parameters: {
                type: "object",
                properties: {
                  paper_type: { type: ["string", "null"] },
                  company_name: { type: ["string", "null"] },
                  company_website: { type: ["string", "null"] },
                  paper_date: { type: ["string", "null"] },
                  document_number: { type: ["string", "null"] },
                  net_amount: { type: ["number", "null"] },
                  vat_amount: { type: ["number", "null"] },
                  gross_amount: { type: ["number", "null"] },
                  currency: { type: ["string", "null"] },
                  payment_method: { type: ["string", "null"] },
                  card_brand: { type: ["string", "null"] },
                  card_last4: { type: ["string", "null"] },
                  card_holder: { type: ["string", "null"] },
                  expense_category: { type: ["string", "null"] },
                  line_items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        quantity: { type: ["number", "null"] },
                        amount: { type: ["number", "null"] },
                      },
                      required: ["name"],
                      additionalProperties: false,
                    },
                  },
                  title: { type: ["string", "null"] },
                  description: { type: ["string", "null"] },
                },
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_paper" } },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      const status = response.status === 429 || response.status === 402 ? response.status : 500;
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({
          error:
            status === 429
              ? "För många förfrågningar just nu, försök igen om en stund."
              : status === 402
                ? "AI-krediterna är slut."
                : `Kunde inte läsa pappret (${response.status})`,
        }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let paper: Record<string, unknown> = {};
    if (args) {
      try {
        paper = JSON.parse(args);
      } catch {
        paper = {};
      }
    }

    return new Response(JSON.stringify({ paper }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-viktigt-papper error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Okänt fel" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
