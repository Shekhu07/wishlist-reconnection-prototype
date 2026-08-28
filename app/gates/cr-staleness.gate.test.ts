import { ComparisonStore, changesSince, stateOf } from "@/state/comparisonSession";
import { InventorySimulator } from "@/revalidation/inventory";
import catalogJson from "@/data/catalog.json";
import wishlistJson from "@/data/wishlist.json";
import type { Catalog, Wishlist } from "@/data/types";
import { realParents } from "./paths";
import { recordGate } from "./report";

/**
 * The comparison-staleness gate.
 *
 * CR-05's promise is that nothing changes underneath a resumed comparison
 * without being marked. This drives real stock churn under a live comparison
 * and checks two things that pull in opposite directions:
 *
 *   - every item that genuinely moved is reported (no silent restoration);
 *   - no item that did *not* move is reported (no crying wolf).
 *
 * The second matters as much as the first. A recovery affordance that fires on
 * items which were already unavailable is one users learn to dismiss, and a
 * dismissed warning protects nobody.
 */

const catalog = catalogJson as unknown as Catalog;
const wishlist = wishlistJson as unknown as Wishlist;

/** Deterministic, so a failing run is reproducible. */
function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

describe("CR staleness gate", () => {
  it("marks every changed item and no unchanged one", () => {
    const real = new Set(realParents(catalog).map((parent) => parent.parent_product_id));
    const items = wishlist.items.filter((item) => real.has(item.parent_product_id));
    const random = seeded(20260828);

    let runs = 0;
    let churned = 0;
    let missed = 0;
    let cried = 0;
    const RUNS = 400;

    for (let i = 0; i < RUNS; i += 1) {
      const item = items[i % items.length];
      const inventory = new InventorySimulator(catalog);
      const store = new ComparisonStore();

      const parent = catalog.parents.find(
        (candidate) => candidate.parent_product_id === item.parent_product_id
      );
      if (!parent) continue;

      // A comparison of this product's colourways plus a couple of others.
      const productIds = [
        ...parent.colourways.map((colourway) => colourway.product_id),
        ...catalog.parents
          .filter((candidate) => candidate.parent_product_id !== parent.parent_product_id)
          .slice(0, 2)
          .map((candidate) => candidate.colourways[0].product_id),
      ].slice(0, 5);

      const session = store.open({
        sessionId: "gate",
        savedItemId: item.item_id,
        productIds,
        query: "gate",
        filters: {},
        pincode: "560034",
        variant: { colour: item.colour, size: item.size },
        catalog,
        inventory,
        savedSize: item.size,
      });

      // Churn, then compute the truth independently of changesSince.
      const before = new Map(
        productIds.map((id) => [id, stateOf(catalog, inventory, id, "560034", item.size)])
      );
      inventory.churn(0.2 + random() * 0.5);
      const after = new Map(
        productIds.map((id) => [id, stateOf(catalog, inventory, id, "560034", item.size)])
      );

      const trulyChanged = productIds.filter((id) => {
        const a = before.get(id)!;
        const b = after.get(id)!;
        return b.withdrawn !== a.withdrawn || (a.sizeAvailable && !b.sizeAvailable);
      });
      churned += trulyChanged.length;

      const reported = new Set(
        changesSince(session, catalog, inventory, "560034", item.size).map(
          (change) => change.productId
        )
      );

      for (const id of trulyChanged) if (!reported.has(id)) missed += 1;
      for (const id of reported) {
        if (!trulyChanged.includes(id)) {
          // Withdrawn is reported unconditionally, which is correct: an item
          // that was already gone when compared is still gone now and the user
          // still needs telling before they resume onto it.
          if (!after.get(id)?.withdrawn) cried += 1;
        }
      }
      runs += 1;
    }

    recordGate({
      id: "CR-staleness",
      epic: "CR-05 — comparison staleness",
      requirement: "every changed compared item is marked, and no unchanged one is",
      measured: `${missed} missed and ${cried} false alarms across ${runs} churn runs that moved ${churned.toLocaleString("en-IN")} items`,
      pass: missed === 0 && cried === 0,
      caveat:
        "Only stock churn and withdrawal are exercised, because they are the only things the inventory simulator can move; price, seller and returns are catalog-static, and delivery changes only when the pincode does. A pincode-driven change is covered by unit tests rather than here.",
    });

    // A run where nothing ever churned would pass silently and prove nothing.
    expect(churned).toBeGreaterThan(0);
    expect(missed).toBe(0);
    expect(cried).toBe(0);
  });

  it("leaves the wishlist untouched when the comparison is cleared", () => {
    // CR-03's "Start fresh" is a real alternative only if it costs nothing
    // beyond the comparison. The wireframes say so explicitly.
    const before = JSON.stringify(wishlist);
    const store = new ComparisonStore();
    const inventory = new InventorySimulator(catalog);
    const item = wishlist.items[0];

    store.open({
      sessionId: "gate",
      savedItemId: item.item_id,
      productIds: [item.product_id],
      query: "gate",
      filters: {},
      pincode: "560034",
      variant: { colour: item.colour, size: item.size },
      catalog,
      inventory,
      savedSize: item.size,
    });
    store.startFresh("gate");

    expect(store.current("gate")).toBeNull();
    expect(JSON.stringify(wishlist)).toBe(before);
  });
});
