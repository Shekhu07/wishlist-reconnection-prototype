import type { ItemState } from "@/match/contract";
import {
  DEFAULT_RANKING,
  actionability,
  compareCandidates,
  selectForModule,
  type Rankable,
} from "@/match/ranking";

/**
 * E13. Ranking answers a different question from scoring, and these tests are
 * mostly about not letting the two collapse back together.
 */

let counter = 0;
function card(overrides: Partial<Rankable> = {}): Rankable {
  counter += 1;
  return {
    itemId: `wi_${counter}`,
    parentProductId: `pp_${counter}`,
    brandKey: `brand_${counter}`,
    tier: 1,
    itemState: "purchasable",
    score: 0.8,
    savedAt: "2026-08-01",
    ...overrides,
  };
}

describe("multi-match ranking (E13)", () => {
  it("puts a buyable item above a higher-scoring one that cannot be bought", () => {
    // The failure the old raw-score sort produced: confidence outranking
    // usefulness, so the first card was one the user could not act on.
    const unbuyable = card({ itemState: "variant_unavailable", score: 0.99 });
    const buyable = card({ itemState: "purchasable", score: 0.75 });
    expect([unbuyable, buyable].sort(compareCandidates)[0]).toBe(buyable);
  });

  it("orders the states by how much a person can do with them", () => {
    const states: ItemState[] = [
      "purchasable",
      "in_bag",
      "variant_unavailable",
      "product_unavailable",
    ];
    const scores = states.map(actionability);
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i - 1]).toBeGreaterThan(scores[i]);
    }
  });

  it("still shows an unavailable item rather than hiding it", () => {
    // The user saved it. Finding out it is gone beats silence.
    expect(actionability("product_unavailable")).toBeGreaterThan(0);
  });

  it("prefers the saved variant over a substitute at equal usefulness", () => {
    const substitute = card({ tier: 2, score: 0.9 });
    const saved = card({ tier: 1, score: 0.9 });
    expect([substitute, saved].sort(compareCandidates)[0]).toBe(saved);
  });

  it("breaks a tie towards the more recent save", () => {
    const old = card({ savedAt: "2026-01-01" });
    const recent = card({ savedAt: "2026-08-20" });
    expect([old, recent].sort(compareCandidates)[0]).toBe(recent);
  });

  it("is a total order, so two identical searches never reshuffle", () => {
    const cards = Array.from({ length: 12 }, () =>
      card({ score: 0.8, savedAt: "2026-08-01" })
    );
    const once = selectForModule(cards).map((c) => c.itemId);
    const again = selectForModule([...cards].reverse()).map((c) => c.itemId);
    expect(again).toEqual(once);
  });

  it("never spends two slots on one product", () => {
    // Two colourways of the same shirt are the same memory twice.
    const shared = "pp_shared";
    const cards = [
      card({ parentProductId: shared, score: 0.95 }),
      card({ parentProductId: shared, score: 0.94 }),
      card({ parentProductId: shared, score: 0.93 }),
      card({ score: 0.5 }),
    ];
    const chosen = selectForModule(cards);
    expect(new Set(chosen.map((c) => c.parentProductId)).size).toBe(chosen.length);
  });

  it("caps one brand while a different brand is still waiting", () => {
    const cards = [
      card({ brandKey: "puma", score: 0.99 }),
      card({ brandKey: "puma", score: 0.98 }),
      card({ brandKey: "puma", score: 0.97 }),
      card({ brandKey: "nike", score: 0.5 }),
    ];
    const brands = selectForModule(cards).map((c) => c.brandKey);
    expect(brands.filter((b) => b === "puma")).toHaveLength(DEFAULT_RANKING.maxPerBrand);
    expect(brands).toContain("nike");
  });

  it("fills the module anyway when the wishlist really is all one brand", () => {
    // The brand cap exists to improve a full module, not to shrink one.
    const cards = Array.from({ length: 5 }, (_, i) =>
      card({ brandKey: "puma", score: 0.9 - i * 0.01 })
    );
    expect(selectForModule(cards)).toHaveLength(DEFAULT_RANKING.maxMatches);
  });

  it("honours the FR-3 cap of three", () => {
    const cards = Array.from({ length: 9 }, () => card());
    expect(selectForModule(cards)).toHaveLength(3);
  });

  it("returns everything it has when there is less than a full module", () => {
    expect(selectForModule([card()])).toHaveLength(1);
    expect(selectForModule([])).toHaveLength(0);
  });
});
