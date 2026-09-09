/**
 * Plockar ut det riktiga felmeddelandet ur ett misslyckat edge-funktionsanrop.
 * Utan detta visas bara "Edge Function returned a non-2xx status code".
 */
export async function edgeErrorMessage(error: unknown, fallback = "Något gick fel"): Promise<string> {
  const ctx = (error as any)?.context;
  try {
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.clone?.().json?.() ?? (await ctx.json());
      if (body?.error) return String(body.error);
    }
  } catch {
    // ignoreras – vi faller tillbaka på standardmeddelandet
  }
  const msg = (error as any)?.message;
  if (msg && !/non-2xx status code/i.test(msg)) return String(msg);
  return fallback;
}
