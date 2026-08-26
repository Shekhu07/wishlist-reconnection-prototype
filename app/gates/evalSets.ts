import type { Catalog, Colourway, ParentProduct, Wishlist } from "@/data/types";

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

/** Deterministic PRNG, so a failing run can be reproduced exactly. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

export interface LabelledPair {
  id: string;
  savedProductId: number;
  savedParentId: string;
  query: string;
  /** Ground truth: should the module render this saved item for this query? */
  shouldMatch: boolean;
  kind: "positive" | "negative_brand" | "negative_category" | "negative_unrelated";
}

interface Entry {
  parent: ParentProduct;
  colourway: Colourway;
}

function entries(catalog: Catalog): Entry[] {
  return catalog.parents.flatMap((parent) =>
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
    const kind = (["positive", "negative_brand", "negative_category", "negative_unrelated"] as const)[
      index % 4
    ];

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

    pairs.push({
      id: `pair_${index}`,
      savedProductId: saved.colourway.product_id,
      savedParentId: saved.parent.parent_product_id,
      query,
      shouldMatch: kind === "positive",
      kind,
    });
  }
  return pairs;
}

/** A one-item wishlist for a pair, so the measurement isolates one decision. */
export function wishlistFor(pair: LabelledPair, catalog: Catalog): Wishlist | null {
  const parent = catalog.parents.find((p) => p.parent_product_id === pair.savedParentId);
  const colourway = parent?.colourways.find((c) => c.product_id === pair.savedProductId);
  if (!parent || !colourway) return null;
  const size = parent.sizes[Math.floor(parent.sizes.length / 2)];
  const sku = colourway.skus.find((s) => s.size === size) ?? colourway.skus[0];
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
        state: "normal",
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
