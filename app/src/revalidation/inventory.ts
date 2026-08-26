import type { Catalog, ParentProduct, Sku } from "@/data/types";

/**
 * The inventory simulator (section 3.2 of the plan).
 *
 * Its whole purpose is to let stock go out from under the user between the
 * advisory read at module render and the binding read at the action boundary.
 * Without that, the recovery states in sections 4.1, 4.2 and 4.14 can be drawn
 * but never actually reached, and a prototype that can only reach its happy
 * path is not testing the thing that matters.
 *
 * Live state lives here rather than in the catalog JSON so the catalog stays
 * the immutable seed and a churn run is always reversible.
 */

export interface StockChange {
  sku: string;
  from: boolean;
  to: boolean;
}

export class InventorySimulator {
  private readonly stock = new Map<string, boolean>();
  private readonly seed = new Map<string, boolean>();
  private readonly skusByParent = new Map<string, Sku[]>();
  readonly changes: StockChange[] = [];

  constructor(catalog: Catalog) {
    for (const parent of catalog.parents) {
      const skus: Sku[] = [];
      for (const colourway of parent.colourways) {
        for (const sku of colourway.skus) {
          this.stock.set(sku.sku, sku.in_stock);
          this.seed.set(sku.sku, sku.in_stock);
          skus.push(sku);
        }
      }
      this.skusByParent.set(parent.parent_product_id, skus);
    }
  }

  isInStock(sku: string): boolean {
    return this.stock.get(sku) ?? false;
  }

  sizesInStock(parent: ParentProduct, productId: number): string[] {
    const colourway = parent.colourways.find((c) => c.product_id === productId);
    if (!colourway) return [];
    return colourway.skus.filter((s) => this.isInStock(s.sku)).map((s) => s.size);
  }

  /** True when no SKU of any colourway of the parent can be bought (section 4.2). */
  isProductUnavailable(parentId: string): boolean {
    const skus = this.skusByParent.get(parentId) ?? [];
    return skus.length > 0 && skus.every((s) => !this.isInStock(s.sku));
  }

  /** Take a specific SKU out of stock -- the section 4.1 case. */
  sellOut(sku: string): void {
    this.set(sku, false);
  }

  /** Take an entire product out of stock in every variant -- the 4.2 case. */
  sellOutProduct(parentId: string): void {
    for (const sku of this.skusByParent.get(parentId) ?? []) this.set(sku.sku, false);
  }

  /**
   * Flip a proportion of currently-stocked SKUs out of stock.
   *
   * Deterministic given the same call order, so a researcher can reproduce a
   * session rather than chase a random one.
   */
  churn(rate: number, parentId?: string): StockChange[] {
    const pool = parentId
      ? this.skusByParent.get(parentId) ?? []
      : [...this.skusByParent.values()].flat();
    const before = this.changes.length;
    pool.forEach((sku, index) => {
      if (!this.isInStock(sku.sku)) return;
      if ((index % 100) / 100 < rate) this.set(sku.sku, false);
    });
    return this.changes.slice(before);
  }

  reset(): void {
    for (const [sku, inStock] of this.seed) this.stock.set(sku, inStock);
    this.changes.length = 0;
  }

  private set(sku: string, value: boolean): void {
    const from = this.stock.get(sku);
    if (from === undefined || from === value) return;
    this.stock.set(sku, value);
    this.changes.push({ sku, from, to: value });
  }
}
