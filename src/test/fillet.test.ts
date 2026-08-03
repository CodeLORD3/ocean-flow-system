import { speciesKey } from "@/lib/asciiFold";
import { SPECIES_CUT_MODEL, hasCutModel, modelForSpecies } from "@/lib/cutModels";
import { SPECIES_GROUP_KEYS } from "@/lib/speciesGroups";
import { evaluateAutoApproval } from "@/lib/autoApproval";
import { describe, it, expect } from "vitest";
import {
  roundUpToAllowedPrice,
  allocateRawCost,
  batchMargin,
  priceByByproductMethod,
  auctionMaxRawPrice,
} from "@/lib/filletMath";
import { CUT_MODEL_TEMPLATES, modelForSpecies, normalizeDetailForm } from "@/lib/cutModels";

/* Torskpartiet i specen: 100 kg à 60 kr/kg, utbyte 47 %, loin_four 55/20/15/10 */
const RAW_QTY = 100;
const RAW_PRICE = 60;
const FILLET = 47; // kg
const QTY = {
  rygg: FILLET * 0.55,
  benfri: FILLET * 0.2,
  slag: FILLET * 0.15,
  kontra: FILLET * 0.1,
};
const SURCHARGE = 35;
const VAT = 6;
const exVat = (inc: number) => inc / 1.06;

describe("rounding", () => {
  it("rounds up", () => {
    expect(roundUpToAllowedPrice(143.2)).toBe(149);
    expect(roundUpToAllowedPrice(150.1)).toBe(179);
    expect(roundUpToAllowedPrice(180)).toBe(198);
    expect(roundUpToAllowedPrice(12)).toBe(19);
  });
});

describe("allocateRawCost", () => {
  it("fördelar jämnt per kilo, oberoende av marginalvikt", () => {
    const details = [
      { qtyKg: 20, marginWeight: 1.4 },
      { qtyKg: 15, marginWeight: 1 },
      { qtyKg: 12, marginWeight: 0.6 },
    ];
    const costs = allocateRawCost(details, 60, 100); // 6000 kr / 47 kg
    expect(costs[0]).toBeCloseTo(127.66, 1);
    expect(costs[1]).toBeCloseTo(127.66, 1);
    expect(costs[2]).toBeCloseTo(127.66, 1);
    const total = details.reduce((s, d, i) => s + d.qtyKg * costs[i], 0);
    expect(total).toBeCloseTo(6000, 2);
  });

  it("en enda detalj = inköpspris / utbyte", () => {
    const [c] = allocateRawCost([{ qtyKg: 40, marginWeight: 1.4 }], 100, 100);
    expect(c).toBeCloseTo(250, 6);
  });
});

/* ── Riktning C: auktionskalkylen (verifieringsexemplet i specen) ─── */
describe("riktning C — auktionskalkyl", () => {
  const lines = [
    { qtyKg: QTY.rygg, priceExVat: exVat(698), surchargePerKg: SURCHARGE },
    { qtyKg: QTY.benfri, priceExVat: exVat(249), surchargePerKg: SURCHARGE },
    { qtyKg: QTY.slag, priceExVat: exVat(129), surchargePerKg: SURCHARGE },
    { qtyKg: QTY.kontra, priceExVat: exVat(398), surchargePerKg: SURCHARGE },
  ];

  it("intäkt, kostnad och marginal enligt specen", () => {
    const b = batchMargin({ purchasePricePerKg: RAW_PRICE, rawQuantity: RAW_QTY, lines: lines.map((l) => ({ qty: l.qtyKg, priceExVat: l.priceExVat, surchargePerKg: l.surchargePerKg })) });
    expect(Math.round(b.revenueExVat)).toBe(21853);
    expect(Math.round(b.rawCost + b.surchargeCost)).toBe(7645);
    expect(b.marginInclWorkPct).toBeCloseTo(65.0, 1);
  });

  it("maxpris per kg råvara: 104 kr vid 45 % och 82 kr vid 55 %", () => {
    const gbg = auctionMaxRawPrice({ rawQuantity: RAW_QTY, targetMarginPct: 45, lines });
    const sthlm = auctionMaxRawPrice({ rawQuantity: RAW_QTY, targetMarginPct: 55, lines });
    expect(Math.round(gbg.maxPricePerKg)).toBe(104);
    expect(Math.round(sthlm.maxPricePerKg)).toBe(82);
  });
});

/* ── Riktning B: biproduktsmetoden ────────────────────────────────── */
describe("riktning B — biproduktsmetoden", () => {
  const run = (targetMarginPct: number, byproductPrices = { benfri: 249, slag: 129, kontra: 398 }) =>
    priceByByproductMethod({
      purchasePricePerKg: RAW_PRICE,
      rawQuantity: RAW_QTY,
      targetMarginPct,
      vatPct: VAT,
      primaries: [{ key: "rygg", qtyKg: QTY.rygg, marginWeight: 1, surchargePerKg: SURCHARGE, lastSetPrice: 698 }],
      byproducts: [
        { key: "benfri", qtyKg: QTY.benfri, priceInclVat: byproductPrices.benfri, surchargePerKg: SURCHARGE },
        { key: "slag", qtyKg: QTY.slag, priceInclVat: byproductPrices.slag, surchargePerKg: SURCHARGE },
        { key: "kontra", qtyKg: QTY.kontra, priceInclVat: byproductPrices.kontra, surchargePerKg: SURCHARGE },
      ],
    });

  it("golvpris för ryggen blir 379 kr vid Göteborg 45 %", () => {
    const r = run(45);
    expect(r.primaries[0].floorInclVat).toBe(379);
  });

  it("partiets marginal blir målet plus avrundningseffekt", () => {
    const r = run(45);
    expect(r.batchAtFloor.marginInclWorkPct).toBeGreaterThanOrEqual(45);
    expect(r.batchAtFloor.marginInclWorkPct).toBeLessThanOrEqual(45 + 3);
  });

  it("föreslaget pris är det högsta av golv och senast fastställt", () => {
    const cheap = run(45);
    // Senast fastställt 698 ligger högt över golvet → priset sänks inte.
    expect(cheap.primaries[0].suggestedInclVat).toBe(698);
    expect(cheap.primaries[0].lastSetPrice).toBe(698);
  });

  it("varnar när golvet ligger mer än 25 % över senast fastställt pris", () => {
    const r = priceByByproductMethod({
      purchasePricePerKg: 260,
      rawQuantity: RAW_QTY,
      targetMarginPct: 55,
      vatPct: VAT,
      primaries: [{ key: "rygg", qtyKg: QTY.rygg, marginWeight: 1, surchargePerKg: SURCHARGE, lastSetPrice: 698 }],
      byproducts: [{ key: "slag", qtyKg: QTY.slag, priceInclVat: 129, surchargePerKg: SURCHARGE }],
    });
    expect(r.primaries[0].floorInclVat).toBeGreaterThan(698 * 1.25);
    expect(r.primaries[0].floorAboveLastPct).toBeGreaterThan(25);
    expect(r.warnings.some((w) => w.includes("råvaran är dyr"))).toBe(true);
  });

  it("varnar när golvet hamnar under högsta biproduktpriset", () => {
    const r = priceByByproductMethod({
      purchasePricePerKg: 5,
      rawQuantity: RAW_QTY,
      targetMarginPct: 45,
      vatPct: VAT,
      primaries: [{ key: "rygg", qtyKg: QTY.rygg, marginWeight: 1, surchargePerKg: 0, lastSetPrice: 698 }],
      byproducts: [{ key: "kontra", qtyKg: QTY.kontra, priceInclVat: 998, surchargePerKg: 0 }],
    });
    expect(r.primaries[0].floorInclVat).toBeLessThan(998);
    expect(r.warnings.some((w) => w.includes("fel klassade"))).toBe(true);
  });

  it("biprodukt utan pris ger 0 kr intäkt men kilona bär arbete och höjer golvet", () => {
    const withPrice = run(45);
    const withoutPrice = priceByByproductMethod({
      purchasePricePerKg: RAW_PRICE,
      rawQuantity: RAW_QTY,
      targetMarginPct: 45,
      vatPct: VAT,
      primaries: [{ key: "rygg", qtyKg: QTY.rygg, marginWeight: 1, surchargePerKg: SURCHARGE, lastSetPrice: 698 }],
      byproducts: [
        { key: "benfri", qtyKg: QTY.benfri, priceInclVat: null, surchargePerKg: SURCHARGE },
        { key: "slag", qtyKg: QTY.slag, priceInclVat: 129, surchargePerKg: SURCHARGE },
        { key: "kontra", qtyKg: QTY.kontra, priceInclVat: 398, surchargePerKg: SURCHARGE },
      ],
    });
    expect(withoutPrice.missingPriceKeys).toContain("benfri");
    expect(withoutPrice.surchargeCost).toBeCloseTo(withPrice.surchargeCost, 6);
    expect(withoutPrice.primaries[0].floorExVat).toBeGreaterThan(withPrice.primaries[0].floorExVat);
  });

  it("flera huvudprodukter: viktat snitt av marginalvikten är 1", () => {
    const r = priceByByproductMethod({
      purchasePricePerKg: RAW_PRICE,
      rawQuantity: RAW_QTY,
      targetMarginPct: 45,
      vatPct: VAT,
      primaries: [
        { key: "a", qtyKg: 20, marginWeight: 1.4, surchargePerKg: SURCHARGE },
        { key: "b", qtyKg: 10, marginWeight: 0.6, surchargePerKg: SURCHARGE },
      ],
      byproducts: [{ key: "slag", qtyKg: 7, priceInclVat: 129, surchargePerKg: SURCHARGE }],
    });
    const revenue = r.primaries.reduce((s, p) => s + p.qtyKg * p.floorExVat, 0);
    expect(revenue).toBeCloseTo(r.primaryRevenueExVat, 4);
  });
});

describe("styckningsmodeller", () => {
  it("kopplar art till rätt modell", () => {
    expect(modelForSpecies("torsk")).toBe("loin_four");
    expect(modelForSpecies("hälleflundra")).toBe("flatfish");
    expect(modelForSpecies("marulk")).toBe("tail_only");
    expect(modelForSpecies("makrill")).toBe("single");
  });

  it("erbjuder aldrig detaljer utanför modellen", () => {
    const flat = CUT_MODEL_TEMPLATES[modelForSpecies("sjötunga")].map((d) => d.form);
    expect(flat).not.toContain("rygg");
    expect(flat).not.toContain("slag");
    const single = CUT_MODEL_TEMPLATES[modelForSpecies("makrill")].map((d) => d.form);
    expect(single).toEqual(["hel filé"]);
  });

  it("alias för benfri filé pekar på samma detalj", () => {
    expect(normalizeDetailForm("stjärtbit")).toBe("benfri filé");
    expect(normalizeDetailForm("Benfri file")).toBe("benfri filé");
  });
});

// ── Auto-godkännande (avsnitt 5) ──
describe("evaluateAutoApproval", () => {
  const base = { requiresProcessing: false, yieldConfirmed: true, marginInclWorkPct: 50, targetMarginPct: 45 };
  it("godkänner färdigvara över målet med säkerställt utbyte", () => {
    expect(evaluateAutoApproval(base).approved).toBe(true);
  });
  it("blockerar när produkten kräver hantering", () => {
    const r = evaluateAutoApproval({ ...base, requiresProcessing: true });
    expect(r.approved).toBe(false);
    expect(r.reasons[0]).toMatch(/Kräver hantering/);
  });
  it("blockerar osäkert utbyte och marginal under mål", () => {
    const r = evaluateAutoApproval({ ...base, yieldConfirmed: false, marginInclWorkPct: 30 });
    expect(r.approved).toBe(false);
    expect(r.reasons).toHaveLength(2);
  });
});

// ── Artnycklar: alla artgrupper måste matcha efter normalisering ──
describe("species keys", () => {
  it("normaliserar svenska tecken till samma nyckel", () => {
    expect(speciesKey("Långa")).toBe("langa");
    expect(speciesKey(" Hälleflundra ")).toBe("halleflundra");
    expect(speciesKey("Rödspätta")).toBe("rodspatta");
    expect(speciesKey("Blåkveite")).toBe("blakveite");
    expect(speciesKey("Regnbåge")).toBe("regnbage");
    expect(speciesKey("Svärdfisk")).toBe("svardfisk");
    expect(speciesKey("Havsöring")).toBe("havsoring");
    expect(speciesKey("Blåkveitø")).toBe("blakveito");
    expect(speciesKey("Purée")).toBe("puree");
  });

  it("SPECIES_CUT_MODEL har enbart ASCII-normaliserade nycklar", () => {
    for (const key of Object.keys(SPECIES_CUT_MODEL)) {
      expect(key).toBe(speciesKey(key));
    }
  });

  it("varje art med egen styckningsmodell hittas oavsett stavning", () => {
    // Artgrupperna som finns i produkt-/utbytesregistret, i svensk stavning.
    const dbSpecies = [
      "torsk", "sej", "kolja", "kummel", "kapkummel", "långa", "lubb", "havskatt", "kolfisk", "bleka",
      "tonfisk", "blåfenad-tonfisk", "svärdfisk", "seriola",
      "lax", "regnbåge", "havsöring", "röding",
      "hälleflundra", "blåkveite", "piggvar", "slätvar", "rödspätta", "sjötunga", "bergtunga",
      "rödtunga", "sillflundra", "marulk",
    ];
    for (const s of dbSpecies) {
      expect(hasCutModel(s), `${s} saknar styckningsmodell`).toBe(true);
      expect(modelForSpecies(s)).not.toBe("single");
    }
    // Plattfiskgruppen och laxfiskarna får rätt modell.
    expect(modelForSpecies("Hälleflundra")).toBe("flatfish");
    expect(modelForSpecies("rödspätta")).toBe("flatfish");
    expect(modelForSpecies("Regnbåge")).toBe("salmon_side");
    expect(modelForSpecies("havsöring")).toBe("salmon_side");
    expect(modelForSpecies("långa")).toBe("loin_four");
    // Alla förslagsnycklar är redan normaliserade.
    for (const k of SPECIES_GROUP_KEYS) expect(k).toBe(speciesKey(k));
  });
});
