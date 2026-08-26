import { buildSearchIndex, search } from "@/search/localSearch";
import { makeCatalog } from "./helpers/fixtures";

describe("organic search (FR-2, constraint C-3)", () => {
  const catalog = makeCatalog();
  const index = buildSearchIndex(catalog);

  it("ranks on the query alone and cannot see the wishlist", () => {
    // The guarantee is structural: search() takes no wishlist argument, so
    // saved status cannot boost organic ranking even by accident.
    expect(search.length).toBeLessThanOrEqual(3);
    const source = search.toString();
    expect(source).not.toMatch(/wishlist|saved|match/i);
  });

  it("returns results for a plain category query", () => {
    const results = search("shirt", index);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.parent.articleType === "Shirts")).toBe(true);
  });

  it("is synchronous, so results never wait on the match call", () => {
    expect(search("shirt", index)).not.toBeInstanceOf(Promise);
  });

  it("orders deterministically", () => {
    expect(search("shirt", index)).toEqual(search("shirt", index));
  });

  it("returns nothing for an empty query rather than the whole catalog", () => {
    expect(search("", index)).toEqual([]);
  });
});
