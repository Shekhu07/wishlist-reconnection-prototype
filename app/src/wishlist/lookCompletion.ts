import type { Catalog, Colourway, ParentProduct, Wishlist, WishlistItem } from "@/data/types";
import { reconcile, type CommerceState } from "@/commerce/reconcile";
import type { InventorySimulator } from "@/revalidation/inventory";
import {
  genderCoherent,
  slotFor,
  slotsComplement,
  usageCoherent,
  type OutfitSlot,
} from "./slots";

/**
 * "Complete the look" -- which of the user's saved items go with the product
 * they are looking at.
 *
 * The bounds the improvement prompt set still govern: "Keep this experience
 * sparse and removable. Do not create an overwhelming recommendation carousel,
 * and do not add complementary products solely to increase basket size." So it
 * is capped, it is behind an experiment arm rather than on for everyone, and it
 * draws **only from items the user has already saved**. That last constraint is
 * what keeps this a memory feature rather than a recommender: everything it can
 * show, the user chose.
 *
 * The matching itself is the slot model in `./slots.ts`. What this file adds is
 * the three gates and the ranking -- and each gate *rejects* rather than
 * scores, because a wrong suggestion costs more than a missing one. A user who
 * is shown a men's shoe against a girls' dress learns the feature is guessing.
 */

export interface LookSuggestion {
  item: WishlistItem;
  parent: ParentProduct;
  colourway: Colourway;
  slot: OutfitSlot;
  /** Derived from the pairing. Never generated prose. */
  reason: string;
  /** False when the saved size is gone: still shown, but ranked last. */
  buyable: boolean;
}

/**
 * Three, up from the old two.
 *
 * A full look is a top, a bottom and shoes -- capping at two could never show
 * one. Three is still nowhere near a carousel, and the section renders nothing
 * at all rather than padding itself out to reach the cap.
 */
export const MAX_LOOK_SUGGESTIONS = 3;

export interface LookContext {
  catalog: Catalog;
  wishlist: Wishlist;
  commerce: CommerceState;
  inventory: InventorySimulator;
  /** Saved items to leave out — typically whatever is already on screen. */
  excludeItemIds?: string[];
}

/**
 * The saved items that complete the look with `seed`.
 *
 * Returns [] rather than reaching into the catalog when nothing saved fits.
 * Suggesting something the user never chose is the basket-size recommender the
 * prompt forbids, and the absence of a section is a smaller cost than that.
 */
export function completeTheLook(
  seedParent: ParentProduct,
  seedColourway: Colourway,
  context: LookContext
): LookSuggestion[] {
  const { catalog, wishlist, commerce, inventory, excludeItemIds = [] } = context;
  const seedSlot = slotFor(seedParent);
  if (seedSlot === "none") return [];

  const candidates: LookSuggestion[] = [];

  for (const item of wishlist.items) {
    if (excludeItemIds.includes(item.item_id)) continue;

    const parent = catalog.parents.find(
      (candidate) => candidate.parent_product_id === item.parent_product_id
    );
    const colourway = parent?.colourways.find(
      (candidate) => candidate.product_id === item.product_id
    );
    if (!parent || !colourway) continue;

    // Never pair a product with itself.
    if (parent.parent_product_id === seedParent.parent_product_id) continue;

    const slot = slotFor(parent);
    if (!slotsComplement(seedSlot, slot)) continue;
    if (!genderCoherent(seedParent.gender, parent.gender)) continue;
    if (!usageCoherent(seedColourway.usage, colourway.usage)) continue;

    // Lifecycle. An item already in the bag or already bought is not a
    // suggestion, it is a reminder the user does not need. Derived through
    // reconcile rather than read off a flag, for the reason E14 established:
    // an item asserting its own state cannot go stale correctly.
    const duplicate = reconcile(item, commerce).state;
    if (duplicate === "in_bag" || duplicate === "purchased") continue;

    candidates.push({
      item,
      parent,
      colourway,
      slot,
      reason: reasonFor(slot, seedColourway),
      buyable: inventory.isInStock(item.sku),
    });
  }

  return rank(candidates);
}

/**
 * One item per slot, buyable first, most recently saved as the tie-break.
 *
 * The slot cap is the important half: two saved shirts against one pair of
 * jeans is the same suggestion twice, and it crowds out the shoes that would
 * have finished the outfit.
 */
function rank(candidates: LookSuggestion[]): LookSuggestion[] {
  const ordered = [...candidates].sort((a, b) => {
    // Unavailable still appears -- learning a saved item is gone beats silence
    // -- but never ahead of something the user can actually wear.
    if (a.buyable !== b.buyable) return a.buyable ? -1 : 1;
    return b.item.saved_at.localeCompare(a.item.saved_at);
  });

  const seenSlots = new Set<OutfitSlot>();
  const picked: LookSuggestion[] = [];
  for (const candidate of ordered) {
    if (seenSlots.has(candidate.slot)) continue;
    seenSlots.add(candidate.slot);
    picked.push(candidate);
    if (picked.length === MAX_LOOK_SUGGESTIONS) break;
  }
  return picked;
}

/**
 * What the pairing claims, in the user's terms.
 *
 * Built from the seed's display name rather than its article type, because
 * de-pluralising a type is a trap: "Tshirts" becomes "tshirt" and "Casual
 * Shoes" becomes "this casual shoes". A display name is already a noun phrase
 * someone wrote, so it is always grammatical and always specific.
 *
 * Per-slot verbs were the first attempt and produced "Wears under this
 * tshirt" for a pair of jeans -- true of trousers under a shirt, wrong here.
 * A claim that is only sometimes right is worse than a plainer one that is
 * always right, so only `finishing` keeps its own phrasing.
 */
function reasonFor(slot: OutfitSlot, seedColourway: Colourway): string {
  const name = seedColourway.display_name;
  return slot === "finishing" ? `Finishes the look with the ${name}` : `Goes with the ${name}`;
}
