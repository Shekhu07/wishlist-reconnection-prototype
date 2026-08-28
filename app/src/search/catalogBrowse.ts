import type { Catalog, Colourway, ParentProduct } from "@/data/types";

export type GenderTab = "all" | "men" | "women" | "kids";
export type CategoryKey =
  | "fashion"
  | "beauty"
  | "kids"
  | "footwear"
  | "accessories"
  | "home";

/**
 * The category circles, in rail order. Exported so the rail and the screen it
 * opens read from one list: a circle whose header says something else is the
 * exact defect a second hardcoded label would introduce.
 */
export const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: "fashion", label: "Fashion" },
  { key: "beauty", label: "Beauty" },
  { key: "kids", label: "Kids" },
  { key: "footwear", label: "Footwear" },
  { key: "accessories", label: "Accessories" },
  { key: "home", label: "Home" },
];

export function categoryLabel(key: CategoryKey): string {
  return CATEGORIES.find((entry) => entry.key === key)?.label ?? key;
}

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

/** Who a product is for, collapsed to the four audiences the home tabs use. */
type Audience = "men" | "women" | "kids" | "everyone";

function audienceOf(parent: ParentProduct): Audience {
  if (KIDS_GENDERS.has(parent.gender)) return "kids";
  if (parent.gender === "Men") return "men";
  if (parent.gender === "Women") return "women";
  return "everyone";
}

/**
 * Take one from each queue, then one from each again, until all are drained.
 * Every input element comes out exactly once, so callers can reorder a tile
 * list without silently dropping products from it.
 */
function interleave<T>(queues: T[][]): T[] {
  const out: T[] = [];
  for (let depth = 0; ; depth += 1) {
    let took = false;
    for (const queue of queues) {
      if (depth < queue.length) {
        out.push(queue[depth]);
        took = true;
      }
    }
    if (!took) return out;
  }
}

function groupBy<T>(items: T[], key: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const bucket = groups.get(key(item));
    if (bucket) bucket.push(item);
    else groups.set(key(item), [item]);
  }
  return [...groups.values()];
}

/**
 * The home grid, ordered so the first screenful is an overview of the shop
 * rather than a run of one shelf.
 *
 * The catalog is stored family by family -- thirteen men's shirts, then
 * thirteen men's t-shirts, then thirteen jeans -- so rendering it in file
 * order opened the ALL tab on 39 men's garments and put every women's,
 * kids' and beauty product below three screens of scroll. Nobody scrolling
 * the top of that grid would know the catalog had kids' clothes in it.
 *
 * Two rounds of interleaving fix that without hiding anything: audiences
 * first, so men / women / kids / home alternate, then article types within
 * each audience. Round one of the result therefore carries one tile from
 * every gender+articleType family in the catalog. The returned set is
 * exactly byGender's -- this reorders, it never filters.
 */
export function overview(catalog: Catalog, tab: GenderTab): BrowseTile[] {
  const tiles = byGender(catalog, tab);
  const byAudience = groupBy(tiles, (tile) => audienceOf(tile.parent));
  return interleave(
    byAudience.map((group) =>
      interleave(groupBy(group, (tile) => tile.parent.articleType))
    )
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
 * The product whose photo fronts a category circle on the home rail.
 *
 * Drawn from the catalog rather than shipped as six separate art assets, so
 * a cover can never advertise a category the circle does not open onto.
 * Highest review count wins: catalog-derived and stable (no randomness, so
 * the rail does not reshuffle between renders), and it lands on a mainstream
 * product instead of whichever row happened to be first in the file.
 */
export function categoryCover(catalog: Catalog, key: CategoryKey): number | null {
  let best: BrowseTile | null = null;
  for (const tile of byCategory(catalog, key)) {
    if (!best || tile.colourway.review_count > best.colourway.review_count) {
      best = tile;
    }
  }
  return best ? best.colourway.product_id : null;
}

/** Every product already fronting a circle, so nothing else reuses one. */
export function categoryCoverIds(catalog: Catalog): Set<number> {
  const ids = new Set<number>();
  for (const { key } of CATEGORIES) {
    const id = categoryCover(catalog, key);
    if (id !== null) ids.add(id);
  }
  return ids;
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
