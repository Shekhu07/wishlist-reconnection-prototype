import catalogJson from "@/data/catalog.json";
import type { Catalog } from "@/data/types";
import { CATALOG_IMAGES } from "@/data/images";

const catalog = catalogJson as unknown as Catalog;

/**
 * The category rail in the shell has five circles. Three were already
 * curated; Kids and Beauty were absent from QUERY_FAMILIES rather than from
 * the dataset. This asserts the curation, not the dataset -- if it fails,
 * tools/catalog/curate.py is what changed.
 */
describe("the demo catalog covers the shell's category rail", () => {
  const parents = catalog.parents;

  it("carries kids products", () => {
    const kids = parents.filter(
      (parent) => parent.gender === "Boys" || parent.gender === "Girls"
    );
    // Three families x (4 wishlisted + 9 filler).
    expect(kids.length).toBeGreaterThanOrEqual(39);
  });

  it("carries beauty products", () => {
    const beauty = parents.filter(
      (parent) => parent.masterCategory === "Personal Care"
    );
    expect(beauty.length).toBeGreaterThanOrEqual(39);
  });

  // select() assigns every role in catalog.roles from families[0..6] in
  // QUERY_FAMILIES order. Appending families must not move any of them;
  // inserting one anywhere from index 0 to 6 would silently repoint the
  // corresponding role. Each row below pins today's resolved product
  // (brand + articleType) for one role, so an accidental insertion fails
  // loudly on whichever role it moved, instead of only on the first one.
  const expectedRoles: Record<string, { brand: string; articleType: string }> = {
    colour_alternative: { brand: "Catwalk", articleType: "Heels" },
    colour_variant: { brand: "Locomotive", articleType: "Jeans" },
    exact_available: { brand: "Mark Taylor", articleType: "Shirts" },
    in_bag: { brand: "W", articleType: "Kurtas" },
    low_identity: { brand: "Locomotive", articleType: "Shirts" },
    multi_a: { brand: "United Colors of Benetton", articleType: "Shirts" },
    multi_b: { brand: "Highlander", articleType: "Shirts" },
    multi_c: { brand: "Scullers", articleType: "Shirts" },
    purchased: { brand: "Numero Uno", articleType: "Casual Shoes" },
    saved_for_later: { brand: "Murcia", articleType: "Handbags" },
    variant_unavailable: { brand: "Proline", articleType: "Tshirts" },
  };

  it.each(Object.entries(expectedRoles))(
    "keeps role %s pointing at the product it always did",
    (role, expected) => {
      const productId = catalog.roles[role];
      const product = catalog.parents.find(
        (parent) => parent.parent_product_id === productId
      );
      expect({
        role,
        brand: product?.brand,
        articleType: product?.articleType,
      }).toEqual({ role, ...expected });
    }
  );

  it("has an image for every colourway", () => {
    const missing = catalog.parents
      .flatMap((parent) => parent.colourways)
      .filter((colourway) => CATALOG_IMAGES[colourway.product_id] === undefined)
      .map((colourway) => colourway.product_id);
    expect(missing).toEqual([]);
  });
});
