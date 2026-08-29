import catalogJson from "@/data/catalog.json";
import wishlistJson from "@/data/wishlist.json";
import { CATALOG_IMAGES } from "@/data/images";
import type { Catalog, ParentProduct, Wishlist } from "@/data/types";
import { slotFor } from "@/wishlist/slots";

const catalog = catalogJson as unknown as Catalog;
const wishlist = wishlistJson as unknown as Wishlist;

const parentById = new Map(
  catalog.parents.map((parent) => [parent.parent_product_id, parent])
);

/**
 * The saved wardrobe: the nineteen items that take the wishlist from the
 * eleven state fixtures to thirty.
 *
 * Eleven saved items is a fixture table, not a wishlist. Everything that reads
 * the saved set -- the Wishlist screen, the slot model, look completion, the
 * comparison entry points -- was being exercised against a list shorter than
 * one screen, so a wardrobe of thirty is the shape those surfaces are meant
 * to hold.
 *
 * The wardrobe is generated (tools/catalog/curate.py, SAVED_GROUPS), so what
 * is pinned here is the construction: the categories asked for, the colour
 * claim in the one group that makes one, and the separation from the fixture
 * table that keeps a saved earring from ever becoming state 2.
 */

const GROUP_EXPECTATIONS: Record<
  string,
  { articleType: string; gender: string; count: number; colour?: string }
> = {
  earrings: { articleType: "Earrings", gender: "Women", count: 5 },
  "black jeans": { articleType: "Jeans", gender: "Men", count: 4, colour: "Black" },
  "men's belt": { articleType: "Belts", gender: "Men", count: 2 },
  "women's belt": { articleType: "Belts", gender: "Women", count: 2 },
  "men's watch": { articleType: "Watches", gender: "Men", count: 3 },
  "women's watch": { articleType: "Watches", gender: "Women", count: 3 },
};

const wardrobeIds = new Set(Object.values(catalog.saved_groups).flat());

describe("the saved wardrobe", () => {
  it("brings the wishlist to thirty items", () => {
    expect(wishlist.items.length).toBe(30);
    // Eleven fixtures, nineteen wardrobe parents, one saved item each.
    expect(wardrobeIds.size).toBe(19);
  });

  it.each(Object.entries(GROUP_EXPECTATIONS))(
    "saves %s from the category and gender it names",
    (group, expected) => {
      const ids = catalog.saved_groups[group];
      expect([group, ids?.length]).toEqual([group, expected.count]);

      for (const id of ids) {
        const parent = parentById.get(id) as ParentProduct;
        expect([id, parent?.articleType, parent?.gender]).toEqual([
          id,
          expected.articleType,
          expected.gender,
        ]);
      }
    }
  );

  it("saves black jeans in black", () => {
    // The one group that makes a colour claim. Colourway order is what the
    // saved item is built from, and nothing else in the pipeline sorts on
    // colour, so without this the claim is only true by luck.
    const saved = wishlist.items.filter((item) =>
      catalog.saved_groups["black jeans"].includes(item.parent_product_id)
    );
    expect(saved.length).toBe(4);
    expect(saved.map((item) => item.colour)).toEqual(["Black", "Black", "Black", "Black"]);
  });

  it("saves a real, resolvable SKU for every wardrobe item", () => {
    const unresolved: string[] = [];
    for (const item of wishlist.items) {
      if (!wardrobeIds.has(item.parent_product_id)) continue;
      const parent = parentById.get(item.parent_product_id);
      const colourway = parent?.colourways.find(
        (candidate) => candidate.product_id === item.product_id
      );
      const sku = colourway?.skus.find((candidate) => candidate.sku === item.sku);
      if (!parent || !colourway || !sku) unresolved.push(item.item_id);
      else if (sku.size !== item.size || colourway.colour !== item.colour) {
        unresolved.push(item.item_id);
      }
    }
    expect(unresolved).toEqual([]);
  });

  it("has an image for every wardrobe colourway", () => {
    const missing = [...wardrobeIds]
      .flatMap((id) => parentById.get(id)?.colourways ?? [])
      .filter((colourway) => CATALOG_IMAGES[colourway.product_id] === undefined)
      .map((colourway) => colourway.product_id);
    expect(missing).toEqual([]);
  });

  it("never becomes a state fixture", () => {
    // Same invariant the showcase carries, and for the same reason: anything
    // reachable from catalog.roles defines what a state *means*, and a pair of
    // earrings has no business defining state 2.
    for (const roleId of Object.values(catalog.roles)) {
      expect(wardrobeIds.has(roleId)).toBe(false);
    }
    for (const family of Object.values(catalog.families)) {
      for (const id of [...family.wishlisted, ...family.filler]) {
        expect(wardrobeIds.has(id)).toBe(false);
      }
    }
    for (const id of catalog.showcase) {
      expect(wardrobeIds.has(id)).toBe(false);
    }
  });

  it("is real catalog data, never invented", () => {
    for (const id of wardrobeIds) {
      const parent = parentById.get(id) as ParentProduct;
      expect([id, parent.synthetic ?? false]).toEqual([id, false]);
    }
  });

  it("occupies an outfit slot, so look completion can use it", () => {
    // Earrings were the article type the slot model had never seen. Falling
    // through to "none" would have dropped every one of them out of pairing
    // in silence.
    for (const id of wardrobeIds) {
      const parent = parentById.get(id) as ParentProduct;
      expect([parent.articleType, slotFor(parent)]).not.toEqual([
        parent.articleType,
        "none",
      ]);
    }
  });
});
