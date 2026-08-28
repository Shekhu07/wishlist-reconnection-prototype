import type { Catalog, Colourway, ParentProduct, WishlistItem } from "@/data/types";
import type { InventorySimulator } from "./inventory";

/**
 * E5: the binding read at the action boundary (FR-6).
 *
 * Section 1.3 of the plan calls this two-phase freshness. The availability the
 * module rendered is *advisory* -- it was true when the match resolved and may
 * not be true now. This is the read that decides, and it is allowed to
 * disagree with what the user was just shown.
 *
 * Disagreement is split in two, because they need different treatment:
 *
 *   blocking  -- the purchase cannot proceed. Each has a name, because section
 *                4.14 forbids a generic error.
 *   advisory  -- the purchase can proceed but something changed the user
 *                should see before committing.
 *
 * Nothing here substitutes a variant the user did not choose (FR-7).
 */

export type BlockingReason =
  /** Section 4.1: the saved size is gone, other sizes or colours remain. */
  | "variant_unavailable"
  /** Section 4.2: gone in every variant. Never a dead-end Buy button. */
  | "product_unavailable"
  /** Section 4.13: revalidated against the current address, not the saved one. */
  | "delivery_unavailable";

export type AdvisoryReason = "price_changed" | "seller_changed";

export interface CurrentFacts {
  price: number;
  seller: string;
  delivery_by: string | null;
  returns_days: number;
  sizesInStock: string[];
  coloursInStock: string[];
}

export interface RevalidationResult {
  item: WishlistItem;
  parent: ParentProduct;
  colourway: Colourway;
  blocking: BlockingReason | null;
  advisories: AdvisoryReason[];
  current: CurrentFacts;
  /** Alternatives offered only when the saved variant is blocked. */
  alternatives: { colourway: Colourway; sizes: string[] }[];
  /**
   * Sizes in stock for every colourway of this parent, keyed by product_id.
   *
   * Populated always, unlike `alternatives`. Section 6 of the wireframes is
   * explicit that size availability uses current inventory and is never
   * inferred from another size -- and the same holds across colours. Once the
   * user can pick a colour, answering "is my size available" from the *saved*
   * colourway's stock is exactly that inference.
   */
  sizesByColour: Record<number, string[]>;
}

/**
 * Whether a seller ships to a pincode. Deterministic, and deliberately not
 * universal: section 4.13 requires revalidation against the *current* address,
 * which is only observable if some address somewhere fails.
 */
export function servesPincode(seller: string, pincode: string): boolean {
  let hash = 0;
  for (const ch of `${seller}|${pincode}`) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 10 !== 0;
}

export function deliveryDateFor(today: string, productId: number): string {
  const offset = 2 + (productId % 4);
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function revalidate(
  item: WishlistItem,
  catalog: Catalog,
  inventory: InventorySimulator,
  pincode: string
): RevalidationResult | null {
  const parent = catalog.parents.find(
    (p) => p.parent_product_id === item.parent_product_id
  );
  if (!parent) return null;
  const colourway = parent.colourways.find((c) => c.product_id === item.product_id);
  if (!colourway) return null;

  const sizesByColour: Record<number, string[]> = {};
  for (const c of parent.colourways) {
    sizesByColour[c.product_id] = inventory.sizesInStock(parent, c.product_id);
  }
  const sizesInStock = sizesByColour[colourway.product_id] ?? [];
  const coloursInStock = parent.colourways
    .filter((c) => (sizesByColour[c.product_id] ?? []).length > 0)
    .map((c) => c.colour);

  const deliverable = servesPincode(colourway.seller, pincode);
  const current: CurrentFacts = {
    price: colourway.price,
    seller: colourway.seller,
    delivery_by: deliverable ? deliveryDateFor(catalog.today, colourway.product_id) : null,
    returns_days: colourway.returns_days,
    sizesInStock,
    coloursInStock,
  };

  // Order matters. "Gone entirely" is a different conversation from "your size
  // is gone", and being unable to deliver is worth saying before either.
  let blocking: BlockingReason | null = null;
  if (inventory.isProductUnavailable(parent.parent_product_id)) {
    blocking = "product_unavailable";
  } else if (!inventory.isInStock(item.sku)) {
    blocking = "variant_unavailable";
  } else if (!deliverable) {
    blocking = "delivery_unavailable";
  }

  const advisories: AdvisoryReason[] = [];
  // Stated as a fact, never as a direction of travel: "it went down" is an
  // incentive, and constraint C-1 rules out incentives entirely.
  if (colourway.price !== item.price_at_save) advisories.push("price_changed");
  if (item.seller_at_save && colourway.seller !== item.seller_at_save) {
    advisories.push("seller_changed");
  }

  const alternatives =
    blocking === "variant_unavailable"
      ? parent.colourways
          .filter((c) => c.product_id !== colourway.product_id)
          .map((c) => ({ colourway: c, sizes: sizesByColour[c.product_id] ?? [] }))
          .filter((entry) => entry.sizes.length > 0)
      : [];

  return {
    item,
    parent,
    colourway,
    blocking,
    advisories,
    current,
    alternatives,
    sizesByColour,
  };
}
