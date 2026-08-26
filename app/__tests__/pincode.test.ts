import catalogJson from "@/data/catalog.json";
import wishlistJson from "@/data/wishlist.json";
import type { Catalog, Wishlist } from "@/data/types";
import { InventorySimulator } from "@/revalidation/inventory";
import { revalidate } from "@/revalidation/revalidate";

const catalog = catalogJson as unknown as Catalog;
const wishlist = wishlistJson as unknown as Wishlist;

/**
 * Section 4.13 requires revalidation against the *current* address. That is
 * only demonstrable if one of the harness addresses actually fails, and only
 * useful in research if it fails on the state the harness opens with.
 */
describe("delivery address revalidation (section 4.13)", () => {
  const HARNESS_PINCODES = ["560034", "194101", "795001"];

  it("delivers the default saved item to the home address", () => {
    const inventory = new InventorySimulator(catalog);
    const item = wishlist.items[0];
    const result = revalidate(item, catalog, inventory, HARNESS_PINCODES[0])!;
    expect(result.blocking).toBeNull();
    expect(result.current.delivery_by).not.toBeNull();
  });

  it("blocks the default saved item from at least one harness address", () => {
    const inventory = new InventorySimulator(catalog);
    const item = wishlist.items[0];
    const blocked = HARNESS_PINCODES.filter(
      (pin) => revalidate(item, catalog, inventory, pin)!.blocking === "delivery_unavailable"
    );
    expect(blocked.length).toBeGreaterThan(0);
  });

  it("names the address rather than failing generically", () => {
    const inventory = new InventorySimulator(catalog);
    const item = wishlist.items[0];
    const pin = HARNESS_PINCODES.find(
      (candidate) =>
        revalidate(item, catalog, inventory, candidate)!.blocking === "delivery_unavailable"
    )!;
    const result = revalidate(item, catalog, inventory, pin)!;
    expect(result.current.delivery_by).toBeNull();
    // Availability is untouched: the item is fine, this address is not.
    expect(result.current.sizesInStock).toContain(item.size);
  });
});
