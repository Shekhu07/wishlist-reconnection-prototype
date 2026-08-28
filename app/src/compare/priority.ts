import { COMPARE_AXES, type CompareAxisKey } from "@/copy/bundle";

/**
 * The comparison priority (improvement 4, wireframe CR-01).
 *
 * The six criteria the implementation prompt names. Each maps onto axes the
 * table already has and the catalog can actually answer -- "Comfort" is not a
 * column, it is material and fit read together, and saying so is more honest
 * than inventing a comfort score.
 */
export type ComparePriority =
  | "fit"
  | "delivery"
  | "comfort"
  | "occasion"
  | "reviews"
  | "returns";

export const COMPARE_PRIORITIES: { key: ComparePriority; label: string }[] = [
  { key: "fit", label: "Fit" },
  { key: "delivery", label: "Delivery" },
  { key: "comfort", label: "Comfort" },
  { key: "occasion", label: "Occasion" },
  { key: "reviews", label: "Reviews" },
  { key: "returns", label: "Returns" },
];

/**
 * Which rows a priority is about.
 *
 * Deliberately not a weighting. A weight would let the table rank options for
 * the user, and improvement 5 is explicit that nothing may claim one item is
 * universally best. This only decides what to read first.
 */
export const PRIORITY_AXES: Record<ComparePriority, CompareAxisKey[]> = {
  fit: ["fit", "sizes"],
  delivery: ["delivery"],
  // Comfort is not a column in this catalog and should not pretend to be one.
  comfort: ["material", "fit"],
  occasion: ["occasion"],
  reviews: ["rating", "review_count"],
  returns: ["returns"],
};

/**
 * The axes in the order the chosen priority wants them, with **everything
 * else still present** underneath.
 *
 * Improvement 4 asks for reordering "without hiding important information",
 * and the distinction matters: hiding the rows a user did not prioritise would
 * quietly decide for them which trade-offs are allowed to exist. Price stays
 * on screen at every priority for the same reason -- but it is never a
 * priority the user can pick, because C-1 keeps money out of the ranking.
 */
export function orderedAxes(
  priority: ComparePriority | null
): readonly (typeof COMPARE_AXES)[number][] {
  if (!priority) return COMPARE_AXES;
  const lifted = PRIORITY_AXES[priority];
  const promoted = COMPARE_AXES.filter((axis) => lifted.includes(axis.key));
  const rest = COMPARE_AXES.filter((axis) => !lifted.includes(axis.key));
  return [...promoted, ...rest];
}
