import * as XLSX from "xlsx";
import { PRODUCT_CATEGORIES, normalizeCategoryKey } from "@/lib/productCategories";
import { skuKey } from "@/lib/asciiFold";
import { normalizeSpeciesGroup } from "@/lib/speciesGroups";
import { parseAllergenCell } from "@/lib/allergens";

export const IMPORT_COLUMNS = [
  "sku",
  "name",
  "category",
  "unit",
  "cost_price",
  "wholesale_price",
  "retail_suggested",
  "origin",
  "producer",
  "supplier",
  "barcode",
  "hs_code",
  "weight_per_piece",
  "shelf_life_days",
  "parent_sku",
  "active",
  "image_url",
  "latin_name",
  "species_group",
  "fao_code",
  "allergens",
  "may_contain",
] as const;


export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export interface ParsedRow {
  rowNumber: number;
  sku: string;
  name: string;
  category: string;
  unit: string;
  cost_price: number;
  wholesale_price: number;
  retail_suggested: number;
  origin: string | null;
  producer: string | null;
  supplier: string | null;
  barcode: string | null;
  hs_code: string | null;
  weight_per_piece: number | null;
  shelf_life_days: number | null;
  parent_sku: string | null;
  active: boolean;
  image_url: string | null;
  /** null = kolumnen saknas eller är tom → befintligt värde lämnas orört */
  latin_name: string | null;
  /** null = kolumnen saknas eller är tom → befintligt värde lämnas orört */
  species_group: string | null;
  /** null = kolumnen saknas eller är tom → befintligt värde lämnas orört */
  fao_code: string | null;
  /** null = kolumnen saknas eller är tom → befintligt värde lämnas orört */
  allergens: string[] | null;
  /** true när cellen hade ett värde, även när värdet var "Inga" */
  allergens_checked: boolean | null;
  /** null = kolumnen saknas eller är tom → befintligt värde lämnas orört */
  may_contain: string[] | null;
}


export type DiffStatus = "new" | "changed" | "unchanged" | "error";

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface DiffRow {
  row: ParsedRow;
  status: DiffStatus;
  errors: string[];
  warnings: string[];
  changes: FieldChange[];
  existingId?: string;
}

export interface ExistingProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  cost_price: number | string;
  wholesale_price: number | string;
  retail_suggested: number | string | null;
  origin: string | null;
  producer: string | null;
  supplier_id: string | null;
  barcode: string | null;
  hs_code: string | null;
  weight_per_piece: number | string | null;
  shelf_life_days: number | null;
  parent_product_id: string | null;
  active: boolean | null;
  image_url: string | null;
  latin_name: string | null;
  species_group?: string | null;
  fao_code?: string | null;
  allergens?: string[] | null;
  allergens_checked?: boolean | null;
  may_contain?: string[] | null;
}


const HEADER_ALIASES: Record<string, ImportColumn> = {
  artikelnummer: "sku",
  namn: "name",
  produktnamn: "name",
  kategori: "category",
  enhet: "unit",
  inkopspris: "cost_price",
  grossistpris: "wholesale_price",
  rekpris: "retail_suggested",
  butikspris: "retail_suggested",
  ursprung: "origin",
  producent: "producer",
  leverantor: "supplier",
  streckkod: "barcode",
  hskod: "hs_code",
  vikt_per_styck: "weight_per_piece",
  hallbarhet_dagar: "shelf_life_days",
  aktiv: "active",
  bild: "image_url",
  bild_url: "image_url",
  bildlank: "image_url",
  bildadress: "image_url",
  image: "image_url",
  bild_lank: "image_url",
  latinskt_namn: "latin_name",
  vetenskapligt_namn: "latin_name",
  latin: "latin_name",
  latinname: "latin_name",
  artgrupp: "species_group",
  artgrupper: "species_group",
  art: "species_group",
  speciesgroup: "species_group",
  species: "species_group",
  faokod: "fao_code",
  fao: "fao_code",
  faocode: "fao_code",
  artkod: "fao_code",
  allergen: "allergens",
  allergener: "allergens",
  kan_innehalla: "may_contain",
  kaninnehalla: "may_contain",
  spar_av: "may_contain",
  maycontain: "may_contain",
};


function normalizeHeader(raw: string): string | null {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[.()]/g, "")
    .replace(/å|ä/g, "a")
    .replace(/ö/g, "o");
  if ((IMPORT_COLUMNS as readonly string[]).includes(key)) return key;
  if (HEADER_ALIASES[key]) return HEADER_ALIASES[key];
  return null;
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value)
    .replace(/\s/g, "")
    .replace(/(kr|sek|:-)/gi, "")
    .replace(",", ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseBool(value: unknown, fallback = true): boolean {
  if (value === null || value === undefined || value === "") return fallback;
  const s = String(value).trim().toLowerCase();
  if (["true", "1", "ja", "yes", "y", "aktiv"].includes(s)) return true;
  if (["false", "0", "nej", "no", "n", "inaktiv"].includes(s)) return false;
  return fallback;
}

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function nullableStr(value: unknown): string | null {
  const s = str(value);
  return s === "" ? null : s;
}

export interface ParseResult {
  rows: ParsedRow[];
  missingColumns: string[];
  /** Kolumner som inte är obligatoriska men som saknas i filen → fälten lämnas orörda */
  missingOptionalColumns: string[];
  unknownColumns: string[];
  fatal?: string;
}

const REQUIRED_COLUMNS: ImportColumn[] = ["sku", "name", "category"];
/** Saknas någon av dessa i filen varnar torrkörningen — de rör spårbarhet, allergener och prissättning. */
const NOTIFY_IF_MISSING: ImportColumn[] = [
  "species_group",
  "fao_code",
  "latin_name",
  "image_url",
  "parent_sku",
  "allergens",
  "may_contain",
];


export async function parseProductFile(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array", raw: false });
  } catch {
    return { rows: [], missingColumns: [], missingOptionalColumns: [], unknownColumns: [], fatal: "Kunde inte läsa filen. Använd .csv eller .xlsx." };
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], missingColumns: [], missingOptionalColumns: [], unknownColumns: [], fatal: "Filen innehåller inga blad." };
  }
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: "",
    raw: false,
  });
  if (raw.length === 0) {
    return { rows: [], missingColumns: [], missingOptionalColumns: [], unknownColumns: [], fatal: "Filen innehåller inga rader." };
  }

  const headerKeys = Object.keys(raw[0]);
  const map = new Map<string, ImportColumn>();
  const unknownColumns: string[] = [];
  for (const h of headerKeys) {
    const norm = normalizeHeader(h);
    if (norm && norm !== "stock") map.set(h, norm as ImportColumn);
    else if (normalizeHeader(h) !== "stock" && str(h) !== "" && str(h).toLowerCase() !== "stock" && str(h).toLowerCase() !== "lager")
      unknownColumns.push(h);
  }
  const present = new Set(map.values());
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !present.has(c));
  if (missingColumns.length > 0) {
    return { rows: [], missingColumns, missingOptionalColumns: [], unknownColumns, fatal: `Obligatoriska kolumner saknas: ${missingColumns.join(", ")}` };
  }

  const rows: ParsedRow[] = raw.map((r, i) => {
    const get = (col: ImportColumn): unknown => {
      for (const [header, mapped] of map) {
        if (mapped === col) return r[header];
      }
      return undefined;
    };
    return {
      rowNumber: i + 2,
      sku: str(get("sku")),
      name: str(get("name")),
      category: str(get("category")),
      unit: str(get("unit")) || "kg",
      cost_price: parseNumber(get("cost_price")) ?? 0,
      wholesale_price: parseNumber(get("wholesale_price")) ?? 0,
      retail_suggested: parseNumber(get("retail_suggested")) ?? 0,
      origin: nullableStr(get("origin")),
      producer: nullableStr(get("producer")),
      supplier: nullableStr(get("supplier")),
      barcode: nullableStr(get("barcode")),
      hs_code: nullableStr(get("hs_code")),
      weight_per_piece: parseNumber(get("weight_per_piece")),
      shelf_life_days: (() => {
        const n = parseNumber(get("shelf_life_days"));
        return n === null ? null : Math.round(n);
      })(),
      parent_sku: nullableStr(get("parent_sku")),
      active: parseBool(get("active")),
      image_url: nullableStr(get("image_url")),
      latin_name: nullableStr(get("latin_name")),
      species_group: normalizeSpeciesGroup(get("species_group")),
      fao_code: (() => {
        const v = nullableStr(get("fao_code"));
        return v === null ? null : v.toUpperCase();
      })(),
      ...(() => {
        const a = parseAllergenCell(get("allergens"));
        const m = parseAllergenCell(get("may_contain"));
        const unknown = [...(a?.unknown ?? []), ...(m?.unknown ?? [])];
        return {
          allergens: a ? a.codes : null,
          allergens_checked: a ? a.checked : null,
          may_contain: m ? m.codes : null,
          _allergenUnknown: unknown.length > 0 ? unknown : undefined,
        };
      })(),
    };
  });


  // Keep raw values that failed numeric parsing as errors later: re-check originals
  rows.forEach((row, i) => {
    const original = raw[i];
    for (const [header, mapped] of map) {
      if (["cost_price", "wholesale_price", "retail_suggested", "weight_per_piece", "shelf_life_days"].includes(mapped)) {
        const v = original[header];
        if (str(v) !== "" && parseNumber(v) === null) {
          (row as ParsedRow & { _numberErrors?: string[] })._numberErrors = [
            ...(((row as ParsedRow & { _numberErrors?: string[] })._numberErrors) ?? []),
            mapped,
          ];
        }
      }
    }
  });

  const missingOptionalColumns = NOTIFY_IF_MISSING.filter((c) => !present.has(c));
  return { rows, missingColumns: [], missingOptionalColumns, unknownColumns };
}

const VALID_UNITS = ["kg", "st", "låda", "förp", "l"];

export interface BuildDiffArgs {
  rows: ParsedRow[];
  existing: ExistingProduct[];
  categories: string[];
  suppliers: { id: string; name: string }[];
}


/** Normaliserad nyckel + alias för leverantörsnamn ("GFA (Göteborgs Fiskauktion)"). */
export function supplierAliasKeys(name: string): string[] {
  const base = name.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
  const keys = new Set<string>([base]);
  const inside = base.match(/\(([^)]+)\)/);
  if (inside) keys.add(inside[1].trim());
  const before = base.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  if (before) keys.add(before);
  return [...keys].filter(Boolean);
}

export function buildSupplierIndex<T extends { id: string; name: string }>(suppliers: T[]) {
  const index = new Map<string, T>();
  suppliers.forEach((s) => {
    supplierAliasKeys(s.name).forEach((k) => {
      if (!index.has(k)) index.set(k, s);
    });
  });
  return index;
}

export function lookupSupplier<T extends { id: string; name: string }>(
  index: Map<string, T>,
  raw: string,
): T | undefined {
  for (const k of supplierAliasKeys(raw)) {
    const hit = index.get(k);
    if (hit) return hit;
  }
  return undefined;
}

export function buildDiff({ rows, existing, categories, suppliers }: BuildDiffArgs): DiffRow[] {
  const bySku = new Map(existing.map((p) => [skuKey(p.sku), p]));
  const byId = new Map(existing.map((p) => [p.id, p]));
  const supplierIndex = buildSupplierIndex(suppliers);

  const knownCategories = new Set(
    [...categories, ...PRODUCT_CATEGORIES].map((c) => normalizeCategoryKey(c)),
  );
  const barcodeOwner = new Map<string, string>();
  existing.forEach((p) => {
    if (p.barcode) barcodeOwner.set(p.barcode, skuKey(p.sku));
  });

  const skuCounts = new Map<string, number>();
  const barcodeCounts = new Map<string, number>();
  rows.forEach((r) => {
    if (r.sku) skuCounts.set(skuKey(r.sku), (skuCounts.get(skuKey(r.sku)) ?? 0) + 1);
    if (r.barcode) barcodeCounts.set(r.barcode, (barcodeCounts.get(r.barcode) ?? 0) + 1);
  });
  const fileSkus = new Set(rows.map((r) => skuKey(r.sku)).filter(Boolean));
  const fileVariantSkus = new Set(
    rows.filter((r) => r.parent_sku).map((r) => skuKey(r.sku)),
  );

  return rows.map((row) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const numberErrors = (row as ParsedRow & { _numberErrors?: string[] })._numberErrors ?? [];

    if (!row.sku) errors.push("sku saknas");
    if (!row.name) errors.push("name saknas");
    if (!row.category) errors.push("category saknas");
    if (numberErrors.length) errors.push(`ogiltigt tal i: ${[...new Set(numberErrors)].join(", ")}`);
    if (row.sku && (skuCounts.get(skuKey(row.sku)) ?? 0) > 1) errors.push("dubblett på sku i filen");
    if (row.barcode && (barcodeCounts.get(row.barcode) ?? 0) > 1) errors.push("dubblett på barcode i filen");
    if (row.barcode && !/^\d+$/.test(row.barcode)) errors.push("barcode får bara innehålla siffror");
    if (row.image_url && !/^https:\/\/\S+\.(jpe?g|png|webp)(\?\S*)?$/i.test(row.image_url))
      errors.push("image_url måste vara en https-länk till .jpg, .png eller .webp");

    const current = row.sku ? bySku.get(skuKey(row.sku)) : undefined;

    if (row.barcode) {
      const owner = barcodeOwner.get(row.barcode);
      if (owner && owner !== skuKey(row.sku)) errors.push(`barcode används redan av ${owner.toUpperCase()}`);
    }

    let parentId: string | null = current?.parent_product_id ?? null;
    if (row.parent_sku) {
      if (skuKey(row.parent_sku) === skuKey(row.sku)) {
        errors.push("parent_sku pekar på sig själv");
      } else {
        const parent = bySku.get(skuKey(row.parent_sku));
        const parentInFile = fileSkus.has(skuKey(row.parent_sku));
        if (!parent && !parentInFile) errors.push(`okänd parent_sku: ${row.parent_sku}`);
        if (parent?.parent_product_id || fileVariantSkus.has(skuKey(row.parent_sku)))
          errors.push("parent_sku är själv en variant (max två nivåer)");
        parentId = parent?.id ?? null;
      }
    } else {
      parentId = null;
    }

    let supplierId: string | null = current?.supplier_id ?? null;
    if (row.supplier) {
      const sup = lookupSupplier(supplierIndex, row.supplier);
      if (!sup) {
        warnings.push(`ny leverantör skapas: ${row.supplier}`);
        supplierId = current?.supplier_id ?? null;
      } else {
        supplierId = sup.id;
      }
    }


    if (row.category && !knownCategories.has(normalizeCategoryKey(row.category)))
      warnings.push(`ny kategori: ${row.category}`);
    if (row.unit && !VALID_UNITS.includes(row.unit.toLowerCase())) warnings.push(`ovanlig enhet: ${row.unit}`);

    if (errors.length > 0) {
      return { row, status: "error" as DiffStatus, errors, warnings, changes: [] };
    }

    if (!current) {
      return { row, status: "new" as DiffStatus, errors, warnings, changes: [] };
    }

    const changes: FieldChange[] = [];
    const cmp = (field: string, from: unknown, to: unknown) => {
      const a = from === null || from === undefined ? "" : String(from);
      const b = to === null || to === undefined ? "" : String(to);
      if (a !== b) changes.push({ field, from: from ?? "", to: to ?? "" });
    };
    cmp("name", current.name, row.name);
    cmp("category", current.category, row.category);
    cmp("unit", current.unit, row.unit);
    cmp("cost_price", Number(current.cost_price).toFixed(2), row.cost_price.toFixed(2));
    cmp("wholesale_price", Number(current.wholesale_price).toFixed(2), row.wholesale_price.toFixed(2));
    cmp("retail_suggested", Number(current.retail_suggested ?? 0).toFixed(2), row.retail_suggested.toFixed(2));
    cmp("origin", current.origin, row.origin);
    cmp("producer", current.producer, row.producer);
    cmp("barcode", current.barcode, row.barcode);
    cmp("hs_code", current.hs_code, row.hs_code);
    cmp("weight_per_piece", current.weight_per_piece ?? "", row.weight_per_piece ?? "");
    cmp("shelf_life_days", current.shelf_life_days ?? "", row.shelf_life_days ?? "");
    cmp("active", current.active !== false, row.active);
    cmp("image_url", current.image_url, row.image_url);
    if (row.latin_name !== null) cmp("latin_name", current.latin_name, row.latin_name);
    if (row.species_group !== null) cmp("species_group", (current as any).species_group, row.species_group);
    if (row.fao_code !== null) cmp("fao_code", (current as any).fao_code, row.fao_code);
    if (row.allergens !== null)
      cmp("allergens", ((current as any).allergens ?? []).join(", "), row.allergens.join(", "));
    if (row.may_contain !== null)
      cmp("may_contain", ((current as any).may_contain ?? []).join(", "), row.may_contain.join(", "));

    cmp(
      "parent_sku",
      current.parent_product_id ? byId.get(current.parent_product_id)?.sku ?? "" : "",
      row.parent_sku ?? "",
    );
    cmp("supplier", current.supplier_id ?? "", supplierId ?? "");

    return {
      row,
      status: changes.length > 0 ? ("changed" as DiffStatus) : ("unchanged" as DiffStatus),
      errors,
      warnings,
      changes,
      existingId: current.id,
    };
  });
}

export interface UpsertPayload {
  sku: string;
  name: string;
  category: string;
  unit: string;
  cost_price: number;
  wholesale_price: number;
  retail_suggested: number;
  origin: string | null;
  producer: string | null;
  barcode: string | null;
  hs_code: string | null;
  weight_per_piece: number | null;
  shelf_life_days: number | null;
  active: boolean;
  image_url: string | null;
  latin_name?: string | null;
  species_group?: string | null;
  fao_code?: string | null;
  allergens?: string[];
  allergens_checked?: boolean;
  may_contain?: string[];
  supplier_id?: string | null;
  parent_product_id?: string | null;
}


export function toPayload(row: ParsedRow): UpsertPayload {
  return {
    sku: row.sku,
    name: row.name,
    category: row.category,
    unit: row.unit,
    cost_price: row.cost_price,
    wholesale_price: row.wholesale_price,
    retail_suggested: row.retail_suggested,
    origin: row.origin,
    producer: row.producer,
    barcode: row.barcode,
    hs_code: row.hs_code,
    weight_per_piece: row.weight_per_piece,
    shelf_life_days: row.shelf_life_days,
    active: row.active,
    image_url: row.image_url,
    // tom cell = ingen ändring: fältet utesluts helt ur payloaden
    ...(row.latin_name !== null ? { latin_name: row.latin_name } : {}),
    ...(row.species_group !== null ? { species_group: row.species_group } : {}),
    ...(row.fao_code !== null ? { fao_code: row.fao_code } : {}),
  };
}

export function buildTemplateCsv(): string {
  return `${IMPORT_COLUMNS.join(",")}\nFS-045,Lax filé,Färsk Fisk,kg,120.00,162.00,199.00,Norge,Salmar,,7311234567890,0304,,5,,TRUE,https://exempel.se/bilder/lax-file.jpg,Salmo salar,lax,SAL\n`;
}
