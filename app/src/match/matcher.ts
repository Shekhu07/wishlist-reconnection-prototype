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
import type { Catalog, Colourway, ParentProduct, Wishlist, WishlistItem } from "@/data/types";

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
}

export function buildIndex(catalog: Catalog, wishlist: Wishlist): MatchIndex {
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
  parent: ParentProduct
): { itemState: ItemState; sizeInStock: boolean; anySizeInStock: boolean } {
  const sku = colourway.skus.find((s) => s.sku === item.sku) ?? colourway.skus[0];
  const sizeInStock = Boolean(sku?.in_stock);
  const anySizeInStock = parent.colourways.some((c) => c.skus.some((s) => s.in_stock));

  if (item.state === "in_bag") return { itemState: "in_bag", sizeInStock, anySizeInStock };
  if (item.state === "purchased") return { itemState: "purchased", sizeInStock, anySizeInStock };
  if (!anySizeInStock) return { itemState: "product_unavailable", sizeInStock, anySizeInStock };
  if (!sizeInStock) return { itemState: "variant_unavailable", sizeInStock, anySizeInStock };
  return { itemState: "purchasable", sizeInStock, anySizeInStock };
}

function copyKeyFor(candidate: Candidate, totalMatches: number, filters: SearchFilters): CopyKey {
  if (candidate.itemState === "in_bag") return "already_in_bag";
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

  const identity = tier === 1 ? 1 : 0.72;
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

      const classified = classify(item, option.colourway, parent);
      const partial = { item, parent, colourway: option.colourway, tier: option.tier, ...classified };
      const value = score(partial, index, intent, config);
      candidates.push({ ...partial, score: value });
    }
  }

  // Below tau renders nothing at all. Never a low-confidence card (C-4).
  const qualified = candidates
    .filter((c) => c.score >= tau)
    .sort((a, b) => b.score - a.score || a.item.item_id.localeCompare(b.item.item_id));

  // One card per saved item: a Tier 2 alternative must not appear beside the
  // Tier 1 card for the same item.
  const seen = new Set<string>();
  const deduped = qualified.filter((c) => {
    if (seen.has(c.item.item_id)) return false;
    seen.add(c.item.item_id);
    return true;
  });

  if (deduped.length === 0) return EMPTY_RESPONSE;

  const capped = deduped.slice(0, config.maxMatches);
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
    copy_key: copyKeyFor(c, deduped.length, filters),
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
