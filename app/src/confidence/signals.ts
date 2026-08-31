import type { Colourway } from "@/data/types";
import type { RevalidationResult } from "@/revalidation/revalidate";
import {
  NOT_DELIVERABLE,
  SIGNAL_SOURCE,
  formatDelivery,
  formatPrice,
  formatReturns,
} from "@/copy/bundle";

/**
 * The Decision Confidence Layer (wireframes Part A).
 *
 * A confidence signal is a value, not a string. The reason is the wireframes'
 * own rule in section 7: "Size guidance is based on this brand's size guide" is
 * preferable to an unexplained "High fit confidence". A signal that cannot say
 * where it came from has no business claiming anything, so `source` is
 * mandatory and `synthetic` is not optional either -- five of the fields this
 * reads are SHA-1 synthesised by tools/catalog/synthesize.py, and presenting
 * those as real marketplace data is forbidden outright.
 *
 * Everything here is derived from `RevalidationResult`, the *binding* read. The
 * module's compact summary is advisory and is allowed to be contradicted by
 * this a tap later; that disagreement is two-phase freshness working, not a bug.
 */

export type SignalKey =
  | "saved_variant"
  | "size_availability"
  | "colour_availability"
  | "delivery"
  | "fit"
  | "material"
  | "returns"
  | "reviews"
  | "seller"
  | "price";

/**
 * What the signal says about the decision -- deliberately not a score.
 *
 *   ok        supports the purchase
 *   attention worth knowing before committing; does not block
 *   blocked   the purchase cannot proceed on this variant
 *   unknown   we state the fact and claim no verdict
 *
 * `unknown` is a first-class outcome rather than a missing value. Section 6
 * requires review *coverage* to be distinguished from a quality judgement, and
 * there is no fit data in this catalog at all -- so fit and reviews are
 * permanently unknown, and saying so is the honest rendering.
 */
export type SignalStatus = "ok" | "attention" | "blocked" | "unknown";

export interface ConfidenceSignal {
  key: SignalKey;
  status: SignalStatus;
  /** The one line the summary shows. */
  value: string;
  /** Where the value came from. Never empty -- see the DC provenance gate. */
  source: string;
  /** True where the underlying field is generated rather than real. */
  synthetic: boolean;
  /** The expansion shown in the DC-04 detail sheet. */
  detail?: string;
}

export interface SelectedVariant {
  size: string;
  colour: string;
}

/** The saved variant, as a display string. Section 4: always shown explicitly. */
export function savedVariantLabel(colour: string, size: string): string {
  return `${colour} · ${size}`;
}

/**
 * Signals in the order DC-03 renders them. The caller slices; nothing here
 * decides how many to show, because "which signals matter" is a layout
 * question and "what is true" is not.
 */
export function signalsFor(
  result: RevalidationResult,
  selected: SelectedVariant
): ConfidenceSignal[] {
  const { item, parent, current } = result;
  const chosen = colourwayFor(result, selected.colour);
  const sizesForChosen = result.sizesByColour[chosen.product_id] ?? [];
  const deviates =
    selected.size !== item.size || selected.colour !== item.colour;

  return [
    savedVariantSignal(item.colour, item.size, deviates, selected),
    sizeSignal(selected, sizesForChosen, parent.sizes),
    colourSignal(result, selected, chosen),
    deliverySignal(current.delivery_by, current.seller),
    fitSignal(chosen),
    materialSignal(chosen),
    returnsSignal(chosen),
    reviewsSignal(chosen),
    sellerSignal(current.seller, item.seller_at_save),
    priceSignal(current.price, item.price_at_save),
  ];
}

/**
 * The colourway the user is currently looking at. Falls back to the saved one
 * rather than throwing: a colour that has left the catalog entirely is a state
 * the panel has to survive, not an impossible input.
 */
function colourwayFor(result: RevalidationResult, colour: string): Colourway {
  return (
    result.parent.colourways.find((c) => c.colour === colour) ?? result.colourway
  );
}

function savedVariantSignal(
  savedColour: string,
  savedSize: string,
  deviates: boolean,
  selected: SelectedVariant
): ConfidenceSignal {
  const saved = savedVariantLabel(savedColour, savedSize);
  return {
    key: "saved_variant",
    status: deviates ? "attention" : "ok",
    // FR-7 and wireframe DC-05: the saved variant stays visible as a reference
    // even once the user has selected something else. It is never overwritten
    // by the new selection, only shown alongside it.
    value: deviates
      ? `New selection: ${savedVariantLabel(selected.colour, selected.size)} · Originally saved: ${saved}`
      : saved,
    source: SIGNAL_SOURCE.saved_variant,
    synthetic: false,
  };
}

function sizeSignal(
  selected: SelectedVariant,
  sizesForChosenColour: string[],
  allSizes: string[]
): ConfidenceSignal {
  const available = sizesForChosenColour.includes(selected.size);
  const othersAvailable = sizesForChosenColour.length > 0;
  return {
    key: "size_availability",
    status: available ? "ok" : "blocked",
    value: available
      ? `Size ${selected.size} available`
      : `Size ${selected.size} unavailable`,
    source: SIGNAL_SOURCE.size_availability,
    synthetic: false,
    detail: available
      ? undefined
      : othersAvailable
        ? `In stock in ${sizesForChosenColour.join(", ")}. Nothing has been changed for you.`
        : `No size of this colour is in stock. This style comes in ${allSizes.join(", ")}.`,
  };
}

function colourSignal(
  result: RevalidationResult,
  selected: SelectedVariant,
  chosen: Colourway
): ConfidenceSignal {
  const { coloursInStock } = result.current;
  const available = coloursInStock.includes(chosen.colour);
  const others = coloursInStock.filter((c) => c !== chosen.colour);
  // Wireframe DC-06: the saved colour label survives even when the card is
  // showing a different one. The user must never mistake a fallback colour for
  // the colour they chose.
  const savedGone = !coloursInStock.includes(result.item.colour);
  return {
    key: "colour_availability",
    status: available ? "ok" : "blocked",
    value: available
      ? `${chosen.colour} available`
      : savedGone
        ? `Saved colour ${result.item.colour} unavailable`
        : `${chosen.colour} unavailable`,
    source: SIGNAL_SOURCE.colour_availability,
    synthetic: false,
    detail: others.length ? `Also available in ${others.join(", ")}.` : undefined,
  };
}

function deliverySignal(deliveryBy: string | null, seller: string): ConfidenceSignal {
  return {
    key: "delivery",
    status: deliveryBy ? "ok" : "blocked",
    value: deliveryBy ? formatDelivery(deliveryBy) : NOT_DELIVERABLE,
    source: SIGNAL_SOURCE.delivery,
    synthetic: false,
    detail: deliveryBy ? undefined : `${seller} does not currently ship to this address.`,
  };
}

/**
 * Fit is permanently `unknown`, and that is a data fact rather than a
 * placeholder: this catalog carries no size chart, no measurements and no fit
 * feedback. `Colourway.fit` is a single synthesised label. A fit *score* here
 * would be the clearest possible case of presenting generated data as real.
 */
function fitSignal(colourway: Colourway): ConfidenceSignal {
  return {
    key: "fit",
    status: "unknown",
    value: colourway.fit ? `${colourway.fit} · Check size guide` : "Check size guide",
    source: SIGNAL_SOURCE.fit,
    synthetic: true,
    detail: "Refer to brand size chart for exact measurements.",
  };
}

function materialSignal(colourway: Colourway): ConfidenceSignal {
  return {
    key: "material",
    status: "unknown",
    value: colourway.material,
    source: SIGNAL_SOURCE.material,
    synthetic: true,
  };
}

function returnsSignal(colourway: Colourway): ConfidenceSignal {
  return {
    key: "returns",
    status: colourway.returns_days > 0 ? "ok" : "attention",
    value: formatReturns(colourway.returns_days),
    source: SIGNAL_SOURCE.returns,
    synthetic: true,
  };
}

/**
 * Coverage, not quality (section 6). The count and the average are stated; no
 * verdict is drawn from them, which is why this is `unknown` rather than `ok`.
 */
function reviewsSignal(colourway: Colourway): ConfidenceSignal {
  return {
    key: "reviews",
    status: "unknown",
    value: `${colourway.rating.toFixed(1)} ★ from ${colourway.review_count.toLocaleString("en-IN")} reviews`,
    source: SIGNAL_SOURCE.reviews,
    synthetic: true,
  };
}

function sellerSignal(seller: string, sellerAtSave: string): ConfidenceSignal {
  const changed = Boolean(sellerAtSave) && seller !== sellerAtSave;
  return {
    key: "seller",
    status: changed ? "attention" : "ok",
    value: seller,
    source: SIGNAL_SOURCE.seller,
    synthetic: false,
    detail: changed ? `You saved this when it was sold by ${sellerAtSave}.` : undefined,
  };
}

/**
 * Current price only. Section 6 forbids historical-price urgency, so a change
 * is stated without a direction of travel -- "it went down" is an incentive and
 * constraint C-1 rules incentives out entirely.
 */
function priceSignal(price: number, priceAtSave: number): ConfidenceSignal {
  const changed = price !== priceAtSave;
  return {
    key: "price",
    status: changed ? "attention" : "ok",
    value: formatPrice(price),
    source: SIGNAL_SOURCE.price,
    synthetic: false,
    // Both numbers, so the user can see the change for themselves, and no
    // sentence connecting them. Naming the direction is what would turn this
    // from a fact into the incentive C-1 rules out.
    detail: changed
      ? `The price has changed since you saved this. You saved it at ${formatPrice(priceAtSave)}.`
      : undefined,
  };
}

/** DC-01's compact summary: what the module shows before the user asks for more. */
export const SUMMARY_SIGNALS: SignalKey[] = [
  "saved_variant",
  "size_availability",
  "delivery",
  "fit",
];

export function summaryOf(signals: ConfidenceSignal[]): ConfidenceSignal[] {
  return SUMMARY_SIGNALS.map((key) => signals.find((s) => s.key === key)).filter(
    (s): s is ConfidenceSignal => s !== undefined
  );
}
