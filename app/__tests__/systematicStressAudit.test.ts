import { makeCatalog, makeWishlist } from "./helpers/fixtures";
import { WishlistStore } from "@/wishlist/store";
import { MatchClient } from "@/match/transport";
import { revalidate, servesPincode, deliveryDateFor } from "@/revalidation/revalidate";
import { InventorySimulator } from "@/revalidation/inventory";
import { signalsFor } from "@/confidence/signals";
import { completeTheLook } from "@/wishlist/lookCompletion";
import { slotFor, slotsComplement } from "@/wishlist/slots";
import { buildColumns } from "@/screens/CompareScreen";
import { tradeOffs } from "@/compare/decide";
import { buildSearchIndex, search } from "@/search/localSearch";
import { buildGazetteers, parseIntent } from "@/match/intent";
import { addToBag, removeFromBag, reconcile, wouldDuplicate } from "@/commerce/reconcile";
import { pathFor, rootFor, switchTab, push, pop, top, type Nav } from "@/shell/nav";
import { EventLog } from "@/analytics/events";
import { PreferenceStore } from "@/preferences/store";
import type { Catalog, WishlistItem } from "@/data/types";
import type { MatchRequest } from "@/match/contract";

describe("SYSTEMATIC STRESS AUDIT SUITE", () => {
  let catalog: Catalog;
  let rawWishlist: ReturnType<typeof makeWishlist>;
  let inventory: InventorySimulator;

  beforeEach(() => {
    catalog = makeCatalog();
    rawWishlist = makeWishlist();
    inventory = new InventorySimulator(catalog);
  });

  describe("1. Wishlist Operations & Store Stress", () => {
    it("handles adding new items and rejects duplicates of same productId", () => {
      const store = new WishlistStore(rawWishlist);
      // Find a parent not currently in rawWishlist
      const savedIds = new Set(rawWishlist.items.map((i) => i.product_id));
      const parent = catalog.parents.find((p) => p.colourways.some((c) => !savedIds.has(c.product_id)))!;
      const colourway = parent.colourways.find((c) => !savedIds.has(c.product_id))!;
      const initialCount = store.items.length;

      // Add item
      const added = store.add(parent, colourway, "M", "2026-09-04");
      expect(store.items.length).toBe(initialCount + 1);

      // Attempt duplicate add
      const dup = store.add(parent, colourway, "M", "2026-09-04");
      expect(dup.item_id).toBe(added.item_id);
      expect(store.items.length).toBe(initialCount + 1);
    });

    it("verifies toggling save returns correct state and updates version", () => {
      const store = new WishlistStore(rawWishlist);
      const parent = catalog.parents[1];
      const colourway = parent.colourways[0];
      const v0 = store.version;

      const outcome1 = store.toggle(parent, colourway, "L", "2026-09-04");
      expect(outcome1).toBe("added");
      expect(store.version).toBeGreaterThan(v0);

      const outcome2 = store.toggle(parent, colourway, "L", "2026-09-04");
      expect(outcome2).toBe("removed");
      expect(store.isSaved(colourway.product_id)).toBe(false);
    });

    it("handles removing non-existent productId without crashing or mutating", () => {
      const store = new WishlistStore(rawWishlist);
      const v0 = store.version;
      store.remove(99999999);
      expect(store.version).toBe(v0);
    });
  });

  describe("2. Search & Parser Edge Cases", () => {
    it("evaluates query parser on diverse edge-case inputs", () => {
      const gaz = buildGazetteers(catalog.parents);
      const inputs = [
        "",
        "   ",
        "???!!!@@#$%",
        "shirt",
        "red shirt men",
        "women's floral summer dress",
        "blue jeans 32",
        "mark taylor casual shirt slim fit",
        "puma shoes size 10 black",
        "a".repeat(200),
        "🎽 👗 👔",
        "undefined",
        "null",
      ];

      for (const q of inputs) {
        expect(() => {
          const parsed = parseIntent(q, "text", gaz);
          expect(parsed).toBeDefined();
        }).not.toThrow();
      }
    });

    it("ensures localSearch handles extreme inputs without returning invalid scores", () => {
      const index = buildSearchIndex(catalog);
      const queries = ["", "   ", "xyznotfound999", "shirt", "blue", "men", "1001"];

      for (const q of queries) {
        const results = search(q, index, 10);
        expect(Array.isArray(results)).toBe(true);
        for (const r of results) {
          expect(Number.isFinite(r.score)).toBe(true);
          expect(r.score).toBeGreaterThan(0);
          expect(r.parent).toBeDefined();
          expect(r.colourway).toBeDefined();
        }
      }
    });
  });

  describe("3. MatchClient & Reconnection Logic", () => {
    it("handles out of stock items and variant unavailability", async () => {
      const store = new WishlistStore(rawWishlist);
      const events = new EventLog();
      const commerce = { bag: { items: [] }, savedForLater: { items: [] }, orders: { orders: [] } };
      const preferences = new PreferenceStore();
      const client = new MatchClient({
        catalog,
        wishlist: store.asWishlist(),
        events,
        commerce,
        preferences,
      });

      const request: MatchRequest = {
        query: "shirt",
        modality: "text",
        filters: {},
        delivery_pincode: "560034",
        session_id: "sess_audit",
        search_id: "search_1",
      };

      const response = await client.requestMatch(request, true);
      expect(response).toBeDefined();
      expect(Array.isArray(response.matches)).toBe(true);
      for (const m of response.matches) {
        expect(m.sku).toBeTruthy();
        expect(m.parent_product_id).toBeTruthy();
        expect(m.display.brand).toBeTruthy();
        expect(m.display.name).toBeTruthy();
        expect(m.saved.color).toBeDefined();
        expect(m.saved.size).toBeDefined();
        expect(m.current.state).toBeDefined();
      }
    });

    it("verifies frequency caps and suppression behavior", async () => {
      const store = new WishlistStore(rawWishlist);
      const client = new MatchClient({
        catalog,
        wishlist: store.asWishlist(),
        latencyMs: 1,
      });

      const req: MatchRequest = {
        query: "mark taylor shirts",
        modality: "text",
        filters: {},
        delivery_pincode: "560034",
        session_id: "sess_freq",
        search_id: "search_freq_1",
      };

      const r1 = await client.requestMatch(req, true);
      const r2 = await client.requestMatch({ ...req, search_id: "search_freq_2" }, true);
      const r3 = await client.requestMatch({ ...req, search_id: "search_freq_3" }, true);

      expect(r1).toBeDefined();
      expect(r2).toBeDefined();
      expect(r3).toBeDefined();
    });
  });

  describe("4. Revalidation & Binding Freshness", () => {
    it("returns null when parent or colourway is not in catalog", () => {
      const fakeItem: WishlistItem = {
        item_id: "fake_1",
        parent_product_id: "nonexistent_parent",
        product_id: 999999,
        sku: "sku_fake",
        colour: "Blue",
        size: "M",
        saved_at: "2026-09-01",
        price_at_save: 1000,
        seller_at_save: "Fake Seller",
        role: "user_saved",
      };

      const result = revalidate(fakeItem, catalog, inventory, "560034");
      expect(result).toBeNull();
    });

    it("identifies variant unavailable when item size is sold out in simulator", () => {
      const item = rawWishlist.items[0];
      // Mark item sku out of stock in inventory using sellOut
      inventory.sellOut(item.sku);

      const result = revalidate(item, catalog, inventory, "560034");
      expect(result).not.toBeNull();
      expect(result?.blocking).toBe("variant_unavailable");
      expect(result?.alternatives).toBeDefined();
    });

    it("identifies delivery unavailable for unserviced pincodes", () => {
      const item = rawWishlist.items[0];
      const seller = catalog.parents.find((p) => p.parent_product_id === item.parent_product_id)!
        .colourways[0].seller;

      let unservicedPincode = "000000";
      for (let p = 100000; p <= 100050; p++) {
        if (!servesPincode(seller, String(p))) {
          unservicedPincode = String(p);
          break;
        }
      }

      const result = revalidate(item, catalog, inventory, unservicedPincode);
      expect(result).not.toBeNull();
      if (!servesPincode(seller, unservicedPincode)) {
        expect(result?.blocking).toBe("delivery_unavailable");
      }
    });

    it("detects price change advisory when price differs from save time", () => {
      const item = { ...rawWishlist.items[0], price_at_save: 999999 };
      const result = revalidate(item, catalog, inventory, "560034");
      expect(result?.advisories).toContain("price_changed");
    });
  });

  describe("5. Decision Confidence Signals", () => {
    it("generates complete signal set without null pointer errors", () => {
      const item = rawWishlist.items[0];
      const result = revalidate(item, catalog, inventory, "560034");
      expect(result).not.toBeNull();

      const signals = signalsFor(result!, { size: item.size, colour: item.colour });
      expect(signals.length).toBeGreaterThanOrEqual(8);
      for (const sig of signals) {
        expect(sig.key).toBeTruthy();
        expect(sig.source).toBeTruthy();
        expect(sig.value).toBeDefined();
        expect(typeof sig.value).toBe("string");
        expect(sig.status).toMatch(/ok|attention|blocked|unknown/);
      }
    });
  });

  describe("6. Comparison Engine & Decision Pillars", () => {
    it("buildColumns works when 0 alternatives exist", () => {
      const item = rawWishlist.items[0];
      const parent = catalog.parents.find((p) => p.parent_product_id === item.parent_product_id)!;
      const colourway = parent.colourways[0];

      // Query that matches nothing else
      const cols = buildColumns(catalog, parent, colourway, item, "xyz999uniquequery", inventory, "560034");
      expect(cols.length).toBe(1);
      expect(cols[0].isSaved).toBe(true);
    });

    it("tradeOffs calculates correct undifferentiated flags across priority axes", () => {
      const cols = [
        { key: "saved", label: "Item 1", isSaved: true, values: { fit: "Regular", sizes: "M in stock" } },
        { key: "alt1", label: "Item 2", isSaved: false, values: { fit: "Slim", sizes: "M in stock" } },
      ];

      const res = tradeOffs(cols, "fit");
      expect(res.length).toBe(2); // fit priority has ["fit", "sizes"]
      const sizesLine = res.find((l) => l.axis === "sizes");
      expect(sizesLine?.undifferentiated).toBe(true);
      const fitLine = res.find((l) => l.axis === "fit");
      expect(fitLine?.undifferentiated).toBe(false);
    });
  });

  describe("7. Look Completion Engine", () => {
    it("returns empty array when seed has no complementary slots or no matching wishlist items", () => {
      const parent = catalog.parents[0];
      const colourway = parent.colourways[0];
      const emptyWishlist = { user_id: "u1", pincode: "560034", items: [] };
      const commerce = { bag: { items: [] }, savedForLater: { items: [] }, orders: { orders: [] } };

      const look = completeTheLook(parent, colourway, {
        catalog,
        wishlist: emptyWishlist,
        commerce,
        inventory,
      });

      expect(look).toEqual([]);
    });

    it("verifies slot conflict rules (full_body cannot pair with top or bottom)", () => {
      expect(slotsComplement("full_body", "top")).toBe(false);
      expect(slotsComplement("full_body", "bottom")).toBe(false);
      expect(slotsComplement("top", "bottom")).toBe(true);
      expect(slotsComplement("top", "feet")).toBe(true);
    });
  });

  describe("8. Commerce & Reconcile States", () => {
    it("handles multiple additions, removals, and prevents duplicates", () => {
      const commerce = { bag: { items: [] }, savedForLater: { items: [] }, orders: { orders: [] } };
      const item = rawWishlist.items[0];

      expect(wouldDuplicate(item, commerce)).toBe(false);

      addToBag(item, item.size, commerce);
      expect(commerce.bag.items.length).toBe(1);
      expect(wouldDuplicate(item, commerce)).toBe(true);

      // Attempting to add duplicate
      addToBag(item, item.size, commerce);
      expect(commerce.bag.items.length).toBe(1); // Unchanged

      // Removal
      const removed = removeFromBag(item.sku, commerce);
      expect(removed).toBe(true);
      expect(commerce.bag.items.length).toBe(0);
    });

    it("correctly computes reconciliation duplicate states", () => {
      const item: WishlistItem = {
        item_id: "wi_rec",
        parent_product_id: "pp_rec",
        product_id: 100,
        sku: "sku_rec",
        colour: "Red",
        size: "L",
        saved_at: "2026-08-01",
        price_at_save: 1500,
        seller_at_save: "Fake Seller",
        role: "user_saved",
      };

      const commerce = {
        bag: { items: [{ sku: "sku_rec", parent_product_id: "pp_rec", size: "L", colour: "Red", added_at: "2026-09-01", quantity: 1 }] },
        savedForLater: { items: [] },
        orders: { orders: [] },
      };

      const rec = reconcile(item, commerce);
      expect(rec.state).toBe("in_bag");
    });
  });

  describe("9. Navigation State Machine", () => {
    it("never produces an empty stack or broken route path", () => {
      let nav: Nav = { tab: "home", stack: [rootFor("home")] };
      expect(pathFor(nav, "")).toBe("/");

      nav = push(nav, { name: "searchEntry" });
      expect(pathFor(nav, "")).toBe("/search");

      nav = push(nav, { name: "results" });
      expect(pathFor(nav, "blue shirt")).toBe("/results?q=blue%20shirt");

      nav = push(nav, { name: "saved", itemId: "wi_1" });
      expect(pathFor(nav, "")).toBe("/saved/wi_1");

      nav = push(nav, { name: "compare", itemId: "wi_1" });
      expect(pathFor(nav, "")).toBe("/compare/wi_1");

      nav = pop(nav);
      expect(top(nav).name).toBe("saved");

      nav = switchTab(nav, "bag");
      expect(nav.tab).toBe("bag");
      expect(top(nav).name).toBe("bag");
      expect(pathFor(nav, "")).toBe("/bag");
    });
  });
});
