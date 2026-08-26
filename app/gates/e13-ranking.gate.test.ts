import catalogJson from "@/data/catalog.json";
import wishlistJson from "@/data/wishlist.json";
import type { Catalog, Wishlist } from "@/data/types";
import { DEFAULT_CONFIG } from "@/match/contract";
import { buildIndex, match } from "@/match/matcher";
import { actionability } from "@/match/ranking";
import { recordGate } from "./report";

const catalog = catalogJson as unknown as Catalog;
const wishlist = wishlistJson as unknown as Wishlist;

/**
 * E13 has no threshold in the plan -- it is a Phase 5 epic, gated on exact
 * match precision being understood rather than on a number of its own. So this
 * gate asserts the properties the ranking is supposed to guarantee, across
 * every query the catalog can produce, rather than a score.
 */
describe("E13 gate — multi-match ranking", () => {
  it("holds its ordering and diversity guarantees across the whole catalog", () => {
    const index = buildIndex(catalog, wishlist);
    const queries = catalog.parents.flatMap((parent) => [
      parent.articleType.toLowerCase(),
      `${parent.brand} ${parent.articleType}`.toLowerCase(),
      parent.display_name.toLowerCase(),
    ]);

    const violations: string[] = [];
    let rendered = 0;
    let multiMatch = 0;
    let unstable = 0;

    for (const query of queries) {
      const request = {
        query,
        modality: "text" as const,
        filters: {},
        delivery_pincode: wishlist.pincode,
        session_id: `rank_${query}`,
      };
      const response = match(request, index, DEFAULT_CONFIG);
      if (response.matches.length === 0) continue;
      rendered += 1;
      if (response.matches.length > 1) multiMatch += 1;

      // FR-3: never more than the cap.
      if (response.matches.length > DEFAULT_CONFIG.maxMatches) {
        violations.push(`"${query}" rendered ${response.matches.length} cards`);
      }

      // One slot per product: two colourways of one shirt are the same memory
      // twice, and the cap is too small to spend that way.
      const parents = response.matches.map((m) => m.parent_product_id);
      if (new Set(parents).size !== parents.length) {
        violations.push(`"${query}" spent two slots on one product`);
      }

      // Usefulness leads: a card the user cannot act on never sits above one
      // they can.
      const usefulness = response.matches.map((m) => actionability(m.current.state));
      for (let i = 1; i < usefulness.length; i += 1) {
        if (usefulness[i] > usefulness[i - 1] + 1e-9) {
          violations.push(`"${query}" ranked an unusable card above a usable one`);
          break;
        }
      }

      // Stability: the same search twice must not reshuffle.
      const repeat = match(request, index, DEFAULT_CONFIG);
      if (
        repeat.matches.map((m) => m.sku).join("|") !== response.matches.map((m) => m.sku).join("|")
      ) {
        unstable += 1;
        violations.push(`"${query}" reshuffled between two identical searches`);
      }
    }

    recordGate({
      id: "E13-ranking",
      epic: "E13 — multi-match ranking",
      requirement: "cap, one slot per product, usefulness ordering, stable order",
      measured: `${violations.length} violations across ${queries.length.toLocaleString("en-IN")} queries (${rendered.toLocaleString("en-IN")} rendered, ${multiMatch.toLocaleString("en-IN")} multi-match, ${unstable} unstable)`,
      pass: violations.length === 0,
      caveat:
        "Asserts the properties the ranking guarantees, not that the ordering is the one users would prefer. Which of three valid orderings performs best is a question for the experiment, and it has not been run.",
    });

    if (violations.length > 0) console.log(violations.slice(0, 5));
    expect(violations).toEqual([]);
    // A gate that never sees a multi-match case would be asserting nothing.
    expect(multiMatch).toBeGreaterThan(0);
  });
});
