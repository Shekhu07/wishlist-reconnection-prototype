import catalogJson from "@/data/catalog.json";
import type { Catalog } from "@/data/types";

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

  it("keeps every state fixture pointing at the product it always did", () => {
    // select() assigns roles by families[0..6]. Appending families must not
    // move them; inserting one would repoint state 2 with every test green.
    const exact = catalog.parents.find(
      (parent) => parent.parent_product_id === catalog.roles.exact_available
    );
    expect(exact?.brand).toBe("Mark Taylor");
    expect(exact?.articleType).toBe("Shirts");
  });
});
