/**
 * Hash a PIN with SHA-256. NOT production-grade (no salt/peppering); replace with
 * a server-side edge function before going live. Sufficient for first build.
 */
export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
