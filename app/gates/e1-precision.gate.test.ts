import catalogJson from "@/data/catalog.json";
import type { Catalog } from "@/data/types";
import { DEFAULT_CONFIG } from "@/match/contract";
import { buildIndex, match } from "@/match/matcher";
import { buildLabelledPairs, wishlistFor } from "./evalSets";
import { recordGate } from "./report";

const catalog = catalogJson as unknown as Catalog;

/**
 * E1 gate: exact-match precision >= 99%.
 *
 * Precision, not accuracy: of everything the module chose to render, what
 * fraction was the right thing? That is the number constraint C-4 is about --
 * a false positive costs more than a miss, so recall is deliberately not the
 * gate here.
 */
describe("E1 gate — exact-match precision", () => {
  it("renders the right saved item at least 99% of the time it renders anything", () => {
    const pairs = buildLabelledPairs(catalog, 500);
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    const failures: string[] = [];

    for (const pair of pairs) {
      const wishlist = wishlistFor(pair, catalog);
      if (!wishlist) continue;
      const response = match(
        {
          query: pair.query,
          modality: "text",
          filters: {},
          delivery_pincode: wishlist.pincode,
          session_id: pair.id,
        },
        buildIndex(catalog, wishlist),
        DEFAULT_CONFIG
      );

      const rendered = response.matches.length > 0;
      // Correctness is "did it surface the right saved item", not "did it show
      // that exact photo": a tier 2 card legitimately pictures another colour
      // while still reporting the user's own saved variant.
      const correctItem =
        rendered &&
        response.matches[0].sku === wishlist.items[0].sku &&
        response.matches[0].parent_product_id === pair.savedParentId;

      if (rendered && pair.shouldMatch && correctItem) truePositives += 1;
      else if (rendered) {
        falsePositives += 1;
        if (failures.length < 5) failures.push(`${pair.kind}: "${pair.query}"`);
      } else if (pair.shouldMatch) falseNegatives += 1;
    }

    const rendered = truePositives + falsePositives;
    const precision = rendered === 0 ? 1 : truePositives / rendered;
    const recall =
      truePositives + falseNegatives === 0
        ? 1
        : truePositives / (truePositives + falseNegatives);

    recordGate({
      id: "E1-precision",
      epic: "E1 — exact-match precision",
      requirement: "≥ 99% on a 500-pair set",
      measured: `${(precision * 100).toFixed(1)}% precision (${truePositives} correct of ${rendered} rendered; recall ${(recall * 100).toFixed(1)}%)`,
      pass: precision >= 0.99,
      caveat:
        "Labels are generated, not hand-labelled. The generator derives brand and article type the same way the matcher does, so an error shared by both is invisible here. This measures matcher behaviour given correct fields, and guards against regression; it is not the Phase 1 exit evidence.",
    });

    if (failures.length > 0) console.log("sample false positives:", failures);
    expect(precision).toBeGreaterThanOrEqual(0.99);
  });
});
