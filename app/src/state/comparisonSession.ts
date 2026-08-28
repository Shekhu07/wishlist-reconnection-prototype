import type { SearchFilters } from "@/match/contract";
import type { Catalog, ParentProduct, WishlistItem } from "@/data/types";
import type { InventorySimulator } from "@/revalidation/inventory";
import { deliveryDateFor, servesPincode } from "@/revalidation/revalidate";
import type { ComparePriority } from "@/compare/priority";
import type { CompareAxisKey } from "@/copy/bundle";

/**
 * Comparison re-entry (wireframes Part B).
 *
 * Session-first, per section 11: no durable comparison history in v1, because
 * that adds privacy and clutter questions before the core behaviour has been
 * validated. The store lives in memory with a key shape that ports to Redis
 * mechanically, exactly like `match/suppression.ts`.
 *
 * The load-bearing decision is what gets stored. The session pins **which**
 * items were being compared and never **what they said**. `CompareScreen`
 * re-derives its columns from the query on every mount, so persisting the
 * rendered values would let a resumed comparison quietly drift out of date --
 * and E14 already taught this codebase that lesson the expensive way, when
 * duplicate reconciliation was cached at index-build time and reproduced
 * exactly the staleness it existed to remove.
 *
 * So: identity is stored, state is derived, and `changesSince` runs on every
 * render of the resume bar rather than being written down anywhere.
 */

export interface ComparisonSession {
  comparisonId: string;
  /** The stable app session, never the per-search id. */
  sessionId: string;
  savedItemId: string;
  /** Pinned identity: the product ids that were on screen. */
  productIds: number[];
  /**
   * What was true about each of them when the user left.
   *
   * Recording the prior answer is not the same as caching the current one, and
   * the distinction is the whole of CR-05. Caching "is this available" is the
   * E14 trap -- the value goes stale and reports the staleness it exists to
   * detect. A *baseline* is an immutable historical fact, and without one
   * "changed since you last compared" cannot be answered at all: an item that
   * was already out of stock when the comparison opened has not changed, and
   * saying it has would cry wolf on the first resume.
   */
  baseline: Record<number, { sizeAvailable: boolean; deliverable: boolean }>;
  query: string;
  filters: SearchFilters;
  pincode: string;
  priority: ComparePriority | null;
  lastViewedAxis: CompareAxisKey | null;
  /** What the user had selected on the saved item when they left. */
  variant: { colour: string; size: string };
  updatedAt: number;
  /** CR-02: dismissing the bar hides it for the session, not the comparison. */
  barDismissed: boolean;
}

export type ChangeKind = "size_unavailable" | "withdrawn" | "delivery_changed";

export interface SessionChange {
  productId: number;
  kind: ChangeKind;
}

/**
 * Only three kinds, because only three things can actually move.
 *
 * `InventorySimulator` churns stock and nothing else; price, seller and
 * returns are catalog-static, and delivery changes only when the pincode does.
 * Modelling a `price_changed` staleness would invent a state the prototype
 * cannot produce, which makes any gate over it unfalsifiable -- a number that
 * can only come out one way is the failure this project keeps meeting.
 */
/** What is true about one compared item right now. */
export function stateOf(
  catalog: Catalog,
  inventory: InventorySimulator,
  productId: number,
  pincode: string,
  savedSize: string
): { sizeAvailable: boolean; deliverable: boolean; withdrawn: boolean } {
  const found = findProduct(catalog, productId);
  if (!found) return { sizeAvailable: false, deliverable: false, withdrawn: true };
  const { parent, colourway } = found;
  if (inventory.isProductUnavailable(parent.parent_product_id)) {
    return { sizeAvailable: false, deliverable: false, withdrawn: true };
  }
  return {
    sizeAvailable: inventory.sizesInStock(parent, productId).includes(savedSize),
    deliverable: servesPincode(colourway.seller, pincode),
    withdrawn: false,
  };
}

export function changesSince(
  session: ComparisonSession,
  catalog: Catalog,
  inventory: InventorySimulator,
  pincode: string,
  savedSize: string
): SessionChange[] {
  const changes: SessionChange[] = [];

  for (const productId of session.productIds) {
    const now = stateOf(catalog, inventory, productId, pincode, savedSize);
    const before = session.baseline[productId];

    if (now.withdrawn) {
      changes.push({ productId, kind: "withdrawn" });
      continue;
    }
    // Only a *transition* counts. An option that was already out of the user's
    // size when they compared it has not changed, and reporting it would cry
    // wolf on the first resume -- which is how a recovery affordance becomes
    // noise people learn to dismiss.
    if (before?.sizeAvailable && !now.sizeAvailable) {
      changes.push({ productId, kind: "size_unavailable" });
      continue;
    }
    if (before && before.deliverable !== now.deliverable) {
      changes.push({ productId, kind: "delivery_changed" });
    }
  }

  return changes;
}

export function findProduct(
  catalog: Catalog,
  productId: number
): { parent: ParentProduct; colourway: Catalog["parents"][number]["colourways"][number] } | null {
  for (const parent of catalog.parents) {
    const colourway = parent.colourways.find((c) => c.product_id === productId);
    if (colourway) return { parent, colourway };
  }
  return null;
}

/**
 * One comparison at a time, per user session.
 *
 * The wireframes cap re-entry at the *current* comparison deliberately: a list
 * of past comparisons is the durable history section 11 rules out of v1.
 */
export class ComparisonStore {
  private session: ComparisonSession | null = null;
  private counter = 0;

  /**
   * Starts or updates the comparison for this session.
   *
   * Re-opening the same saved item keeps the comparison rather than replacing
   * it, so a priority the user already chose is not silently discarded by a
   * second visit.
   */
  open(input: {
    sessionId: string;
    savedItemId: string;
    productIds: number[];
    query: string;
    filters: SearchFilters;
    pincode: string;
    variant: { colour: string; size: string };
    catalog: Catalog;
    inventory: InventorySimulator;
    savedSize: string;
  }): ComparisonSession {
    const baseline: ComparisonSession["baseline"] = {};
    for (const productId of input.productIds) {
      const state = stateOf(
        input.catalog,
        input.inventory,
        productId,
        input.pincode,
        input.savedSize
      );
      baseline[productId] = {
        sizeAvailable: state.sizeAvailable,
        deliverable: state.deliverable,
      };
    }

    const existing = this.session;
    if (
      existing &&
      existing.sessionId === input.sessionId &&
      existing.savedItemId === input.savedItemId
    ) {
      // Re-opening does not re-baseline: the baseline is what was true when
      // the user *last saw* the comparison, and resetting it here would erase
      // the very change CR-05 exists to report.
      existing.variant = input.variant;
      existing.updatedAt = Date.now();
      return existing;
    }

    this.counter += 1;
    this.session = {
      comparisonId: `cmp_${this.counter}`,
      sessionId: input.sessionId,
      savedItemId: input.savedItemId,
      productIds: input.productIds,
      query: input.query,
      filters: input.filters,
      pincode: input.pincode,
      priority: null,
      lastViewedAxis: null,
      variant: input.variant,
      baseline,
      updatedAt: Date.now(),
      barDismissed: false,
    };
    return this.session;
  }

  /** The comparison for this session, or null. Never another session's. */
  current(sessionId: string): ComparisonSession | null {
    if (!this.session || this.session.sessionId !== sessionId) return null;
    return this.session;
  }

  setPriority(sessionId: string, priority: ComparePriority | null): void {
    const session = this.current(sessionId);
    if (!session) return;
    session.priority = priority;
    session.updatedAt = Date.now();
  }

  setLastViewedAxis(sessionId: string, axis: CompareAxisKey | null): void {
    const session = this.current(sessionId);
    if (!session) return;
    session.lastViewedAxis = axis;
  }

  /** CR-02: the bar is hidden for the session; the comparison is untouched. */
  dismissBar(sessionId: string): void {
    const session = this.current(sessionId);
    if (session) session.barDismissed = true;
  }

  /**
   * CR-03's "Start fresh".
   *
   * Clears the comparison and nothing else. The wireframes are explicit that
   * it must not delete Wishlist items, and this store has no access to them --
   * which is the cheapest way to guarantee it.
   */
  startFresh(sessionId: string): void {
    if (this.session?.sessionId === sessionId) this.session = null;
  }

  /** Harness and tests. */
  reset(): void {
    this.session = null;
  }
}

/** A one-line digest of what would be restored (CR-02's bar, CR-03's sheet). */
export function describeSession(
  session: ComparisonSession,
  item: WishlistItem
): { count: string; detail: string } {
  const count = `${session.productIds.length} items in your comparison`;
  const parts = [
    session.priority ? `Priority: ${session.priority}` : null,
    `Saved: ${item.colour} · ${item.size}`,
  ].filter(Boolean);
  return { count, detail: parts.join(" · ") };
}

export { deliveryDateFor };
