import type { Catalog, Colourway, ParentProduct, Wishlist } from "@/data/types";
import { realParents } from "@/analytics/catalog";

/**
 * Evaluation sets for the E1 and E2 acceptance gates.
 *
 * The plan asks for a *hand-labelled* 500-pair set. These labels are generated,
 * and that difference is not cosmetic: the generator derives brand and article
 * type the same way the matcher's gazetteer does, so a systematic error in that
 * derivation is invisible to both and cancels out. What this set can prove is
 * that the matcher behaves correctly *given* correctly-extracted fields, and
 * that behaviour has not regressed. What it cannot prove is that the fields are
 * right in the first place. A real Phase 1 exit still needs human labels.
 *
 * Every gate carries that caveat into the report rather than burying it here.
 */

import { seeded } from "./random";

export { seeded };

export function pick<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

/**
 * What the module is allowed to do for a pair.
 *
 * Three values rather than two, because "must not render as an exact match"
 * and "must not render at all" are different requirements, and collapsing them
 * makes a correct answer score as a false positive. A query naming a colour the
 * user did not save must not produce a tier 1 card -- but offering that colour
 * as a labelled tier 2 variant is exactly right.
 */
export type PairExpectation = "tier1" | "tier2_or_none" | "none";

export interface LabelledPair {
  id: string;
  savedProductId: number;
  savedParentId: string;
  /** Chosen with stock in mind, so the expectation below is reachable. */
  savedSize: string;
  query: string;
  expect: PairExpectation;
  /** Convenience for the positive case. */
  shouldMatch: boolean;
  kind:
    | "positive"
    | "negative_brand"
    | "negative_category"
    | "negative_colour"
    | "negative_unrelated";
}

interface Entry {
  parent: ParentProduct;
  colourway: Colourway;
}

function entries(catalog: Catalog): Entry[] {
  // The synthetic home range is invented data (see ParentProduct.synthetic).
  // A precision or recall figure computed partly over invented products would
  // be measuring the generator, not the matcher, so it is excluded here.
  return realParents(catalog).flatMap((parent) =>
    parent.colourways.map((colourway) => ({ parent, colourway }))
  );
}

/**
 * Half positives, half near-miss negatives.
 *
 * The negatives are deliberately close. A negative set of nonsense strings
 * would measure nothing -- any threshold passes when the alternatives are
 * absurd. Same brand/wrong category and wrong brand/same category are the
 * cases a real user actually generates.
 */
export function buildLabelledPairs(catalog: Catalog, count = 500): LabelledPair[] {
  const random = seeded(20260826);
  const all = entries(catalog);
  const pairs: LabelledPair[] = [];

  while (pairs.length < count) {
    const saved = pick(all, random);
    const index = pairs.length;
    const kind = (
      [
        "positive",
        "negative_brand",
        "negative_category",
        "negative_colour",
        "negative_unrelated",
      ] as const
    )[index % 5];

    let query: string;
    if (kind === "positive") {
      query = `${saved.parent.brand} ${saved.parent.articleType}`.toLowerCase();
    } else if (kind === "negative_brand") {
      // Same category, a brand the user did not save. The brand predicate
      // should exclude it (FR-9).
      const other = all.find(
        (candidate) =>
          candidate.parent.articleType === saved.parent.articleType &&
          candidate.parent.brand_key !== saved.parent.brand_key
      );
      if (!other) continue;
      query = `${other.parent.brand} ${other.parent.articleType}`.toLowerCase();
    } else if (kind === "negative_colour") {
      // The right brand and category, the wrong colour. This is the only
      // negative that the hard predicates cannot catch: a colour in the query
      // text is parsed into intent and priced through variant alignment, so
      // rejecting it is tau's job and nothing else's. Without a case like this
      // the sweep has nothing to discriminate and will happily recommend the
      // lowest threshold on the table.
      const otherColour = saved.parent.colourways.find(
        (candidate) => candidate.colour !== saved.colourway.colour
      );
      if (!otherColour) continue;
      query = `${saved.parent.brand} ${otherColour.colour} ${saved.parent.articleType}`.toLowerCase();
    } else if (kind === "negative_category") {
      // The saved brand, a category the user did not save in it.
      const other = all.find(
        (candidate) => candidate.parent.articleType !== saved.parent.articleType
      );
      if (!other) continue;
      query = `${saved.parent.brand} ${other.parent.articleType}`.toLowerCase();
    } else {
      query = pick(
        ["formal blazer", "wedding sherwani", "yoga mat", "cricket bat", "table lamp"],
        random
      );
    }

    // Prefer a size actually in stock in the saved colourway. About a fifth of
    // the seeded catalog is out of stock, and a positive whose saved variant
    // cannot be bought is a tier 2 case by design -- labelling it tier 1 would
    // measure the fixture rather than the matcher.
    const stockedSku = saved.colourway.skus.find((sku) => sku.in_stock);
    const savedSize = (stockedSku ?? saved.colourway.skus[0]).size;

    const expect: PairExpectation =
      kind === "positive"
        ? stockedSku
          ? "tier1"
          : "tier2_or_none"
        : kind === "negative_colour"
          ? "tier2_or_none"
          : "none";

    pairs.push({
      id: `pair_${index}`,
      savedProductId: saved.colourway.product_id,
      savedParentId: saved.parent.parent_product_id,
      savedSize,
      query,
      expect,
      shouldMatch: kind === "positive",
      kind,
    });
  }
  return pairs;
}

/**
 * Whether a rendered result satisfies a pair's expectation.
 *
 * Shared by the E1 gate and the threshold sweep on purpose. When they each
 * had their own copy of this rule the sweep silently kept the older, binary
 * version and reported 53% precision for a matcher measuring 100%.
 */
export function isAcceptable(
  pair: LabelledPair,
  rendered: { sku: string; tier: number; parent_product_id: string } | undefined,
  savedSku: string
): boolean {
  const rightItem =
    rendered !== undefined &&
    rendered.sku === savedSku &&
    rendered.parent_product_id === pair.savedParentId;

  switch (pair.expect) {
    case "tier1":
      return rightItem && rendered!.tier === 1;
    case "tier2_or_none":
      return rendered === undefined || (rightItem && rendered.tier === 2);
    case "none":
      return rendered === undefined;
  }
}

/** A one-item wishlist for a pair, so the measurement isolates one decision. */
export function wishlistFor(pair: LabelledPair, catalog: Catalog): Wishlist | null {
  const parent = catalog.parents.find((p) => p.parent_product_id === pair.savedParentId);
  const colourway = parent?.colourways.find((c) => c.product_id === pair.savedProductId);
  if (!parent || !colourway) return null;
  const sku =
    colourway.skus.find((candidate) => candidate.size === pair.savedSize) ?? colourway.skus[0];
  return {
    user_id: "u_eval",
    pincode: "560034",
    items: [
      {
        item_id: `wi_${pair.id}`,
        role: "eval",
        parent_product_id: parent.parent_product_id,
        product_id: colourway.product_id,
        sku: sku.sku,
        colour: colourway.colour,
        size: sku.size,
        saved_at: catalog.today,
        price_at_save: colourway.price,
        seller_at_save: colourway.seller,
      },
    ],
  };
}

export interface QueryCase {
  query: string;
  expected: {
    brand?: string;
    articleType?: string;
    colour?: string;
    gender?: string;
  };
}

/**
 * Queries assembled from known catalog values, so the expected extraction is
 * known by construction. Fields are included at random, because a parser that
 * only works when every field is present is not a parser.
 */
export function buildQueryEvalSet(catalog: Catalog, count = 1000): QueryCase[] {
  const random = seeded(987654321);
  const all = entries(catalog);
  const cases: QueryCase[] = [];

  while (cases.length < count) {
    const { parent, colourway } = pick(all, random);
    const includeBrand = random() < 0.7;
    const includeColour = random() < 0.5;
    const includeGender = random() < 0.4;
    // Article type is always present: a fashion query without one is a
    // different problem than the one this parser is being measured on.
    const terms: string[] = [];
    const expected: QueryCase["expected"] = { articleType: parent.articleType };

    if (includeBrand) {
      terms.push(parent.brand);
      expected.brand = parent.brand;
    }
    if (includeGender) {
      terms.push(parent.gender);
      expected.gender = parent.gender;
    }
    if (includeColour) {
      terms.push(colourway.colour);
      expected.colour = colourway.colour;
    }
    terms.push(parent.articleType);

    cases.push({ query: terms.join(" ").toLowerCase(), expected });
  }
  return cases;
}
