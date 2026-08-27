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
  saved_for_later: {
    title: TITLE,
    // They moved this out of their bag on purpose. Saying so is more useful
    // than pretending this is the first time they have seen it today.
    subtitle: () => "In your Save for Later",
    primaryAction: "Move to Bag",
    secondaryAction: "View Save for Later",
  },
  purchased_before: {
    title: TITLE,
    subtitle: () => "Purchased before",
    primaryAction: "Reorder",
    secondaryAction: "View order",
  },
  purchased_other_variant: {
    title: TITLE,
    // For fashion this is usually a sizing story rather than a repeat
    // purchase, so it gets its own line instead of a generic "bought before".
    subtitle: (ctx) => `You bought this before in a different ${ctx.savedColour ? "colour or size" : "variant"}`,
    primaryAction: "Buy from Wishlist",
    secondaryAction: "View order",
  },
};

export const DISMISS_LABEL = "Hide items from your Wishlist for this search";
export const DISMISSED_COPY = "Hidden for now";
export const UNDO_LABEL = "Undo";
/**
 * The durable control, offered alongside undo rather than instead of the
 * dismiss. FR-8 is explicit that dismissing is a relevance signal and never a
 * permanent opt-out, so the permanent version has to be its own deliberate
 * choice -- reachable, but not something you land on by tapping a close box.
 */
export const HIDE_FOREVER_LABEL = "Don't show this again";
export const HIDDEN_FOREVER_COPY = "Hidden from search";
export const UNHIDE_LABEL = "Unhide";
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

/* ------------------------------------------------------------------ *
 * E5 -- recovery at the action boundary (section 4.14)
 * ------------------------------------------------------------------ */

export interface RecoveryCopy {
  title: string;
  body: string;
  /** Moves the user forward. Never a Buy button that cannot buy (FR-7). */
  primaryAction: string;
  secondaryAction: string;
}

export interface RecoveryContext {
  size: string;
  colour: string;
  seller: string;
  pincode: string;
}

/**
 * One named state per blocking reason. Section 4.14 rules out a generic error,
 * and the reason a generic error is wrong here is that every one of these has
 * a different next step -- pick another size, pick another colour, change the
 * address, or let the item go.
 */
export const RECOVERY_COPY: Record<string, (ctx: RecoveryContext) => RecoveryCopy> = {
  variant_unavailable: (ctx) => ({
    title: `Size ${ctx.size} sold out`,
    body: `Your saved ${ctx.colour} in size ${ctx.size} went out of stock after you searched. Nothing has been changed for you.`,
    primaryAction: "See what's in stock",
    secondaryAction: "Keep in Wishlist",
  }),
  product_unavailable: () => ({
    title: "No longer available",
    body: "This product has been withdrawn in every colour and size. It stays in your Wishlist until you remove it.",
    // Section 4.2: identity plus similar styles, and never a dead-end Buy.
    primaryAction: "See similar styles",
    secondaryAction: "Remove from Wishlist",
  }),
  delivery_unavailable: (ctx) => ({
    title: `No delivery to ${ctx.pincode}`,
    body: `${ctx.seller} does not currently ship to this address. The item is still available elsewhere.`,
    primaryAction: "Change delivery address",
    secondaryAction: "Keep in Wishlist",
  }),
};

/**
 * Advisories do not block the purchase; they are facts the user should see
 * before committing. Stated without a direction of travel: "it went down" is
 * an incentive, and constraint C-1 rules incentives out entirely.
 */
export const ADVISORY_COPY: Record<string, string> = {
  price_changed: "The price has changed since you saved this",
  seller_changed: "This is now sold by a different seller",
};

export function formatReturns(days: number): string {
  return days === 0 ? "Not returnable" : `${days}-day returns`;
}

/* ------------------------------------------------------------------ *
 * E6 -- compare options
 * ------------------------------------------------------------------ */

export const COMPARE_TITLE = "Compare options";
export const COMPARE_SAVED_LABEL = "Your saved item";

/**
 * The comparison axes named in the plan's E6, in order.
 *
 * There is deliberately no discount, offer or savings axis. Constraint C-1
 * bans monetary incentive, and a comparison table is exactly where one would
 * creep back in disguised as a column.
 */
export const COMPARE_AXES = [
  { key: "price", label: "Price" },
  { key: "rating", label: "Rating" },
  { key: "review_count", label: "Reviews" },
  { key: "material", label: "Material" },
  { key: "fit", label: "Fit" },
  { key: "sizes", label: "Your size" },
  { key: "delivery", label: "Delivery" },
  { key: "returns", label: "Returns" },
] as const;

export type CompareAxisKey = (typeof COMPARE_AXES)[number]["key"];

/** Shown once above the table, because five of the eight axes are invented. */
export const COMPARE_SYNTHETIC_NOTE =
  "Prototype data: rating, reviews, material, fit and returns are generated, not real.";
