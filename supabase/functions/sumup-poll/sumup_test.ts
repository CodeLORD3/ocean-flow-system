import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  interpretLine,
  isOpenNow,
  majorToMinor,
  normalizePayment,
  parseNameWeight,
  scrubCard,
} from "../_shared/sumup.ts";

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

/* --- Verkliga svar från Zollikons kassa (merchant MCNGCU6L, maj 2026) ---
   Kassan lägger vikten som prefix i namnet och skickar quantity = 1,
   där price är radens totalbelopp. Se docs/sumup-integration.md 4.1. */

Deno.test("viktprefix i namnet läses ut och namnet rensas", () => {
  assertEquals(parseNameWeight("0.724 kg Lachs filet"), {
    quantity: 0.724,
    cleanName: "Lachs filet",
    unit: "kg",
  });
  assertEquals(parseNameWeight("1.60 kg Seezunge (ganz)")?.quantity, 1.6);
  assertEquals(parseNameWeight("1,24 kg Leng")?.quantity, 1.24);
  assertEquals(parseNameWeight("150 g Kaviar")?.quantity, 0.15);
  assertEquals(parseNameWeight("Kaltgeräucherter Lachs 150g"), null);
  assertEquals(parseNameWeight("Skagen classic small"), null);
});

Deno.test("skarp rad: 0.724 kg Lachs filet ger vikt och kilopris", () => {
  const line = interpretLine(
    {
      name: "0.724 kg Lachs filet",
      price: 55.75,
      price_with_vat: 57.2,
      quantity: 1,
      total_with_vat: 57.2,
      vat_rate: 0.026,
    },
    { isWeightItem: true },
  );
  assertEquals(line.quantitySource, "namn_vikt");
  assertEquals(line.quantity, 0.724);
  assertEquals(line.cleanName, "Lachs filet");
  assertEquals(line.lineTotalMinor, 5720);
  assertEquals(line.unitPriceMinor, 7901); // 57.20 / 0.724 = 79.01 CHF/kg
  assertEquals(line.externalQuantity, 1);
});

Deno.test("skarp rad: viktvara känns igen även när enheten är styck i registret", () => {
  const line = interpretLine(
    { name: "0.32 kg Leng", price: 24.64, quantity: 1, total_with_vat: 25.28 },
    { isWeightItem: false },
  );
  assertEquals(line.quantitySource, "namn_vikt");
  assertEquals(line.quantity, 0.32);
});

Deno.test("skarp rad: styckvara i 2 st behåller heltalet och rensar inte namnet", () => {
  const line = interpretLine(
    { name: " Sourgood Brot", price: 11.69, quantity: 2, total_with_vat: 24.0 },
    { isWeightItem: false },
  );
  assertEquals(line.quantitySource, "rapporterad");
  assertEquals(line.quantity, 2);
  assertEquals(line.cleanName, "Sourgood Brot");
  assertEquals(line.lineTotalMinor, 2400);
});

Deno.test("retur av viktvara: vikten ur namnet, negativt belopp behålls", () => {
  const line = interpretLine(
    { name: "0.724 kg Lachs filet", price: -55.75, quantity: 1, total_with_vat: -57.2 },
    { isWeightItem: true },
  );
  assertEquals(line.quantity, 0.724);
  assertEquals(line.lineTotalMinor, -5720);
  assertEquals(line.unitPriceMinor, 7901);
});
