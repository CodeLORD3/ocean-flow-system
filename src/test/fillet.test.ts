import { speciesKey } from "@/lib/asciiFold";
import { SPECIES_GROUP_KEYS } from "@/lib/speciesGroups";
import { evaluateAutoApproval } from "@/lib/autoApproval";
import { describe, it, expect } from "vitest";
import {
  roundUpToAllowedPrice,
  batchMargin,
  priceByNrv,
  auctionMaxRawPrice,
} from "@/lib/filletMath";

import { CUT_MODEL_TEMPLATES, SPECIES_CUT_MODEL, hasCutModel, modelForSpecies, normalizeDetailForm } from "@/lib/cutModels";

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

/* ── NRV-metoden: verifieringsexemplet 29 kg torsk à 146 kr/kg ────── */
describe("NRV-prissättning", () => {
  const RAW = 29;
  const PRICE = 146;
  const FILLET_KG = RAW * 0.55; // 15,95 kg
  const Q = {
    rygg: FILLET_KG * 0.55,
    kontra: FILLET_KG * 0.1,
    benfri: FILLET_KG * 0.2,
    slag: FILLET_KG * 0.15,
  };
  const lines = [
    { key: "rygg", qtyKg: Q.rygg, priceExVat: exVat(798), surchargePerKg: SURCHARGE },
    { key: "kontra", qtyKg: Q.kontra, priceExVat: exVat(398), surchargePerKg: SURCHARGE },
    { key: "benfri", qtyKg: Q.benfri, priceExVat: exVat(249), surchargePerKg: SURCHARGE },
    { key: "slag", qtyKg: Q.slag, priceExVat: exVat(198), surchargePerKg: SURCHARGE },
  ];
  const res = priceByNrv({ purchasePricePerKg: PRICE, rawQuantity: RAW, targetMarginPct: 45, lines });
  const line = (k: string) => res.lines.find((l) => l.key === k)!;

  it("intäkt, kostnad och partiets marginal", () => {
    expect(res.revenueExVat).toBeCloseTo(8399.33, 1);
    expect(res.totalCost).toBeCloseTo(4792.25, 2);
    expect(res.batchMarginPct).toBeCloseTo(42.9, 1);
    expect(res.revenuePerOutputKg).toBeCloseTo(526.6, 1);
  });

  it("intäktsandelar per detalj", () => {
    expect(line("rygg").revenueShare * 100).toBeCloseTo(78.6, 1);
    expect(line("kontra").revenueShare * 100).toBeCloseTo(7.1, 1);
    expect(line("benfri").revenueShare * 100).toBeCloseTo(8.9, 1);
    expect(line("slag").revenueShare * 100).toBeCloseTo(5.3, 1);
  });

  it("fördelad råvarukostnad per kg", () => {
    expect(line("rygg").rawCostPerKg).toBeCloseTo(379.49, 1);
    expect(line("kontra").rawCostPerKg).toBeCloseTo(189.27, 1);
    expect(line("benfri").rawCostPerKg).toBeCloseTo(118.41, 1);
    expect(line("slag").rawCostPerKg).toBeCloseTo(94.16, 1);
  });

  it("marginal per detalj — billigaste detaljen har lägst marginal", () => {
    expect(line("rygg").marginPct).toBeCloseTo(44.9, 1);
    expect(line("kontra").marginPct).toBeCloseTo(40.3, 1);
    expect(line("benfri").marginPct).toBeCloseTo(34.7, 1);
    expect(line("slag").marginPct).toBeCloseTo(30.9, 1);
    expect(res.lowestMarginKey).toBe("slag");
  });

  it("detalj utan pris blockerar kalkylen i stället för att gissa", () => {
    const r = priceByNrv({
      purchasePricePerKg: PRICE,
      rawQuantity: RAW,
      targetMarginPct: 45,
      lines: [...lines.slice(0, 3), { key: "slag", qtyKg: Q.slag, priceExVat: null, surchargePerKg: SURCHARGE }],
    });
    expect(r.missingPriceKeys).toContain("slag");
    expect(r.lines.find((l) => l.key === "slag")!.priceExVat).toBe(0);
  });

  it("auktionskalkyl: partiet håller 140,05 kr och alla detaljer 105,03 kr", () => {
    const a = auctionMaxRawPrice({
      rawQuantity: RAW,
      targetMarginPct: 45,
      lines: lines.map((l) => ({ qtyKg: l.qtyKg, priceExVat: l.priceExVat, surchargePerKg: l.surchargePerKg })),
    });
    expect(a.maxPricePerKg).toBeCloseTo(140.05, 1);
    expect(a.maxPricePerKgAllDetails).toBeCloseTo(105.03, 1);
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
