import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import App from "../App";

jest.mock("@/data/images", () => ({ CATALOG_IMAGES: new Proxy({}, { get: () => 1 }) }));

/**
 * The other half of the E5 gate: search context restored on every
 * back-navigation.
 *
 * The subtle failure this guards against is a re-run of the match on return.
 * That would look fine once, but the module carries a per-item daily frequency
 * cap of two, so a third round trip would silently empty it -- the user's own
 * saved item disappearing because they looked at it.
 */

const waitForModule = () => waitFor(() => expect(screen.getByTestId("wishlist-module")).toBeTruthy());

// Home is the entry point now (Task 12): App no longer opens directly on
// search results, so every test here has to navigate there first, the same
// way a participant would -- open search, type the scenario's own query,
// submit. "mark taylor shirts" is scenarios[1].query with empty filters,
// which is exactly what App initialises to on mount, so this reproduces the
// same match deterministically.
function renderAtResults() {
  render(<App />);
  fireEvent.press(screen.getByLabelText("Search for products"));
  const input = screen.getByLabelText("Search for products");
  fireEvent.changeText(input, "mark taylor shirts");
  fireEvent(input, "submitEditing");
}

describe("navigation between search, saved product and compare", () => {
  it("opens the saved product from Buy from Wishlist and comes back intact", async () => {
    renderAtResults();
    await waitForModule();
    const query = screen.getByText("mark taylor shirts");
    expect(query).toBeTruthy();

    fireEvent.press(screen.getByTestId("wishlist-action-primary"));
    expect(screen.getByTestId("saved-product")).toBeTruthy();
    expect(screen.queryByTestId("search-results")).toBeNull();

    fireEvent.press(screen.getByTestId("back-to-results"));
    expect(screen.getByTestId("search-results")).toBeTruthy();
    expect(screen.getByText("mark taylor shirts")).toBeTruthy();
    await waitForModule();
  });

  it("opens compare from the secondary action and comes back intact", async () => {
    renderAtResults();
    await waitForModule();

    fireEvent.press(screen.getByTestId("wishlist-action-secondary"));
    expect(screen.getByTestId("compare-screen")).toBeTruthy();

    fireEvent.press(screen.getByTestId("compare-back"));
    expect(screen.getByTestId("search-results")).toBeTruthy();
    await waitForModule();
  });

  it("keeps the module alive across repeated round trips", async () => {
    renderAtResults();
    await waitForModule();

    // Three trips is past the per-item daily cap of two. If back-navigation
    // re-ran the match, the module would be gone by now.
    for (let trip = 0; trip < 3; trip += 1) {
      fireEvent.press(screen.getByTestId("wishlist-action-primary"));
      expect(screen.getByTestId("saved-product")).toBeTruthy();
      fireEvent.press(screen.getByTestId("back-to-results"));
      await waitForModule();
    }
  });

  it("carries the saved size into the product screen, preselected", async () => {
    renderAtResults();
    await waitForModule();
    const savedChip = screen.getByText(/^Saved: /);
    const [, colour, size] = savedChip.props.children.join("").match(/Saved: (.+) · (.+)/)!;

    fireEvent.press(screen.getByTestId("wishlist-action-primary"));
    expect(screen.getByText(`Saved: ${colour} · ${size}`)).toBeTruthy();
    expect(screen.getByTestId(`size-${size}`).props.accessibilityState.selected).toBe(true);
  });

  it("reaches the recovery state when stock moves before the action", async () => {
    renderAtResults();
    await waitForModule();

    // The two-phase boundary: the module has already rendered this item as
    // buyable. Selling it out now is precisely the case section 4.14 covers.
    // Task 13 moved the harness controls behind a collapsed pill.
    fireEvent.press(screen.getByLabelText(/Open the state harness/));
    fireEvent.press(screen.getByLabelText("Sell out the saved size before the next action"));
    fireEvent.press(screen.getByTestId("wishlist-action-primary"));

    expect(screen.getByTestId("recovery-variant_unavailable")).toBeTruthy();
    expect(screen.queryByTestId("move-to-bag")).toBeNull();
  });

  it("reaches the withdrawn-product state, which offers no Buy at all", async () => {
    renderAtResults();
    await waitForModule();

    // Task 13 moved the harness controls behind a collapsed pill.
    fireEvent.press(screen.getByLabelText(/Open the state harness/));
    fireEvent.press(screen.getByLabelText("Sell out the whole product before the next action"));
    fireEvent.press(screen.getByTestId("wishlist-action-primary"));

    expect(screen.getByTestId("recovery-product_unavailable")).toBeTruthy();
    expect(screen.queryByTestId("move-to-bag")).toBeNull();
    expect(screen.getByLabelText("Remove from Wishlist")).toBeTruthy();
  });
});
