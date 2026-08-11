// Läser ut det riktiga felmeddelandet ur ett misslyckat edge function-anrop.
export async function edgeErrorMessage(error: any, data?: any): Promise<string> {
  const fromData = data?.error;
  if (typeof fromData === "string" && fromData) return fromData;
  try {
    const res = error?.context;
    if (res && typeof res.json === "function") {
      const body = await res.clone().json();
      if (body?.error) return String(body.error);
      if (body?.message) return String(body.message);
    }
  } catch {
    // ignorera parsningsfel och fall tillbaka nedan
  }
  return error?.message || "Okänt fel";
}
