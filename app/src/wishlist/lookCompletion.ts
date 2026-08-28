import type { Catalog, ParentProduct, Wishlist, WishlistItem } from "@/data/types";

/**
 * Wishlist-to-look completion (improvement 9) -- a later-phase state, off by
 * default, and deliberately small.
 *
 * The prompt sets the bounds tightly: "Keep this experience sparse and
 * removable. Do not create an overwhelming recommendation carousel, and do not
 * add complementary products solely to increase basket size." So it is capped
 * at two, it is behind a harness switch, and it draws **only from items the
 * user has already saved**. That last constraint is what keeps it a memory
 * feature rather than a recommender: everything it can show, the user chose.
 *
 * The complement table is hand-written and short. A learned version would need
 * outfit data this catalog does not have, and would produce exactly the
 * confident-sounding invention constraint 8 rules out.
 */

/** Article types that plausibly complete each other. Symmetric by construction. */
const COMPLEMENTS: [string, string][] = [
  ["Shirts", "Jeans"],
  ["Shirts", "Trousers"],
  ["Tshirts", "Jeans"],
  ["Tshirts", "Shorts"],
  ["Kurtas", "Leggings"],
  ["Dresses", "Heels"],
  ["Jeans", "Casual Shoes"],
  ["Trousers", "Formal Shoes"],
  ["Shirts", "Casual Shoes"],
  ["Tops", "Jeans"],
];

const TABLE = new Map<string, Set<string>>();
for (const [a, b] of COMPLEMENTS) {
  if (!TABLE.has(a)) TABLE.set(a, new Set());
  if (!TABLE.has(b)) TABLE.set(b, new Set());
  TABLE.get(a)!.add(b);
  TABLE.get(b)!.add(a);
}

export function complements(articleType: string): string[] {
  return [...(TABLE.get(articleType) ?? [])];
}

export interface LookSuggestion {
  item: WishlistItem;
  parent: ParentProduct;
  /** Derived from the pairing, never generated prose. */
  reason: string;
}

export const MAX_LOOK_SUGGESTIONS = 2;

/**
 * Saved items that complete the one the user is looking at.
 *
 * Returns [] rather than reaching for the catalog when nothing saved fits.
 * "Works with your saved jeans" is only true if there are saved jeans; the
 * alternative -- suggesting something they never chose -- is the basket-size
 * recommender the prompt forbids.
 */
export function completeTheLook(
  searchedArticleType: string,
  wishlist: Wishlist,
  catalog: Catalog,
  excludeItemIds: string[] = []
): LookSuggestion[] {
  const wanted = new Set(complements(searchedArticleType));
  if (wanted.size === 0) return [];

  const suggestions: LookSuggestion[] = [];
  for (const item of wishlist.items) {
    if (excludeItemIds.includes(item.item_id)) continue;
    const parent = catalog.parents.find(
      (candidate) => candidate.parent_product_id === item.parent_product_id
    );
    if (!parent || !wanted.has(parent.articleType)) continue;

    suggestions.push({
      item,
      parent,
      // Names the saved thing it pairs with, because the whole claim is that
      // the user already owns half of this outfit.
      reason: `Works with the ${searchedArticleType.toLowerCase()} you searched for`,
    });
    if (suggestions.length === MAX_LOOK_SUGGESTIONS) break;
  }
  return suggestions;
}
