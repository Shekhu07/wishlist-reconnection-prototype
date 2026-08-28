import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import App from "../App";
import { WhySheet } from "@/components/WishlistModule/WhySheet";
import { BANNED_COPY_PATTERNS } from "@/copy/bundle";

jest.mock("@/data/images", () => ({ CATALOG_IMAGES: new Proxy({}, { get: () => 1 }) }));

/**
 * DC-02, "Why are you seeing this?".
 *
 * Section 5 asks for two things that pull against each other: explain the
 * personalisation, and reveal nothing private. The resolution is that the
 * explanation is about the *match*, never about the user's reason for saving.
 */

const noop = () => undefined;

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

function renderSheet(props: Partial<Parameters<typeof WhySheet>[0]> = {}) {
  return render(
    <WhySheet
      open
      onClose={noop}
      onViewItem={noop}
      onHideForSearch={noop}
      onHideAlways={noop}
      {...props}
    />
  );
}

describe("why this appeared (DC-02)", () => {
  it("explains the match without revealing why the item was saved", () => {
    renderSheet();
    expect(screen.getByText("Your search matches a product in your Wishlist.")).toBeTruthy();
    // Section 5: private intent stays private. Nothing here may describe the
    // user's reason for saving, only the fact of the match.
    expect(renderedText()).not.toMatch(/occasion|gift|workwear|planning|forgot/i);
  });

  it("carries no monetary incentive or urgency (C-1)", () => {
    renderSheet();
    for (const pattern of BANNED_COPY_PATTERNS) {
      expect(renderedText()).not.toMatch(pattern);
    }
  });

  it("offers the reversible control and the durable one as different things", () => {
    // FR-8: dismissing is a relevance signal and never a permanent opt-out, so
    // the permanent version cannot be the same control.
    const onHideForSearch = jest.fn();
    const onHideAlways = jest.fn();
    renderSheet({ onHideForSearch, onHideAlways });

    fireEvent.press(screen.getByTestId("why-hide-search"));
    expect(onHideForSearch).toHaveBeenCalledTimes(1);
    expect(onHideAlways).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("why-hide-always"));
    expect(onHideAlways).toHaveBeenCalledTimes(1);
  });

  it("traps itself for a screen reader while it is open", () => {
    renderSheet();
    expect(
      screen.getByLabelText("Why are you seeing this?").props.accessibilityViewIsModal
    ).toBe(true);
  });

  it("renders nothing at all when closed", () => {
    renderSheet({ open: false });
    expect(screen.queryByTestId("why-sheet")).toBeNull();
  });
});

describe("the sheet in the running app", () => {
  it("opens above the results rather than inside the module", async () => {
    // The regression this guards: an overlay resolves against its nearest
    // positioned ancestor, so rendering it inside the module clipped it to the
    // module's box and scrimmed only the module. It now lives in AppShell's
    // sheet slot, a sibling of the body rather than a descendant.
    render(<App />);
    fireEvent.press(screen.getByLabelText("Search for products"));
    const input = screen.getByLabelText("Search for products");
    fireEvent.changeText(input, "mark taylor shirts");
    fireEvent(input, "submitEditing");
    await waitFor(() => expect(screen.getByTestId("wishlist-module")).toBeTruthy());

    fireEvent.press(screen.getByTestId("wishlist-why"));
    const sheet = screen.getByTestId("why-sheet");
    expect(sheet).toBeTruthy();

    // Walk up from the sheet: the search results must not be one of its
    // ancestors, or it is clipped again.
    const ancestors: string[] = [];
    for (let node = sheet.parent; node; node = node.parent) {
      const id = node.props?.testID;
      if (typeof id === "string") ancestors.push(id);
    }
    expect(ancestors).toContain("app-shell");
    expect(ancestors).not.toContain("search-results");
    expect(ancestors).not.toContain("wishlist-module");
  });

  it("logs hiding for this search as the same relevance signal as the close box", async () => {
    render(<App />);
    fireEvent.press(screen.getByLabelText("Search for products"));
    const input = screen.getByLabelText("Search for products");
    fireEvent.changeText(input, "mark taylor shirts");
    fireEvent(input, "submitEditing");
    await waitFor(() => expect(screen.getByTestId("wishlist-module")).toBeTruthy());

    const openHarness = () => fireEvent.press(screen.getByLabelText(/Open the state harness/));
    const count = () =>
      Number(screen.getByTestId("harness-event-count").children.join("").replace(/\D/g, ""));

    openHarness();
    const before = count();
    openHarness();

    fireEvent.press(screen.getByTestId("wishlist-why"));
    fireEvent.press(screen.getByTestId("why-hide-search"));

    // Section 7's dismissal rate counts both entry points or it counts neither.
    openHarness();
    expect(count()).toBeGreaterThan(before);
    openHarness();

    // Suppression is server-side and the re-run is async, so the module goes
    // on the next resolve rather than synchronously.
    await waitFor(() => expect(screen.queryByTestId("wishlist-module")).toBeNull());
  });
});
