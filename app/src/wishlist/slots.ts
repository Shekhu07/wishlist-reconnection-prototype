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
  /** Fragrance and cosmetics -- completes a look without occupying the body. */
  | "finishing"
  /** Not part of any outfit. Home furnishing is a different universe. */
  | "none";

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
  // Personal Care
  Lipstick: "finishing",
  "Nail Polish": "finishing",
  "Perfume and Body Mist": "finishing",
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
  Lips: "finishing",
  Nails: "finishing",
  Fragrance: "finishing",
  Perfumes: "finishing",
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
