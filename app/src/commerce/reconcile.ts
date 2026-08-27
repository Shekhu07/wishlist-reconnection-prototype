import type { WishlistItem } from "@/data/types";

/**
 * E14: reconciling a saved item against the bag, Save for Later, and orders.
 *
 * FR-11 asks for three duplicate states to be *detected and re-labelled*.
 * Detection is the operative word: until now `in_bag` and `purchased` were
 * fields on the wishlist record, which is an item asserting something about
 * itself. An assertion cannot go stale correctly -- remove something from your
 * bag and the saved item goes on claiming to be in it.
 *
 * So the states are derived from the records that actually own them. The
 * wishlist says what you saved; the bag says what you are about to buy; the
 * order history says what you already did.
 */

export interface BagLine {
  sku: string;
  parent_product_id: string;
  size: string;
  colour: string;
  added_at: string;
  quantity: number;
}

export interface SavedForLaterLine {
  sku: string;
  parent_product_id: string;
  size: string;
  colour: string;
  moved_at: string;
}

export interface OrderLine {
  sku: string;
  parent_product_id: string;
  size: string;
  colour: string;
  quantity: number;
  price_paid: number;
}

export interface Order {
  order_id: string;
  placed_at: string;
  delivered_at: string | null;
  lines: OrderLine[];
}

export interface Bag {
  items: BagLine[];
}
export interface SavedForLater {
  items: SavedForLaterLine[];
}
export interface Orders {
  orders: Order[];
}

export type DuplicateState =
  | "none"
  /** This exact SKU is in the bag right now. */
  | "in_bag"
  /** Moved out of the bag into Save for Later. */
  | "saved_for_later"
  /** Bought before, in this exact variant. */
  | "purchased"
  /**
   * Bought before, but in a different size or colour. Materially different
   * from a repeat purchase: for fashion, buying the same style in another
   * size usually means the first one did not fit.
   */
  | "purchased_other_variant";

export interface Reconciliation {
  state: DuplicateState;
  /** Where the evidence came from, so a label can never be unexplained. */
  evidence: string | null;
  orderId: string | null;
  bagQuantity: number;
}

export interface CommerceState {
  bag: Bag;
  savedForLater: SavedForLater;
  orders: Orders;
}

/**
 * Precedence, most immediate first.
 *
 * In-bag wins because it is the only state where the user is about to do
 * something wrong *right now* -- adding a second copy of what they are already
 * buying. Save for Later comes next: they deliberately deferred it, and saying
 * so is more useful than telling them about a purchase from months ago.
 * Purchase history is last, and the exact-variant case outranks the
 * other-variant one because it is the stronger claim.
 */
export function reconcile(item: WishlistItem, commerce: CommerceState): Reconciliation {
  const inBag = commerce.bag.items.find((line) => line.sku === item.sku);
  if (inBag) {
    return {
      state: "in_bag",
      evidence: `added to the bag on ${inBag.added_at}`,
      orderId: null,
      bagQuantity: inBag.quantity,
    };
  }

  const deferred = commerce.savedForLater.items.find((line) => line.sku === item.sku);
  if (deferred) {
    return {
      state: "saved_for_later",
      evidence: `moved to Save for Later on ${deferred.moved_at}`,
      orderId: null,
      bagQuantity: 0,
    };
  }

  // Most recent order first: "you bought this in March" beats the same fact
  // from two years ago when both are true.
  const ordered = [...commerce.orders.orders].sort((a, b) => (a.placed_at < b.placed_at ? 1 : -1));

  for (const order of ordered) {
    if (order.lines.some((line) => line.sku === item.sku)) {
      return {
        state: "purchased",
        evidence: `ordered on ${order.placed_at}`,
        orderId: order.order_id,
        bagQuantity: 0,
      };
    }
  }

  for (const order of ordered) {
    const line = order.lines.find(
      (candidate) => candidate.parent_product_id === item.parent_product_id
    );
    if (line) {
      return {
        state: "purchased_other_variant",
        evidence: `ordered in ${line.colour} · ${line.size} on ${order.placed_at}`,
        orderId: order.order_id,
        bagQuantity: 0,
      };
    }
  }

  return { state: "none", evidence: null, orderId: null, bagQuantity: 0 };
}

/**
 * Would adding this to the bag create a duplicate?
 *
 * The E5/E14 duplicate-add metric counts what this returns true for, so it has
 * to mean exactly one thing: the same SKU is already in the bag. Having bought
 * it last year is not a duplicate add.
 */
export function wouldDuplicate(item: WishlistItem, commerce: CommerceState): boolean {
  return commerce.bag.items.some((line) => line.sku === item.sku);
}

/** Mutating helpers, kept together so the invariants are visible in one place. */
export function addToBag(item: WishlistItem, size: string, commerce: CommerceState): void {
  const existing = commerce.bag.items.find((line) => line.sku === item.sku);
  if (existing) {
    // Never silently stack a second copy. FR-11 exists to prevent exactly this,
    // and the module has already told the user it is in there.
    return;
  }
  // Adding from the wishlist takes it out of Save for Later: the two states are
  // mutually exclusive, and leaving it in both would make the next
  // reconciliation ambiguous.
  commerce.savedForLater.items = commerce.savedForLater.items.filter(
    (line) => line.sku !== item.sku
  );
  commerce.bag.items.push({
    sku: item.sku,
    parent_product_id: item.parent_product_id,
    size,
    colour: item.colour,
    added_at: new Date().toISOString().slice(0, 10),
    quantity: 1,
  });
}

export function moveToSaveForLater(sku: string, commerce: CommerceState): void {
  const line = commerce.bag.items.find((candidate) => candidate.sku === sku);
  if (!line) return;
  commerce.bag.items = commerce.bag.items.filter((candidate) => candidate.sku !== sku);
  commerce.savedForLater.items.push({
    sku: line.sku,
    parent_product_id: line.parent_product_id,
    size: line.size,
    colour: line.colour,
    moved_at: new Date().toISOString().slice(0, 10),
  });
}
