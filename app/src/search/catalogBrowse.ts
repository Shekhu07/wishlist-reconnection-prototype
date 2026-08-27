import type { Catalog, Colourway, ParentProduct } from "@/data/types";

export type GenderTab = "all" | "men" | "women" | "kids";
export type CategoryKey =
  | "fashion"
  | "beauty"
  | "kids"
  | "footwear"
  | "accessories"
  | "home";

export interface BrowseTile {
  parent: ParentProduct;
  colourway: Colourway;
}

/** One tile per product, so two colourways of a shirt are not two results. */
function tiles(parents: ParentProduct[]): BrowseTile[] {
  return parents
    .filter((parent) => parent.colourways.length > 0)
    .map((parent) => ({ parent, colourway: parent.colourways[0] }));
}

const KIDS_GENDERS = new Set(["Boys", "Girls"]);

export function byGender(catalog: Catalog, tab: GenderTab): BrowseTile[] {
  return tiles(
    catalog.parents.filter((parent) => {
      switch (tab) {
        case "all":
          return true;
        case "men":
          return parent.gender === "Men";
        case "women":
          return parent.gender === "Women";
        case "kids":
          return KIDS_GENDERS.has(parent.gender);
      }
    })
  );
}

export function byCategory(catalog: Catalog, key: CategoryKey): BrowseTile[] {
  return tiles(
    catalog.parents.filter((parent) => {
      switch (key) {
        case "fashion":
          return parent.masterCategory === "Apparel" && !KIDS_GENDERS.has(parent.gender);
        case "beauty":
          return parent.masterCategory === "Personal Care";
        case "kids":
          return KIDS_GENDERS.has(parent.gender);
        case "footwear":
          return parent.masterCategory === "Footwear";
        case "accessories":
          return parent.masterCategory === "Accessories";
        case "home":
          return parent.masterCategory === "Home";
      }
    })
  );
}

/**
 * Luxury is the top price decile of the catalog rather than a fixed number,
 * so it stays meaningful if the catalog is rebuilt with different rows.
 */
export function byPrice(
  catalog: Catalog,
  filter: "under999" | "luxury"
): BrowseTile[] {
  const all = tiles(catalog.parents);
  if (filter === "under999") {
    return all.filter((tile) => tile.colourway.price < 999);
  }
  const prices = all.map((tile) => tile.colourway.price).sort((a, b) => a - b);
  const floor = prices[Math.floor(prices.length * 0.9)] ?? 0;
  return all.filter((tile) => tile.colourway.price >= floor);
}

/** "Continue browsing these brands": one tile per brand, stable order. */
export function brandRail(catalog: Catalog, limit = 12): BrowseTile[] {
  const seen = new Set<string>();
  const out: BrowseTile[] = [];
  for (const tile of tiles(catalog.parents)) {
    if (seen.has(tile.parent.brand_key)) continue;
    seen.add(tile.parent.brand_key);
    out.push(tile);
    if (out.length === limit) break;
  }
  return out;
}
