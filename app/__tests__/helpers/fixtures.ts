import type { Catalog, Colourway, ParentProduct, Wishlist } from "@/data/types";

/**
 * A hand-built two-product catalog. The matcher tests use this rather than the
 * generated one so that a change in curation cannot quietly change what a
 * behavioural assertion means.
 */

export const TODAY = "2026-08-26";

function sku(id: string, size: string, inStock: boolean) {
  return { sku: id, size, in_stock: inStock };
}

function colourway(
  productId: number,
  colour: string,
  stock: Record<string, boolean>,
  displayName = "Striped Shirt",
  identityConfidence = 1
): Colourway {
  return {
    product_id: productId,
    colour,
    display_name: displayName,
    identity_confidence: identityConfidence,
    identity_flags: [],
    season: "Summer",
    usage: "Casual",
    price: 1999,
    seller: "Myntra Retail",
    rating: 4.1,
    review_count: 320,
    material: "Cotton",
    fit: "Regular Fit",
    returns_days: 14,
    skus: Object.entries(stock).map(([size, inStock]) =>
      sku(`sku_${productId}_${size}`, size, inStock)
    ),
  };
}

export function makeCatalog(overrides: Partial<ParentProduct> = {}): Catalog {
  const parent: ParentProduct = {
    parent_product_id: "pp_shirt",
    brand: "Mark Taylor",
    brand_key: "marktaylor",
    gender: "Men",
    masterCategory: "Apparel",
    subCategory: "Topwear",
    articleType: "Shirts",
    name_core: "striped",
    display_name: "Striped Shirt",
    specific: true,
    sizes: ["S", "M", "L"],
    colourways: [
      colourway(1001, "Blue", { S: true, M: true, L: true }),
      colourway(1002, "Red", { S: true, M: true, L: true }),
    ],
    ...overrides,
  };

  const other: ParentProduct = {
    parent_product_id: "pp_jeans",
    brand: "Locomotive",
    brand_key: "locomotive",
    gender: "Men",
    masterCategory: "Apparel",
    subCategory: "Bottomwear",
    articleType: "Jeans",
    name_core: "washed",
    display_name: "Washed Jeans",
    specific: true,
    sizes: ["30", "32"],
    colourways: [colourway(2001, "Blue", { "30": true, "32": true }, "Washed Jeans")],
  };

  // A second brand in the same article type, so comparison has a genuinely
  // different option to prefer rather than only other colourways.
  const rival: ParentProduct = {
    parent_product_id: "pp_shirt_rival",
    brand: "Highlander",
    brand_key: "highlander",
    gender: "Men",
    masterCategory: "Apparel",
    subCategory: "Topwear",
    articleType: "Shirts",
    name_core: "check",
    display_name: "Check Shirt",
    specific: true,
    sizes: ["S", "M", "L"],
    colourways: [
      colourway(3001, "Green", { S: true, M: true, L: true }, "Check Shirt"),
      colourway(3002, "Navy Blue", { S: true, M: false, L: true }, "Check Shirt"),
    ],
  };

  return {
    generated_from: "fixture",
    today: TODAY,
    parents: [parent, rival, other],
    families: {},
    roles: {},
    stock_overrides: [],
  };
}

export function makeWishlist(overrides: Partial<Wishlist["items"][0]> = {}): Wishlist {
  return {
    user_id: "u_test",
    pincode: "560034",
    items: [
      {
        item_id: "wi_1",
        role: "test",
        parent_product_id: "pp_shirt",
        product_id: 1001,
        sku: "sku_1001_M",
        colour: "Blue",
        size: "M",
        saved_at: "2026-08-01",
        price_at_save: 1999,
        seller_at_save: "Myntra Retail",
        state: "normal",
        ...overrides,
      },
    ],
  };
}
