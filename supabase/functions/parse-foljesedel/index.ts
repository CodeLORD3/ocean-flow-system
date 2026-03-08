import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Convert a URL to a base64 data URL so the AI gateway can process it
async function toDataUrl(fileUrl: string): Promise<{ dataUrl: string; mimeType: string }> {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`);

  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Manual base64 encoding for Deno
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  return {
    dataUrl: `data:${contentType};base64,${base64}`,
    mimeType: contentType,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fileUrl } = await req.json();
    if (!fileUrl) throw new Error("fileUrl is required");

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
      const { dataUrl } = await toDataUrl(fileUrl);
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
        const { dataUrl } = await toDataUrl(fileUrl);
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
            content: `You are an expert at reading Swedish delivery notes (följesedlar) for a fish/seafood wholesale business. 
Extract ALL product lines from the document. For each line return: product_name, quantity, unit (kg/st/liter/förp), unit_price, line_total.
If you cannot determine a value, use null. Always return a JSON array of objects. Only return the JSON array, no other text.
Example: [{"product_name":"Lax färsk","quantity":10,"unit":"kg","unit_price":89.50,"line_total":895.00}]`,
          },
          {
            role: "user",
            content: [
              imageContent as any,
              {
                type: "text",
                text: "Extract all product lines from this följesedel (delivery note). Return a JSON array.",
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_products",
              description: "Extract product lines from a delivery note",
              parameters: {
                type: "object",
                properties: {
                  products: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        product_name: { type: "string" },
                        quantity: { type: "number" },
                        unit: { type: "string" },
                        unit_price: { type: "number" },
                        line_total: { type: "number" },
                      },
                      required: ["product_name", "quantity"],
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
    let products = [];

    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        products = parsed.products || [];
      } catch {
        const content = data.choices?.[0]?.message?.content || "";
        const match = content.match(/\[[\s\S]*\]/);
        if (match) products = JSON.parse(match[0]);
      }
    }

    return new Response(JSON.stringify({ products }), {
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
