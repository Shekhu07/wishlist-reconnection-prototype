import { DEFAULT_CONFIG } from "@/match/contract";
import { buildIndex, match } from "@/match/matcher";
import { InventorySimulator } from "@/revalidation/inventory";
import { deliveryDateFor, revalidate, servesPincode } from "@/revalidation/revalidate";
import { TODAY, makeCatalog, makeWishlist } from "./helpers/fixtures";

const baseRequest = {
  modality: "text" as const,
  filters: {},
  delivery_pincode: "560034",
  session_id: "s1",
  search_id: "search_1",
};

function run(query: string, catalog = makeCatalog(), wishlist = makeWishlist(), config = DEFAULT_CONFIG) {
  return match({ ...baseRequest, query }, buildIndex(catalog, wishlist), config);
}

describe("match service (E3, tiers 1 and 2)", () => {
  it("returns the saved item as a tier 1 match", () => {
    const result = run("mark taylor shirt");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].tier).toBe(1);
    expect(result.matches[0].saved).toMatchObject({ color: "Blue", size: "M" });
  });

  it("returns nothing at all below the threshold, never a weak card", () => {
    // Constraint C-4: a false positive is worse than a miss.
    const strict = { ...DEFAULT_CONFIG, tau: { ...DEFAULT_CONFIG.tau, text: 0.99 } };
    const result = run("mark taylor shirt", makeCatalog(), makeWishlist(), strict);
    expect(result.matches).toHaveLength(0);
    expect(result.capped_total).toBe(0);
  });

  it("holds voice and image queries to a higher bar than text (C-8)", () => {
    expect(DEFAULT_CONFIG.tau.voice).toBeGreaterThan(DEFAULT_CONFIG.tau.text);
    expect(DEFAULT_CONFIG.tau.image).toBeGreaterThan(DEFAULT_CONFIG.tau.text);
  });

  it("refuses to render a colourway whose identity confidence is below the floor", () => {
    const catalog = makeCatalog();
    catalog.parents[0].colourways[0].identity_confidence = 0.5;
    expect(run("mark taylor shirt", catalog).matches).toHaveLength(0);
  });

  it("never substitutes a different colour while the saved one is buyable (FR-7)", () => {
    const result = run("mark taylor shirt");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].display.imageId).toBe(1001);
    expect(result.matches.every((m) => m.tier === 1)).toBe(true);
  });

  it("offers another colour once the saved one cannot be bought, and says so", () => {
    const catalog = makeCatalog();
    for (const sku of catalog.parents[0].colourways[0].skus) sku.in_stock = false;
    const result = run("mark taylor shirt", catalog);

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].tier).toBe(2);
    // Not a silent substitution: the card still reports the user's own saved
    // colour and size, and the copy names the change explicitly (FR-7).
    expect(result.matches[0].copy_key).toBe("colour_variant_available");
    expect(result.matches[0].saved.color).toBe("Blue");
    expect(result.matches[0].saved.size).toBe("M");
  });

  it("falls back to the unavailable message when no other colour has the size", () => {
    const catalog = makeCatalog();
    // Every colourway of the parent loses the saved size, so there is nothing
    // to offer and the honest answer is that the size is gone.
    for (const colourway of catalog.parents[0].colourways) {
      for (const sku of colourway.skus) if (sku.size === "M") sku.in_stock = false;
    }
    const result = run("mark taylor shirt", catalog);
    expect(result.matches[0].tier).toBe(1);
    expect(result.matches[0].copy_key).toBe("exact_variant_unavailable");
  });

  it("keeps the saved colour leading while it is still buyable", () => {
    const result = run("mark taylor shirt");
    expect(result.matches[0].tier).toBe(1);
  });

  it("treats explicit filters as hard predicates, not preferences (FR-9)", () => {
    const index = buildIndex(makeCatalog(), makeWishlist());
    const result = match(
      { ...baseRequest, query: "shirt", filters: { brand: ["Locomotive"] } },
      index
    );
    expect(result.matches).toHaveLength(0);
  });

  it("hides a saved item whose size does not conform to an explicit filter (FR-9)", () => {
    const index = buildIndex(makeCatalog(), makeWishlist());
    const conforming = match({ ...baseRequest, query: "shirt", filters: { size: ["M"] } }, index);
    const nonConforming = match({ ...baseRequest, query: "shirt", filters: { size: ["L"] } }, index);
    expect(conforming.matches).toHaveLength(1);
    expect(nonConforming.matches).toHaveLength(0);
  });

  it("confirms the saved size when the user asked about size explicitly", () => {
    const index = buildIndex(makeCatalog(), makeWishlist());
    const result = match({ ...baseRequest, query: "shirt", filters: { size: ["M"] } }, index);
    expect(result.matches[0].copy_key).toBe("saved_size_available");
  });

  it("caps the module at three items and reports the true total", () => {
    expect(DEFAULT_CONFIG.maxMatches).toBe(3);
  });

  it("preserves the saved variant verbatim in every match (FR-4)", () => {
    const result = run("mark taylor shirt");
    expect(result.matches[0].saved.color).toBe("Blue");
    expect(result.matches[0].saved.size).toBe("M");
    expect(result.matches[0].saved.price_at_save).toBe(1999);
  });

  it("labels an item already in the bag rather than offering it again (FR-11)", () => {
    const wishlist = makeWishlist();
    const item = wishlist.items[0];
    const result = match(
      { ...baseRequest, query: "mark taylor shirt" },
      buildIndex(makeCatalog(), wishlist, {
        bag: {
          items: [
            {
              sku: item.sku,
              parent_product_id: item.parent_product_id,
              size: item.size,
              colour: item.colour,
              added_at: "2026-08-20",
              quantity: 1,
            },
          ],
        },
        savedForLater: { items: [] },
        orders: { orders: [] },
      })
    );
    expect(result.matches[0].copy_key).toBe("already_in_bag");
  });

  it("labels a previously purchased item (FR-11)", () => {
    const wishlist = makeWishlist();
    const item = wishlist.items[0];
    const result = match(
      { ...baseRequest, query: "mark taylor shirt" },
      buildIndex(makeCatalog(), wishlist, {
        bag: { items: [] },
        savedForLater: { items: [] },
        orders: {
          orders: [
            {
              order_id: "ord_1",
              placed_at: "2026-05-01",
              delivered_at: "2026-05-05",
              lines: [
                {
                  sku: item.sku,
                  parent_product_id: item.parent_product_id,
                  size: item.size,
                  colour: item.colour,
                  quantity: 1,
                  price_paid: 1999,
                },
              ],
            },
          ],
        },
      })
    );
    expect(result.matches[0].copy_key).toBe("purchased_before");
  });

  it("is deterministic across repeated calls", () => {
    expect(run("mark taylor shirt")).toEqual(run("mark taylor shirt"));
  });

  describe("delivery is answered for the address that was asked about", () => {
    // The matcher used to carry its own copy of the delivery estimate that
    // never looked at the pincode, so the module could promise a date at an
    // address the seller does not serve -- and the binding read would then
    // contradict it a tap later. Both paths now share one definition.
    const request = (pincode: string) => ({ ...baseRequest, query: "mark taylor shirt", delivery_pincode: pincode });
    const at = (pincode: string) =>
      match(request(pincode), buildIndex(makeCatalog(), makeWishlist())).matches[0];

    it("gives a date where the seller serves the address", () => {
      expect(servesPincode("Myntra Retail", "560034")).toBe(true);
      expect(at("560034").current.delivery_by).toBe(deliveryDateFor(TODAY, 1001));
    });

    it("withholds the date where the seller does not serve it", () => {
      // 100001 is a pincode this seller fails. Asserted rather than assumed,
      // so the test cannot quietly become vacuous if servesPincode changes.
      expect(servesPincode("Myntra Retail", "100001")).toBe(false);
      expect(at("100001").current.delivery_by).toBeNull();
    });

    it("agrees with the binding read at the same address", () => {
      for (const pincode of ["560034", "100001"]) {
        const advisory = at(pincode).current.delivery_by;
        const binding = revalidate(
          makeWishlist().items[0],
          makeCatalog(),
          new InventorySimulator(makeCatalog()),
          pincode
        );
        expect(advisory).toBe(binding?.current.delivery_by ?? null);
      }
    });
  });
});
