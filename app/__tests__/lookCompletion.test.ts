import {
  MAX_LOOK_SUGGESTIONS,
  completeTheLook,
  type LookContext,
} from "@/wishlist/lookCompletion";
import {
  genderCoherent,
  isFinishingSlot,
  slotFor,
  slotsComplement,
  usageCoherent,
} from "@/wishlist/slots";
import { InventorySimulator } from "@/revalidation/inventory";
import catalogJson from "@/data/catalog.json";
import wishlistJson from "@/data/wishlist.json";
import bagJson from "@/data/bag.json";
import sflJson from "@/data/saved-for-later.json";
import ordersJson from "@/data/orders.json";
import type { Catalog, ParentProduct, Wishlist } from "@/data/types";
import type { Bag, CommerceState, Orders, SavedForLater } from "@/commerce/reconcile";

/**
 * Cross-category pairing, on the real catalog.
 *
 * The fixture catalog has two article types and cannot exercise a slot model,
 * so this runs against the shipped data — which is also the only way to check
 * the claim that matters: that the engine finds outfits the old pairwise table
 * could not.
 */

const catalog = catalogJson as unknown as Catalog;
const wishlist = wishlistJson as unknown as Wishlist;

function commerceState(): CommerceState {
  return {
    bag: JSON.parse(JSON.stringify(bagJson)) as Bag,
    savedForLater: JSON.parse(JSON.stringify(sflJson)) as SavedForLater,
    orders: ordersJson as unknown as Orders,
  };
}

function context(overrides: Partial<LookContext> = {}): LookContext {
  return {
    catalog,
    wishlist,
    commerce: commerceState(),
    inventory: new InventorySimulator(catalog),
    ...overrides,
  };
}

function parentByType(articleType: string, gender?: string): ParentProduct {
  const found = catalog.parents.find(
    (p) => p.articleType === articleType && (!gender || p.gender === gender)
  );
  if (!found) throw new Error(`no ${gender ?? ""} ${articleType} in catalog`);
  return found;
}

function look(articleType: string, gender?: string, ctx = context()) {
  const parent = parentByType(articleType, gender);
  return completeTheLook(parent, parent.colourways[0], ctx);
}

describe("the slot model", () => {
  it("never pairs an item with its own slot", () => {
    // Two saved shirts are the same idea twice, not a look.
    expect(slotsComplement("top", "top")).toBe(false);
    expect(slotsComplement("feet", "feet")).toBe(false);
  });

  it("excludes a dress from pairing with a top or a bottom", () => {
    // The case a pairwise table gets wrong unless someone thinks of it: a
    // dress already occupies the torso and the legs.
    expect(slotsComplement("full_body", "top")).toBe(false);
    expect(slotsComplement("full_body", "bottom")).toBe(false);
    expect(slotsComplement("full_body", "feet")).toBe(true);
    expect(slotsComplement("full_body", "carry")).toBe(true);
  });

  it("keeps home furnishing out of outfits entirely", () => {
    expect(slotsComplement("none", "top")).toBe(false);
    const home = catalog.parents.find((p) => p.masterCategory === "Home");
    expect(home && slotFor(home)).toBe("none");
  });

  it("assigns every catalog article type a slot", () => {
    // A type nobody has classified falls through to `none` and vanishes from
    // the feature with no explanation, which is how the old table rotted.
    const unslotted = catalog.parents
      .filter((p) => slotFor(p) === "none" && p.masterCategory !== "Home")
      .map((p) => p.articleType);
    expect([...new Set(unslotted)]).toEqual([]);
  });

  it("refuses to cross kidswear with adult sizing", () => {
    // `Tops` and `Dresses` are tagged Girls in this catalog, so the most
    // natural-looking pair in the dataset — Dresses with Heels — crosses
    // kidswear into adult footwear. Nothing about the types reveals that.
    expect(genderCoherent("Girls", "Women")).toBe(false);
    expect(genderCoherent("Boys", "Men")).toBe(false);
    expect(genderCoherent("Men", "Women")).toBe(false);
    expect(genderCoherent("Women", "Women")).toBe(true);
  });

  it("keeps sportswear out of formalwear but lets casual mix", () => {
    expect(usageCoherent("Sports", "Formal")).toBe(false);
    expect(usageCoherent("Casual", "Formal")).toBe(true);
    // A missing label is not a conflict.
    expect(usageCoherent(null, "Formal")).toBe(true);
  });
});

describe("what the engine finds on the real wishlist", () => {
  it("completes a men's shirt with the saved jeans", () => {
    const suggestions = look("Shirts", "Men");
    expect(suggestions.map((s) => s.slot)).toContain("bottom");
    expect(suggestions.every((s) => s.parent.gender === "Men")).toBe(true);
  });

  it("withholds the men's shoes because they were already bought", () => {
    // The only men's footwear saved is `wi_purchased`, and the lifecycle gate
    // is doing exactly what it should. Worth pinning rather than leaving as a
    // puzzle: the men's chain is shirt→jeans, not shirt→jeans→shoes, and the
    // reason is the fixture rather than the engine.
    const shoes = wishlist.items.find((i) => i.item_id === "wi_purchased")!;
    expect(look("Shirts", "Men").map((s) => s.item.item_id)).not.toContain(shoes.item_id);

    // Remove the purchase and the same engine finds the full outfit, which is
    // what proves the absence is the gate and not a slot bug.
    const noHistory = context();
    noHistory.commerce.orders = { orders: [] };
    noHistory.commerce.bag.items = [];
    const slots = look("Shirts", "Men", noHistory).map((s) => s.slot).sort();
    // The saved wardrobe put a men's belt and a men's watch in the accessory
    // slots, and those are now two slots rather than one, so the men's chain
    // is shirt -> jeans -> shoes -> belt -> watch, capped at four.
    expect(slots).toContain("bottom");
    expect(slots).toContain("feet");
    expect(slots.length).toBe(MAX_LOOK_SUGGESTIONS);
  });

  it("completes a women's kurta, which the old table could not", () => {
    // `Kurtas` mapped only to `Leggings`, which does not exist in this
    // catalog, so the shipped code returned nothing for every women's top.
    // The saved Handbag and Heels were there the whole time.
    const suggestions = look("Kurtas", "Women");
    expect(suggestions.length).toBeGreaterThan(0);
    const slots = suggestions.map((s) => s.slot).sort();
    // The whole ensemble, not one companion: the saved handbag, the saved
    // Flats and the saved jewellery, which is the case the improvement was
    // asked for. Feet is the one that had to be fought for -- the saved Flats
    // are out of stock in the saved size, so a strictly buyable-first seating
    // dropped the only women's footwear in the wishlist behind four buyable
    // accessories and left the outfit barefoot.
    expect(slots).toContain("carry");
    expect(slots).toContain("feet");
    expect(slots).toContain("jewellery");
    expect(suggestions.every((s) => s.parent.gender === "Women")).toBe(true);
  });

  it("suggests nothing at all for a home product", () => {
    expect(look("Bedsheet")).toEqual([]);
  });

  it("dresses a men's shirt in more than one other category", () => {
    // The ask, in the terms it was asked in: a shirt should reach jeans, a
    // belt and footwear rather than one complementary item. Footwear is
    // absent here for a reason the test above pins -- the only men's shoes
    // saved were bought -- so what is checked is the categories the data can
    // actually reach, plus the count.
    const suggestions = look("Shirts", "Men");
    const slots = suggestions.map((s) => s.slot);
    expect(slots).toContain("bottom");
    expect(slots).toContain("waist");
    expect(new Set(slots).size).toBeGreaterThanOrEqual(3);
  });

  it("pairs a belt with a watch, which one finishing slot forbade", () => {
    // The density bottleneck the split removed. Under a single `finishing`
    // slot these were "two finishing touches, not a look" and only one could
    // ever appear; they are worn on different parts of the body and an outfit
    // has room for both.
    expect(slotsComplement("waist", "wrist")).toBe(true);
    const slots = look("Shirts", "Men").map((s) => s.slot);
    expect(slots).toContain("waist");
    expect(slots).toContain("wrist");
  });

  it("still shows only one beauty item, however many are saved", () => {
    // The half of the old rule worth keeping. A lipstick and a nail polish
    // are one finishing touch twice over, and in a strip of four they would
    // take the seats the garment needed.
    for (const type of ["Kurtas", "Handbags", "Heels"]) {
      const beauty = look(type, "Women").filter((s) => s.slot === "beauty");
      expect(beauty.length).toBeLessThanOrEqual(1);
    }
  });

  it("seats the outfit before the accessories when the cap binds", () => {
    // Seven eligible slots, four seats. Whatever drops has to be the
    // decoration, never the garment -- ordering by save date alone filled the
    // strip with a perfume, a nail polish and a pair of sunglasses.
    const ctx = context();
    ctx.commerce.bag.items = [];
    for (const type of ["Kurtas", "Handbags", "Heels", "Earrings"]) {
      const slots = new Set(look(type, "Women", ctx).map((s) => s.slot));
      if (slots.has("beauty")) {
        // Beauty is last in line, so its presence means nothing an outfit
        // needs was left waiting behind it.
        expect(slots.has("carry") || slots.has("feet")).toBe(true);
      }
    }
  });

  it("stays sparse", () => {
    for (const type of ["Shirts", "Tshirts", "Jeans", "Kurtas", "Heels", "Handbags"]) {
      expect(look(type).length).toBeLessThanOrEqual(MAX_LOOK_SUGGESTIONS);
    }
  });

  it("shows at most one item per slot", () => {
    // Five of eleven saved items are shirts. Without the slot cap a men's
    // jeans PDP would suggest three of them and no shoes.
    const suggestions = look("Jeans", "Men");
    const slots = suggestions.map((s) => s.slot);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it("draws only from saved items, never the catalog", () => {
    const savedIds = new Set(wishlist.items.map((i) => i.item_id));
    for (const type of ["Shirts", "Kurtas", "Jeans"]) {
      for (const suggestion of look(type)) {
        expect(savedIds.has(suggestion.item.item_id)).toBe(true);
      }
    }
  });
});

describe("the gates reject rather than rank", () => {
  it("never suggests something already in the bag", () => {
    // An item in the bag is a reminder the user does not need. Derived
    // through reconcile, so removing it from the bag makes it eligible again.
    const inBag = wishlist.items.find((i) => i.item_id === "wi_in_bag")!;
    const withBag = context();
    withBag.commerce.bag.items.push({
      sku: inBag.sku,
      parent_product_id: inBag.parent_product_id,
      size: inBag.size,
      colour: inBag.colour,
      added_at: "2026-08-20",
      quantity: 1,
    });
    const suggested = look("Heels", "Women", withBag).map((s) => s.item.item_id);
    expect(suggested).not.toContain("wi_in_bag");

    // ...and is eligible once it leaves the bag, which is the property a
    // stored flag could not deliver.
    const empty = context();
    empty.commerce.bag.items = [];
    expect(look("Heels", "Women", empty).map((s) => s.item.item_id)).toContain("wi_in_bag");
  });

  it("excludes whatever is already on screen", () => {
    const ctx = context();
    ctx.commerce.bag.items = [];
    const withoutExclusion = look("Kurtas", "Women", ctx).map((s) => s.item.item_id);
    expect(withoutExclusion.length).toBeGreaterThan(0);

    const excluded = completeTheLook(
      parentByType("Kurtas", "Women"),
      parentByType("Kurtas", "Women").colourways[0],
      { ...ctx, excludeItemIds: withoutExclusion }
    );
    // What is on screen is gone from the suggestions. It no longer empties
    // them: the saved wardrobe is deep enough that excluding the first three
    // women's items leaves others behind them, which is the point of a
    // wishlist with thirty items rather than eleven.
    for (const id of withoutExclusion) {
      expect(excluded.map((s) => s.item.item_id)).not.toContain(id);
    }
  });

  it("ranks an unavailable saved item last rather than hiding it", () => {
    // Learning a saved item is gone beats silence, but it never leads.
    const ctx = context();
    ctx.commerce.bag.items = [];
    const suggestions = look("Shirts", "Men", ctx);
    const buyable = suggestions.map((s) => s.buyable);
    expect([...buyable].sort((a, b) => (a === b ? 0 : a ? -1 : 1))).toEqual(buyable);
  });

  it("names the product it pairs with, grammatically", () => {
    // The first version built the phrase from the article type and produced
    // "Wears under this tshirt" for jeans, and would have produced "this
    // casual shoes". A display name is already a noun phrase someone wrote.
    const seed = parentByType("Shirts", "Men");
    const name = seed.colourways[0].display_name;
    for (const suggestion of look("Shirts", "Men")) {
      // Two phrasings, and only two: the finishing slots keep their own verb
      // between them, and everything else takes the plain one. Both name the seed rather than
      // de-pluralising its article type.
      expect(suggestion.reason).toBe(
        isFinishingSlot(suggestion.slot)
          ? `Finishes the look with the ${name}`
          : `Goes with the ${name}`
      );
      expect(suggestion.reason).not.toMatch(/tshirt|this casual shoes/i);
    }
  });
});
