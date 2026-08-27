/** Shapes of the generated data files. Keep in step with tools/catalog/build.py. */

export interface Sku {
  sku: string;
  size: string;
  in_stock: boolean;
  /** True where build.py pinned stock to make a state fixture reachable. */
  stock_override?: boolean;
}

export interface Colourway {
  product_id: number;
  colour: string;
  display_name: string;
  /** Below the configured floor, this never renders as "the same product". */
  identity_confidence: number;
  identity_flags: string[];
  season: string | null;
  usage: string | null;
  price: number;
  seller: string;
  /**
   * Comparison axes for E6. The dataset carries none of these, so they are
   * synthesised deterministically by tools/catalog/synthesize.py. Real enough
   * to exercise the comparison, not real enough to draw conclusions from.
   */
  rating: number;
  review_count: number;
  material: string;
  /** Apparel only; null for footwear and accessories. */
  fit: string | null;
  /** 0 means not returnable. */
  returns_days: number;
  skus: Sku[];
}

export interface ParentProduct {
  parent_product_id: string;
  brand: string;
  brand_key: string;
  gender: string;
  masterCategory: string;
  subCategory: string;
  articleType: string;
  name_core: string;
  display_name: string;
  /** False when the parent groups every plain garment of its type. */
  specific: boolean;
  sizes: string[];
  /**
   * True only for the invented home range. Everything else in this catalog is
   * a real dataset row. Measurement code filters on this -- a precision figure
   * computed partly over invented products would be measuring the generator.
   */
  synthetic?: boolean;
  colourways: Colourway[];
}

export interface Catalog {
  generated_from: string;
  /** Fixed date the recency term scores against, so fixtures never drift. */
  today: string;
  parents: ParentProduct[];
  families: Record<string, { wishlisted: string[]; filler: string[] }>;
  roles: Record<string, string>;
  stock_overrides: { sku: string; in_stock: boolean; role: string }[];
}

export interface WishlistItem {
  item_id: string;
  role: string;
  parent_product_id: string;
  product_id: number;
  sku: string;
  colour: string;
  size: string;
  saved_at: string;
  price_at_save: number;
  /** The E1 record persists seller too, so a seller change is detectable. */
  seller_at_save: string;
}

export interface Wishlist {
  user_id: string;
  pincode: string;
  items: WishlistItem[];
}

export interface Scenario {
  id: string;
  state: number;
  label: string;
  query: string;
  modality: "text" | "voice" | "image" | "recent" | "category";
  filters: Record<string, unknown>;
  authenticated: boolean;
  dismissFirst?: boolean;
  outOfScope?: boolean;
  note?: string;
  expect: {
    moduleVisible: boolean;
    matchCount: number;
    copyKey?: string;
    suppressed?: boolean;
  };
}
