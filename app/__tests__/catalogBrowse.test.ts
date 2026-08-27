import catalogJson from "@/data/catalog.json";
import type { Catalog } from "@/data/types";
import { brandRail, byCategory, byGender, byPrice } from "@/search/catalogBrowse";

const catalog = catalogJson as unknown as Catalog;

describe("browsing the catalog", () => {
  it("fills every gender tab, kids included", () => {
    for (const tab of ["all", "men", "women", "kids"] as const) {
      expect(byGender(catalog, tab).length).toBeGreaterThan(0);
    }
  });

  it("fills every circle in the rail", () => {
    for (const key of [
      "fashion",
      "beauty",
      "kids",
      "footwear",
      "accessories",
      "home",
    ] as const) {
      expect(byCategory(catalog, key).length).toBeGreaterThan(0);
    }
  });

  it("keeps the invented home range visible in browse (synthetic products are not hidden here)", () => {
    const home = byCategory(catalog, "home");
    expect(home.some((tile) => tile.parent.synthetic === true)).toBe(true);
  });

  it("excludes kids from the fashion circle so the two don't overlap", () => {
    const fashion = byCategory(catalog, "fashion");
    expect(fashion.every((tile) => tile.parent.gender !== "Boys" && tile.parent.gender !== "Girls")).toBe(
      true
    );
  });

  it("filters by price honestly", () => {
    const cheap = byPrice(catalog, "under999");
    expect(cheap.length).toBeGreaterThan(0);
    expect(cheap.every((tile) => tile.colourway.price < 999)).toBe(true);

    const luxe = byPrice(catalog, "luxury");
    expect(luxe.length).toBeGreaterThan(0);
    const cheapest = Math.min(...luxe.map((tile) => tile.colourway.price));
    expect(cheapest).toBeGreaterThan(999);

    // The brief's ">999" check alone can't tell a correct top-decile cut from
    // an off-by-one bucket -- both satisfy "> 999" on this catalog. Recompute
    // the expected boundary independently here (not pinned literals) so the
    // test still catches a shifted bucket after a catalog regeneration, as
    // long as byPrice's maths stays correct.
    const allPrices = catalog.parents
      .filter((parent) => parent.colourways.length > 0)
      .map((parent) => parent.colourways[0].price)
      .sort((a, b) => a - b);
    const expectedFloor = allPrices[Math.floor(allPrices.length * 0.9)];
    const expectedCount = allPrices.filter((price) => price >= expectedFloor).length;
    expect(cheapest).toBe(expectedFloor);
    expect(luxe.length).toBe(expectedCount);
  });

  it("shows one tile per product in the brand rail", () => {
    const rail = brandRail(catalog, 12);
    const ids = rail.map((tile) => tile.parent.parent_product_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("caps the brand rail at one tile per brand", () => {
    const rail = brandRail(catalog, 12);
    const brands = rail.map((tile) => tile.parent.brand_key);
    expect(new Set(brands).size).toBe(brands.length);
  });
});
