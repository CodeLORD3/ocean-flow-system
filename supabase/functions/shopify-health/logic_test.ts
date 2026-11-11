import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideOrder, missingTopics } from "./logic.ts";

Deno.test("order som redan finns i kundordrarna hämtas inte igen", () => {
  assertEquals(decideOrder({ financial_status: "paid" }, true, []), "finns");
});

Deno.test("färdigbehandlad webhook (duplikat/skapad) räknas som mottagen", () => {
  assertEquals(decideOrder({ financial_status: "paid" }, false, ["duplikat"]), "finns");
  assertEquals(decideOrder({ financial_status: "paid" }, false, ["osorterad"]), "finns");
});

Deno.test("order som redan ligger i kön läggs inte dubbelt", () => {
  assertEquals(decideOrder({ financial_status: "paid" }, false, ["koad"]), "vantar");
  assertEquals(decideOrder({ financial_status: "paid" }, false, ["fel"]), "vantar");
});

Deno.test("obetald eller avbruten order hämtas inte", () => {
  assertEquals(decideOrder({ financial_status: "pending" }, false, []), "hoppa_over");
  assertEquals(decideOrder({ financial_status: "paid", cancelled_at: "2026-11-10T10:00:00Z" }, false, []), "hoppa_over");
});

Deno.test("betald order som saknas helt hämtas", () => {
  assertEquals(decideOrder({ financial_status: "paid" }, false, []), "hamta");
  assertEquals(decideOrder({ financial_status: "partially_refunded" }, false, []), "hamta");
});

Deno.test("prenumeration som pekar på fel adress räknas som saknad", () => {
  const addr = "https://x/functions/v1/shopify-order-webhook";
  const hooks = [
    { topic: "orders/create", address: addr },
    { topic: "orders/paid", address: "https://annan/adress" },
  ];
  assertEquals(missingTopics(hooks, addr), ["orders/paid", "orders/cancelled"]);
  assertEquals(missingTopics([...hooks, { topic: "orders/paid", address: addr }, { topic: "orders/cancelled", address: addr }], addr), []);
});
