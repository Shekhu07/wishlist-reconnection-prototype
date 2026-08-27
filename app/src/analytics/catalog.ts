import type { Catalog, ParentProduct } from "@/data/types";

/**
 * The parents a measurement is allowed to see.
 *
 * The home range is invented (spec section 3.2). A precision, recall or
 * latency figure computed partly over invented products measures the
 * generator, not the matcher, and the whole point of the gate report is that
 * its numbers mean what they say.
 */
export function realParents(catalog: Catalog): ParentProduct[] {
  return catalog.parents.filter((parent) => !parent.synthetic);
}
