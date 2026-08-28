import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import App from "../App";

jest.mock("@/data/images", () => ({ CATALOG_IMAGES: new Proxy({}, { get: () => 1 }) }));

/**
 * The route from the comparison into a product.
 *
 * `onChoose` used to toast for every column but the saved one, so the
 * comparison was a table to read rather than a decision to make -- the user
 * could weigh four alternatives and open none of them. It also left CR-04
 * with nothing to return *from*, which is why this is fixed before slice 13
 * rather than during it.
 */

async function openComparison() {
  render(<App />);
  fireEvent.press(screen.getByLabelText("Search for products"));
  const input = screen.getByLabelText("Search for products");
  fireEvent.changeText(input, "mark taylor shirts");
  fireEvent(input, "submitEditing");
  await waitFor(() => expect(screen.getByTestId("wishlist-module")).toBeTruthy());
  fireEvent.press(screen.getByTestId("wishlist-action-secondary"));
  await waitFor(() => expect(screen.getByTestId("compare-screen")).toBeTruthy());
}

/** The first column that is not the saved item. */
function openAlternative() {
  const alternatives = screen
    .getAllByLabelText(/^Open /)
    .filter((node) => !/your saved/.test(node.props.accessibilityLabel));
  return alternatives[0];
}

describe("opening an option from the comparison", () => {
  it("opens an alternative on its own screen, not a toast", async () => {
    await openComparison();
    // Not /^Open /: that also matches "Open your saved ...", which routes to
    // the saved-product screen and would make this test pass for the wrong
    // reason while the alternative route stayed broken.
    const alternatives = screen
      .getAllByLabelText(/^Open /)
      .filter((node) => !/your saved/.test(node.props.accessibilityLabel));
    expect(alternatives.length).toBeGreaterThan(0);

    fireEvent.press(alternatives[0]);
    await waitFor(() => expect(screen.getByTestId("alternative-product")).toBeTruthy());
    // It is not the saved-product screen wearing a flag: no confidence layer,
    // because there is nothing saved here for that layer to be about.
    expect(screen.queryByTestId("confidence-panel")).toBeNull();
    expect(screen.queryByTestId("saved-product")).toBeNull();
  });

  it("keeps the saved item named as the thing being compared against", async () => {
    await openComparison();
    fireEvent.press(openAlternative());
    await waitFor(() => expect(screen.getByTestId("alternative-product")).toBeTruthy());
    expect(screen.getByText(/Comparing against your saved/)).toBeTruthy();
  });

  it("returns to the comparison rather than to the results", async () => {
    await openComparison();
    fireEvent.press(openAlternative());
    await waitFor(() => expect(screen.getByTestId("alternative-product")).toBeTruthy());

    fireEvent.press(screen.getByTestId("back-to-comparison"));
    await waitFor(() => expect(screen.getByTestId("compare-screen")).toBeTruthy());
  });

  it("still opens the saved item on the saved-product screen", async () => {
    await openComparison();
    fireEvent.press(screen.getByLabelText(/^Open your saved /));
    await waitFor(() => expect(screen.getByTestId("saved-product")).toBeTruthy());
    expect(screen.getByTestId("confidence-panel")).toBeTruthy();
  });
});

describe("the priority selector in the running app", () => {
  it("promotes the chosen rows and keeps every other row", async () => {
    await openComparison();
    const before = screen.getAllByText("Price").length;

    fireEvent.press(screen.getByTestId("priority-delivery"));
    // Nothing disappears: Price is still on screen after prioritising delivery.
    expect(screen.getAllByText("Price").length).toBe(before);
    expect(screen.getByTestId("priority-delivery").props.accessibilityState.selected).toBe(true);
  });

  it("lets the user clear the priority again", async () => {
    await openComparison();
    fireEvent.press(screen.getByTestId("priority-fit"));
    expect(screen.getByTestId("priority-fit").props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByTestId("priority-fit"));
    expect(screen.getByTestId("priority-fit").props.accessibilityState.selected).toBe(false);
  });
});

describe("help me decide", () => {
  it("is absent unless it has been turned on", async () => {
    // Improvement 5: not shown to every user by default, and never a third
    // co-equal action competing with Buy and Compare (FR-5).
    await openComparison();
    expect(screen.queryByTestId("help-me-decide")).toBeNull();
  });

  it("asks for a priority before it will answer", async () => {
    await openComparison();
    fireEvent.press(screen.getByLabelText(/Open the state harness/));
    fireEvent.press(
      screen.getByLabelText("Show the optional Help me decide action in comparison")
    );
    fireEvent.press(screen.getByLabelText(/Open the state harness/));

    const button = screen.getByTestId("help-me-decide");
    expect(button.props.accessibilityState?.disabled ?? button.props.disabled).toBeTruthy();
    fireEvent.press(button);
    expect(screen.queryByTestId("decide-sheet")).toBeNull();

    fireEvent.press(screen.getByTestId("priority-fit"));
    fireEvent.press(screen.getByTestId("help-me-decide"));
    expect(screen.getByTestId("decide-sheet")).toBeTruthy();
    expect(screen.getByTestId("tradeoff-caveat")).toBeTruthy();
  });
});
