import catalogJson from "@/data/catalog.json";
import type { Catalog } from "@/data/types";
import {
  CATEGORIES,
  brandRail,
  byCategory,
  byGender,
  byPrice,
  categoryLabel,
  overview,
} from "@/search/catalogBrowse";

const catalog = catalogJson as unknown as Catalog;

const KIDS = new Set(["Boys", "Girls"]);

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

  it("reorders the overview without dropping or duplicating a product", () => {
    for (const tab of ["all", "men", "women", "kids"] as const) {
      const ids = byGender(catalog, tab).map((tile) => tile.parent.parent_product_id);
      const mixed = overview(catalog, tab).map((tile) => tile.parent.parent_product_id);
      expect(mixed.length).toBe(ids.length);
      expect([...mixed].sort()).toEqual([...ids].sort());
    }
  });

  it("opens the overview on men, women and kids rather than one shelf", () => {
    // A row of the grid is two tiles, so four tiles is the first two rows --
    // what someone sees before scrolling at all.
    const opening = overview(catalog, "all").slice(0, 4).map((tile) => tile.parent);
    expect(opening.some((parent) => parent.gender === "Men")).toBe(true);
    expect(opening.some((parent) => parent.gender === "Women")).toBe(true);
    expect(opening.some((parent) => KIDS.has(parent.gender))).toBe(true);
  });

  it("reaches every category, and every gender+type shelf, in one screenful", () => {
    // The failure this guards is the one the file order had: 39 men's
    // garments before the first women's product. Anything that clumps the
    // grid by shelf again pushes a family past this window and fails here.
    const shelves = new Set(
      catalog.parents.map((parent) => `${parent.gender}|${parent.articleType}`)
    );
    const head = overview(catalog, "all").slice(0, shelves.size * 2);

    const seenShelves = new Set(
      head.map((tile) => `${tile.parent.gender}|${tile.parent.articleType}`)
    );
    expect(seenShelves.size).toBe(shelves.size);

    const categoryIds = CATEGORIES.map(({ key }) => ({
      key,
      ids: new Set(byCategory(catalog, key).map((t) => t.parent.parent_product_id)),
    }));
    for (const { key, ids } of categoryIds) {
      const present = head.some((tile) => ids.has(tile.parent.parent_product_id));
      expect([key, present]).toEqual([key, true]);
    }
  });

  it("keeps a gender tab honest after the reorder", () => {
    for (const tile of overview(catalog, "kids")) {
      expect(KIDS.has(tile.parent.gender)).toBe(true);
    }
    for (const tile of overview(catalog, "men")) {
      expect(tile.parent.gender).toBe("Men");
    }
  });

  it("puts something in every category a circle offers", () => {
    // What `categoryCover` used to guard, minus the photograph: the circles
    // now carry drawn marks, but a circle that opens an empty grid is still a
    // dead end.
    for (const { key } of CATEGORIES) {
      expect([key, byCategory(catalog, key).length > 0]).toEqual([key, true]);
    }
  });

  it("names every category exactly once", () => {
    const keys = CATEGORIES.map(({ key }) => key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const { key, label } of CATEGORIES) {
      expect(categoryLabel(key)).toBe(label);
    }
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
