import { fireEvent, render, screen } from "@testing-library/react-native";
import { WishlistModule } from "@/components/WishlistModule";
import { DISMISS_LABEL } from "@/copy/bundle";
import { MIN_TOUCH_TARGET } from "@/design/tokens";
import type { Match, MatchResponse } from "@/match/contract";

jest.mock("@/data/images", () => ({ CATALOG_IMAGES: new Proxy({}, { get: () => 1 }) }));

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    parent_product_id: "pp_shirt",
    sku: "sku_1001_M",
    tier: 1,
    confidence: 0.91,
    identity_confidence: 1,
    saved: { color: "Blue", size: "M", saved_at: "2026-08-01", price_at_save: 1999 },
    current: {
      available: true,
      price: 1999,
      seller: "Myntra Retail",
      delivery_by: "2026-08-29",
      state: "purchasable",
    },
    copy_key: "exact_variant_available",
    display: { brand: "Mark Taylor", name: "Striped Shirt", imageId: 1001 },
    ...overrides,
  };
}

function makeResponse(matches: Match[]): MatchResponse {
  return { matches, capped_total: matches.length, suppressed: false };
}

const noop = () => undefined;

function renderModule(response: MatchResponse, props: Partial<Parameters<typeof WishlistModule>[0]> = {}) {
  return render(
    <WishlistModule
      response={response}
      onDismiss={noop}
      onUndo={noop}
      onPrimary={noop}
      onSecondary={noop}
      {...props}
    />
  );
}

describe("wishlist module (E4)", () => {
  it("renders nothing when there are no matches (state 1 and state 10)", () => {
    renderModule(makeResponse([]));
    expect(screen.queryByTestId("wishlist-module")).toBeNull();
  });

  it("explains why it appeared", () => {
    renderModule(makeResponse([makeMatch()]));
    expect(screen.getByText("You saved this earlier")).toBeTruthy();
  });

  it("shows the saved variant explicitly (FR-4)", () => {
    renderModule(makeResponse([makeMatch()]));
    expect(screen.getByText("Saved: Blue · M")).toBeTruthy();
  });

  it("says the saved size is unavailable instead of showing another one (FR-7)", () => {
    const match = makeMatch({
      copy_key: "exact_variant_unavailable",
      current: { ...makeMatch().current, available: false, state: "variant_unavailable" },
    });
    renderModule(makeResponse([match]));
    expect(screen.getByText("You saved this, but Size M is unavailable")).toBeTruthy();
    expect(screen.getByText("Saved size unavailable")).toBeTruthy();
  });

  it("gives both actions identical geometry so neither reads as subordinate", () => {
    renderModule(makeResponse([makeMatch()]));
    const primary = screen.getByTestId("wishlist-action-primary");
    const secondary = screen.getByTestId("wishlist-action-secondary");
    const flatten = (style: unknown) =>
      (Array.isArray(style) ? style : [style]).filter(Boolean).reduce<Record<string, unknown>>(
        (acc, layer) => Object.assign(acc, layer),
        {}
      );
    const a = flatten(primary.props.style);
    const b = flatten(secondary.props.style);
    expect(a.minHeight).toBe(b.minHeight);
    expect(a.borderRadius).toBe(b.borderRadius);
    expect(a.flex).toBe(b.flex);
  });

  it("meets the minimum touch target on the dismiss control (constraint C-7)", () => {
    renderModule(makeResponse([makeMatch()]));
    const dismiss = screen.getByLabelText(DISMISS_LABEL);
    const slop = dismiss.props.hitSlop;
    expect(20 + slop.left + slop.right).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    expect(20 + slop.top + slop.bottom).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

  it("labels every interactive element for a screen reader", () => {
    renderModule(makeResponse([makeMatch()]));
    for (const id of ["wishlist-action-primary", "wishlist-action-secondary", "wishlist-dismiss"]) {
      expect(screen.getByTestId(id).props.accessibilityLabel).toBeTruthy();
    }
  });

  it("collapses to an undo strip on dismissal (state 9)", () => {
    const onDismiss = jest.fn();
    renderModule(makeResponse([makeMatch()]), { onDismiss });
    fireEvent.press(screen.getByTestId("wishlist-dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("wishlist-module")).toBeNull();
    expect(screen.getByTestId("wishlist-module-dismissed")).toBeTruthy();
  });

  it("restores the module from the undo strip", () => {
    const onUndo = jest.fn();
    renderModule(makeResponse([makeMatch()]), { onUndo });
    fireEvent.press(screen.getByTestId("wishlist-dismiss"));
    fireEvent.press(screen.getByLabelText("Undo"));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("wishlist-module")).toBeTruthy();
  });

  it("moves the action pair to module level at multi-match (state 3)", () => {
    const matches = [makeMatch(), makeMatch({ sku: "b" }), makeMatch({ sku: "c" })].map((m) => ({
      ...m,
      copy_key: "multiple_matches" as const,
    }));
    renderModule(makeResponse(matches));
    expect(screen.getByText("3 items match your search")).toBeTruthy();
    // One pair for the module, not one pair per card (section 4.6 clutter).
    expect(screen.getAllByTestId("wishlist-action-primary")).toHaveLength(1);
  });

  it("still shows brand and saved variant on every carousel card", () => {
    // The compact card once collapsed to zero height and clipped the brand;
    // a card that cannot say whose product it is defeats the module.
    const matches = [makeMatch(), makeMatch({ sku: "b" }), makeMatch({ sku: "c" })].map((m) => ({
      ...m,
      copy_key: "multiple_matches" as const,
    }));
    renderModule(makeResponse(matches));
    expect(screen.getAllByText("MARK TAYLOR")).toHaveLength(3);
    expect(screen.getAllByText("Saved: Blue · M")).toHaveLength(3);
  });
});
