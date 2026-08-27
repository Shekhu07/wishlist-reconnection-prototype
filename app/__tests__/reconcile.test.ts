import {
  addToBag,
  moveToSaveForLater,
  reconcile,
  wouldDuplicate,
  type CommerceState,
} from "@/commerce/reconcile";
import { MatchClient } from "@/match/transport";
import { makeCatalog, makeWishlist } from "./helpers/fixtures";

/**
 * E14 / FR-11. The point of the slice is that these states are *detected*
 * rather than declared: a saved item that claims to be in the bag cannot stop
 * claiming it when the bag changes.
 */

const item = makeWishlist().items[0];

function empty(): CommerceState {
  return { bag: { items: [] }, savedForLater: { items: [] }, orders: { orders: [] } };
}

function withBag(): CommerceState {
  const commerce = empty();
  commerce.bag.items.push({
    sku: item.sku,
    parent_product_id: item.parent_product_id,
    size: item.size,
    colour: item.colour,
    added_at: "2026-08-20",
    quantity: 1,
  });
  return commerce;
}

function withOrder(overrides: Partial<{ sku: string; size: string; colour: string }> = {}) {
  const commerce = empty();
  commerce.orders.orders.push({
    order_id: "ord_1",
    placed_at: "2026-05-01",
    delivered_at: "2026-05-06",
    lines: [
      {
        sku: overrides.sku ?? item.sku,
        parent_product_id: item.parent_product_id,
        size: overrides.size ?? item.size,
        colour: overrides.colour ?? item.colour,
        quantity: 1,
        price_paid: 1999,
      },
    ],
  });
  return commerce;
}

describe("duplicate reconciliation (E14 / FR-11)", () => {
  it("reports nothing when the item is only in the wishlist", () => {
    expect(reconcile(item, empty()).state).toBe("none");
  });

  it("detects the item in the bag", () => {
    const result = reconcile(item, withBag());
    expect(result.state).toBe("in_bag");
    expect(result.evidence).toContain("2026-08-20");
  });

  it("stops saying in-bag the moment the bag no longer contains it", () => {
    // The property the old flag could not have. A field on the wishlist item
    // goes on asserting whatever it was set to.
    const commerce = withBag();
    expect(reconcile(item, commerce).state).toBe("in_bag");
    commerce.bag.items = [];
    expect(reconcile(item, commerce).state).toBe("none");
  });

  it("detects Save for Later as its own state", () => {
    const commerce = empty();
    commerce.savedForLater.items.push({
      sku: item.sku,
      parent_product_id: item.parent_product_id,
      size: item.size,
      colour: item.colour,
      moved_at: "2026-07-01",
    });
    expect(reconcile(item, commerce).state).toBe("saved_for_later");
  });

  it("detects a previous purchase of the exact variant", () => {
    const result = reconcile(item, withOrder());
    expect(result.state).toBe("purchased");
    expect(result.orderId).toBe("ord_1");
  });

  it("separates a purchase of a different size from a repeat purchase", () => {
    // For fashion this is usually a sizing story, not a reorder, and the two
    // deserve different copy.
    const result = reconcile(item, withOrder({ sku: "sku_other", size: "XXL" }));
    expect(result.state).toBe("purchased_other_variant");
    expect(result.evidence).toContain("XXL");
  });

  it("prefers the most recent order when several match", () => {
    const commerce = withOrder();
    commerce.orders.orders.push({
      order_id: "ord_2",
      placed_at: "2026-07-15",
      delivered_at: "2026-07-19",
      lines: commerce.orders.orders[0].lines,
    });
    expect(reconcile(item, commerce).orderId).toBe("ord_2");
  });

  it("puts in-bag above every other state", () => {
    // The only state where the user is about to do something wrong right now.
    const commerce = withOrder();
    commerce.bag.items = withBag().bag.items;
    commerce.savedForLater.items.push({
      sku: item.sku,
      parent_product_id: item.parent_product_id,
      size: item.size,
      colour: item.colour,
      moved_at: "2026-07-01",
    });
    expect(reconcile(item, commerce).state).toBe("in_bag");
  });

  it("prefers Save for Later over a months-old purchase", () => {
    const commerce = withOrder();
    commerce.savedForLater.items.push({
      sku: item.sku,
      parent_product_id: item.parent_product_id,
      size: item.size,
      colour: item.colour,
      moved_at: "2026-07-01",
    });
    expect(reconcile(item, commerce).state).toBe("saved_for_later");
  });

  it("counts only a same-SKU bag entry as a duplicate add", () => {
    // The E5/E14 duplicate-add metric depends on this meaning exactly one
    // thing. Having bought it last year is not a duplicate add.
    expect(wouldDuplicate(item, withBag())).toBe(true);
    expect(wouldDuplicate(item, withOrder())).toBe(false);
    expect(wouldDuplicate(item, empty())).toBe(false);
  });

  it("never stacks a second copy of what is already in the bag", () => {
    const commerce = withBag();
    addToBag(item, item.size, commerce);
    expect(commerce.bag.items).toHaveLength(1);
    expect(commerce.bag.items[0].quantity).toBe(1);
  });

  it("takes an item out of Save for Later when it is added to the bag", () => {
    // Leaving it in both would make the next reconciliation ambiguous.
    const commerce = empty();
    commerce.savedForLater.items.push({
      sku: item.sku,
      parent_product_id: item.parent_product_id,
      size: item.size,
      colour: item.colour,
      moved_at: "2026-07-01",
    });
    addToBag(item, item.size, commerce);
    expect(commerce.savedForLater.items).toHaveLength(0);
    expect(reconcile(item, commerce).state).toBe("in_bag");
  });

  it("moves an item from the bag into Save for Later and back", () => {
    const commerce = withBag();
    moveToSaveForLater(item.sku, commerce);
    expect(reconcile(item, commerce).state).toBe("saved_for_later");
    addToBag(item, item.size, commerce);
    expect(reconcile(item, commerce).state).toBe("in_bag");
  });
});

describe("the module re-labels as the bag changes", () => {
  it("switches to Already in Bag on the next search after an add", async () => {
    const wishlist = makeWishlist();
    const commerce = empty();
    const client = new MatchClient({
      catalog: makeCatalog(),
      wishlist,
      latencyMs: 5,
      commerce,
    });
    const request = {
      query: "mark taylor shirt",
      modality: "text" as const,
      filters: {},
      delivery_pincode: "560034",
      session_id: "s1",
    };

    const before = await client.requestMatch(request, true);
    expect(before.matches[0].copy_key).toBe("exact_variant_available");

    addToBag(wishlist.items[0], wishlist.items[0].size, commerce);

    // Reconciliation has to be read per call. Caching it at index-build time
    // reproduced exactly the staleness deriving these states was meant to fix.
    const after = await client.requestMatch(request, true);
    expect(after.matches[0].copy_key).toBe("already_in_bag");
    expect(after.matches[0].current.state).toBe("in_bag");
  });
});
