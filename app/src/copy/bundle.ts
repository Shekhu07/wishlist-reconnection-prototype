import type { CopyKey } from "@/match/contract";

/**
 * Every user-facing string in the module, keyed by the `copy_key` the match
 * service returns. Keeping copy out of components is what makes the ban list
 * below enforceable: one file to lint, and the lint runs in CI.
 */

export interface ModuleCopy {
  /** Module header, always the same so the surface stays recognisable. */
  title: string;
  /** The one line that explains why the module appeared. */
  subtitle: (ctx: CopyContext) => string;
  primaryAction: string;
  secondaryAction: string;
}

export interface CopyContext {
  count: number;
  savedSize: string;
  savedColour: string;
}

const TITLE = "From your Wishlist";
const BUY = "Buy from Wishlist";
const COMPARE = "Compare options";

export const COPY: Record<CopyKey, ModuleCopy> = {
  exact_variant_available: {
    title: TITLE,
    subtitle: () => "You saved this earlier",
    primaryAction: BUY,
    secondaryAction: COMPARE,
  },
  saved_size_available: {
    title: TITLE,
    subtitle: (ctx) => `Your saved Size ${ctx.savedSize} is available`,
    primaryAction: BUY,
    secondaryAction: COMPARE,
  },
  exact_variant_unavailable: {
    title: TITLE,
    subtitle: (ctx) =>
      `You saved this, but Size ${ctx.savedSize} is unavailable`,
    // No dead-end Buy button when the saved variant cannot be bought
    // (source doc 4.1 / FR-7): the primary action moves the user forward
    // rather than substituting a variant they did not choose.
    primaryAction: "See available sizes",
    secondaryAction: COMPARE,
  },
  multiple_matches: {
    title: TITLE,
    subtitle: (ctx) => `${ctx.count} items match your search`,
    primaryAction: BUY,
    secondaryAction: "Compare these",
  },
  colour_variant_available: {
    title: TITLE,
    subtitle: (ctx) =>
      `You saved this in ${ctx.savedColour} — other colours are available`,
    primaryAction: BUY,
    secondaryAction: COMPARE,
  },
  already_in_bag: {
    title: TITLE,
    subtitle: () => "Already in Bag",
    primaryAction: "View Bag",
    secondaryAction: COMPARE,
  },
  purchased_before: {
    title: TITLE,
    subtitle: () => "Purchased before",
    primaryAction: "Reorder",
    secondaryAction: "View order",
  },
};

export const DISMISS_LABEL = "Hide items from your Wishlist for this search";
export const DISMISSED_COPY = "Hidden for now";
export const UNDO_LABEL = "Undo";
export const VIEW_ALL = "View all matching Wishlist items";

/**
 * Constraint C-1: no monetary incentive of any kind. These patterns are banned
 * from the bundle, and a test fails the build if one appears. Urgency copy is
 * banned alongside discounting because both work by pressure rather than by
 * memory, which is the mechanism this feature is testing.
 */
export const BANNED_COPY_PATTERNS: RegExp[] = [
  /you forgot/i,
  /you were planning to buy/i,
  /buy now before/i,
  /only \d+ left/i,
  /price drop(ped)?/i,
  /\d+\s*%\s*off/i,
  /\bdiscount\b/i,
  /\bcoupon\b/i,
  /\bcashback\b/i,
  /\bsale\b/i,
  /\bdeal\b/i,
  /hurry/i,
  /last chance/i,
  /selling fast/i,
];

/** Neutral price rendering. No strike-through, no was/now, no savings. */
export function formatPrice(paise: number): string {
  return `₹${paise.toLocaleString("en-IN")}`;
}

export function formatDelivery(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  const day = date.toLocaleDateString("en-IN", { weekday: "short" });
  const rest = date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return `Delivery by ${day}, ${rest}`;
}
