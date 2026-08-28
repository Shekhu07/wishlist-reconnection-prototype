import {
  ComparisonStore,
  changesSince,
  describeSession,
  findProduct,
} from "@/state/comparisonSession";
import { InventorySimulator } from "@/revalidation/inventory";
import { makeCatalog, makeWishlist } from "./helpers/fixtures";

/**
 * Comparison re-entry (wireframes Part B).
 *
 * The property everything else rests on: the session pins **which** items were
 * compared and never **what they said**. E14 already taught this codebase what
 * happens otherwise -- duplicate reconciliation was cached at index-build time
 * and reproduced exactly the staleness it existed to remove.
 */

const SESSION = "sess_test";
const OTHER_SESSION = "sess_other";

function open(
  store: ComparisonStore,
  catalog = makeCatalog(),
  inventory = new InventorySimulator(catalog),
  productIds = [1001, 3001, 3002]
) {
  const item = makeWishlist().items[0];
  return store.open({
    sessionId: SESSION,
    savedItemId: item.item_id,
    productIds,
    query: "shirt",
    filters: {},
    pincode: "560034",
    variant: { colour: item.colour, size: item.size },
    catalog,
    inventory,
    savedSize: item.size,
  });
}

describe("the comparison session", () => {
  it("survives leaving and coming back", () => {
    const store = new ComparisonStore();
    open(store);
    expect(store.current(SESSION)?.productIds).toHaveLength(3);
  });

  it("belongs to one session and is invisible to another", () => {
    const store = new ComparisonStore();
    open(store);
    expect(store.current(OTHER_SESSION)).toBeNull();
  });

  it("keeps a chosen priority across a re-open of the same item", () => {
    // CR-03 promises to restore the priority by name, and re-picking it is the
    // most expensive part of the decision to make someone repeat.
    const store = new ComparisonStore();
    open(store);
    store.setPriority(SESSION, "fit");
    open(store);
    expect(store.current(SESSION)?.priority).toBe("fit");
  });

  it("separates hiding the bar from abandoning the work", () => {
    // CR-02: dismissing the offer is not discarding the comparison. Only
    // "Start fresh" does that.
    const store = new ComparisonStore();
    open(store);
    store.dismissBar(SESSION);
    expect(store.current(SESSION)?.barDismissed).toBe(true);
    expect(store.current(SESSION)?.productIds).toHaveLength(3);
  });

  it("clears the comparison on start fresh, and nothing else", () => {
    const store = new ComparisonStore();
    const wishlist = makeWishlist();
    const before = JSON.stringify(wishlist);
    open(store);
    store.startFresh(SESSION);

    expect(store.current(SESSION)).toBeNull();
    // The wireframes are explicit that Start fresh must not delete Wishlist
    // items. The store has no access to them, which is the cheapest possible
    // guarantee -- but assert it anyway, because that is the promise.
    expect(JSON.stringify(wishlist)).toBe(before);
  });

  it("describes what would be restored without naming a price", () => {
    const store = new ComparisonStore();
    const session = open(store);
    store.setPriority(SESSION, "delivery");
    const described = describeSession(store.current(SESSION)!, makeWishlist().items[0]);
    expect(described.count).toContain("3 items");
    expect(described.detail).toContain("Priority: delivery");
    expect(described.detail).toContain("Saved: Blue · M");
    expect(session.comparisonId).toMatch(/^cmp_/);
  });
});

describe("what changed while the user was away", () => {
  const savedSize = "M";

  /**
   * The comparison opens against a *clean* catalog and the change happens
   * afterwards -- which is what "since you last compared" means. Mutating
   * before the open would bake the change into the baseline and correctly
   * report nothing.
   */
  function setup(mutate: (inventory: InventorySimulator) => void = () => {}) {
    const catalog = makeCatalog();
    const inventory = new InventorySimulator(catalog);
    const store = new ComparisonStore();
    const session = open(store, catalog, inventory);
    mutate(inventory);
    return { catalog, inventory, session };
  }

  it("reports nothing when nothing moved", () => {
    const { catalog, inventory, session } = setup();
    expect(changesSince(session, catalog, inventory, "560034", savedSize)).toEqual([]);
  });

  it("marks an item whose saved size has gone", () => {
    const { catalog, inventory, session } = setup((inv) => inv.sellOut("sku_3001_M"));
    const changes = changesSince(session, catalog, inventory, "560034", savedSize);
    expect(changes).toEqual([{ productId: 3001, kind: "size_unavailable" }]);
  });

  it("marks a product withdrawn in every variant", () => {
    const { catalog, inventory, session } = setup((inv) =>
      inv.sellOutProduct("pp_shirt_rival")
    );
    const kinds = changesSince(session, catalog, inventory, "560034", savedSize);
    expect(kinds.every((change) => change.kind === "withdrawn")).toBe(true);
    expect(kinds).toHaveLength(2); // both rival colourways were in the comparison
  });

  it("says nothing about an option that was already unavailable when compared", () => {
    // Colourway 3002 has no M in the fixture to begin with. It has not changed,
    // and reporting it on the first resume would cry wolf -- which is how a
    // recovery affordance turns into noise people learn to dismiss.
    const { catalog, inventory, session } = setup();
    const changes = changesSince(session, catalog, inventory, "560034", savedSize);
    expect(changes.map((change) => change.productId)).not.toContain(3002);
  });

  it("marks delivery when the address changes underneath", () => {
    // Section 19: recompute delivery for every compared item when the pincode
    // moves, rather than letting the rows go quietly stale.
    const { catalog, inventory, session } = setup();
    const changes = changesSince(session, catalog, inventory, "100001", savedSize);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.every((change) => change.kind === "delivery_changed")).toBe(true);
  });

  it("is derived fresh every time rather than remembered", () => {
    // The E14 trap: a cached staleness flag reproduces the staleness it exists
    // to detect. Same session object, two different answers.
    const { catalog, inventory, session } = setup();
    expect(changesSince(session, catalog, inventory, "560034", savedSize)).toEqual([]);
    inventory.sellOut("sku_3001_M");
    expect(changesSince(session, catalog, inventory, "560034", savedSize)).toEqual([
      { productId: 3001, kind: "size_unavailable" },
    ]);
  });

  it("gives every changed item a distinguishable name", () => {
    // Several colourways of one product can be compared at once, so a name
    // built from brand and title alone renders the same line three times and
    // tells the user nothing about which option moved. The identical mistake
    // was already made once, in the comparison trade-off labels.
    const { catalog, session } = setup();
    const nameFor = (productId: number) => {
      const found = findProduct(catalog, productId);
      return found
        ? `${found.parent.brand} ${found.colourway.display_name} · ${found.colourway.colour}`
        : "An item";
    };
    const names = session.productIds.map(nameFor);
    expect(new Set(names).size).toBe(names.length);
  });

  it("never silently drops a changed item from the comparison", () => {
    // "Never silently replace the removed item with a new alternative" --
    // the change is reported, and the pinned ids are untouched.
    const { catalog, inventory, session } = setup((inv) => inv.sellOut("sku_3001_M"));
    changesSince(session, catalog, inventory, "560034", savedSize);
    expect(session.productIds).toEqual([1001, 3001, 3002]);
  });
});
