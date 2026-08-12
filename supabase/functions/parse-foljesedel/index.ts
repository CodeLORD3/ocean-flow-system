import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Files live in private buckets, so download them with the service role instead
// of relying on a public URL.
async function fetchFileBytes(fileUrl: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const match = fileUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
  if (match) {
    const bucket = match[1];
    const path = decodeURIComponent(match[2]);
    const res = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/${bucket}/${encodeURI(path)}`,
      {
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        },
      },
    );
    if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`);
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      contentType: res.headers.get("content-type") || "application/octet-stream",
    };
  }
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`);
  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") || "application/octet-stream",
  };
}

// Convert a URL to a base64 data URL so the AI gateway can process it
async function toDataUrl(fileUrl: string): Promise<{ dataUrl: string; mimeType: string; hash: string }> {
  const { bytes, contentType } = await fetchFileBytes(fileUrl);



  // Manual base64 encoding for Deno
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return {
    dataUrl: `data:${contentType};base64,${base64}`,
    mimeType: contentType,
    hash,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fileUrl, fileHash: providedHash } = await req.json();
    if (!fileUrl) throw new Error("fileUrl is required");
    let fileHash: string | null = providedHash ?? null;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Determine if the file is a PDF — Gemini doesn't accept PDF image URLs,
    // so we need to send it as a base64 data URL instead
    const isPdf = fileUrl.toLowerCase().endsWith(".pdf") ||
      fileUrl.toLowerCase().includes(".pdf?") ||
      fileUrl.toLowerCase().includes("content-type=application/pdf");

    let imageContent: { type: string; image_url?: { url: string }; file?: { filename: string; file_data: string } };

    if (isPdf) {
      // Download and convert to base64 data URL for PDF
      const { dataUrl, hash } = await toDataUrl(fileUrl);
      fileHash = fileHash ?? hash;
      imageContent = {
        type: "file",
        file: {
          filename: "document.pdf",
          file_data: dataUrl,
        },
      };
    } else {
      // For images, try data URL first to avoid URL format issues
      const lowerUrl = fileUrl.toLowerCase();
      const isImage = lowerUrl.endsWith(".png") || lowerUrl.endsWith(".jpg") || lowerUrl.endsWith(".jpeg") ||
        lowerUrl.endsWith(".webp") || lowerUrl.endsWith(".gif");

      if (isImage) {
        imageContent = {
          type: "image_url",
          image_url: { url: fileUrl },
        };
      } else {
        // Unknown format — download and send as data URL
        const { dataUrl, hash } = await toDataUrl(fileUrl);
        fileHash = fileHash ?? hash;
        imageContent = {
          type: "image_url",
          image_url: { url: dataUrl },
        };
      }
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert at reading Swedish delivery notes (följesedlar), auction notes (auktionsavräkningar) and invoices for a fish/seafood wholesale business.

Extract BOTH the document header and ALL product lines.

Header: supplier_name, supplier_org_no, document_number (följesedelsnummer/fakturanummer/avräkningsnummer), document_type (foljesedel|faktura|auktionsavrakning), document_date, delivery_date, total_ex_vat, total_amount, notes.
If the document has no number at all (common on auction notes), leave document_number null — do not invent one.

Each line: product_name, supplier_article_no, size_grade, quantity, unit (kg/st/förp/låda), unit_price, line_total, ordered_quantity (only if the document shows both ordered and delivered), latin_name, species_fao_code, lot_numbers (array — every parti-/batch-/klubbslagsnummer printed on the line), best_before, catch_area (FAO area), catch_date_from, catch_date_to, fishing_gear, fishing_gear_code, vessel_name, vessel_reg, vessel_nation, presentation (hel/urtagen/filé/skalad), condition (färsk/fryst/kokt), grade, certificate.

Rules:
- size_grade: the EU sorting class printed on the line as a single digit 1-9 ("Torsk 3", "Sej stl 1", "klass 2"). A count range like "16-20" or "6-10" is NOT a sorting class — leave size_grade null and keep the range in product_name.
- Report DELIVERED quantity in quantity, never ordered quantity.
- Copy latin names and batch numbers exactly as printed, including misspellings.
- Dates as YYYY-MM-DD.
- Use null for anything not printed on the document. Never guess.`,
          },
          {
            role: "user",
            content: [
              imageContent as any,
              {
                type: "text",
                text: "Extract the document header and all product lines from this document.",
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_products",
              description: "Extract document header and product lines from a delivery note",
              parameters: {
                type: "object",
                properties: {
                  document: {
                    type: "object",
                    properties: {
                      supplier_name: { type: ["string", "null"] },
                      supplier_org_no: { type: ["string", "null"] },
                      document_number: { type: ["string", "null"] },
                      document_type: { type: ["string", "null"] },
                      document_date: { type: ["string", "null"] },
                      delivery_date: { type: ["string", "null"] },
                      total_ex_vat: { type: ["number", "null"] },
                      total_amount: { type: ["number", "null"] },
                      notes: { type: ["string", "null"] },
                    },
                    additionalProperties: false,
                  },
                  products: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        product_name: { type: "string" },
                        supplier_article_no: { type: ["string", "null"] },
                        size_grade: { type: ["number", "null"] },
                        quantity: { type: ["number", "null"] },
                        unit: { type: ["string", "null"] },
                        unit_price: { type: ["number", "null"] },
                        line_total: { type: ["number", "null"] },
                        ordered_quantity: { type: ["number", "null"] },
                        latin_name: { type: ["string", "null"] },
                        species_fao_code: { type: ["string", "null"] },
                        lot_numbers: { type: "array", items: { type: "string" } },
                        best_before: { type: ["string", "null"] },
                        catch_area: { type: ["string", "null"] },
                        catch_date_from: { type: ["string", "null"] },
                        catch_date_to: { type: ["string", "null"] },
                        fishing_gear: { type: ["string", "null"] },
                        fishing_gear_code: { type: ["string", "null"] },
                        vessel_name: { type: ["string", "null"] },
                        vessel_reg: { type: ["string", "null"] },
                        vessel_nation: { type: ["string", "null"] },
                        presentation: { type: ["string", "null"] },
                        condition: { type: ["string", "null"] },
                        grade: { type: ["string", "null"] },
                        certificate: { type: ["string", "null"] },
                      },
                      required: ["product_name"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["products"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_products" } },
      }),

    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let products: unknown[] = [];
    let document: Record<string, unknown> = {};

    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        products = parsed.products || [];
        document = parsed.document || {};
      } catch {
        const content = data.choices?.[0]?.message?.content || "";
        const match = content.match(/\[[\s\S]*\]/);
        if (match) products = JSON.parse(match[0]);
      }
    }

    // Filhashen används för dubblettspärren i klienten.
    return new Response(JSON.stringify({ products, document, fileHash }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-foljesedel error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
