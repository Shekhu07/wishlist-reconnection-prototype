import { EMPTY_RESPONSE } from "@/match/contract";
import { MatchClient } from "@/match/transport";
import { PreferenceStore } from "@/preferences/store";
import { makeCatalog, makeWishlist } from "./helpers/fixtures";

/**
 * Section 4.16 / E8: the per-user control, respected server-side.
 *
 * The bar is higher than "the module does not render". Opting out must be
 * indistinguishable from having nothing saved -- otherwise the opt-out itself
 * becomes an oracle, which is the same failure constraint C-6 exists to
 * prevent for logged-out users.
 */

const request = {
  query: "mark taylor shirt",
  modality: "text" as const,
  filters: {},
  delivery_pincode: "560034",
  session_id: "s1",
  search_id: "search_1",
};

const client = (preferences?: PreferenceStore) =>
  new MatchClient({
    catalog: makeCatalog(),
    wishlist: makeWishlist(),
    latencyMs: 5,
    preferences,
  });

describe("per-user wishlist-in-search control (section 4.16)", () => {
  it("shows saved items by default", async () => {
    const result = await client().requestMatch(request, true);
    expect(result.matches).toHaveLength(1);
  });

  it("returns nothing at all once the user opts out", async () => {
    const result = await client(new PreferenceStore({ showWishlistInSearch: false })).requestMatch(request, true);
    expect(result).toEqual(EMPTY_RESPONSE);
  });

  it("is enforced in the service, not by the UI declining to draw", async () => {
    // The matcher must never run. If the response were built and then hidden,
    // the data would still have crossed the boundary.
    const subject = client(new PreferenceStore({ showWishlistInSearch: false }));
    await subject.requestMatch(request, true);
    const record = subject.shadow[subject.shadow.length - 1];
    expect(record.rendered).toBe(0);
    expect(record.matches).toEqual([]);
  });

  it("leaks nothing about the wishlist into the log line either (E8 gate)", async () => {
    const subject = client(new PreferenceStore({ showWishlistInSearch: false }));
    await subject.requestMatch(request, true);
    const logged = JSON.stringify(subject.shadow);
    for (const item of makeWishlist().items) {
      expect(logged).not.toContain(item.sku);
      expect(logged).not.toContain(item.parent_product_id);
      expect(logged).not.toContain(item.item_id);
    }
  });

  it("is indistinguishable from a genuine miss", async () => {
    const optedOut = await client(new PreferenceStore({ showWishlistInSearch: false })).requestMatch(request, true);
    const genuineMiss = await client().requestMatch(
      { ...request, query: "formal blazer" },
      true
    );
    expect(optedOut).toEqual(genuineMiss);
  });

  it("can be turned back on without restarting the session", async () => {
    const subject = client(new PreferenceStore({ showWishlistInSearch: false }));
    expect((await subject.requestMatch(request, true)).matches).toHaveLength(0);
    subject.preferences.showWishlistInSearch = true;
    expect((await subject.requestMatch(request, true)).matches).toHaveLength(1);
  });

  it("does not consume the daily frequency cap while opted out", async () => {
    // An opted-out user is not seeing the module, so those impressions must
    // not be spent -- otherwise turning it back on shows nothing.
    const subject = client(new PreferenceStore({ showWishlistInSearch: false }));
    for (let i = 0; i < 5; i += 1) await subject.requestMatch(request, true);
    subject.preferences.showWishlistInSearch = true;
    expect((await subject.requestMatch(request, true)).matches).toHaveLength(1);
  });
});
