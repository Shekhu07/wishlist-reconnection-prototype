import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import App from "../App";
import { ProductScreen, describe as describeProduct } from "@/screens/ProductScreen";
import { SearchSuggestions } from "@/components/SearchSuggestions";
import catalogJson from "@/data/catalog.json";
import type { Catalog } from "@/data/types";

jest.mock("@/data/images", () => ({ CATALOG_IMAGES: new Proxy({}, { get: () => 1 }) }));

/**
 * The product detail page and the typeahead — the two surfaces this feature
 * needed and the app did not have.
 */

const catalog = catalogJson as unknown as Catalog;
const noop = () => undefined;

const parent = catalog.parents.find((p) => p.articleType === "Shirts")!;
const colourway = parent.colourways[0];

function renderProduct(props: Partial<Parameters<typeof ProductScreen>[0]> = {}) {
  return render(
    <ProductScreen
      parent={parent}
      colourway={colourway}
      sizesInStock={parent.sizes}
      deliveryBy="2026-08-29"
      selectedSize={parent.sizes[0]}
      onChooseSize={noop}
      onMoveToBag={noop}
      added={false}
      {...props}
    />
  );
}

/** Text in render order, so section ordering can be asserted rather than eyeballed. */
function orderedText(): string {
  const collect = (node: { children: unknown[] }): string =>
    node.children
      .map((child) => (typeof child === "string" ? child : collect(child as never)))
      .join("\n");
  return screen.root ? collect(screen.root) : "";
}

describe("the product detail page", () => {
  it("puts the pairing between the price and the description", () => {
    // The spec's explicit layout requirement, asserted on positions rather
    // than on a screenshot.
    renderProduct({ pairing: <>PAIRING_MARKER</> });
    const text = orderedText();
    const price = text.indexOf("₹");
    const pairing = text.indexOf("PAIRING_MARKER");
    const description = text.indexOf("Description");

    expect(price).toBeGreaterThan(-1);
    expect(pairing).toBeGreaterThan(price);
    expect(description).toBeGreaterThan(pairing);
  });

  it("renders a neutral price with no MRP or discount (C-1)", () => {
    renderProduct();
    const text = orderedText();
    expect(screen.getByTestId("product-price")).toBeTruthy();
    expect(text).not.toMatch(/%\s*off|MRP|\bsave\b/i);
  });

  it("composes the description from attributes rather than inventing prose", () => {
    // No description field exists anywhere in the data model. Generated
    // marketing tone is exactly what constraint 8 rules out, and a shopper
    // cannot tell invented tone from a real description.
    const line = describeProduct(parent, colourway);
    expect(line).toContain(colourway.material);
    expect(line).toContain(colourway.colour);
    renderProduct();
    expect(screen.getByText(/generated, not real/)).toBeTruthy();
  });

  it("shows no pairing section when nothing saved completes the look", () => {
    renderProduct({ pairing: null });
    expect(screen.queryByTestId("look-strip")).toBeNull();
  });

  it("offers no purchase when the selected size is gone", () => {
    renderProduct({ sizesInStock: [], selectedSize: parent.sizes[0] });
    expect(screen.queryByTestId("product-move-to-bag")).toBeNull();
    expect(screen.getByTestId("product-no-size")).toBeTruthy();
  });
});

describe("the typeahead", () => {
  it("renders nothing before there is anything to suggest", () => {
    render(<SearchSuggestions organic={[]} saved={[]} onOpenSaved={noop} onOpenProduct={noop} />);
    expect(screen.queryByTestId("search-suggestions")).toBeNull();
  });

  it("puts saved matches above organic suggestions", () => {
    const match = {
      parent_product_id: parent.parent_product_id,
      sku: "sku_1",
      tier: 1 as const,
      confidence: 0.9,
      identity_confidence: 1,
      saved: { color: "Blue", size: "M", saved_at: "2026-08-01", price_at_save: 999 },
      current: {
        available: true,
        price: 999,
        seller: "s",
        delivery_by: "2026-08-29",
        state: "purchasable" as const,
      },
      copy_key: "exact_variant_available" as const,
      display: { brand: parent.brand, name: colourway.display_name, imageId: colourway.product_id },
    };
    render(
      <SearchSuggestions
        organic={[{ parent, colourway, score: 1 }]}
        saved={[match]}
        onOpenSaved={noop}
        onOpenProduct={noop}
      />
    );
    const text = orderedText();
    expect(text.indexOf("From your Wishlist")).toBeLessThan(text.indexOf("Suggestions"));
  });

  it("nests no interactive element inside another", () => {
    // A control inside the row rendered a <button> in a <button>: invalid
    // HTML, and two overlapping targets a keyboard user cannot separate.
    render(
      <SearchSuggestions
        organic={[{ parent, colourway, score: 1 }]}
        saved={[]}
        onOpenSaved={noop}
        onOpenProduct={noop}
      />
    );
    const row = screen.getByTestId(`suggestion-organic-${colourway.product_id}`);
    const nested = row.findAllByProps({ accessibilityRole: "button" });
    expect(nested).toHaveLength(1);
  });
});

describe("opening a product from search", () => {
  it("makes result tiles tappable, which they were not", async () => {
    render(<App />);
    fireEvent.press(screen.getByLabelText("Search for products"));
    const input = screen.getByLabelText("Search for products");
    fireEvent.changeText(input, "mark taylor shirts");
    fireEvent(input, "submitEditing");
    await waitFor(() => expect(screen.getByTestId("search-results")).toBeTruthy());

    const tiles = screen.getAllByTestId(/^result-tile-/);
    expect(tiles.length).toBeGreaterThan(0);
    fireEvent.press(tiles[0]);
    await waitFor(() => expect(screen.getByTestId("product-screen")).toBeTruthy());
  });
});
