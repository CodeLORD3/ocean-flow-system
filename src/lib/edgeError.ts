/**
 * Plockar ut det riktiga felmeddelandet ur ett misslyckat edge-funktionsanrop.
 * Utan detta visas bara "Edge Function returned a non-2xx status code".
 *
 * Andra argumentet får antingen vara ett svarsobjekt från funktionen (där
 * felet ligger i fältet error) eller en färdig text att visa i stället.
 */
export async function edgeErrorMessage(
  error: unknown,
  fallbackOrData: unknown = "Något gick fel",
): Promise<string> {
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

  // Funktionen kan svara 2xx med ett felfält i kroppen.
  const dataError = (fallbackOrData as any)?.error;
  if (dataError) return String(typeof dataError === "string" ? dataError : JSON.stringify(dataError));
  if (typeof fallbackOrData === "string" && fallbackOrData) return fallbackOrData;
  return "Något gick fel";
}
