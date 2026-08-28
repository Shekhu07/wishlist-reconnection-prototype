import bagJson from "@/data/bag.json";
import catalogJson from "@/data/catalog.json";
import ordersJson from "@/data/orders.json";
import savedForLaterJson from "@/data/saved-for-later.json";
import scenariosJson from "@/data/scenarios.json";
import wishlistJson from "@/data/wishlist.json";
import type { Catalog, Scenario, Wishlist } from "@/data/types";
import type { MatchRequest } from "@/match/contract";
import { MatchClient } from "@/match/transport";

/**
 * The end-to-end check: the generated catalog really does produce every state
 * in section 4.6, through the same transport the UI uses.
 *
 * This is what stops the ten states from being a design fiction. If curation
 * drifts and a fixture stops resolving, this fails rather than the researcher
 * discovering it in a session.
 */

const catalog = catalogJson as unknown as Catalog;
const wishlist = wishlistJson as unknown as Wishlist;
const scenarios = scenariosJson as unknown as Scenario[];

// The duplicate states are derived from these, so a client without them
// cannot produce states 7 and 8 at all.
const commerce = {
  bag: bagJson,
  savedForLater: savedForLaterJson,
  orders: ordersJson,
} as never;

function requestFor(scenario: Scenario): MatchRequest {
  return {
    query: scenario.query,
    modality: scenario.modality,
    filters: scenario.filters as MatchRequest["filters"],
    delivery_pincode: wishlist.pincode,
    session_id: `sess_${scenario.id}`,
    search_id: "search_1",
  };
}

describe("prototype state fixtures (section 4.6)", () => {
  it("covers all ten states", () => {
    const states = new Set(scenarios.map((s) => s.state));
    for (let state = 1; state <= 10; state += 1) {
      expect(states.has(state)).toBe(true);
    }
  });

  it.each(scenarios.map((s) => [s.id, s] as const))("%s resolves as specified", async (_id, scenario) => {
    const client = new MatchClient({ catalog, wishlist, latencyMs: 5, commerce });
    const request = requestFor(scenario);
    if (scenario.dismissFirst) client.dismiss(request);

    const response = await client.requestMatch(request, scenario.authenticated);

    expect(response.matches.length).toBe(scenario.expect.matchCount);
    expect(response.matches.length > 0).toBe(scenario.expect.moduleVisible);
    if (scenario.expect.copyKey) {
      expect(response.matches[0].copy_key).toBe(scenario.expect.copyKey);
    }
    if (scenario.expect.suppressed !== undefined) {
      expect(response.suppressed).toBe(scenario.expect.suppressed);
    }
  });

  it("reveals nothing about the wishlist to a logged-out session (C-6)", async () => {
    const scenario = scenarios.find((s) => !s.authenticated)!;
    const client = new MatchClient({ catalog, wishlist, latencyMs: 5, commerce });
    const response = await client.requestMatch(requestFor(scenario), false);
    const payload = JSON.stringify(response);
    for (const item of wishlist.items) {
      expect(payload).not.toContain(item.sku);
      expect(payload).not.toContain(item.parent_product_id);
    }
  });

  it("has an image on disk for every catalog colourway", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { CATALOG_IMAGES } = require("@/data/images");
    for (const parent of catalog.parents) {
      for (const colourway of parent.colourways) {
        expect(CATALOG_IMAGES[colourway.product_id]).toBeDefined();
      }
    }
  });

  it("points every wishlist item at a SKU the catalog actually contains", () => {
    const skus = new Set(
      catalog.parents.flatMap((p) => p.colourways.flatMap((c) => c.skus.map((s) => s.sku)))
    );
    for (const item of wishlist.items) {
      expect(skus.has(item.sku)).toBe(true);
    }
  });

  it("records every stock override rather than leaving it to look emergent", () => {
    for (const override of catalog.stock_overrides) {
      const sku = catalog.parents
        .flatMap((p) => p.colourways)
        .flatMap((c) => c.skus)
        .find((s) => s.sku === override.sku);
      expect(sku?.stock_override).toBe(true);
    }
  });
});
