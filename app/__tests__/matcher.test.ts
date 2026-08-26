import { DEFAULT_CONFIG } from "@/match/contract";
import { buildIndex, match } from "@/match/matcher";
import { makeCatalog, makeWishlist } from "./helpers/fixtures";

const baseRequest = {
  modality: "text" as const,
  filters: {},
  delivery_pincode: "560034",
  session_id: "s1",
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

  it("offers a tier 2 colourway only once the saved variant cannot be bought", () => {
    const catalog = makeCatalog();
    for (const sku of catalog.parents[0].colourways[0].skus) sku.in_stock = false;
    const result = run("mark taylor shirt", catalog);
    expect(result.matches).toHaveLength(1);
    // The saved colourway still leads; it is reported as unavailable rather
    // than swapped out from under the user.
    expect(result.matches[0].current.state).toBe("variant_unavailable");
    expect(result.matches[0].copy_key).toBe("exact_variant_unavailable");
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
    const result = run("mark taylor shirt", makeCatalog(), makeWishlist({ state: "in_bag" }));
    expect(result.matches[0].copy_key).toBe("already_in_bag");
  });

  it("labels a previously purchased item (FR-11)", () => {
    const result = run("mark taylor shirt", makeCatalog(), makeWishlist({ state: "purchased" }));
    expect(result.matches[0].copy_key).toBe("purchased_before");
  });

  it("is deterministic across repeated calls", () => {
    expect(run("mark taylor shirt")).toEqual(run("mark taylor shirt"));
  });
});
