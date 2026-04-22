/**
 * Scomber Commerce API
 *
 * Fastify-server som exponerar commerce-endpoints.
 * Läser artikel/batch/inventory från Makrilltrade via adaptern,
 * skriver prisregler/transaktioner till egen DB.
 */

import Fastify from "fastify";
import { MakrilltradeAdapter, MakrilltradeMockAdapter } from "./adapters/makrilltrade";
import { buildArticlePricing, suggestPrice } from "./pricing/engine";
import { allocateFIFO } from "./pricing/fifo-allocator";
import { seedArticles, seedBatches, seedAllocations, seedPricingRules } from "./db/seed";
import { Batch, PricingRule, StoreId, TransactionItem, VatBreakdownRow } from "./types";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------
// In-memory datastore för PoC (ersätt med MySQL i produktion)
// ---------------------------------------------------------------
const state = {
  pricingRules: new Map<string, PricingRule>(
    Object.entries(seedPricingRules).map(([sku, rule]) => [sku, rule as PricingRule])
  ),
  overrides: new Map<string, { priceOre: number; reason: string }>(),
  transactions: [] as any[],
};

function overrideKey(sku: string, storeId: StoreId): string {
  return `${sku}::${storeId}`;
}

// ---------------------------------------------------------------
// Build the app
// ---------------------------------------------------------------
export function buildApp(adapter: MakrilltradeAdapter) {
  const app = Fastify({ logger: { level: "info" } });

  // Health
  app.get("/health", async () => ({ status: "ok", uptime: process.uptime() }));

  // --------------------------------------------------------
  // GET /api/articles?storeId=X
  // Lista säljbara artiklar i butik, med pris + FIFO-batch info.
  // --------------------------------------------------------
  app.get<{ Querystring: { storeId: StoreId } }>(
    "/api/articles",
    async (req, reply) => {
      const { storeId } = req.query;
      if (!storeId) {
        return reply.code(400).send({ error: "storeId krävs" });
      }

      const [articles, allocations] = await Promise.all([
        adapter.listArticles(),
        adapter.listBatchAllocationsForStore(storeId),
      ]);

      // Gruppera batcher per SKU som är tillgängliga i butiken
      const batchesBySku = new Map<string, Batch[]>();
      const allocationsBySku = new Map<string, typeof allocations>();
      for (const alloc of allocations) {
        if (!allocationsBySku.has(alloc.sku)) allocationsBySku.set(alloc.sku, []);
        allocationsBySku.get(alloc.sku)!.push(alloc);
      }

      // Hämta batch-metadata för alla batcher i denna butik
      const uniqueBatchIds = Array.from(new Set(allocations.map(a => a.batchId)));
      const batchData = await Promise.all(
        uniqueBatchIds.map(id => adapter.getBatch(id))
      );
      for (const b of batchData) {
        if (!b) continue;
        if (!batchesBySku.has(b.sku)) batchesBySku.set(b.sku, []);
        batchesBySku.get(b.sku)!.push(b);
      }

      // Bygg responsen
      const result = articles
        .filter(a => allocationsBySku.has(a.sku))       // bara artiklar som finns i butiken
        .map(article => {
          const batches = (batchesBySku.get(article.sku) ?? [])
            .sort((a, b) => (a.caughtDate ?? a.receivedDate)
              .localeCompare(b.caughtDate ?? b.receivedDate));
          const rule = state.pricingRules.get(article.sku);
          const override = state.overrides.get(overrideKey(article.sku, storeId)) ?? null;

          const pricing = rule
            ? buildArticlePricing(article.sku, storeId, rule, batches, override)
            : null;

          const totalQuantity = (allocationsBySku.get(article.sku) ?? [])
            .reduce((sum, a) => sum + (a.quantityRemaining - a.reservedQuantity), 0);

          return {
            ...article,
            pricing,
            availableQuantity: totalQuantity,
            activeBatchCount: batches.length,
            oldestBatch: batches[0] ?? null,
          };
        });

      return { storeId, articles: result, generatedAt: new Date().toISOString() };
    }
  );

  // --------------------------------------------------------
  // GET /api/articles/:sku/traceability
  // Full spårbarhetsdata för en artikel i en butik.
  // --------------------------------------------------------
  app.get<{ Params: { sku: string }; Querystring: { storeId: StoreId } }>(
    "/api/articles/:sku/traceability",
    async (req, reply) => {
      const { sku } = req.params;
      const { storeId } = req.query;
      const article = await adapter.getArticle(sku);
      if (!article) return reply.code(404).send({ error: "Artikel finns ej" });

      const allocations = (await adapter.listBatchAllocationsForStore(storeId))
        .filter(a => a.sku === sku);
      const batches = await Promise.all(
        allocations.map(a => adapter.getBatch(a.batchId))
      );

      return {
        article,
        batches: batches.filter(b => b !== null).map(b => ({
          ...b,
          availableInStore: allocations.find(a => a.batchId === b!.batchId)?.quantityRemaining ?? 0,
        })),
      };
    }
  );

  // --------------------------------------------------------
  // POST /api/pricing/morning-suggest
  // Bygger morgondagens prisförslag för alla artiklar i alla butiker.
  // UI:t visar detta, chefen godkänner manuellt.
  // --------------------------------------------------------
  app.post<{ Body: { storeIds: StoreId[] } }>(
    "/api/pricing/morning-suggest",
    async (req) => {
      const { storeIds } = req.body;
      const articles = await adapter.listArticles();

      const suggestions: Array<{
        sku: string;
        name: string;
        storeId: StoreId;
        suggestedPriceOre: number;
        currentPriceOre: number;     // nuvarande (kan vara override)
        changeOre: number;
        rationale: string;
        marginPercent: number | null;
        oldestBatchId: string | null;
      }> = [];

      for (const article of articles) {
        const rule = state.pricingRules.get(article.sku);
        if (!rule) continue;
        const batches = (await adapter.listBatchesForSku(article.sku))
          .sort((a, b) => (a.caughtDate ?? a.receivedDate)
            .localeCompare(b.caughtDate ?? b.receivedDate));

        for (const storeId of storeIds) {
          const suggestion = suggestPrice(rule, batches, storeId);
          const override = state.overrides.get(overrideKey(article.sku, storeId));
          const currentPrice = override?.priceOre ?? suggestion.suggestedPriceOre;
          suggestions.push({
            sku: article.sku,
            name: article.name,
            storeId,
            suggestedPriceOre: suggestion.suggestedPriceOre,
            currentPriceOre: currentPrice,
            changeOre: suggestion.suggestedPriceOre - currentPrice,
            rationale: suggestion.rationale,
            marginPercent: suggestion.marginPercent,
            oldestBatchId: suggestion.basedOnBatchId,
          });
        }
      }

      return { generatedAt: new Date().toISOString(), suggestions };
    }
  );

  // --------------------------------------------------------
  // PUT /api/articles/:sku/price-override
  // Manuell override för en butik (godkänn förslag eller sätt annat pris).
  // --------------------------------------------------------
  app.put<{
    Params: { sku: string };
    Body: { storeId: StoreId; priceOre: number; reason: string };
  }>("/api/articles/:sku/price-override", async (req) => {
    const { sku } = req.params;
    const { storeId, priceOre, reason } = req.body;
    state.overrides.set(overrideKey(sku, storeId), { priceOre, reason });
    return { ok: true, sku, storeId, priceOre, reason };
  });

  // --------------------------------------------------------
  // POST /api/transactions
  // Registrera en försäljning. Allokerar från batcher (FIFO) och lagrar.
  // --------------------------------------------------------
  app.post<{
    Body: {
      storeId: StoreId;
      cashierId: string;
      items: Array<{ sku: string; quantity: number }>;
      payment: any;
    };
  }>("/api/transactions", async (req, reply) => {
    const { storeId, cashierId, items, payment } = req.body;

    const allocations = await adapter.listBatchAllocationsForStore(storeId);
    const allocationsBySku = new Map<string, typeof allocations>();
    for (const a of allocations) {
      if (!allocationsBySku.has(a.sku)) allocationsBySku.set(a.sku, []);
      allocationsBySku.get(a.sku)!.push(a);
    }

    const batchMetadata = new Map<string, Batch>();
    for (const a of allocations) {
      const b = await adapter.getBatch(a.batchId);
      if (b) batchMetadata.set(a.batchId, b);
    }

    const resultItems: TransactionItem[] = [];
    const vatMap = new Map<6 | 12 | 25, { netOre: number; vatOre: number; grossOre: number }>();

    for (const item of items) {
      const article = await adapter.getArticle(item.sku);
      if (!article) {
        return reply.code(400).send({ error: `Okänd SKU: ${item.sku}` });
      }

      const storeAllocs = allocationsBySku.get(item.sku) ?? [];
      const fifoResult = allocateFIFO({
        requestedQuantity: item.quantity,
        availableAllocations: storeAllocs,
        batchMetadata,
      });
      if (!fifoResult.fullyAllocated) {
        return reply.code(409).send({
          error: `Otillräckligt lager av ${item.sku}`,
          shortBy: fifoResult.shortBy,
        });
      }

      const rule = state.pricingRules.get(item.sku);
      const override = state.overrides.get(overrideKey(item.sku, storeId));
      const batches = Array.from(batchMetadata.values()).filter(b => b.sku === item.sku);
      const pricing = rule
        ? buildArticlePricing(item.sku, storeId, rule, batches, override ?? null)
        : null;
      const unitPriceOre = pricing?.currentPriceOre ?? 0;

      // Radsumma: för kg-artiklar räknar vi kvantitet i gram × pris/kg / 1000
      const lineTotalOre = article.unit === "kg"
        ? Math.round((unitPriceOre * item.quantity) / 1000)
        : unitPriceOre * item.quantity;

      resultItems.push({
        sku: article.sku,
        name: article.name,
        quantity: item.quantity,
        unit: article.unit,
        unitPriceOre,
        lineTotalOre,
        vatRate: article.vatRate,
        discountOre: 0,
        batchAllocations: fifoResult.allocations,
      });

      // Lägg till i momsuppdelning
      const existing = vatMap.get(article.vatRate) ?? { netOre: 0, vatOre: 0, grossOre: 0 };
      const netOre = Math.round(lineTotalOre / (1 + article.vatRate / 100));
      const vatOre = lineTotalOre - netOre;
      vatMap.set(article.vatRate, {
        netOre: existing.netOre + netOre,
        vatOre: existing.vatOre + vatOre,
        grossOre: existing.grossOre + lineTotalOre,
      });
    }

    const totalOre = resultItems.reduce((sum, i) => sum + i.lineTotalOre, 0);
    const vatBreakdown: VatBreakdownRow[] = Array.from(vatMap.entries())
      .map(([rate, v]) => ({ rate, ...v }))
      .sort((a, b) => a.rate - b.rate);

    const transaction = {
      transactionId: randomUUID(),
      receiptNo: `${new Date().getFullYear()}-${(state.transactions.length + 1).toString().padStart(7, "0")}`,
      storeId,
      timestamp: new Date().toISOString(),
      cashierId,
      totalOre,
      vatBreakdown,
      items: resultItems,
      payment,
      controlCode: null,     // ska sättas av CleanCash i nästa steg
      controlUnitId: null,
      type: "sale" as const,
      b2bCustomerId: null,
      status: "pending" as const,
    };

    state.transactions.push(transaction);
    return transaction;
  });

  return app;
}

// ---------------------------------------------------------------
// Start
// ---------------------------------------------------------------
if (require.main === module) {
  const adapter = new MakrilltradeMockAdapter({
    articles: seedArticles,
    batches: seedBatches,
    allocations: seedAllocations,
  });

  const app = buildApp(adapter);
  const port = Number(process.env.PORT ?? 3030);
  app.listen({ port, host: "0.0.0.0" }).then(() => {
    console.log(`\n✓ Scomber Commerce API lyssnar på http://localhost:${port}`);
    console.log(`  Prova:`);
    console.log(`    curl http://localhost:${port}/health`);
    console.log(`    curl 'http://localhost:${port}/api/articles?storeId=amhult'`);
    console.log(`    curl -X POST http://localhost:${port}/api/pricing/morning-suggest \\`);
    console.log(`      -H 'Content-Type: application/json' \\`);
    console.log(`      -d '{"storeIds":["amhult","saro","torslanda"]}'`);
    console.log();
  });
}
