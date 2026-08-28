import catalogJson from "@/data/catalog.json";
import wishlistJson from "@/data/wishlist.json";
import type { Catalog, Wishlist } from "@/data/types";
import { DEFAULT_CONFIG } from "@/match/contract";
import { buildIndex, match } from "@/match/matcher";
import { pick, seeded } from "@/analytics/evalSets";
import { recordGate } from "./report";
import { realParents } from "./paths";

const catalog = catalogJson as unknown as Catalog;
const wishlist = wishlistJson as unknown as Wishlist;

const RUNS = 10_000;

/**
 * E1 gate: zero silent variant substitutions across a 10k-run fuzz.
 *
 * "Silent" is the operative word. Offering another colour once the saved one
 * cannot be bought is a feature; doing it while the saved variant is still
 * purchasable, or reporting a saved variant the user never chose, is the
 * failure FR-7 exists to prevent. Stock is churned between runs precisely
 * because that is when a matcher is tempted to substitute.
 */
describe("E1 gate — silent variant substitution", () => {
  it("never substitutes a variant across 10,000 randomised runs", () => {
    const random = seeded(4242);
    const index = buildIndex(catalog, wishlist);
    const itemBySku = new Map(wishlist.items.map((item) => [item.sku, item]));
    const allSkus = realParents(catalog).flatMap((parent) =>
      parent.colourways.flatMap((colourway) => colourway.skus)
    );
    const seededStock = allSkus.map((sku) => sku.in_stock);

    const queries = [
      ...new Set(
        wishlist.items
          .map((item) => index.parents.get(item.parent_product_id))
          .filter(Boolean)
          .flatMap((parent) => [
            `${parent!.brand} ${parent!.articleType}`.toLowerCase(),
            parent!.articleType.toLowerCase(),
            `${parent!.display_name} ${parent!.articleType}`.toLowerCase(),
          ])
      ),
    ];

    const violations: string[] = [];
    let rendered = 0;
    let tierTwoOffers = 0;

    for (let run = 0; run < RUNS; run += 1) {
      // Churn: flip a slice of stock. The index holds references to these same
      // objects, so no rebuild is needed and the matcher sees it immediately.
      for (const sku of allSkus) {
        if (random() < 0.25) sku.in_stock = random() < 0.5;
      }

      const query = pick(queries, random);
      const response = match(
        {
          query,
          modality: "text",
          filters: {},
          delivery_pincode: wishlist.pincode,
          session_id: `fuzz_${run}`,
          search_id: "search_1",
        },
        index,
        DEFAULT_CONFIG
      );

      for (const candidate of response.matches) {
        rendered += 1;
        const item = itemBySku.get(candidate.sku);
        if (!item) {
          violations.push(`run ${run}: match reports an sku no saved item owns`);
          continue;
        }
        // The reported saved variant must be the one actually saved.
        if (candidate.saved.color !== item.colour || candidate.saved.size !== item.size) {
          violations.push(
            `run ${run}: reported saved ${candidate.saved.color}/${candidate.saved.size}, actual ${item.colour}/${item.size}`
          );
        }
        if (candidate.tier === 2) {
          tierTwoOffers += 1;
          const savedSku = allSkus.find((sku) => sku.sku === item.sku);
          if (savedSku?.in_stock) {
            violations.push(
              `run ${run}: offered another colour while the saved variant was still purchasable`
            );
          }
        }
      }
    }

    allSkus.forEach((sku, i) => {
      sku.in_stock = seededStock[i];
    });

    recordGate({
      id: "E1-substitution",
      epic: "E1 — silent variant substitution",
      requirement: "zero across a 10k-run fuzz",
      measured: `${violations.length} violations in ${RUNS.toLocaleString("en-IN")} runs (${rendered.toLocaleString("en-IN")} matches rendered, ${tierTwoOffers.toLocaleString("en-IN")} of them tier 2)`,
      pass: violations.length === 0,
      caveat:
        "Fuzzes stock and query against the nine committed wishlist items. It does not vary the wishlist itself, so a substitution that only occurs for a saved item shape absent from this fixture would not be caught.",
    });

    if (violations.length > 0) console.log(violations.slice(0, 5));
    expect(violations).toEqual([]);
  });
});
