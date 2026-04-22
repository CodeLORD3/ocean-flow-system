/**
 * Makrilltrade-adapter
 *
 * Detta är den ENDA fil Tim/Joakim behöver anpassa när de kopplar mot
 * den riktiga Makrilltrade-databasen. Ersätt SQL-frågorna nedan med
 * de faktiska tabell- och kolumnnamnen.
 *
 * Viktigt: DB-användaren ska ha SELECT-rättigheter på Makrilltrade-tabellerna.
 * Commerce API skriver ALDRIG till Makrilltrade direkt — all vår data går
 * till separata tabeller i scomber_commerce-DB:n.
 */

import { Pool, RowDataPacket } from "mysql2/promise";
import { Article, Batch, StoreBatchAllocation, SKU, StoreId, BatchId } from "../types";

export interface MakrilltradeAdapter {
  listArticles(): Promise<Article[]>;
  getArticle(sku: SKU): Promise<Article | null>;
  listBatchesForSku(sku: SKU): Promise<Batch[]>;
  listBatchAllocationsForStore(storeId: StoreId): Promise<StoreBatchAllocation[]>;
  getBatch(batchId: BatchId): Promise<Batch | null>;
}

/**
 * Standardimplementation.
 *
 * ANPASSA DETTA:
 * - Tabellnamnen nedan (`mt_articles`, `mt_batches`, etc.) är gissningar.
 *   Byt till de faktiska namnen i Makrilltrade.
 * - Kolumnmappningen i `mapArticleRow()` osv. — byt fältnamn till de riktiga.
 * - Om Makrilltrade lagrar priser i kronor (ej öre) så gör konverteringen
 *   i map-funktionerna (multiplicera med 100).
 */
export class MakrilltradeMySQLAdapter implements MakrilltradeAdapter {
  constructor(private pool: Pool) {}

  async listArticles(): Promise<Article[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(`
      SELECT
        a.article_id        AS sku,
        a.name              AS name,
        a.species_latin     AS species,
        a.category          AS category,
        a.unit              AS unit,
        a.vat_rate          AS vat_rate,
        a.is_active         AS active,
        a.image_url         AS image_url
      FROM mt_articles a
      WHERE a.is_active = 1
      ORDER BY a.name
    `);

    return rows.map(this.mapArticleRow);
  }

  async getArticle(sku: SKU): Promise<Article | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT article_id AS sku, name, species_latin AS species, category,
              unit, vat_rate, is_active AS active, image_url
       FROM mt_articles WHERE article_id = ? LIMIT 1`,
      [sku]
    );
    return rows[0] ? this.mapArticleRow(rows[0]) : null;
  }

  async listBatchesForSku(sku: SKU): Promise<Batch[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(`
      SELECT
        b.batch_id,
        b.article_id,
        b.caught_date,
        b.vessel_name,
        b.fao_zone,
        b.msc_certified,
        b.asc_certified,
        b.country_origin,
        b.supplier_name,
        b.purchase_price_ore,
        b.purchase_currency,
        b.fx_rate_sek,
        b.received_date,
        b.expiry_date
      FROM mt_batches b
      WHERE b.article_id = ?
        AND b.received_date <= CURDATE()
        AND (b.expiry_date IS NULL OR b.expiry_date >= CURDATE())
      ORDER BY b.received_date ASC
    `, [sku]);

    return rows.map(this.mapBatchRow);
  }

  async listBatchAllocationsForStore(storeId: StoreId): Promise<StoreBatchAllocation[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(`
      SELECT
        i.store_id,
        i.batch_id,
        i.article_id AS sku,
        i.quantity_remaining,
        i.quantity_reserved
      FROM mt_store_inventory i
      WHERE i.store_id = ?
        AND i.quantity_remaining > 0
    `, [storeId]);

    return rows.map(r => ({
      storeId: r.store_id,
      batchId: r.batch_id,
      sku: r.sku,
      quantityRemaining: Number(r.quantity_remaining),
      reservedQuantity: Number(r.quantity_reserved ?? 0),
    }));
  }

  async getBatch(batchId: BatchId): Promise<Batch | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT batch_id, article_id, caught_date, vessel_name, fao_zone,
              msc_certified, asc_certified, country_origin, supplier_name,
              purchase_price_ore, purchase_currency, fx_rate_sek,
              received_date, expiry_date
       FROM mt_batches WHERE batch_id = ? LIMIT 1`,
      [batchId]
    );
    return rows[0] ? this.mapBatchRow(rows[0]) : null;
  }

  // --- Map-funktioner: ANPASSA fältnamn till Makrilltrades faktiska schema ---

  private mapArticleRow = (r: RowDataPacket): Article => ({
    sku: r.sku,
    name: r.name,
    species: r.species || null,
    category: r.category,
    unit: r.unit as "kg" | "piece",
    vatRate: Number(r.vat_rate) as 6 | 12 | 25,
    active: Boolean(r.active),
    imageUrl: r.image_url || null,
  });

  private mapBatchRow = (r: RowDataPacket): Batch => ({
    batchId: r.batch_id,
    sku: r.article_id,
    caughtDate: r.caught_date ? this.formatDate(r.caught_date) : null,
    vessel: r.vessel_name || null,
    faoZone: r.fao_zone || null,
    mscCertified: Boolean(r.msc_certified),
    aslCertified: Boolean(r.asc_certified),
    countryOfOrigin: r.country_origin || null,
    supplier: r.supplier_name || null,
    purchasePriceOre: Number(r.purchase_price_ore),
    purchaseCurrency: r.purchase_currency || "SEK",
    fxRateToSek: Number(r.fx_rate_sek ?? 1.0),
    receivedDate: this.formatDate(r.received_date),
    expiryDate: r.expiry_date ? this.formatDate(r.expiry_date) : null,
  });

  private formatDate(d: Date | string): string {
    if (typeof d === "string") return d.substring(0, 10);
    return d.toISOString().substring(0, 10);
  }
}

/**
 * In-memory mock för utveckling och tester.
 * Används när MOCK_MAKRILLTRADE=true i miljön.
 */
export class MakrilltradeMockAdapter implements MakrilltradeAdapter {
  private articles: Article[] = [];
  private batches: Batch[] = [];
  private allocations: StoreBatchAllocation[] = [];

  constructor(seed?: {
    articles?: Article[];
    batches?: Batch[];
    allocations?: StoreBatchAllocation[];
  }) {
    this.articles = seed?.articles ?? [];
    this.batches = seed?.batches ?? [];
    this.allocations = seed?.allocations ?? [];
  }

  async listArticles(): Promise<Article[]> {
    return this.articles.filter(a => a.active);
  }

  async getArticle(sku: SKU): Promise<Article | null> {
    return this.articles.find(a => a.sku === sku) ?? null;
  }

  async listBatchesForSku(sku: SKU): Promise<Batch[]> {
    return this.batches.filter(b => b.sku === sku);
  }

  async listBatchAllocationsForStore(storeId: StoreId): Promise<StoreBatchAllocation[]> {
    return this.allocations.filter(a => a.storeId === storeId && a.quantityRemaining > 0);
  }

  async getBatch(batchId: BatchId): Promise<Batch | null> {
    return this.batches.find(b => b.batchId === batchId) ?? null;
  }
}
