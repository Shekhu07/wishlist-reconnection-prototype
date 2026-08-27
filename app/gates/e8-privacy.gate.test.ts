import catalogJson from "@/data/catalog.json";
import wishlistJson from "@/data/wishlist.json";
import type { Catalog, Wishlist } from "@/data/types";
import { MatchClient } from "@/match/transport";
import { PreferenceStore } from "@/preferences/store";
import { recordGate } from "./report";

const catalog = catalogJson as unknown as Catalog;
const wishlist = wishlistJson as unknown as Wishlist;

/**
 * E8 gate: no wishlist field appears in any unauthenticated response or log
 * line.
 *
 * The log-line half of that sentence had never been checked. Responses were
 * asserted from the beginning; the shadow topic, which by design records every
 * call whether or not it rendered, was not. A leak there is worse than one in
 * the response, because nobody is looking at it.
 */
describe("E8 gate — wishlist leakage", () => {
  it("leaks nothing through responses or shadow records", async () => {
    // Every token that would betray the wishlist: ids, SKUs, and the saved
    // colour/size pairs themselves.
    const secrets = new Set<string>();
    for (const item of wishlist.items) {
      secrets.add(item.sku);
      secrets.add(item.item_id);
      secrets.add(item.parent_product_id);
      secrets.add(String(item.product_id));
      secrets.add(`${item.colour} · ${item.size}`);
    }

    const queries = [
      ...wishlist.items.map((item) => {
        const parent = catalog.parents.find(
          (p) => p.parent_product_id === item.parent_product_id
        )!;
        return `${parent.brand} ${parent.articleType}`.toLowerCase();
      }),
      "check shirt",
      "formal blazer",
      "",
    ];

    const findings: string[] = [];
    let calls = 0;

    for (const [label, authenticated, showWishlist] of [
      ["logged out", false, true],
      ["opted out", true, false],
    ] as const) {
      const client = new MatchClient({
        catalog,
        wishlist,
        latencyMs: 1,
        preferences: new PreferenceStore({ showWishlistInSearch: showWishlist }),
      });

      for (const query of queries) {
        const response = await client.requestMatch(
          {
            query,
            modality: "text",
            filters: {},
            delivery_pincode: wishlist.pincode,
            session_id: `privacy_${calls}`,
          },
          authenticated
        );
        calls += 1;

        const surface = JSON.stringify({ response, shadow: client.shadow });
        for (const secret of secrets) {
          if (secret && surface.includes(secret)) {
            findings.push(`${label}: "${secret}" reachable for query "${query}"`);
          }
        }
      }
    }

    recordGate({
      id: "E8-privacy",
      epic: "E8 — wishlist leakage",
      requirement: "no wishlist field in any unauthenticated response or log line",
      measured: `${findings.length} leaks across ${calls} calls covering responses and shadow records`,
      pass: findings.length === 0,
      caveat:
        "Covers the response payload and the shadow topic. It cannot see leaks through timing side channels, through a real service's access logs, or through any surface this prototype does not have.",
    });

    if (findings.length > 0) console.log(findings.slice(0, 5));
    expect(findings).toEqual([]);
  });

  it("answers a logged-out and an opted-out caller identically", async () => {
    const request = {
      query: "check shirt",
      modality: "text" as const,
      filters: {},
      delivery_pincode: wishlist.pincode,
      session_id: "shape",
    };
    const loggedOut = await new MatchClient({ catalog, wishlist, latencyMs: 1 }).requestMatch(
      request,
      false
    );
    const optedOut = await new MatchClient({
      catalog,
      wishlist,
      latencyMs: 1,
      preferences: new PreferenceStore({ showWishlistInSearch: false }),
    }).requestMatch(request, true);

    expect(loggedOut).toEqual(optedOut);
  });
});
