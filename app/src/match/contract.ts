/**
 * The wire contract from section 3.3 of the source doc, transcribed as types.
 *
 * Slice 1 satisfies this contract with an in-memory matcher. The point of
 * writing it down as a wire shape now is that replacing the local matcher with
 * `POST /v1/wishlist/match` against a real service becomes a transport swap
 * rather than a UI change.
 */

export type Modality = "text" | "voice" | "image" | "recent" | "category";

export type MatchTier = 1 | 2;

export interface SearchFilters {
  size?: string[];
  color?: string[];
  brand?: string[];
  gender?: string[];
  articleType?: string[];
  price_max?: number;
  price_min?: number;
}

export interface MatchRequest {
  query: string;
  modality: Modality;
  filters: SearchFilters;
  delivery_pincode: string;
  session_id: string;
}

/** Why the module is showing what it is showing. Drives the copy bundle. */
export type CopyKey =
  | "exact_variant_available"
  | "saved_size_available"
  | "exact_variant_unavailable"
  | "multiple_matches"
  | "colour_variant_available"
  | "already_in_bag"
  | "purchased_before";

/** Availability of the saved item as of the (advisory) module-render read. */
export type ItemState =
  | "purchasable"
  | "variant_unavailable"
  | "product_unavailable"
  | "in_bag"
  | "purchased";

export interface SavedSnapshot {
  color: string;
  size: string;
  saved_at: string;
  price_at_save: number;
}

export interface CurrentSnapshot {
  available: boolean;
  price: number;
  seller: string;
  delivery_by: string;
  state: ItemState;
}

export interface Match {
  parent_product_id: string;
  sku: string;
  tier: MatchTier;
  confidence: number;
  /** Below 0.8 must never render as "the same product" (source doc 4.3). */
  identity_confidence: number;
  saved: SavedSnapshot;
  current: CurrentSnapshot;
  copy_key: CopyKey;
  display: {
    brand: string;
    name: string;
    imageId: number;
  };
}

export interface MatchResponse {
  matches: Match[];
  capped_total: number;
  suppressed: boolean;
}

/** The one shape a caller may never distinguish from a real empty result. */
export const EMPTY_RESPONSE: MatchResponse = Object.freeze({
  matches: [],
  capped_total: 0,
  suppressed: false,
});

/**
 * Every tunable in one object because Phase 3 exists specifically to tune
 * them, and the doc requires that tuning happen without a client release.
 */
export interface MatchConfig {
  weights: {
    identity: number;
    category_align: number;
    brand_align: number;
    variant_align: number;
    recency: number;
    prior_engagement: number;
  };
  /** Confidence floor, keyed by input modality (constraint C-8). */
  tau: Record<Modality, number>;
  /** Max cards rendered in the module (FR-3). */
  maxMatches: number;
  /** Identity confidence below this never renders as the same product. */
  minIdentityConfidence: number;
  /** Hard timeout in ms. Section 1.3. */
  timeoutMs: number;
  /** Breaker opens above this timeout rate. Section 1.3. */
  breakerTimeoutRate: number;
  breakerWindow: number;
  breakerCooldownMs: number;
  /** Frequency cap per item per day (E7). */
  perItemDailyCap: number;
}

export const DEFAULT_CONFIG: MatchConfig = {
  weights: {
    identity: 0.4,
    category_align: 0.15,
    brand_align: 0.15,
    variant_align: 0.15,
    recency: 0.1,
    prior_engagement: 0.05,
  },
  tau: {
    text: 0.72,
    // Voice and image queries are noisier, so they must clear a higher bar
    // before anything renders (constraint C-8).
    voice: 0.82,
    image: 0.85,
    recent: 0.72,
    category: 0.75,
  },
  maxMatches: 3,
  minIdentityConfidence: 0.8,
  timeoutMs: 250,
  breakerTimeoutRate: 0.05,
  breakerWindow: 20,
  breakerCooldownMs: 30_000,
  perItemDailyCap: 2,
};
