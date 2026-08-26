import type { Catalog, Colourway, ParentProduct } from "@/data/types";
import { normalise } from "@/match/intent";

/**
 * A small BM25-flavoured search over the demo catalog.
 *
 * It exists so the module has a believable surface to sit in. Two properties
 * matter and are asserted in tests:
 *
 *   1. It knows nothing about the wishlist. FR-2 forbids wishlist status from
 *      boosting organic ranking, and the cheapest way to guarantee that is to
 *      give this function no access to wishlist data at all.
 *   2. It is synchronous and independent of the match call, so results can
 *      render whether or not matching ever resolves (constraint C-3).
 */

export interface SearchResult {
  parent: ParentProduct;
  colourway: Colourway;
  score: number;
}

export interface SearchIndexEntry {
  parent: ParentProduct;
  colourway: Colourway;
  terms: string[];
}

export function buildSearchIndex(catalog: Catalog): SearchIndexEntry[] {
  const entries: SearchIndexEntry[] = [];
  for (const parent of catalog.parents) {
    for (const colourway of parent.colourways) {
      const terms = normalise(
        [
          parent.brand,
          parent.articleType,
          parent.subCategory,
          parent.masterCategory,
          parent.gender,
          colourway.colour,
          colourway.display_name,
        ].join(" ")
      )
        .split(" ")
        .filter(Boolean);
      entries.push({ parent, colourway, terms });
    }
  }
  return entries;
}

export function search(
  query: string,
  index: SearchIndexEntry[],
  limit = 24
): SearchResult[] {
  const queryTerms = normalise(query).split(" ").filter(Boolean);
  if (queryTerms.length === 0) return [];

  const results: SearchResult[] = [];
  for (const entry of index) {
    let hits = 0;
    for (const term of queryTerms) {
      if (entry.terms.some((t) => t === term || t.startsWith(term) || term.startsWith(t))) {
        hits += 1;
      }
    }
    if (hits === 0) continue;
    // Coverage of the query dominates; identity confidence breaks ties so
    // mislabelled listings sink rather than lead.
    const score = hits / queryTerms.length + 0.05 * entry.colourway.identity_confidence;
    results.push({ parent: entry.parent, colourway: entry.colourway, score });
  }

  results.sort(
    (a, b) =>
      b.score - a.score ||
      a.parent.parent_product_id.localeCompare(b.parent.parent_product_id) ||
      a.colourway.product_id - b.colourway.product_id
  );
  return results.slice(0, limit);
}
