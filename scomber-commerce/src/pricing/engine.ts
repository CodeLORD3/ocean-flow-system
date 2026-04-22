/**
 * Prismotor
 *
 * Räknar fram föreslagna priser givet:
 *   - en prisregel (strategy + parametrar)
 *   - aktuell batch (FIFO — äldsta kvarvarande batch bestämmer kostnaden)
 *   - butiks-multiplier (Särö +15% etc.)
 *
 * Halvautomatisk filosofi: dessa är FÖRSLAG. UI:t visar dem, butikschefen
 * godkänner eller justerar innan de går live.
 *
 * Allt i öre. Alla funktioner är rena — inga side effects, lätt att testa.
 */

import { Batch, PricingRule, StoreId, ArticlePricing, PricingStrategyName } from "../types";

export interface PriceSuggestion {
  suggestedPriceOre: number;
  strategy: PricingStrategyName;
  rationale: string;                // förklaring att visa i UI:t
  basedOnBatchId: string | null;
  marginPercent: number | null;
}

/**
 * Huvudingång: räkna fram dagens föreslagna pris för en artikel i en butik.
 *
 * batches: alla tillgängliga batcher, sorterade FIFO (äldsta först).
 */
export function suggestPrice(
  rule: PricingRule,
  batches: Batch[],
  storeId: StoreId
): PriceSuggestion {
  const fifoBatch = batches[0] ?? null;
  const multiplier = rule.storeMultipliers[storeId] ?? 1.0;

  let priceOre: number;
  let rationale: string;

  switch (rule.strategy) {
    case "fixed":
      if (rule.fixedPriceOre == null) {
        throw new Error(`Fixed strategy kräver fixedPriceOre (sku: ${rule.sku})`);
      }
      priceOre = rule.fixedPriceOre;
      rationale = `Fast pris: ${formatOre(rule.fixedPriceOre)}`;
      break;

    case "markup": {
      if (rule.markupPercent == null) {
        throw new Error(`Markup-strategi kräver markupPercent (sku: ${rule.sku})`);
      }
      if (!fifoBatch) {
        // Ingen batch → kan inte beräkna, fall tillbaka till minPrice eller 0
        priceOre = rule.minPriceOre ?? 0;
        rationale = "Ingen batch tillgänglig — använder minimipris";
        break;
      }
      const costSek = toSek(fifoBatch.purchasePriceOre, fifoBatch.fxRateToSek);
      priceOre = Math.round(costSek * (1 + rule.markupPercent / 100));
      rationale = `Inköp ${formatOre(costSek)} + ${rule.markupPercent}% påslag`;
      break;
    }

    case "target-margin": {
      if (rule.targetMarginPercent == null) {
        throw new Error(`Target-margin-strategi kräver targetMarginPercent (sku: ${rule.sku})`);
      }
      if (rule.targetMarginPercent >= 100) {
        throw new Error(`Target margin måste vara < 100%`);
      }
      if (!fifoBatch) {
        priceOre = rule.minPriceOre ?? 0;
        rationale = "Ingen batch tillgänglig — använder minimipris";
        break;
      }
      const costSek = toSek(fifoBatch.purchasePriceOre, fifoBatch.fxRateToSek);
      // Marginal = (pris - kostnad) / pris → pris = kostnad / (1 - marginal)
      priceOre = Math.round(costSek / (1 - rule.targetMarginPercent / 100));
      rationale = `Inköp ${formatOre(costSek)} → ${rule.targetMarginPercent}% bruttomarginal`;
      break;
    }

    case "manual":
    default:
      priceOre = rule.fixedPriceOre ?? rule.minPriceOre ?? 0;
      rationale = "Manuell prissättning";
      break;
  }

  // Applicera butiks-multiplier (t.ex. Särö 1.15x)
  priceOre = Math.round(priceOre * multiplier);
  if (multiplier !== 1.0) {
    rationale += ` × ${multiplier} (butik ${storeId})`;
  }

  // Clamp mellan min och max
  if (rule.minPriceOre != null && priceOre < rule.minPriceOre) {
    priceOre = rule.minPriceOre;
    rationale += " (golvat vid min)";
  }
  if (rule.maxPriceOre != null && priceOre > rule.maxPriceOre) {
    priceOre = rule.maxPriceOre;
    rationale += " (kapat vid max)";
  }

  // Avrunda till närmaste öre-enhet (t.ex. hela kronor)
  if (rule.roundToOre > 0) {
    priceOre = Math.round(priceOre / rule.roundToOre) * rule.roundToOre;
  }

  // Beräkna faktisk marginal för visning
  let marginPercent: number | null = null;
  if (fifoBatch) {
    const costSek = toSek(fifoBatch.purchasePriceOre, fifoBatch.fxRateToSek);
    if (priceOre > 0) {
      marginPercent = Math.round(((priceOre - costSek) / priceOre) * 1000) / 10;
    }
  }

  return {
    suggestedPriceOre: priceOre,
    strategy: rule.strategy,
    rationale,
    basedOnBatchId: fifoBatch?.batchId ?? null,
    marginPercent,
  };
}

/**
 * Konvertera pris från annan valuta till SEK-öre.
 */
function toSek(priceOreInOriginalCurrency: number, fxRate: number): number {
  return Math.round(priceOreInOriginalCurrency * fxRate);
}

/**
 * Formatera öre som "123,45 kr" för att visa i rationale.
 */
function formatOre(ore: number): string {
  const kr = Math.floor(Math.abs(ore) / 100);
  const o = Math.abs(ore) % 100;
  const sign = ore < 0 ? "-" : "";
  return `${sign}${kr},${o.toString().padStart(2, "0")} kr`;
}

/**
 * Bygg en komplett ArticlePricing-post (med eventuell override).
 */
export function buildArticlePricing(
  sku: string,
  storeId: StoreId,
  rule: PricingRule,
  batches: Batch[],
  override: { priceOre: number; reason: string } | null
): ArticlePricing {
  const suggestion = suggestPrice(rule, batches, storeId);

  return {
    sku,
    storeId,
    currentPriceOre: override ? override.priceOre : suggestion.suggestedPriceOre,
    suggestedPriceOre: suggestion.suggestedPriceOre,
    suggestedAt: new Date().toISOString(),
    overrideActive: override !== null,
    overrideReason: override?.reason ?? null,
    strategy: suggestion.strategy,
    marginPercent: suggestion.marginPercent,
  };
}
