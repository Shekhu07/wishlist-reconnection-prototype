import { fireEvent, render, screen } from "@testing-library/react-native";
import { WishlistModule } from "@/components/WishlistModule";
import { HIDE_FOREVER_LABEL, UNDO_LABEL } from "@/copy/bundle";
import { MatchClient } from "@/match/transport";
import {
  MIN_ACTIONS_FOR_PREFERENCE,
  PreferenceStore,
  shouldPersonalise,
} from "@/preferences/store";
import type { Match, MatchResponse } from "@/match/contract";
import { makeCatalog, makeWishlist } from "./helpers/fixtures";

jest.mock("@/data/images", () => ({ CATALOG_IMAGES: new Proxy({}, { get: () => 1 }) }));

const request = {
  query: "mark taylor shirt",
  modality: "text" as const,
  filters: {},
  delivery_pincode: "560034",
  session_id: "s1",
};

function makeMatch(): Match {
  return {
    parent_product_id: "pp_shirt",
    sku: "sku_1001_M",
    tier: 1,
    confidence: 0.9,
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
  };
}

const response: MatchResponse = { matches: [makeMatch()], capped_total: 1, suppressed: false };
const noop = () => undefined;

describe("per-item hide (E16)", () => {
  it("is enforced in the service, not by the view declining to draw", async () => {
    const preferences = new PreferenceStore();
    const wishlist = makeWishlist();
    const client = new MatchClient({
      catalog: makeCatalog(),
      wishlist,
      latencyMs: 5,
      preferences,
    });

    expect((await client.requestMatch(request, true)).matches).toHaveLength(1);
    preferences.hide(wishlist.items[0].item_id);
    expect((await client.requestMatch(request, true)).matches).toHaveLength(0);
  });

  it("is durable across sessions, unlike a dismissal", async () => {
    // FR-8 makes dismissal a relevance signal that never becomes a permanent
    // opt-out. Hiding is the permanent one, and the difference has to survive
    // a new session id or the two controls are the same control.
    const preferences = new PreferenceStore();
    const wishlist = makeWishlist();
    const client = new MatchClient({
      catalog: makeCatalog(),
      wishlist,
      latencyMs: 5,
      preferences,
    });
    preferences.hide(wishlist.items[0].item_id);
    const later = await client.requestMatch({ ...request, session_id: "a-new-session" }, true);
    expect(later.matches).toHaveLength(0);
  });

  it("can be undone, because a durable control without an undo is a trap", async () => {
    const preferences = new PreferenceStore();
    const wishlist = makeWishlist();
    const client = new MatchClient({
      catalog: makeCatalog(),
      wishlist,
      latencyMs: 5,
      preferences,
    });
    preferences.hide(wishlist.items[0].item_id);
    preferences.unhide(wishlist.items[0].item_id);
    expect((await client.requestMatch(request, true)).matches).toHaveLength(1);
  });

  it("offers the durable control only after a dismissal, never instead of it", () => {
    const onHideForever = jest.fn();
    render(
      <WishlistModule
        response={response}
        onDismiss={noop}
        onUndo={noop}
        onHideForever={onHideForever}
        onPrimary={noop}
        onSecondary={noop}
      />
    );
    // Not reachable from the module itself: you land on it by choosing to
    // dismiss first.
    expect(screen.queryByLabelText(HIDE_FOREVER_LABEL)).toBeNull();

    fireEvent.press(screen.getByTestId("wishlist-dismiss"));
    fireEvent.press(screen.getByLabelText(HIDE_FOREVER_LABEL));
    expect(onHideForever).toHaveBeenCalledWith("sku_1001_M");
    expect(screen.getByText("Hidden from search")).toBeTruthy();
  });

  it("still offers undo after hiding", () => {
    render(
      <WishlistModule
        response={response}
        onDismiss={noop}
        onUndo={noop}
        onHideForever={noop}
        onPrimary={noop}
        onSecondary={noop}
      />
    );
    fireEvent.press(screen.getByTestId("wishlist-dismiss"));
    fireEvent.press(screen.getByLabelText(HIDE_FOREVER_LABEL));
    expect(screen.getByLabelText(UNDO_LABEL)).toBeTruthy();
  });
});

describe("preferred-action learning (E16 vs FR-5)", () => {
  it("claims no preference until there is enough evidence", () => {
    const store = new PreferenceStore();
    for (let i = 0; i < MIN_ACTIONS_FOR_PREFERENCE - 1; i += 1) {
      store.recordAction("buy_from_wishlist");
    }
    // Two taps is a coincidence.
    expect(store.preferredAction()).toBeNull();
  });

  it("learns a lopsided preference once the evidence supports it", () => {
    const store = new PreferenceStore();
    for (let i = 0; i < 8; i += 1) store.recordAction("compare_options");
    expect(store.preferredAction()).toBe("compare_options");
  });

  it("claims nothing when the split is close", () => {
    const store = new PreferenceStore();
    for (let i = 0; i < 5; i += 1) {
      store.recordAction("buy_from_wishlist");
      store.recordAction("compare_options");
    }
    expect(store.preferredAction()).toBeNull();
  });

  it("refuses to act on a preference while an experiment is running", () => {
    // The heart of the E16 / FR-5 conflict. Section 7 reads the mechanism off
    // the Buy and Compare rates; personalising which action leads would make
    // those rates a measurement of the personaliser.
    const store = new PreferenceStore({ personaliseActions: true });
    for (let i = 0; i < 10; i += 1) store.recordAction("buy_from_wishlist");
    expect(store.preferredAction()).toBe("buy_from_wishlist");
    expect(shouldPersonalise(store, true)).toBe(false);
    expect(shouldPersonalise(store, false)).toBe(true);
  });

  it("keeps personalisation off unless it is deliberately turned on", () => {
    const store = new PreferenceStore();
    for (let i = 0; i < 10; i += 1) store.recordAction("buy_from_wishlist");
    expect(shouldPersonalise(store, false)).toBe(false);
  });

  it("still records the evidence while the experiment runs", () => {
    // Learning is durable; acting on it is a decision for after the read-out.
    const store = new PreferenceStore();
    for (let i = 0; i < 10; i += 1) store.recordAction("compare_options");
    expect(store.actionCounts.compare_options).toBe(10);
    expect(store.preferredAction()).toBe("compare_options");
  });
});
