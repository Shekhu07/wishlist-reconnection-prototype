import { formatAmount } from "./currency";
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

/**
 * The lifecycle a saved row is in, as a pill.
 *
 * The Wishlist list already knew all of this -- `reconcile()` derives it from
 * the bag and the order history -- and showed none of it, so a row the user
 * had already bought looked exactly like one they had not. These are state
 * words, not promotion: no urgency, no incentive, nothing about price, which
 * is what keeps them inside C-1. `none` renders no pill at all rather than a
 * reassuring one; the absence is the information.
 */
/** Taking a line back out of the bag. A correction, not an action. */
export const REMOVE_LABEL = "Remove";

export const LIFECYCLE_PILL: Record<string, string | null> = {
  none: null,
  in_bag: "In Bag",
  saved_for_later: "In Save for Later",
  purchased: "Purchased before",
  purchased_other_variant: "Purchased before",
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
  return formatAmount(paise);
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

/** Said in place of a delivery date the seller cannot actually promise. */
export const NOT_DELIVERABLE = "Not deliverable to this address";

/* ------------------------------------------------------------------ *
 * Decision Confidence Layer (wireframes Part A)
 * ------------------------------------------------------------------ */

/**
 * The only fit statement this catalog can support. There is no size chart and
 * no fit feedback in the dataset, so a per-product fit claim would be invented.
 */
export const FIT_PROMPT = "Check size guide";

export const CONFIDENCE_TITLE = "Decision confidence";
export const CONFIDENCE_EXPAND = "Check decision confidence";
export const CONFIDENCE_COLLAPSE = "Hide decision confidence";

export const SIGNAL_LABEL: Record<string, string> = {
  saved_variant: "Saved variant",
  size_availability: "Availability",
  colour_availability: "Colour",
  delivery: "Delivery",
  fit: "Fit",
  material: "Material",
  returns: "Returns",
  reviews: "Reviews",
  seller: "Seller",
  price: "Price",
};

/**
 * Where each signal comes from, shown as the "why" affordance section 7 asks
 * for. Naming the source is what separates evidence from persuasion: "based on
 * this brand's size guide" is answerable, "high fit confidence" is not.
 *
 * The four marked *prototype data* are generated by
 * tools/catalog/synthesize.py. Saying so on the signal itself, rather than once
 * in a banner, is deliberate -- a reader scanning one row would miss a banner.
 */
export const SIGNAL_SOURCE: Record<string, string> = {
  saved_variant: "From your Wishlist",
  size_availability: "Current inventory",
  colour_availability: "Current inventory",
  delivery: "This seller, for your delivery address",
  fit: "This listing's fit label · prototype data",
  material: "This listing's material · prototype data",
  returns: "This listing's return policy · prototype data",
  reviews: "Review count and average · prototype data",
  seller: "The current listing",
  price: "The current listing",
};

/* ------------------------------------------------------------------ *
 * Improvement 7 -- optional intent tags
 * ------------------------------------------------------------------ */

export const TAGS_HEADING = "Why did you save this?";
export const TAGS_OPTIONAL = "Optional. Only you see this, and you can remove it any time.";

/* ------------------------------------------------------------------ *
 * Improvement 9 -- look completion (later phase, off by default)
 * ------------------------------------------------------------------ */

export const LOOK_HEADING = "From your Wishlist, to go with this";
/**
 * The same section on a product page, which can afford to be warmer.
 *
 * Search is answering a query and has to point -- "to go with this" -- because
 * the thing being gone with is one result among several. A product page is
 * already showing the garment, full width, directly above. With nothing left
 * to disambiguate, the heading can address the person instead of the item.
 */
export const LOOK_HEADING_PDP = "Style it with your saved items";

export const SUGGESTIONS_SAVED_HEADING = "From your Wishlist";
export const SUGGESTIONS_ORGANIC_HEADING = "Suggestions";

export const PRODUCT_DESCRIPTION_HEADING = "Description";
/**
 * The description is composed from attributes rather than written, because no
 * description field exists and inventing marketing tone is what constraint 8
 * rules out. This note names the generated half.
 */
export const PRODUCT_DESCRIPTION_NOTE =
  "Prototype data: material, fit and returns are generated, not real.";
export const LOOK_NOTE = "Later-phase prototype. Drawn only from items you already saved.";
/**
 * Shown against a suggestion whose saved size has gone.
 *
 * The strip earns its seat for the outfit's slot rather than for what happens
 * to be in stock, so the only footwear a user saved can hold the footwear seat
 * while being unbuyable. Without this line the card reads as an ordinary
 * suggestion and the user finds out at the size selector.
 */
export const LOOK_SIZE_GONE = "No longer in your size";

/* ------------------------------------------------------------------ *
 * Improvement 10 -- later-phase input modes
 * ------------------------------------------------------------------ */

/**
 * Shown on any mode that is a labelled stand-in rather than the capability its
 * name implies. A demo that implies a capability the system does not have is
 * worse than no demo, because someone will make a decision on it.
 */
export const MODE_NOT_REAL = "Prototype state — not the capability this names.";

/* ------------------------------------------------------------------ *
 * Part B -- comparison re-entry (CR-01 .. CR-05)
 * ------------------------------------------------------------------ */

/** CR-01: says plainly that leaving will not destroy the comparison. */
export const KEEP_COMPARISON = "Keep comparison";
export const COMPARISON_KEPT = "Comparison kept — resume it from Search";

/** CR-02: the quiet bar. Never a modal, never blocking. */
export const RESUME_LABEL = "Resume";
export const RESUME_DISMISS = "Hide the comparison bar for this session";

/** CR-03: confirming what comes back before it comes back. */
export const RESUME_TITLE = "Resume your comparison";
export const RESUME_ACTION = "Resume comparison";
/**
 * A real alternative, not a decline. It clears the session comparison and
 * leaves the Wishlist untouched -- the wireframes say so explicitly, and a
 * "start fresh" that quietly removed saved items would be the worst kind of
 * surprise.
 */
export const START_FRESH = "Start fresh";
export const START_FRESH_DONE = "Comparison cleared. Your Wishlist is untouched.";

/** CR-04: the context bar on a product opened from the comparison. */
export const RETURN_TO_COMPARISON = "Return to comparison";

/** CR-05: something moved while the user was away. */
export const STALE_TITLE = "One item changed since you last compared";
export const STALE_TITLE_MANY = (n: number) =>
  `${n} items changed since you last compared`;
export const REVIEW_CHANGES = "Review changes";
export const CHANGE_COPY: Record<string, string> = {
  size_unavailable: "no longer available in your size",
  withdrawn: "no longer available",
  delivery_changed: "delivery to this address has changed",
};

/* ------------------------------------------------------------------ *
 * Improvement 3 -- what happens after Move to Bag
 * ------------------------------------------------------------------ */

/**
 * The provenance line the edge-case table asks for: "Added to Bag from
 * Wishlist" and "Added to Bag from comparison" are different sentences,
 * because where the decision came from is the thing this feature measures.
 */
/**
 * The saved-item screen is reachable from search results, from a comparison,
 * and from the Wishlist page. A hardcoded "Back to results" names a place the
 * user may never have been, so the caller says which one it was.
 */
export const BACK_LABELS = {
  results: { text: "← Back to results", accessibilityLabel: "Back to search results" },
  wishlist: { text: "← Back to Wishlist", accessibilityLabel: "Back to Wishlist" },
} as const;

export type BackOrigin = keyof typeof BACK_LABELS;

export const ADDED_FROM_WISHLIST = "Added to Bag from Wishlist";
export const ADDED_FROM_COMPARISON = "Added to Bag from comparison";
export const ADDED_DUPLICATE = "Already in your Bag — not added twice";

export const AFTER_ADD_VIEW_BAG = "View Bag";
export const AFTER_ADD_KEEP_COMPARING = "Continue comparing";
export const AFTER_ADD_KEEP_BROWSING = "Keep browsing";

/* ------------------------------------------------------------------ *
 * DC-02 -- "Why this appeared?"
 * ------------------------------------------------------------------ */

export const WHY_LINK = "Why this appeared?";
export const WHY_TITLE = "Why are you seeing this?";
export const WHY_BODY = [
  "Your search matches a product in your Wishlist.",
  "We show it here so you can revisit your saved choice without searching for it again.",
];
export const WHY_VIEW_ITEM = "View saved item";
export const WHY_HIDE_SEARCH = "Hide for this search";
export const WHY_HIDE_ALWAYS = "Hide Wishlist matches in Search";
export const WHY_CLOSE = "Close";

/**
 * Section 5: the explanation must not reveal occasion tags or private intent
 * unless the user chose to display them. So the sheet says what matched --
 * the product -- and never why the user might have saved it.
 */

/** The four statuses, as text a screen reader can read out. */
export const SIGNAL_STATUS_LABEL: Record<string, string> = {
  ok: "Confirmed",
  attention: "Worth knowing",
  blocked: "Blocking",
  unknown: "No claim made",
};

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
  // Backed by Colourway.usage and .season, which are real dataset columns --
  // unlike five of the axes above. The priority selector offers "Occasion", and
  // an invented answer there would be the exact thing constraint 8 of the
  // improvement prompt forbids.
  { key: "occasion", label: "Occasion" },
] as const;

export type CompareAxisKey = (typeof COMPARE_AXES)[number]["key"];

/** Shown once above the table, because five of the eight axes are invented. */
export const COMPARE_SYNTHETIC_NOTE =
  "Prototype data: rating, reviews, material, fit and returns are generated, not real.";
