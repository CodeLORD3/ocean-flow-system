import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { interpretLine, isOpenNow, majorToMinor, normalizePayment, scrubCard } from "../_shared/sumup.ts";

Deno.test("belopp: decimaltal i huvudenhet blir minsta enhet", () => {
  assertEquals(majorToMinor(10.1), 1010);
  assertEquals(majorToMinor("246.76"), 24676);
  assertEquals(majorToMinor(null), 0);
});

Deno.test("viktvara: rapporterad kvantitet används rakt när decimaler finns", () => {
  const line = interpretLine(
    { name: "Lax filé", price: 39.5, quantity: 1.24, total_with_vat: 48.98, vat_rate: 0.026 },
    { isWeightItem: true },
  );
  assertEquals(line.quantitySource, "rapporterad");
  assertEquals(line.quantity, 1.24);
  assertEquals(line.externalQuantity, 1.24);
});

Deno.test("viktvara: heltalskvantitet härleds ur radtotal och kilopris", () => {
  const line = interpretLine(
    { name: "Lax filé", price: 39.5, quantity: 1, total_with_vat: 48.98 },
    { isWeightItem: true },
  );
  assertEquals(line.quantitySource, "harledd_pris");
  assertEquals(line.quantity, 1.24);
});

Deno.test("viktvara: kilopris ur prislistan när kassan skickar radtotal på quantity 1", () => {
  const line = interpretLine(
    { name: "Lax filé", quantity: 1, total_with_vat: 48.98 },
    { isWeightItem: true, kgPriceMinor: 3950 },
  );
  assertEquals(line.quantitySource, "harledd_pris");
  assertEquals(line.quantity, 1.24);
});

Deno.test("viktvara utan pris: okänd kvantitet, ingen gissning", () => {
  const line = interpretLine({ name: "Lax filé", quantity: 1 }, { isWeightItem: true });
  assertEquals(line.quantitySource, "okand");
  assertEquals(line.quantity, 1);
});

Deno.test("styckvara: heltal 2 behålls", () => {
  const line = interpretLine(
    { name: "Fiskbulle 400g", price: 6.5, quantity: 2, total_with_vat: 13 },
    { isWeightItem: false },
  );
  assertEquals(line.quantitySource, "rapporterad");
  assertEquals(line.quantity, 2);
  assertEquals(line.lineTotalMinor, 1300);
});

Deno.test("retur: negativ kvantitet ger positiv mängd, typen styr riktningen", () => {
  const line = interpretLine(
    { name: "Lax filé", price: 39.5, quantity: -1.24, total_with_vat: -48.98 },
    { isWeightItem: true },
  );
  assertEquals(line.quantity, 1.24);
  assertEquals(line.lineTotalMinor, -4898);
});

Deno.test("kortdata skrubbas i hela payloaden", () => {
  const scrubbed = scrubCard({
    id: "tx",
    card: { type: "VISA", last_4_digits: "4242" },
    events: [{ card: { masked_pan: "**** 4242" } }],
  });
  assertEquals(scrubbed.card.last_4_digits, undefined);
  assertEquals(scrubbed.events[0].card.masked_pan, undefined);
  assertEquals(scrubbed.card.type, "VISA");
});

Deno.test("betalsätt normaliseras", () => {
  assertEquals(normalizePayment("POS"), "card");
  assertEquals(normalizePayment("CASH"), "cash");
  assertEquals(normalizePayment("TWINT"), "twint");
  assertEquals(normalizePayment(undefined), "other");
});

Deno.test("tyst kassa-larm gäller bara inom öppettid", () => {
  const hours = [
    { weekday: 1, open_time: "09:00", close_time: "18:00", closed: false },
    { weekday: 0, open_time: null, close_time: null, closed: true },
  ];
  // Måndag 2026-08-17 10:00 Zürich = 08:00 UTC
  assertEquals(isOpenNow(hours, new Date("2026-08-17T08:00:00Z")), true);
  // Måndag 22:00 Zürich
  assertEquals(isOpenNow(hours, new Date("2026-08-17T20:00:00Z")), false);
  // Söndag stängt
  assertEquals(isOpenNow(hours, new Date("2026-08-16T10:00:00Z")), false);
});
