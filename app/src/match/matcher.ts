import {
  DEFAULT_CONFIG,
  EMPTY_RESPONSE,
  type CopyKey,
  type ItemState,
  type Match,
  type MatchConfig,
  type MatchRequest,
  type MatchResponse,
  type MatchTier,
  type SearchFilters,
} from "./contract";
import { buildGazetteers, mergeFilters, normalise, parseIntent, type Gazetteers } from "./intent";
import { DEFAULT_RANKING, selectForModule, type Rankable } from "./ranking";
import type { Catalog, Colourway, ParentProduct, Wishlist, WishlistItem } from "@/data/types";
import {
  reconcile,
  type CommerceState,
  type DuplicateState,
} from "@/commerce/reconcile";

/**
 * E3, tiers 1 and 2 only.
 *
 * Tier 1 is the same canonical product and the same saved colourway. Tier 2 is
 * the same canonical product in a different colour. Tier 3 (semantic) and
 * Tier 4 (visual) are excluded from v1 by constraint C-5 and are not stubbed
 * here -- an empty branch is easier to mistake for a bug than an absent one.
 */

export interface MatchIndex {
  catalog: Catalog;
  wishlist: Wishlist;
  gaz: Gazetteers;
  parents: Map<string, ParentProduct>;
  colourwayByProduct: Map<number, { parent: ParentProduct; colourway: Colourway }>;
  /**
   * Bag, Save for Later and orders. Held by reference and read on every match,
   * never snapshotted: the bag changes *between* calls, and caching the
   * reconciliation at index-build time reproduced the exact staleness this
   * derivation exists to remove -- add an item and the module went on saying
   * "you saved this earlier" until the client was rebuilt.
   */
  commerce: CommerceState;
}

const EMPTY_COMMERCE: CommerceState = {
  bag: { items: [] },
  savedForLater: { items: [] },
  orders: { orders: [] },
};

export function buildIndex(
  catalog: Catalog,
  wishlist: Wishlist,
  commerce: CommerceState = EMPTY_COMMERCE
): MatchIndex {
  const parents = new Map<string, ParentProduct>();
  const colourwayByProduct = new Map<number, { parent: ParentProduct; colourway: Colourway }>();
  for (const parent of catalog.parents) {
    parents.set(parent.parent_product_id, parent);
    for (const colourway of parent.colourways) {
      colourwayByProduct.set(colourway.product_id, { parent, colourway });
    }
  }
  return {
    catalog,
    wishlist,
    gaz: buildGazetteers(catalog.parents),
    parents,
    colourwayByProduct,
    commerce,
  };
}

function passesHardFilters(parent: ParentProduct, filters: SearchFilters): boolean {
  // FR-9: filters are predicates, not preferences. A saved item that does not
  // conform is hidden rather than down-ranked.
  if (filters.brand?.length && !filters.brand.some((b) => normalise(b) === normalise(parent.brand))) {
    return false;
  }
  if (
    filters.articleType?.length &&
    !filters.articleType.some((a) => normalise(a) === normalise(parent.articleType))
  ) {
    return false;
  }
  if (filters.gender?.length && !filters.gender.some((g) => normalise(g) === normalise(parent.gender))) {
    return false;
  }
  return true;
}

function passesPriceFilter(colourway: Colourway, filters: SearchFilters): boolean {
  if (filters.price_max !== undefined && colourway.price > filters.price_max) return false;
  if (filters.price_min !== undefined && colourway.price < filters.price_min) return false;
  return true;
}

/** Days between an ISO date and the catalog's fixed "today". */
function daysSince(iso: string, today: string): number {
  const then = Date.parse(`${iso}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  return Math.max(0, Math.round((now - then) / 86_400_000));
}

function recencyScore(savedAt: string, today: string): number {
  // Half-life of roughly six weeks: recent saves are stronger evidence of
  // live intent, but an old save is not worthless.
  return Math.exp(-daysSince(savedAt, today) / 42);
}

interface Candidate {
  item: WishlistItem;
  parent: ParentProduct;
  colourway: Colourway;
  tier: MatchTier;
  score: number;
  itemState: ItemState;
  sizeInStock: boolean;
  anySizeInStock: boolean;
}

function classify(
  item: WishlistItem,
  colourway: Colourway,
  parent: ParentProduct,
  duplicate: DuplicateState
): { itemState: ItemState; sizeInStock: boolean; anySizeInStock: boolean } {
  // Match on size, not on the saved SKU id: for a tier 2 colourway the saved
  // SKU belongs to a different colourway and can never be found here, and the
  // old fallback to skus[0] silently reported stock for an unrelated size.
  const sku = colourway.skus.find((s) => s.size === item.size);
  const sizeInStock = Boolean(sku?.in_stock);
  const anySizeInStock = parent.colourways.some((c) => c.skus.some((s) => s.in_stock));

  // A duplicate state outranks availability: telling someone the item is
  // already in their bag matters more than telling them it is in stock.
  if (duplicate === "in_bag") return { itemState: "in_bag", sizeInStock, anySizeInStock };
  if (duplicate === "saved_for_later") {
    return { itemState: "saved_for_later", sizeInStock, anySizeInStock };
  }
  if (duplicate === "purchased" || duplicate === "purchased_other_variant") {
    return { itemState: "purchased", sizeInStock, anySizeInStock };
  }
  if (!anySizeInStock) return { itemState: "product_unavailable", sizeInStock, anySizeInStock };
  if (!sizeInStock) return { itemState: "variant_unavailable", sizeInStock, anySizeInStock };
  return { itemState: "purchasable", sizeInStock, anySizeInStock };
}

function copyKeyFor(
  candidate: Candidate,
  totalMatches: number,
  filters: SearchFilters,
  duplicate: DuplicateState
): CopyKey {
  if (candidate.itemState === "in_bag") return "already_in_bag";
  if (candidate.itemState === "saved_for_later") return "saved_for_later";
  if (duplicate === "purchased_other_variant") return "purchased_other_variant";
  if (candidate.itemState === "purchased") return "purchased_before";
  if (totalMatches > 1) return "multiple_matches";
  if (candidate.itemState === "variant_unavailable" || candidate.itemState === "product_unavailable") {
    return "exact_variant_unavailable";
  }
  if (candidate.tier === 2) return "colour_variant_available";
  // A size filter on the query means the user asked about size explicitly, so
  // confirming the saved size is the more useful line.
  if (filters.size?.length) return "saved_size_available";
  return "exact_variant_available";
}

/**
 * Does the query actually refer to this product at all?
 *
 * Without this gate the neutral defaults below (an absent field scores 0.5)
 * add up to roughly tau on their own, so an unparseable query like "formal
 * blazer" scored high enough to surface every saved item. Precision beats
 * recall (constraint C-4), so a query that provides no positive link to the
 * product scores zero and never renders.
 */
export function evidenceFor(
  intent: ReturnType<typeof parseIntent>,
  parent: ParentProduct,
  colourway: Colourway
): number {
  if (
    intent.articleType &&
    normalise(intent.articleType.value) === normalise(parent.articleType)
  ) {
    return 1;
  }
  if (intent.brand && normalise(intent.brand.value) === normalise(parent.brand)) {
    return 1;
  }
  // Failing a structured hit, a leftover query term has to appear in the
  // product's own text. A colour alone is deliberately not enough: "black"
  // would otherwise reach every black item the user ever saved.
  const haystack = new Set(
    normalise(
      [parent.display_name, colourway.display_name, parent.subCategory].join(" ")
    ).split(" ")
  );
  return intent.residual.some((term) => haystack.has(term)) ? 0.7 : 0;
}

export function score(candidate: Omit<Candidate, "score">, index: MatchIndex, intent: ReturnType<typeof parseIntent>, config: MatchConfig): number {
  const w = config.weights;
  const { parent, colourway, item, tier } = candidate;

  const evidence = evidenceFor(intent, parent, colourway);
  if (evidence === 0) return 0;

  // Tier 2 is the same canonical product, so its identity claim is nearly as
  // strong as tier 1. The colour difference belongs to variant_align; charging
  // it to identity as well double-counted it and put every tier 2 candidate
  // under tau, which is why none ever rendered.
  const identity = tier === 1 ? 1 : 0.92;
  const categoryAlign = intent.articleType
    ? normalise(intent.articleType.value) === normalise(parent.articleType)
      ? intent.articleType.confidence
      : 0
    : 0.5;
  const brandAlign = intent.brand
    ? normalise(intent.brand.value) === normalise(parent.brand)
      ? intent.brand.confidence
      : 0
    : 0.5;
  const variantAlign = intent.colour
    ? normalise(intent.colour.value) === normalise(colourway.colour)
      ? 1
      : 0.2
    : 0.6;
  const recency = recencyScore(item.saved_at, index.catalog.today);
  // No behavioural log exists in a greenfield prototype, so prior engagement
  // is a constant rather than a fabricated signal. It stays in the formula
  // because Phase 3 will have real data to put here.
  const priorEngagement = 0.5;

  const raw =
    w.identity * identity +
    w.category_align * categoryAlign +
    w.brand_align * brandAlign +
    w.variant_align * variantAlign +
    w.recency * recency +
    w.prior_engagement * priorEngagement;

  // A generic parent ("plain men's shirt") groups many unrelated styles, so it
  // is a weaker identity claim and is held to a higher bar.
  const specificityPenalty = parent.specific ? 1 : 0.88;
  return raw * evidence * specificityPenalty * colourway.identity_confidence;
}

export function match(request: MatchRequest, index: MatchIndex, config: MatchConfig = DEFAULT_CONFIG): MatchResponse {
  const intent = parseIntent(request.query, request.modality, index.gaz);
  const filters = mergeFilters(intent, request.filters);
  const tau = config.tau[request.modality] ?? config.tau.text;

  const candidates: Candidate[] = [];
  for (const item of index.wishlist.items) {
    const parent = index.parents.get(item.parent_product_id);
    if (!parent) continue;
    if (!passesHardFilters(parent, filters)) continue;
    // FR-9 again, at item level: a size filter is a predicate on the saved
    // variant. A saved L is hidden when the user has filtered to M -- it is
    // not shown and quietly relabelled.
    if (filters.size?.length && !filters.size.some((s) => s === item.size)) continue;

    const saved = parent.colourways.find((c) => c.product_id === item.product_id);
    if (!saved) continue;
    // The floor gates the *saved* colourway, not merely whichever colourway we
    // are about to draw. If we cannot trust that this listing is the product
    // the user saved, we have no business offering its siblings either --
    // otherwise opting one colourway out on identity grounds quietly readmits
    // the same uncertain product through tier 2 (constraint C-4).
    if (saved.identity_confidence < config.minIdentityConfidence) continue;

    const duplicate = reconcile(item, index.commerce).state;

    // A colour named in the query is a statement of intent. If it is not the
    // colour they saved, the saved colourway is not an exact match to what
    // they just asked for -- calling it one is the false positive constraint
    // C-4 exists to prevent, and it contradicts the tier taxonomy, where a
    // different colour is tier 2 by definition.
    //
    // The useful answer is not silence, though: if the product comes in the
    // colour they asked for, offer that, labelled as the colour variant it is.
    const requestedColour = intent.colour?.value;
    const savedIsWrongColour =
      requestedColour !== undefined &&
      normalise(requestedColour) !== normalise(saved.colour);

    if (savedIsWrongColour) {
      const requested = parent.colourways.find(
        (candidate) =>
          normalise(candidate.colour) === normalise(requestedColour) &&
          candidate.skus.some((sku) => sku.size === item.size && sku.in_stock)
      );
      if (!requested) continue;
      if (requested.identity_confidence < config.minIdentityConfidence) continue;
      if (!passesPriceFilter(requested, filters)) continue;

      const classified = classify(item, requested, parent, duplicate);
      const partial = { item, parent, colourway: requested, tier: 2 as MatchTier, ...classified };
      candidates.push({ ...partial, score: score(partial, index, intent, config) });
      continue;
    }

    // Tier 1: the saved colourway itself.
    const tierOptions: { colourway: Colourway; tier: MatchTier }[] = [
      { colourway: saved, tier: 1 },
    ];
    // Tier 2: same product, different colour -- only offered when the saved
    // colourway cannot be bought, so we never nudge a user off a choice they
    // already made (FR-7).
    const savedSku = saved.skus.find((s) => s.sku === item.sku);
    if (!savedSku?.in_stock) {
      for (const other of parent.colourways) {
        if (other.product_id === saved.product_id) continue;
        if (!other.skus.some((s) => s.size === item.size && s.in_stock)) continue;
        tierOptions.push({ colourway: other, tier: 2 });
      }
    }

    for (const option of tierOptions) {
      if (!passesPriceFilter(option.colourway, filters)) continue;
      if (option.colourway.identity_confidence < config.minIdentityConfidence) continue;

      const classified = classify(item, option.colourway, parent, duplicate);
      const partial = { item, parent, colourway: option.colourway, tier: option.tier, ...classified };
      const value = score(partial, index, intent, config);
      candidates.push({ ...partial, score: value });
    }
  }

  // Below tau renders nothing at all. Never a low-confidence card (C-4).
  const qualified = candidates
    .filter((c) => c.score >= tau)
    .sort((a, b) => b.score - a.score || a.item.item_id.localeCompare(b.item.item_id));

  // One card per saved item, and which card is a question of usefulness rather
  // than of raw score. Tier 1 outscores tier 2 by construction, so picking the
  // top score meant a saved item whose colour had sold out always rendered as
  // "your size is unavailable" and never mentioned that the same product was
  // sitting there in another colour.
  //
  // The saved choice still leads whenever it can actually be bought (FR-7).
  const byItem = new Map<string, Candidate[]>();
  for (const candidate of qualified) {
    const bucket = byItem.get(candidate.item.item_id);
    if (bucket) bucket.push(candidate);
    else byItem.set(candidate.item.item_id, [candidate]);
  }

  const perItem = [...byItem.values()].map((candidates) => {
    const tierOne = candidates.find((c) => c.tier === 1);
    if (tierOne && tierOne.itemState !== "variant_unavailable") return tierOne;
    const colourway = candidates.find((c) => c.tier === 2 && c.sizeInStock);
    return colourway ?? tierOne ?? candidates[0];
  });

  if (perItem.length === 0) return EMPTY_RESPONSE;

  // E13. Ranking is a separate question from scoring: the score says which
  // items are right, this says which of them is worth a slot. Sorting by raw
  // score put an unbuyable item above a buyable one whenever it happened to
  // score higher, and would happily spend all three slots on one product.
  const rankable: (Rankable & { candidate: Candidate })[] = perItem.map((candidate) => ({
    candidate,
    itemId: candidate.item.item_id,
    parentProductId: candidate.parent.parent_product_id,
    brandKey: candidate.parent.brand_key,
    tier: candidate.tier,
    itemState: candidate.itemState,
    score: candidate.score,
    savedAt: candidate.item.saved_at,
  }));

  const capped = selectForModule(rankable, {
    ...DEFAULT_RANKING,
    maxMatches: config.maxMatches,
  }).map((row) => row.candidate);
  const deduped = perItem;
  const matches: Match[] = capped.map((c) => ({
    parent_product_id: c.parent.parent_product_id,
    sku: c.item.sku,
    tier: c.tier,
    confidence: Number(c.score.toFixed(4)),
    identity_confidence: c.colourway.identity_confidence,
    saved: {
      color: c.item.colour,
      size: c.item.size,
      saved_at: c.item.saved_at,
      price_at_save: c.item.price_at_save,
    },
    current: {
      available: c.itemState === "purchasable" || c.itemState === "in_bag",
      price: c.colourway.price,
      seller: c.colourway.seller,
      delivery_by: deliveryDate(index.catalog.today, c.colourway.product_id),
      state: c.itemState,
    },
    copy_key: copyKeyFor(c, deduped.length, filters, reconcile(c.item, index.commerce).state),
    display: {
      brand: c.parent.brand,
      name: c.colourway.display_name,
      imageId: c.colourway.product_id,
    },
  }));

  return { matches, capped_total: deduped.length, suppressed: false };
}

/** Advisory delivery estimate: 2-5 days out, stable per product. */
function deliveryDate(today: string, productId: number): string {
  const offset = 2 + (productId % 4);
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
