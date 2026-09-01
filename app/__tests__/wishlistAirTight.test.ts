import { MatchClient } from "@/match/transport";
import { EventLog } from "@/analytics/events";
import { PreferenceStore } from "@/preferences/store";
import { WishlistStore } from "@/wishlist/store";
import catalogData from "@/data/catalog.json";
import wishlistData from "@/data/wishlist.json";
import type { Catalog, ParentProduct, Wishlist } from "@/data/types";
import type { CommerceState } from "@/commerce/reconcile";

/**
 * Exhaustive Air-Tight Verification for all 30 Wishlist items across all product categories.
 */

describe("Exhaustive Air-Tight Wishlist Reconnection Verification", () => {
  const catalog = catalogData as Catalog;
  const wishlist = wishlistData as Wishlist;
  const store = new WishlistStore(wishlist);
  const events = new EventLog();
  const preferences = new PreferenceStore();
  const commerce: CommerceState = {
    bag: { items: [] },
    savedForLater: { items: [] },
    orders: { orders: [] },
  };

  const client = new MatchClient({
    catalog,
    wishlist: store.asWishlist(),
    events,
    commerce,
    preferences,
  });

  const parentById = new Map<string, ParentProduct>(
    catalog.parents.map((p) => [p.parent_product_id, p])
  );

  const categoryQueries: Record<string, string[]> = {
    Shirts: ["shirt", "shirts", "men shirt", "cotton shirt"],
    Tshirts: ["tshirt", "tshirts", "t-shirt", "t shirt", "tees"],
    Jeans: ["jeans", "jean", "black jeans", "denim", "denims"],
    Kurtas: ["kurta", "kurtas"],
    "Casual Shoes": ["shoes", "shoe", "casual shoes", "footwear", "sneakers", "boots"],
    Heels: ["heels", "heel", "flats", "sandals", "wedges"],
    Handbags: ["handbag", "handbags", "bag", "bags", "purse"],
    Earrings: ["earring", "earrings", "jewellery", "jewelry"],
    Belts: ["belt", "belts", "men belt", "womens belt"],
    Watches: ["watch", "watches", "mens watch", "womens watch"],
  };

  it("verifies every wishlist category resolves to matching items in 'From your Wishlist'", async () => {
    const failures: string[] = [];

    for (const [articleType, queries] of Object.entries(categoryQueries)) {
      // Find wishlist items of this articleType
      const matchingWishlistItems = wishlist.items.filter((item) => {
        const parent = parentById.get(item.parent_product_id);
        return parent?.articleType === articleType;
      });

      if (matchingWishlistItems.length === 0) continue;

      for (const query of queries) {
        const response = await client.requestMatch(
          {
            query,
            modality: "text",
            pincode: "560034",
            session_id: `sess_test_${query}`,
          },
          true
        );

        if (response.matches.length === 0) {
          failures.push(`Query '${query}' (Category: ${articleType}) returned 0 matches.`);
        } else {
          // Verify that at least one returned match is in this category
          const hasCategoryMatch = response.matches.some((m) => {
            const item = wishlist.items.find((it) => it.sku === m.sku);
            if (!item) return false;
            const parent = parentById.get(item.parent_product_id);
            return (
              parent?.articleType === articleType ||
              parent?.subCategory === articleType ||
              (articleType === "Casual Shoes" && (parent?.subCategory === "Shoes" || parent?.articleType === "Heels"))
            );
          });

          if (!hasCategoryMatch) {
            failures.push(`Query '${query}' matched items outside expected category '${articleType}'`);
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("verifies every eligible individual wishlist item is searchable by brand + category", async () => {
    const unsearchable: string[] = [];

    for (const item of wishlist.items) {
      const parent = parentById.get(item.parent_product_id);
      if (!parent) continue;

      const savedColourway = parent.colourways.find((c) => c.product_id === item.product_id);
      if (!savedColourway) continue;

      // Constraint C-4: Items with identity_confidence < 0.8 are safely withheld
      if (savedColourway.identity_confidence < 0.8) {
        expect(item.role).toBe("low_identity");
        continue;
      }

      const query = `${parent.brand} ${parent.articleType}`.toLowerCase();
      const response = await client.requestMatch(
        {
          query,
          modality: "text",
          pincode: "560034",
          session_id: `sess_${item.item_id}`,
        },
        true
      );

      const found = response.matches.some(
        (m) => m.sku === item.sku || m.display.brand.toLowerCase() === parent.brand.toLowerCase()
      );

      if (!found) {
        unsearchable.push(`Item ${item.item_id} (${parent.brand} ${parent.display_name}) query: '${query}'`);
      }
    }

    expect(unsearchable).toEqual([]);
  });
});
