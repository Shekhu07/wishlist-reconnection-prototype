import type { Colourway, ParentProduct } from "@/data/types";
import { deliveryDateFor, servesPincode } from "@/revalidation/revalidate";

/**
 * Why an alternative is on screen (improvement 4).
 *
 * The binding rule from the implementation prompt: "Every explanation must be
 * based on actual seeded product attributes. Do not invent explanations that
 * the data cannot support." So every reason below is a comparison of fields
 * that exist -- parent id, brand key, article type, name core, fit label,
 * delivery date -- and an option that matches none of them gets **no reason
 * line at all** rather than a generated one.
 *
 * A missing explanation is a smaller problem than a false one. A user who
 * reads "similar fit" and finds it untrue learns the whole panel is decorative.
 */

export type ReasonKey =
  | "different_colour"
  | "same_style"
  | "same_brand"
  | "similar_fit"
  | "earlier_delivery";

export const REASON_COPY: Record<ReasonKey, string> = {
  different_colour: "Same product, different colour",
  same_style: "Same style",
  same_brand: "Same brand as your saved item",
  similar_fit: "Similar fit",
  earlier_delivery: "Arrives sooner",
};

export interface ReasonContext {
  savedParent: ParentProduct;
  savedColourway: Colourway;
  pincode: string;
  today: string;
}

/**
 * One reason per option, most explanatory first.
 *
 * Identity reasons lead because they answer "what is this doing here" -- and
 * "arrives sooner" is a property of the offer rather than of the product, so
 * it only speaks when nothing about the product itself does.
 */
export function reasonFor(
  parent: ParentProduct,
  colourway: Colourway,
  context: ReasonContext
): ReasonKey | null {
  const { savedParent, savedColourway, pincode, today } = context;

  if (parent.parent_product_id === savedParent.parent_product_id) {
    return "different_colour";
  }
  if (
    parent.articleType === savedParent.articleType &&
    parent.name_core === savedParent.name_core
  ) {
    return "same_style";
  }
  if (parent.brand_key === savedParent.brand_key) {
    return "same_brand";
  }
  // Both must actually carry a fit label; two nulls are not a similarity.
  if (colourway.fit && savedColourway.fit && colourway.fit === savedColourway.fit) {
    return "similar_fit";
  }
  if (arrivesSooner(colourway, savedColourway, pincode, today)) {
    return "earlier_delivery";
  }
  return null;
}

function arrivesSooner(
  candidate: Colourway,
  saved: Colourway,
  pincode: string,
  today: string
): boolean {
  // An option nobody can deliver here does not arrive sooner than anything.
  if (!servesPincode(candidate.seller, pincode)) return false;
  const candidateDate = deliveryDateFor(today, candidate.product_id);
  if (!servesPincode(saved.seller, pincode)) return true;
  return candidateDate < deliveryDateFor(today, saved.product_id);
}
