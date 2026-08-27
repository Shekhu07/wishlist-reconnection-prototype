import catalogJson from "@/data/catalog.json";
import wishlistJson from "@/data/wishlist.json";
import type { Catalog, Wishlist } from "@/data/types";

const catalog = catalogJson as unknown as Catalog;
const wishlist = wishlistJson as unknown as Wishlist;

/**
 * The home range is the only invented product data in the catalog. Everything
 * else is a real dataset row with price, stock and size synthesised on top.
 *
 * This suite is the guard on that exception. It is not about home products
 * looking right -- it is about an invented product never becoming evidence
 * for anything.
 */
describe("the synthetic home range stays quarantined", () => {
  const home = catalog.parents.filter((p) => p.masterCategory === "Home");

  it("exists", () => {
    expect(home.length).toBeGreaterThanOrEqual(8);
  });

  it("is the only thing flagged synthetic", () => {
    const flagged = catalog.parents.filter((p) => p.synthetic);
    expect(flagged.map((p) => p.parent_product_id).sort()).toEqual(
      home.map((p) => p.parent_product_id).sort()
    );
  });

  it("is never saved, never a fixture, never wishlisted", () => {
    const homeIds = new Set(home.map((p) => p.parent_product_id));
    for (const item of wishlist.items) {
      expect(homeIds.has(item.parent_product_id)).toBe(false);
    }
    for (const roleId of Object.values(catalog.roles)) {
      expect(homeIds.has(roleId)).toBe(false);
    }
  });
});
