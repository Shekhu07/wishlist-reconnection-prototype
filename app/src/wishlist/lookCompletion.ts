import type { Catalog, Colourway, ParentProduct, Wishlist, WishlistItem } from "@/data/types";
import { reconcile, type CommerceState } from "@/commerce/reconcile";
import type { InventorySimulator } from "@/revalidation/inventory";
import { computeLookAffinity } from "./affinity";
import {
  genderCoherent,
  slotFor,
  slotRank,
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
 * The matching itself is the slot model in `./slots.ts` paired with the
 * dynamic affinity scoring in `./affinity.ts`. Each gate *rejects* rather than
 * scores, and candidates within each slot are ranked by seed-aware compatibility
 * (color harmony, occasion alignment, and styling synergy).
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

export const MAX_LOOK_SUGGESTIONS = 4;

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

  const candidates: Array<LookSuggestion & { score: number }> = [];

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
    // suggestion, it is a reminder the user does not need.
    const duplicate = reconcile(item, commerce).state;
    if (duplicate === "in_bag" || duplicate === "purchased") continue;

    const buyable = inventory.isInStock(item.sku);
    const affinity = computeLookAffinity(
      { parent: seedParent, colourway: seedColourway },
      { item, parent, colourway, slot, buyable }
    );

    candidates.push({
      item,
      parent,
      colourway,
      slot,
      reason: affinity.reason,
      buyable,
      score: affinity.score,
    });
  }

  return rank(candidates);
}

/**
 * One item per slot; the slots an outfit needs most take the seats;
 * within a seat, seed-aware affinity score decides the winner.
 */
function rank(candidates: Array<LookSuggestion & { score: number }>): LookSuggestion[] {
  // Best item per slot based on affinity score
  const bySlot = new Map<OutfitSlot, LookSuggestion & { score: number }>();
  for (const candidate of candidates) {
    const held = bySlot.get(candidate.slot);
    if (!held || candidate.score > held.score) {
      bySlot.set(candidate.slot, candidate);
    }
  }

  const seated = [...bySlot.values()]
    .sort((a, b) => slotRank(a.slot) - slotRank(b.slot) || b.score - a.score)
    .slice(0, MAX_LOOK_SUGGESTIONS);

  return seated
    .sort((a, b) => {
      if (a.buyable !== b.buyable) return a.buyable ? -1 : 1;
      return slotRank(a.slot) - slotRank(b.slot) || b.score - a.score;
    })
    .map(({ score: _, ...suggestion }) => suggestion);
}
