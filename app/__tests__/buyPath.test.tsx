import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import App from "../App";
import { SavedProductScreen } from "@/screens/SavedProductScreen";
import { InventorySimulator } from "@/revalidation/inventory";
import { revalidate } from "@/revalidation/revalidate";
import { boundaryBlockRate } from "@/analytics/metrics";
import { EventLog } from "@/analytics/events";
import { makeCatalog, makeWishlist } from "./helpers/fixtures";

jest.mock("@/data/images", () => ({ CATALOG_IMAGES: new Proxy({}, { get: () => 1 }) }));

/**
 * Improvement 3: the Buy-from-Wishlist path, end to end.
 *
 * Steps 1-5 were already built in slice 2. What was missing is what happens
 * *after* the add -- three genuinely different next moves that a 2.6 second
 * toast cannot carry -- and step 8's promise that the search position survives
 * the round trip.
 */

const PINCODE = "560034";
const noop = () => undefined;

function setup(mutate?: (inventory: InventorySimulator) => void) {
  const catalog = makeCatalog();
  const inventory = new InventorySimulator(catalog);
  mutate?.(inventory);
  const item = makeWishlist().items[0];
  return { item, result: revalidate(item, catalog, inventory, PINCODE)! };
}

function renderScreen(props: Partial<Parameters<typeof SavedProductScreen>[0]> = {}) {
  const { item, result } = setup();
  return render(
    <SavedProductScreen
      result={result}
      pincode={PINCODE}
      selectedSize={item.size}
      onBack={noop}
      onMoveToBag={noop}
      onRecoveryPrimary={noop}
      onRecoverySecondary={noop}
      onChooseSize={noop}
      {...props}
    />
  );
}

describe("after the item reaches the bag", () => {
  it("names where the item came from and offers three next moves", () => {
    renderScreen({ added: "added" });
    expect(screen.getByText("Added to Bag from Wishlist")).toBeTruthy();
    for (const id of ["after-add-bag", "after-add-compare", "after-add-browse"]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
  });

  it("announces itself rather than relying on a toast nobody hears", () => {
    // The toast is visual-only and gone in 2.6 seconds. A confirmation that a
    // screen-reader user never receives is not a confirmation.
    renderScreen({ added: "added" });
    const alert = screen.getByTestId("added-confirmation");
    expect(alert.props.accessibilityRole).toBe("alert");
    expect(alert.props.accessibilityLiveRegion).toBe("polite");
  });

  it("says it was already there instead of pretending to add it twice", () => {
    // FR-11: the duplicate case is an outcome worth naming, not a failure.
    renderScreen({ added: "duplicate" });
    expect(screen.getByText("Already in your Bag — not added twice")).toBeTruthy();
    expect(screen.queryByTestId("move-to-bag")).toBeNull();
  });

  it("replaces the Buy button rather than sitting beside it", () => {
    // Two live "Move to Bag" affordances after a successful add invites the
    // duplicate FR-11 exists to prevent.
    renderScreen({ added: "added" });
    expect(screen.queryByTestId("move-to-bag")).toBeNull();
  });

  it("routes each next move to a different place", () => {
    const onAfterAdd = jest.fn();
    renderScreen({ added: "added", onAfterAdd });
    fireEvent.press(screen.getByTestId("after-add-bag"));
    fireEvent.press(screen.getByTestId("after-add-compare"));
    fireEvent.press(screen.getByTestId("after-add-browse"));
    expect(onAfterAdd.mock.calls.map(([next]) => next)).toEqual(["bag", "compare", "browse"]);
  });

  it("shows no confirmation before anything has been added", () => {
    renderScreen();
    expect(screen.queryByTestId("added-confirmation")).toBeNull();
    expect(screen.getByTestId("move-to-bag")).toBeTruthy();
  });
});

describe("the boundary block metric", () => {
  it("distinguishes no attempts from attempts that were never blocked", () => {
    expect(boundaryBlockRate(new EventLog().all()).value).toBeNull();
  });

  it("counts only the adds the binding read actually stopped", () => {
    const log = new EventLog();
    const base = {
      ts: "2026-08-26",
      user_id: "u",
      session_id: "s",
      arm: "treatment_b" as const,
      sku: "sku_1",
      size: "M",
      colour: "Blue",
    };
    log.emit({ ...base, type: "move_to_bag_attempted", result: "added", revalidation_changed: false });
    log.emit({
      ...base,
      type: "move_to_bag_attempted",
      result: "blocked_variant_unavailable",
      revalidation_changed: true,
    });
    expect(boundaryBlockRate(log.all())).toMatchObject({ numerator: 1, denominator: 2 });
  });
});

describe("the round trip through the app", () => {
  it("adds from the module and offers the three next moves", async () => {
    render(<App />);
    fireEvent.press(screen.getByLabelText("Search for products"));
    const input = screen.getByLabelText("Search for products");
    fireEvent.changeText(input, "mark taylor shirts");
    fireEvent(input, "submitEditing");
    await waitFor(() => expect(screen.getByTestId("wishlist-module")).toBeTruthy());

    fireEvent.press(screen.getByTestId("wishlist-action-primary"));
    await waitFor(() => expect(screen.getByTestId("saved-product")).toBeTruthy());
    fireEvent.press(screen.getByTestId("move-to-bag"));

    expect(screen.getByTestId("added-confirmation")).toBeTruthy();
    fireEvent.press(screen.getByTestId("after-add-browse"));
    // Step 8: the query is still the one the user typed, not a reset.
    await waitFor(() => expect(screen.getByTestId("search-results")).toBeTruthy());
    expect(screen.getByText("mark taylor shirts")).toBeTruthy();
  });

  it("catches a stale card at the tap, not just at the re-render", async () => {
    // Every other stock control announces the change to React, so the screen
    // re-renders into recovery before the user can tap and the binding read is
    // never the thing that catches it -- which would make boundaryBlockRate a
    // number that could only ever be zero. "Sell out silently" leaves the card
    // stale on purpose so the mechanism is reachable and falsifiable.
    render(<App />);
    fireEvent.press(screen.getByLabelText("Search for products"));
    const input = screen.getByLabelText("Search for products");
    fireEvent.changeText(input, "mark taylor shirts");
    fireEvent(input, "submitEditing");
    await waitFor(() => expect(screen.getByTestId("wishlist-module")).toBeTruthy());

    fireEvent.press(screen.getByTestId("wishlist-action-primary"));
    await waitFor(() => expect(screen.getByTestId("saved-product")).toBeTruthy());

    const openHarness = () => fireEvent.press(screen.getByLabelText(/Open the state harness/));
    openHarness();
    fireEvent.press(
      screen.getByLabelText("Sell out the saved size without refreshing the screen")
    );
    openHarness();

    // The card still offers the purchase, because nothing told it not to.
    const buy = screen.getByTestId("move-to-bag");
    expect(buy).toBeTruthy();

    fireEvent.press(buy);
    // The tap is refused and the screen turns into a recovery state. Nothing
    // was added, and no substitution was made.
    expect(screen.queryByTestId("added-confirmation")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("recovery-variant_unavailable")).toBeTruthy());
  });

  it("blocks the add when stock moves while the user is deciding", async () => {
    render(<App />);
    fireEvent.press(screen.getByLabelText("Search for products"));
    const input = screen.getByLabelText("Search for products");
    fireEvent.changeText(input, "mark taylor shirts");
    fireEvent(input, "submitEditing");
    await waitFor(() => expect(screen.getByTestId("wishlist-module")).toBeTruthy());

    fireEvent.press(screen.getByTestId("wishlist-action-primary"));
    await waitFor(() => expect(screen.getByTestId("saved-product")).toBeTruthy());
    expect(screen.getByTestId("move-to-bag")).toBeTruthy();

    // Sell the size out from under the user while the product is on screen.
    const openHarness = () => fireEvent.press(screen.getByLabelText(/Open the state harness/));
    openHarness();
    fireEvent.press(screen.getByLabelText("Sell out the saved size before the next action"));
    openHarness();

    // A recovery state, never a generic error and never a silent substitution.
    await waitFor(() => expect(screen.getByTestId("recovery-variant_unavailable")).toBeTruthy());
    expect(screen.queryByTestId("move-to-bag")).toBeNull();
    expect(screen.queryByTestId("added-confirmation")).toBeNull();
  });
});
