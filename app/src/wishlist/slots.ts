import type { ParentProduct } from "@/data/types";

/**
 * The outfit slot model.
 *
 * A pairing engine built from a hand-written list of complementary article
 * types is the wrong shape three times over. It costs O(types squared) to
 * maintain. It goes stale in silence -- the table this replaces named four
 * types the catalog does not contain (`Trousers`, `Shorts`, `Leggings`,
 * `Formal Shoes`), so `Kurtas` mapped only to `Leggings` and could never fire,
 * and thirteen of twenty-one catalog types returned nothing at all. And it gets
 * the one genuinely interesting case wrong unless somebody remembers to think
 * of it.
 *
 * Model an outfit as slots instead. Two items complement each other when they
 * occupy *different* slots, with one exception that a pairwise table is exactly
 * the wrong structure to express: a dress occupies the torso and the legs at
 * once, so it excludes both a top and a bottom rather than pairing with them.
 *
 * A new article type joins the model by being assigned one slot. That is the
 * whole cost of extending it.
 */

export type OutfitSlot =
  | "top"
  | "bottom"
  /** A dress: occupies `top` and `bottom` simultaneously. */
  | "full_body"
  | "feet"
  | "carry"
  /* ---- The finishing slots ---------------------------------------- *
   * One `finishing` slot used to hold every accessory, which made the
   * accessory the density bottleneck: a belt and a watch were "two finishing
   * touches, not a look", so a men's shirt could never reach both, and a
   * kurta could show earrings or a watch but never the pair. An outfit does
   * not work that way -- these things are worn at once, on different parts
   * of the body -- so each gets the slot it actually occupies. The rule that
   * mattered survives intact, one slot deep: still no two belts, still no
   * lipstick with a nail polish.
   * ------------------------------------------------------------------ */
  /** Belts. */
  | "waist"
  /** Watches. */
  | "wrist"
  /** Sunglasses. */
  | "eyes"
  /** Earrings and the rest of the jewellery box. */
  | "jewellery"
  /**
   * Cosmetics and fragrance, deliberately kept as one slot: lipstick, nail
   * polish and perfume finish a look together, but showing two of them in a
   * four-item strip crowds out the garment the user was actually shopping.
   */
  | "beauty"
  /** Not part of any outfit. Home furnishing is a different universe. */
  | "none";

/**
 * The finishing slots, as one set.
 *
 * Copy and ranking both need "is this an accessory?" and neither should have
 * to keep its own list in step with the union above.
 */
const FINISHING_SLOTS = new Set<OutfitSlot>(["waist", "wrist", "eyes", "jewellery", "beauty"]);

export function isFinishingSlot(slot: OutfitSlot): boolean {
  return FINISHING_SLOTS.has(slot);
}

/**
 * Which slot to fill first when the cap cannot hold them all.
 *
 * Ranking by recency alone was fine while three suggestions covered nearly
 * every slot a seed could reach. Now that the accessories have split five
 * ways, a seed can have seven eligible slots and room for four, and the
 * ordering decides whether "complete the look" means an outfit or a jewellery
 * box. The garment that finishes the body goes first, then shoes, then the
 * bag, then the accessories, with beauty last -- it completes a look without
 * being part of one.
 */
const SLOT_RANK: Record<OutfitSlot, number> = {
  top: 0,
  bottom: 0,
  full_body: 0,
  feet: 1,
  carry: 2,
  waist: 3,
  wrist: 4,
  jewellery: 4,
  eyes: 5,
  beauty: 6,
  none: 9,
};

export function slotRank(slot: OutfitSlot): number {
  return SLOT_RANK[slot];
}

/**
 * Keyed on articleType rather than subCategory, deliberately.
 *
 * The catalog files `Perfume and Body Mist` under two different subCategories
 * (`Fragrance` twelve times, `Perfumes` once), so subCategory is not a stable
 * key. articleType is.
 */
const SLOT_BY_ARTICLE_TYPE: Record<string, OutfitSlot> = {
  // Apparel > Topwear
  Shirts: "top",
  Tshirts: "top",
  Kurtas: "top",
  Tops: "top",
  // Apparel > Bottomwear
  Jeans: "bottom",
  "Track Pants": "bottom",
  // Apparel > Dress
  Dresses: "full_body",
  // Footwear
  "Casual Shoes": "feet",
  Heels: "feet",
  // Accessories
  Handbags: "carry",
  Wallets: "carry",
  // Worn with an outfit without occupying a garment slot, each on its own
  // part of the body -- so a belt and a watch now pair, and a belt and a
  // second belt still do not.
  Watches: "wrist",
  Belts: "waist",
  Sunglasses: "eyes",
  Earrings: "jewellery",
  // Personal Care. One slot between them, on purpose: see `beauty`.
  Lipstick: "beauty",
  "Nail Polish": "beauty",
  "Perfume and Body Mist": "beauty",
};

/**
 * Falls back through subCategory so an article type nobody has classified yet
 * still lands somewhere sensible rather than silently becoming `none` and
 * disappearing from the feature without explanation.
 */
const SLOT_BY_SUB_CATEGORY: Record<string, OutfitSlot> = {
  Topwear: "top",
  Bottomwear: "bottom",
  Dress: "full_body",
  Shoes: "feet",
  Bags: "carry",
  Watches: "wrist",
  Belts: "waist",
  Eyewear: "eyes",
  Jewellery: "jewellery",
  Wallets: "carry",
  Lips: "beauty",
  Nails: "beauty",
  Fragrance: "beauty",
  Perfumes: "beauty",
  "Home Furnishing": "none",
};

export function slotFor(parent: ParentProduct): OutfitSlot {
  return (
    SLOT_BY_ARTICLE_TYPE[parent.articleType] ??
    SLOT_BY_SUB_CATEGORY[parent.subCategory] ??
    "none"
  );
}

/**
 * Do these two slots belong in the same outfit?
 *
 * Same slot never pairs -- two saved shirts are the same idea twice, not a
 * look. `none` pairs with nothing. And `full_body` conflicts with `top` and
 * `bottom` because a dress already fills both.
 */
export function slotsComplement(a: OutfitSlot, b: OutfitSlot): boolean {
  if (a === "none" || b === "none") return false;
  if (a === b) return false;
  const dressConflict =
    (a === "full_body" && (b === "top" || b === "bottom")) ||
    (b === "full_body" && (a === "top" || a === "bottom"));
  return !dressConflict;
}

/* ------------------------------------------------------------------ *
 * The coherence gates
 * ------------------------------------------------------------------ */

/**
 * Gender coherence.
 *
 * This gate exists because of a specific trap in the catalog: gender is
 * perfectly confounded with article type, and `Tops` and `Dresses` are tagged
 * **Girls**, not Women. So the most natural-looking pair in the whole dataset,
 * "Dresses with Heels", silently crosses kidswear into adult footwear. Nothing
 * about the article types themselves reveals that.
 *
 * Adult and kidswear never mix. Unisex pairs only with Unisex, because the only
 * Unisex items here are home furnishing.
 */
const KIDSWEAR = new Set(["Boys", "Girls"]);

export function genderCoherent(a: string, b: string): boolean {
  if (a === b) return true;
  if (KIDSWEAR.has(a) !== KIDSWEAR.has(b)) return false;
  // Two different kidswear genders, or two different adult genders: an outfit
  // is worn by one person.
  return false;
}

/**
 * Usage coherence, over a real dataset column.
 *
 * Sports track pants do not complete a formal shirt. Casual is the permissive
 * middle -- most of the catalog is Casual and refusing to pair it with anything
 * would leave the feature with nothing to say.
 */
const USAGE_PAIRS: Record<string, string[]> = {
  Casual: ["Casual", "Formal", "Ethnic", "Sports"],
  Formal: ["Formal", "Casual"],
  Ethnic: ["Ethnic", "Casual"],
  Sports: ["Sports", "Casual"],
  Home: ["Home"],
};

export function usageCoherent(a: string | null, b: string | null): boolean {
  // An unlabelled item makes no claim either way; refusing it would drop real
  // pairings for a missing field rather than for a conflict.
  if (!a || !b) return true;
  return USAGE_PAIRS[a]?.includes(b) ?? true;
}
