import catalogJson from "@/data/catalog.json";
import wishlistJson from "@/data/wishlist.json";
import type { Catalog, Wishlist } from "@/data/types";
import { byCategory } from "@/search/catalogBrowse";
import { buildSearchIndex, search } from "@/search/localSearch";
import { slotFor } from "@/wishlist/slots";

const catalog = catalogJson as unknown as Catalog;
const wishlist = wishlistJson as unknown as Wishlist;

/**
 * The showcase accessories: watches, belts, sunglasses and wallets, added so
 * the Accessories circle is not thirteen handbags.
 *
 * They are browse-only by construction -- real dataset rows appended after
 * curate.select() has taken its families, exactly as the home range is. These
 * tests pin that construction, because the failure mode is silent: a showcase
 * parent that leaked into the fixture table would repoint what "state 2"
 * means while every other suite stayed green.
 */

const SHOWCASE_TYPES = ["Watches", "Belts", "Sunglasses", "Wallets"];
/**
 * The showcase parents themselves, as the generator recorded them.
 *
 * This used to be inferred from articleType, which was true right up until the
 * saved wardrobe added watches and belts the demo user has actually saved --
 * at which point "no showcase parent is ever a saved item" would have failed
 * on parents that were never showcase parents at all. The invariant is about
 * where a parent came from, so it is checked against where it came from.
 */
const showcaseIds = new Set(catalog.showcase);

describe("the showcase accessories", () => {
  it("stocks every type it claims to", () => {
    for (const articleType of SHOWCASE_TYPES) {
      const parents = catalog.parents.filter((p) => p.articleType === articleType);
      expect([articleType, parents.length > 0]).toEqual([articleType, true]);
    }
  });

  it("leaves the Accessories circle more than a pile of handbags", () => {
    const types = new Set(byCategory(catalog, "accessories").map((t) => t.parent.articleType));
    // Before this, the circle held exactly one article type.
    expect(types.size).toBeGreaterThan(1);
    expect(types.has("Handbags")).toBe(true);
    for (const articleType of SHOWCASE_TYPES) {
      expect([articleType, types.has(articleType)]).toEqual([articleType, true]);
    }
  });

  it("is real catalog data, never invented", () => {
    // The home range is the only thing allowed to be synthetic. An invented
    // watch would quietly become evidence in every gate that measures the
    // catalog, which is exactly what the synthetic flag exists to prevent.
    for (const parent of catalog.parents) {
      if (!showcaseIds.has(parent.parent_product_id)) continue;
      expect([parent.parent_product_id, parent.synthetic ?? false]).toEqual([
        parent.parent_product_id,
        false,
      ]);
    }
  });

  it("is browse-only: never a saved item, never a state fixture", () => {
    expect(showcaseIds.size).toBeGreaterThan(0);

    for (const item of wishlist.items) {
      expect(showcaseIds.has(item.parent_product_id)).toBe(false);
    }
    for (const roleId of Object.values(catalog.roles)) {
      expect(showcaseIds.has(roleId)).toBe(false);
    }
    // Nor a query family: families own the wishlisted/filler split, and a
    // showcase group deliberately owns neither.
    for (const family of Object.values(catalog.families)) {
      for (const id of [...family.wishlisted, ...family.filler]) {
        expect(showcaseIds.has(id)).toBe(false);
      }
    }
  });

  it("is findable by the name a shopper would type", () => {
    const index = buildSearchIndex(catalog);
    for (const [query, articleType] of [
      ["watch", "Watches"],
      ["belt", "Belts"],
      ["sunglasses", "Sunglasses"],
      ["wallet", "Wallets"],
    ] as const) {
      const hits = search(query, index);
      expect([query, hits.some((h) => h.parent.articleType === articleType)]).toEqual([
        query,
        true,
      ]);
    }
  });
});

describe("the slot model covers what the catalog actually holds", () => {
  it("gives every catalog article type a slot, home excepted", () => {
    // The guard that would have caught the real bug here: an article type
    // nobody classified falls through to "none" and vanishes from pairing
    // silently -- no error, no empty state, just a feature that never fires.
    const unclassified = new Set<string>();
    for (const parent of catalog.parents) {
      if (parent.masterCategory === "Home") continue; // deliberately "none"
      if (slotFor(parent) === "none") unclassified.add(parent.articleType);
    }
    expect([...unclassified]).toEqual([]);
  });
});
