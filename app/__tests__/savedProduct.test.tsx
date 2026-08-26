import { fireEvent, render, screen } from "@testing-library/react-native";
import { BANNED_COPY_PATTERNS } from "@/copy/bundle";
import { SavedProductScreen } from "@/screens/SavedProductScreen";
import { InventorySimulator } from "@/revalidation/inventory";
import { revalidate } from "@/revalidation/revalidate";
import { makeCatalog, makeWishlist } from "./helpers/fixtures";

jest.mock("@/data/images", () => ({ CATALOG_IMAGES: new Proxy({}, { get: () => 1 }) }));

/**
 * The E5 gate: 100% of variant-unavailable cases render recovery rather than a
 * substitution, and no state ever draws a Buy button that cannot buy.
 */

const PINCODE = "560034";
const noop = () => undefined;

function setup(mutate?: (inventory: InventorySimulator, item: ReturnType<typeof makeWishlist>["items"][0]) => void) {
  const catalog = makeCatalog();
  const wishlist = makeWishlist();
  const inventory = new InventorySimulator(catalog);
  const item = wishlist.items[0];
  mutate?.(inventory, item);
  const result = revalidate(item, catalog, inventory, PINCODE)!;
  return { catalog, item, result };
}

/** Every string currently on screen, for whole-surface copy assertions. */
function renderedText(): string {
  return screen.root ? collect(screen.root) : "";
}

function collect(node: { children: unknown[] }): string {
  return node.children
    .map((child) =>
      typeof child === "string" ? child : collect(child as { children: unknown[] })
    )
    .join(" ");
}

function renderScreen(result: ReturnType<typeof setup>["result"], size: string, props = {}) {
  return render(
    <SavedProductScreen
      result={result}
      pincode={PINCODE}
      selectedSize={size}
      onBack={noop}
      onMoveToBag={noop}
      onRecoveryPrimary={noop}
      onRecoverySecondary={noop}
      onChooseSize={noop}
      {...props}
    />
  );
}

describe("saved product screen (E5)", () => {
  it("opens with the saved colour and size preselected (FR-4)", () => {
    const { result, item } = setup();
    renderScreen(result, item.size);
    expect(screen.getByText("Saved: Blue · M")).toBeTruthy();
    expect(screen.getByTestId(`size-${item.size}`).props.accessibilityState.selected).toBe(true);
  });

  it("shows the five facts revalidated at the boundary (section 4.13)", () => {
    const { result } = setup();
    renderScreen(result, "M");
    for (const label of ["Price", "Seller", "Delivery", "Returns"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("offers Move to Bag when the saved variant is genuinely buyable", () => {
    const { result, item } = setup();
    renderScreen(result, item.size);
    const button = screen.getByTestId("move-to-bag");
    // Buying the saved size needs no qualifier on the label.
    expect(button.props.accessibilityLabel).toBe("Move to Bag");
  });

  it("renders named recovery, not a substitution, when the size sold out", () => {
    const { result, item } = setup((inventory, saved) => inventory.sellOut(saved.sku));
    renderScreen(result, item.size);

    expect(screen.getByTestId("recovery-variant_unavailable")).toBeTruthy();
    expect(screen.getByText("Size M sold out")).toBeTruthy();
    // The saved variant is still what the screen is about -- nothing has been
    // swapped underneath the user (FR-7).
    expect(screen.getByText("Saved: Blue · M")).toBeTruthy();
  });

  it("draws no Buy button at all when the purchase cannot proceed", () => {
    const { result, item } = setup((inventory, saved) => inventory.sellOut(saved.sku));
    renderScreen(result, item.size);
    // Not disabled -- absent. A disabled Buy is still a dead end.
    expect(screen.queryByTestId("move-to-bag")).toBeNull();
    expect(screen.getByTestId("recovery-primary")).toBeTruthy();
  });

  it("distinguishes a withdrawn product from a sold-out size (4.2 vs 4.1)", () => {
    const { result, item } = setup((inventory, saved) =>
      inventory.sellOutProduct(saved.parent_product_id)
    );
    renderScreen(result, item.size);
    expect(screen.getByTestId("recovery-product_unavailable")).toBeTruthy();
    expect(screen.getByText("No longer available")).toBeTruthy();
    expect(screen.getByLabelText("Remove from Wishlist")).toBeTruthy();
    expect(screen.queryByTestId("move-to-bag")).toBeNull();
  });

  it("never shows a generic error for any blocking reason (section 4.14)", () => {
    const cases: [(i: InventorySimulator, s: ReturnType<typeof makeWishlist>["items"][0]) => void, string][] = [
      [(i, s) => i.sellOut(s.sku), "recovery-variant_unavailable"],
      [(i, s) => i.sellOutProduct(s.parent_product_id), "recovery-product_unavailable"],
    ];
    for (const [mutate, testId] of cases) {
      const { result, item } = setup(mutate);
      const view = renderScreen(result, item.size);
      expect(screen.getByTestId(testId)).toBeTruthy();
      expect(screen.queryByText(/something went wrong|try again later|error/i)).toBeNull();
      view.unmount();
    }
  });

  it("marks out-of-stock sizes as unselectable rather than hiding them", () => {
    const { result, item } = setup((inventory, saved) => inventory.sellOut(saved.sku));
    renderScreen(result, item.size);
    const gone = screen.getByTestId(`size-${item.size}`);
    expect(gone.props.accessibilityState.disabled).toBe(true);
    expect(gone.props.accessibilityLabel).toBe(`Size ${item.size}, out of stock`);
  });

  it("surfaces a price change as an advisory without blocking the purchase", () => {
    const catalog = makeCatalog();
    const inventory = new InventorySimulator(catalog);
    const item = { ...makeWishlist().items[0], price_at_save: 1499 };
    const result = revalidate(item, catalog, inventory, PINCODE)!;
    renderScreen(result, item.size);

    expect(screen.getByTestId("advisory-price_changed")).toBeTruthy();
    expect(screen.getByTestId("move-to-bag")).toBeTruthy();
    // Both numbers are stated so the user can see the change, but neither is
    // framed as a gain and no direction of travel is named (constraint C-1).
    expect(screen.getByText("Price when saved")).toBeTruthy();
    expect(renderedText()).not.toMatch(/\b(cheaper|lower|reduced|now only|save \u20b9)\b/i);
  });

  it("carries no banned copy anywhere on the screen, in any state", () => {
    const states: ((i: InventorySimulator, s: ReturnType<typeof makeWishlist>["items"][0]) => void)[] = [
      () => undefined,
      (i, s) => i.sellOut(s.sku),
      (i, s) => i.sellOutProduct(s.parent_product_id),
    ];
    for (const mutate of states) {
      const { result, item } = setup(mutate);
      const view = renderScreen(result, item.size);
      const text = renderedText();
      for (const pattern of BANNED_COPY_PATTERNS) {
        expect(text).not.toMatch(pattern);
      }
      view.unmount();
    }
  });

  it("lets the user complete the purchase after choosing an in-stock size", () => {
    // The recovery action has to lead somewhere. Selecting a stocked size must
    // reopen the purchase, or "See what's in stock" is a dead end.
    const { result } = setup((inventory, saved) => inventory.sellOut(saved.sku));
    const stocked = result.current.sizesInStock[0];
    expect(stocked).toBeDefined();
    renderScreen(result, stocked);
    expect(screen.getByTestId("move-to-bag")).toBeTruthy();
  });

  it("names the size it is actually buying when it differs from the saved one", () => {
    const { result, item } = setup((inventory, saved) => inventory.sellOut(saved.sku));
    const stocked = result.current.sizesInStock.find((size) => size !== item.size)!;
    renderScreen(result, stocked);
    // FR-7 bans a silent substitution. An explicit choice is fine; a button
    // that reads "Move to Bag" while quietly buying another size is not.
    expect(screen.getByText(`Move to Bag · Size ${stocked}`)).toBeTruthy();
    expect(screen.getByTestId("move-to-bag").props.accessibilityLabel).toContain(
      `instead of your saved size ${item.size}`
    );
  });

  it("still offers no purchase when the product is gone in every variant", () => {
    const { result } = setup((inventory, saved) =>
      inventory.sellOutProduct(saved.parent_product_id)
    );
    // Every size is out, so there is no size to select that would help.
    for (const size of result.parent.sizes) {
      const view = renderScreen(result, size);
      expect(screen.queryByTestId("move-to-bag")).toBeNull();
      view.unmount();
    }
  });

  it("returns to results without losing the search context", () => {
    const onBack = jest.fn();
    const { result, item } = setup();
    renderScreen(result, item.size, { onBack });
    fireEvent.press(screen.getByTestId("back-to-results"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
