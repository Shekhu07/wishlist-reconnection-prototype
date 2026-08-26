import { InventorySimulator } from "@/revalidation/inventory";
import { revalidate, servesPincode } from "@/revalidation/revalidate";
import { makeCatalog, makeWishlist } from "./helpers/fixtures";

/**
 * Two-phase freshness (plan section 1.3): what the module rendered is
 * advisory, and this read is allowed to contradict it. These tests are the
 * E5 gate -- 100% of variant-unavailable cases must render recovery rather
 * than a substitution.
 */

const PINCODE = "560034";

function setup() {
  const catalog = makeCatalog();
  const wishlist = makeWishlist();
  const inventory = new InventorySimulator(catalog);
  return { catalog, wishlist, inventory, item: wishlist.items[0] };
}

describe("revalidation at the action boundary (E5)", () => {
  it("clears the purchase when nothing has changed", () => {
    const { catalog, inventory, item } = setup();
    const result = revalidate(item, catalog, inventory, PINCODE)!;
    expect(result.blocking).toBeNull();
    expect(result.advisories).toEqual([]);
    expect(result.current.sizesInStock).toContain(item.size);
  });

  it("names the failure when the saved size sold out since the module rendered", () => {
    const { catalog, inventory, item } = setup();
    inventory.sellOut(item.sku);
    const result = revalidate(item, catalog, inventory, PINCODE)!;
    expect(result.blocking).toBe("variant_unavailable");
    // Section 4.14 forbids a generic error, so the reason has to be specific
    // enough to write copy against.
    expect(result.blocking).not.toBeNull();
  });

  it("distinguishes a gone variant from a gone product (sections 4.1 vs 4.2)", () => {
    const { catalog, inventory, item } = setup();
    inventory.sellOut(item.sku);
    expect(revalidate(item, catalog, inventory, PINCODE)!.blocking).toBe("variant_unavailable");

    inventory.sellOutProduct(item.parent_product_id);
    expect(revalidate(item, catalog, inventory, PINCODE)!.blocking).toBe("product_unavailable");
  });

  it("offers alternatives only when the saved variant is blocked, never before", () => {
    const { catalog, inventory, item } = setup();
    // FR-7: while the saved variant is buyable, nothing else is proposed.
    expect(revalidate(item, catalog, inventory, PINCODE)!.alternatives).toEqual([]);

    inventory.sellOut(item.sku);
    const recovered = revalidate(item, catalog, inventory, PINCODE)!;
    expect(recovered.alternatives.length).toBeGreaterThan(0);
    // And an alternative is an offer, not a swap: the saved colourway is still
    // what the result is about.
    expect(recovered.colourway.product_id).toBe(item.product_id);
  });

  it("offers no alternatives when the whole product is gone", () => {
    const { catalog, inventory, item } = setup();
    inventory.sellOutProduct(item.parent_product_id);
    expect(revalidate(item, catalog, inventory, PINCODE)!.alternatives).toEqual([]);
  });

  it("revalidates delivery against the current address, not the saved one", () => {
    const { catalog, inventory, item } = setup();
    const seller = catalog.parents[0].colourways[0].seller;
    const unreachable = ["100001", "100002", "100003", "100004", "100005", "100006",
      "100007", "100008", "100009", "100010", "100011", "100012"]
      .find((pin) => !servesPincode(seller, pin));
    expect(unreachable).toBeDefined();

    const result = revalidate(item, catalog, inventory, unreachable!)!;
    expect(result.blocking).toBe("delivery_unavailable");
    expect(result.current.delivery_by).toBeNull();
  });

  it("reports a price change as a fact without a direction of travel", () => {
    const { catalog, inventory, wishlist } = setup();
    const item = { ...wishlist.items[0], price_at_save: 1499 };
    const result = revalidate(item, catalog, inventory, PINCODE)!;
    expect(result.advisories).toContain("price_changed");
    // Advisory, not blocking: a changed price does not stop the purchase.
    expect(result.blocking).toBeNull();
  });

  it("reports a seller change", () => {
    const { catalog, inventory, wishlist } = setup();
    const item = { ...wishlist.items[0], seller_at_save: "Someone Else" };
    expect(revalidate(item, catalog, inventory, PINCODE)!.advisories).toContain(
      "seller_changed"
    );
  });

  it("prefers the gone-entirely message over the gone-size one", () => {
    const { catalog, inventory, item } = setup();
    inventory.sellOutProduct(item.parent_product_id);
    const result = revalidate(item, catalog, inventory, PINCODE)!;
    expect(result.blocking).toBe("product_unavailable");
  });
});

describe("inventory simulator", () => {
  it("restores the seeded stock on reset, so a session is reproducible", () => {
    const { catalog, inventory, item } = setup();
    inventory.sellOut(item.sku);
    expect(inventory.isInStock(item.sku)).toBe(false);
    inventory.reset();
    expect(inventory.isInStock(item.sku)).toBe(true);
    expect(inventory.changes).toEqual([]);
  });

  it("records every change so the harness can show what moved", () => {
    const { catalog, inventory, item } = setup();
    inventory.sellOut(item.sku);
    expect(inventory.changes).toEqual([{ sku: item.sku, from: true, to: false }]);
  });

  it("does not report a product unavailable while any colourway remains", () => {
    const { catalog, inventory, item } = setup();
    inventory.sellOut(item.sku);
    expect(inventory.isProductUnavailable(item.parent_product_id)).toBe(false);
  });
});
