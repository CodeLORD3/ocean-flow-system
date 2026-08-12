import { describe, expect, it } from "vitest";
import { matchProduct, suggestProducts } from "@/lib/foljesedelMatch";

// Riktiga rader ur produktregistret och sorteringsregistret.
const products = [
  { id: "a", sku: "FS-017", name: "Hel Torsk", latin_name: "Gadus morhua", fao_code: "COD", species_group: "torsk", active: false, purchasable: false },
  { id: "b", sku: "TOR-001-HEL-SE", name: "Hel Torsk Svensk", latin_name: "Gadus morhua", fao_code: "COD", species_group: "torsk", active: true, purchasable: false },
  { id: "c", sku: "TOR-001-HEL-1", name: "Hel Torsk 1", latin_name: "Gadus morhua", fao_code: "COD", species_group: "torsk", active: true, purchasable: true, size_grade_id: "g1" },
  { id: "d", sku: "TOR-001-HEL-3", name: "Hel Torsk 3", latin_name: "Gadus morhua", fao_code: "COD", species_group: "torsk", active: true, purchasable: true, size_grade_id: "g3" },
] as any[];
const grades = [
  { id: "g1", species_group: "torsk", grade_no: 1, min_weight_kg: 7, active: true },
  { id: "g3", species_group: "torsk", grade_no: 3, min_weight_kg: 2, max_weight_kg: 4, active: true },
] as any[];

describe("verklig följesedelsrad", () => {
  it("Torsk 3 landar på TOR-001-HEL-3", () => {
    const res = matchProduct({ product_name: "Torsk 3", latin_name: "Gadus morhua", species_fao_code: "COD" }, { products, grades });
    expect(products.find((p) => p.id === res.productId)?.sku).toBe("TOR-001-HEL-3");
    expect(res.method).toBe("size_grade");
  });

  it("osorterad torskrad kräver val och föreslår aldrig spärrad grundprodukt", () => {
    const res = matchProduct({ product_name: "Torsk färsk", species_fao_code: "COD" }, { products, grades });
    expect(res.productId).toBeNull();
    const skus = suggestProducts({ product_name: "Torsk färsk", species_fao_code: "COD" }, { products, grades }).map((s) => s.product.sku);
    expect(skus).toEqual(expect.arrayContaining(["TOR-001-HEL-1", "TOR-001-HEL-3"]));
    expect(skus).not.toContain("TOR-001-HEL-SE");
    expect(skus).not.toContain("FS-017");
  });
});
