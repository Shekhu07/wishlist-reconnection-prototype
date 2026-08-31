import type { Colourway, ParentProduct, WishlistItem } from "@/data/types";
import { isFinishingSlot, type OutfitSlot } from "./slots";

/**
 * Deterministic Seed-to-Candidate Compatibility & Affinity Engine.
 *
 * Replaces static `saved_at` timestamp tie-breaking with a rules-based,
 * explainable multi-attribute scoring model. Evaluates:
 * 1. Usage / Occasion alignment (e.g., Formal, Ethnic, Casual)
 * 2. Color harmony & metallic coordination (Neutrals, Contrasts, Accents)
 * 3. Style & description synergy (e.g., Slim fit, Solid vs Pattern)
 * 4. Normalized recency tie-breaker
 *
 * All inputs are deterministic catalog fields. No embeddings or hallucinated scores.
 */

export interface CandidateItem {
  item: WishlistItem;
  parent: ParentProduct;
  colourway: Colourway;
  slot: OutfitSlot;
  buyable: boolean;
}

export interface SeedProduct {
  parent: ParentProduct;
  colourway: Colourway;
}

export interface AffinityResult {
  score: number;
  reason: string;
}

const UNIVERSAL_NEUTRALS = new Set([
  "black",
  "white",
  "grey",
  "gray",
  "charcoal",
  "off white",
]);

const EARTHY_NEUTRALS = new Set([
  "tan",
  "brown",
  "beige",
  "khaki",
  "camel",
  "coffee",
]);

const COOL_METALLICS = new Set(["silver", "steel", "platinum"]);
const WARM_METALLICS = new Set(["gold", "rose gold", "bronze", "copper", "brass"]);

/**
 * Deterministic color harmony score between seed color and candidate color.
 * Returns a score between 0 and 40.
 */
export function colorHarmonyScore(
  seedColorRaw: string,
  candidateColorRaw: string,
  candidateSlot: OutfitSlot,
  seedUsage?: string | null
): number {
  const seed = seedColorRaw.trim().toLowerCase();
  const cand = candidateColorRaw.trim().toLowerCase();

  if (seed === cand) {
    // All-black is classic.
    if (seed === "black") return 30;
    // Same-color accessory accent (e.g., blue shirt with blue watch or blue belt).
    if (isFinishingSlot(candidateSlot)) return 28;
    // Same color top and bottom (e.g. all-red) is often monochromatic clash unless neutral.
    if (UNIVERSAL_NEUTRALS.has(seed)) return 25;
    return 15;
  }

  // 1. Universal neutrals on candidate (Black, White, Grey) pair with everything.
  if (UNIVERSAL_NEUTRALS.has(cand)) {
    // High contrast pairs (e.g. Red / Purple / Green / Blue with Black or White).
    return 35;
  }

  // 2. Earthy neutrals (Tan, Brown) - fantastic with Navy, Blue, White, Black, Red, Green.
  if (EARTHY_NEUTRALS.has(cand)) {
    if (
      seed.includes("blue") ||
      seed.includes("navy") ||
      seed === "white" ||
      seed === "black" ||
      seed === "red" ||
      seed === "green" ||
      seed === "olive"
    ) {
      return 35;
    }
    return 28;
  }

  // 3. Metallics for Jewellery and Accessories
  if (COOL_METALLICS.has(cand)) {
    // Silver / Steel matches Cool colors (Blue, Navy, Purple, Black, White, Grey).
    if (
      seed.includes("blue") ||
      seed === "purple" ||
      seed === "black" ||
      seed === "white" ||
      seed === "grey" ||
      seed === "silver"
    ) {
      return 35;
    }
    return 25;
  }

  if (WARM_METALLICS.has(cand)) {
    // Gold matches Warm/Ethnic colors (Red, Yellow, Green, Maroon, Ethnic usage, Black, White, Tan).
    if (
      seedUsage === "Ethnic" ||
      seed === "red" ||
      seed === "yellow" ||
      seed === "gold" ||
      seed === "green" ||
      seed === "black" ||
      seed === "white" ||
      seed === "tan"
    ) {
      return 35;
    }
    return 25;
  }

  // 4. Blue / Navy tones on candidate (e.g. Washed Blue Jeans, Navy Belt)
  if (cand.includes("blue") || cand.includes("navy")) {
    if (seed === "white" || seed === "grey" || seed === "tan" || seed === "yellow") {
      return 34;
    }
    if (seed === "red" || seed === "green") {
      return 22; // Moderate contrast
    }
    if (seed.includes("blue") || seed.includes("navy")) {
      return 20; // Monochromatic blue
    }
    return 24;
  }

  // 5. Default fallback for standard valid color pairs
  return 20;
}

/**
 * Occasion and usage affinity score.
 * Returns a score between 0 and 40.
 */
export function usageAffinityScore(
  seedUsageRaw: string | null | undefined,
  candidateUsageRaw: string | null | undefined
): number {
  if (!seedUsageRaw || !candidateUsageRaw) return 25;
  const s = seedUsageRaw.trim();
  const c = candidateUsageRaw.trim();

  // Exact occasion match is highest priority
  if (s === c) {
    if (s === "Ethnic" || s === "Formal") return 40;
    if (s === "Sports" || s === "Casual" || s === "Smart Casual") return 35;
    return 30;
  }

  // Smart Casual bridges Casual and Formal
  if (
    (s === "Smart Casual" && (c === "Casual" || c === "Formal")) ||
    (c === "Smart Casual" && (s === "Casual" || s === "Formal"))
  ) {
    return 32;
  }

  // Casual mixes with Formal or Ethnic as secondary
  if (s === "Casual" || c === "Casual") {
    return 22;
  }

  return 15;
}

/**
 * Style, pattern, and title synergy.
 * Returns a score between 0 and 15.
 */
export function styleSynergyScore(
  seedTitle: string,
  candTitle: string
): number {
  let score = 0;
  const sLower = seedTitle.toLowerCase();
  const cLower = candTitle.toLowerCase();

  // Slim fit synergy
  if (sLower.includes("slim") && cLower.includes("slim")) {
    score += 10;
  }

  // Check / Striped top with Solid / Clean bottom
  if (
    (sLower.includes("check") || sLower.includes("stripe")) &&
    (cLower.includes("solid") || cLower.includes("slim") || cLower.includes("clean") || cLower.includes("washed"))
  ) {
    score += 5;
  }

  return score;
}

/**
 * Normalized recency factor (0 to 10 points).
 * Keeps recently saved items slightly preferred when all styling attributes are tied.
 */
export function recencyScore(savedAt: string): number {
  const savedDate = new Date(savedAt).getTime();
  const now = new Date("2026-08-31").getTime();
  if (isNaN(savedDate)) return 5;
  const daysDiff = Math.max(0, (now - savedDate) / (1000 * 60 * 60 * 24));
  return Math.max(0, 10 - daysDiff * 0.1);
}

/**
 * Composite Look Affinity computation.
 */
export function computeLookAffinity(
  seed: SeedProduct,
  candidate: CandidateItem
): AffinityResult {
  const uScore = usageAffinityScore(seed.colourway.usage, candidate.colourway.usage);
  const cScore = colorHarmonyScore(
    seed.colourway.colour,
    candidate.colourway.colour,
    candidate.slot,
    seed.colourway.usage
  );
  const sScore = styleSynergyScore(
    seed.colourway.display_name,
    candidate.colourway.display_name
  );
  const rScore = recencyScore(candidate.item.saved_at);

  // Buyability remains an absolute priority (+100)
  const buyableBoost = candidate.buyable ? 100 : 0;

  const totalScore = buyableBoost + uScore + cScore + sScore + rScore;

  // Determine dynamic human-readable reason
  const reason = deriveDynamicReason(seed, candidate, uScore, cScore);

  return { score: totalScore, reason };
}

/**
 * Formats a contextual, truthful explanation of the pairing.
 */
function deriveDynamicReason(
  seed: SeedProduct,
  candidate: CandidateItem,
  _usageScore: number,
  _colorScore: number
): string {
  const seedName = seed.colourway.display_name;
  return isFinishingSlot(candidate.slot)
    ? `Finishes the look with the ${seedName}`
    : `Goes with the ${seedName}`;
}
