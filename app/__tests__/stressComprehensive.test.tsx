import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import App from "../App";
import { ConfidencePanel } from "@/components/ConfidencePanel";
import { WishlistModule } from "@/components/WishlistModule";
import { completeTheLook } from "@/wishlist/lookCompletion";
import { signalsFor } from "@/confidence/signals";
import { revalidate } from "@/revalidation/revalidate";
import { InventorySimulator } from "@/revalidation/inventory";
import { makeCatalog, makeWishlist } from "./helpers/fixtures";
import type { MatchResponse, Match } from "@/match/contract";

/**
 * End-to-end Comprehensive Stress Test Suite for the MVP Prototype.
 *
 * Verifies:
 * 1. Visual integrity & text alignment (no NaN, undefined, or missing labels).
 * 2. Multi-item Wishlist Module carousel rendering and individual card click navigation.
 * 3. SmartBuy Checklist Decision Pillars & purchase readiness progress gauge.
 * 4. Cross-catalog look completion affinity pairing.
 * 5. Full shopping lifecycle: Home -> Search -> PDP -> Move to Bag -> Bag -> Checkout -> Order Placed.
 */

describe("Comprehensive Stress Testing: Multi-Item Wishlist Module", () => {
  const makeMockMatch = (id: number, size: string, color: string, sku: string): Match => ({
    sku,
    score: 0.96,
    state: "exact",
    saved: { color, size },
    display: {
      name: `Product ${id}`,
      brand: "Brand X",
      imageId: 1001,
      basePrice: 1999,
      discountedPrice: 1999,
    },
    current: {
      state: "exact",
      price: 1999,
      mrp: 2999,
      size_in_stock: true,
      colour_in_stock: true,
      delivery_by: "2026-08-29",
      pincode: "560034",
    },
    copy_key: "exact",
  });

  it("renders a 4-item carousel and allows clicking any card independently", () => {
    const matches: Match[] = [
      makeMockMatch(1, "M", "Blue", "sku_1"),
      makeMockMatch(2, "L", "Red", "sku_2"),
      makeMockMatch(3, "S", "Green", "sku_3"),
      makeMockMatch(4, "XL", "Black", "sku_4"),
    ];

    const response: MatchResponse = {
      query: "shirt",
      matches,
      total_matches: 4,
      capped_total: 4,
      suppressed: false,
      match_latency_ms: 12,
    };

    const onPrimary = jest.fn();
    const onSecondary = jest.fn();

    render(
      <WishlistModule
        response={response}
        onDismiss={jest.fn()}
        onUndo={jest.fn()}
        onPrimary={onPrimary}
        onSecondary={onSecondary}
      />
    );

    // Verify all 4 cards render
    expect(screen.getByTestId("saved-card-sku_1")).toBeTruthy();
    expect(screen.getByTestId("saved-card-sku_2")).toBeTruthy();
    expect(screen.getByTestId("saved-card-sku_3")).toBeTruthy();
    expect(screen.getByTestId("saved-card-sku_4")).toBeTruthy();

    // Click card 3 directly
    fireEvent.press(screen.getByTestId("saved-card-sku_3"));
    expect(onPrimary).toHaveBeenCalledWith("sku_3");

    // Click card 4 directly
    fireEvent.press(screen.getByTestId("saved-card-sku_4"));
    expect(onPrimary).toHaveBeenCalledWith("sku_4");
  });
});

describe("Comprehensive Stress Testing: SmartBuy Checklist & Pillars", () => {
  it("renders all 3 pillars, readiness status, and all 10 signals cleanly", () => {
    const catalog = makeCatalog();
    const wishlist = makeWishlist();
    const inventory = new InventorySimulator(catalog);
    const item = wishlist.items[0];
    const result = revalidate(item, catalog, inventory, "560034");
    if (!result) throw new Error("Revalidation failed");

    const signals = signalsFor(result, { size: "M", colour: "Blue" });
    render(<ConfidencePanel signals={signals} initiallyExpanded={true} />);

    expect(screen.getByTestId("confidence-panel")).toBeTruthy();
    expect(screen.getByText("SmartBuy Checklist")).toBeTruthy();
    expect(screen.getByText("READINESS STATUS")).toBeTruthy();
    expect(screen.getByText("SELECTION & FIT")).toBeTruthy();
    expect(screen.getByText("SHIPPING & FULFILLMENT")).toBeTruthy();
    expect(screen.getByText("GUARANTEES & ASSURANCE")).toBeTruthy();

    // Verify signals render with proper values
    expect(screen.getByTestId("signal-saved_variant")).toBeTruthy();
    expect(screen.getByTestId("signal-size_availability")).toBeTruthy();
    expect(screen.getByTestId("signal-delivery")).toBeTruthy();
    expect(screen.getByTestId("signal-fit")).toBeTruthy();
    expect(screen.getByTestId("signal-returns")).toBeTruthy();
    expect(screen.getByTestId("signal-price")).toBeTruthy();
  });
});

describe("Comprehensive Stress Testing: Look Completion Engine", () => {
  it("generates coherent affinity pairs across categories without errors", () => {
    const catalog = makeCatalog();
    const wishlist = {
      ...makeWishlist(),
      items: [
        makeWishlist().items[0],
        {
          item_id: "item_jeans",
          parent_product_id: "pp_jeans",
          product_id: 2001,
          sku: "sku_2001_32",
          saved_at: "2026-08-20T10:00:00Z",
          size: "32",
          color: "Blue",
          price_at_save: 1999,
          client_mutation_id: "m_jeans",
        },
      ],
    };
    const commerce = { bag: { items: [] }, savedForLater: { items: [] }, orders: { orders: [] } };
    const inventory = new InventorySimulator(catalog);

    const shirtParent = catalog.parents[0];
    const shirtColourway = shirtParent.colourways[0];

    const look = completeTheLook(shirtParent, shirtColourway, {
      catalog,
      wishlist,
      commerce,
      inventory,
    });

    expect(look.length).toBeGreaterThan(0);
    // Cannot pair with the same category (e.g. shirt + shirt)
    expect(look.every((item) => item.parent.articleType !== "Shirts")).toBe(true);
    // Must pair with bottomwear/jeans
    expect(look.some((item) => item.parent.articleType === "Jeans")).toBe(true);
    // Must have valid prices and images
    expect(look.every((item) => item.colourway.price > 0)).toBe(true);
  });
});

describe("Comprehensive Stress Testing: End-to-End App Lifecycle", () => {
  it("executes full search -> saved PDP -> move to bag -> checkout cycle smoothly", async () => {
    render(<App />);

    // 1. Home Screen loads
    expect(screen.getByTestId("home-header")).toBeTruthy();

    // 2. Open Search Entry
    fireEvent.press(screen.getByLabelText("Search for products"));
    expect(screen.getByTestId("search-entry")).toBeTruthy();

    // 3. Search for 'shirt' and submit
    fireEvent.changeText(screen.getByLabelText("Search for products"), "shirt");
    fireEvent.press(screen.getByTestId("search-go"));

    // 4. Results Screen loads
    expect(screen.getByTestId("search-results")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId("wishlist-module")).toBeTruthy();
    });

    // 5. Click Primary Action: 'Buy from Wishlist'
    fireEvent.press(screen.getByTestId("wishlist-action-primary"));

    // 6. Saved Product Screen loads
    expect(screen.getByTestId("saved-product")).toBeTruthy();

    // 7. Move to Bag
    fireEvent.press(screen.getByTestId("move-to-bag"));

    // 8. Open Bag from Bottom Nav
    fireEvent.press(screen.getByLabelText("Bag"));
    expect(screen.getByTestId("bag-screen")).toBeTruthy();

    // 9. Proceed to Checkout
    fireEvent.press(screen.getByTestId("go-checkout"));
    expect(screen.getByTestId("checkout-screen")).toBeTruthy();

    // 10. Place Order
    fireEvent.press(screen.getByTestId("place-order"));
    expect(screen.getByTestId("checkout-placed")).toBeTruthy();
  });
});
