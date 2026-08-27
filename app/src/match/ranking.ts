import type { ItemState, MatchTier } from "./contract";

/**
 * E13: ranking the module's three slots.
 *
 * Matching and ranking answer different questions, and the prototype had been
 * using one answer for both. The match score asks *is this the right item* --
 * confidence, identity, category and brand alignment. Ranking asks *which of
 * the right items is most useful to put in front of someone now*, and the
 * dominant signal there is not confidence at all: it is whether the thing can
 * actually be bought.
 *
 * So ranking deliberately does **not** re-weight the scoring signals. Recency
 * and confidence are already priced into the score; re-applying them here
 * would double-count them. What ranking adds is actionability and diversity,
 * with the score kept only as a tiebreak.
 *
 * FR-3 caps the module at three items. Three slots spent on three colourways
 * of one shirt is a cap wasted, which is what the diversity pass prevents.
 */

export interface Rankable {
  itemId: string;
  parentProductId: string;
  brandKey: string;
  tier: MatchTier;
  itemState: ItemState;
  /** Match confidence. Tiebreak only -- see the note above. */
  score: number;
  savedAt: string;
}

export interface RankingConfig {
  /** Max cards rendered (FR-3). */
  maxMatches: number;
  /** Cap on cards sharing one brand, when alternatives exist. */
  maxPerBrand: number;
}

export const DEFAULT_RANKING: RankingConfig = { maxMatches: 3, maxPerBrand: 2 };

/**
 * How useful is this state to a person right now?
 *
 * A buyable item leads. An item already in the bag or previously purchased is
 * informational rather than actionable, so it ranks below one that can be
 * bought -- but above nothing, because "you already have this" is exactly the
 * duplicate-purchase FR-11 exists to prevent.
 *
 * An unavailable variant ranks last and is still shown: the user saved it, and
 * finding out it is gone is more useful than silence.
 */
export function actionability(state: ItemState): number {
  switch (state) {
    case "purchasable":
      return 1;
    case "in_bag":
    case "saved_for_later":
    case "purchased":
      return 0.6;
    case "variant_unavailable":
      return 0.3;
    case "product_unavailable":
      return 0.1;
  }
}

/**
 * Total order over candidates.
 *
 * Deterministic to the last comparison, including the item id fallback. A
 * module whose contents reshuffle between two identical searches is
 * disorienting on its own, and during an experiment it would add variance to
 * every interaction metric for no reason.
 */
export function compareCandidates(a: Rankable, b: Rankable): number {
  const byAction = actionability(b.itemState) - actionability(a.itemState);
  if (Math.abs(byAction) > 1e-9) return byAction;

  // Among equally actionable items the saved variant beats a substitute: the
  // user's own choice leads wherever it still can (FR-7).
  if (a.tier !== b.tier) return a.tier - b.tier;

  if (Math.abs(b.score - a.score) > 1e-9) return b.score - a.score;

  // More recently saved first: a save from last week is better evidence of
  // live intent than one from six months ago.
  if (a.savedAt !== b.savedAt) return a.savedAt < b.savedAt ? 1 : -1;

  return a.itemId.localeCompare(b.itemId);
}

/**
 * Pick the cards to render: ranked, then thinned for diversity.
 *
 * One card per parent product is absolute -- two colourways of the same shirt
 * are the same memory twice. The per-brand cap is a preference: it applies
 * only while a different brand is still waiting, so a user whose wishlist is
 * genuinely all one brand still fills their slots.
 */
export function selectForModule<T extends Rankable>(
  candidates: T[],
  config: RankingConfig = DEFAULT_RANKING
): T[] {
  const ranked = [...candidates].sort(compareCandidates);

  const chosen: T[] = [];
  const seenParents = new Set<string>();
  const brandCounts = new Map<string, number>();
  const deferred: T[] = [];

  for (const candidate of ranked) {
    if (chosen.length >= config.maxMatches) break;
    if (seenParents.has(candidate.parentProductId)) continue;

    const brandCount = brandCounts.get(candidate.brandKey) ?? 0;
    if (brandCount >= config.maxPerBrand) {
      deferred.push(candidate);
      continue;
    }

    chosen.push(candidate);
    seenParents.add(candidate.parentProductId);
    brandCounts.set(candidate.brandKey, brandCount + 1);
  }

  // Backfill from the deferred pile rather than render fewer cards than we
  // have. The brand cap exists to improve a full module, not to shrink one.
  for (const candidate of deferred) {
    if (chosen.length >= config.maxMatches) break;
    if (seenParents.has(candidate.parentProductId)) continue;
    chosen.push(candidate);
    seenParents.add(candidate.parentProductId);
  }

  return chosen;
}

/** How many distinct saved items matched, before the cap and the thinning. */
export function distinctItems(candidates: Rankable[]): number {
  return new Set(candidates.map((candidate) => candidate.itemId)).size;
}
