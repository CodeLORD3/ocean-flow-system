/** Ren beslutslogik för shopify-health, så att den kan testas utan nätverk. */

export const TOPICS = ["orders/create", "orders/paid", "orders/cancelled"];
const DONE = ["skapad", "duplikat", "osorterad", "avbokad", "avbokad_larm"];
const PENDING = ["koad", "bearbetar", "fel"];
const PAID = ["paid", "partially_refunded"];

export type OrderDecision = "finns" | "vantar" | "hoppa_over" | "hamta";

/**
 * Vad ska göras med en Shopify-order?
 *   finns       – kundordern finns redan, eller webhooken är färdigbehandlad
 *   vantar      – ligger redan i kön (koad/bearbetar/fel) – läggs inte dubbelt
 *   hoppa_over  – avbruten eller obetald; webhook-flödet tar den när den betalas
 *   hamta       – saknas helt och är betald → läggs i kön
 */
export function decideOrder(
  order: { cancelled_at?: string | null; financial_status?: string | null },
  inCustomerOrders: boolean,
  eventStatuses: string[],
): OrderDecision {
  if (inCustomerOrders) return "finns";
  if (eventStatuses.some((s) => DONE.includes(s))) return "finns";
  if (eventStatuses.some((s) => PENDING.includes(s))) return "vantar";
  if (order?.cancelled_at || !PAID.includes(String(order?.financial_status ?? ""))) return "hoppa_over";
  return "hamta";
}

/** Vilka av systemets topics saknar en prenumeration mot vår adress? */
export function missingTopics(hooks: { topic?: unknown; address?: unknown }[], address: string): string[] {
  return TOPICS.filter((t) => !hooks.some((w) => String(w.topic) === t && String(w.address) === address));
}
