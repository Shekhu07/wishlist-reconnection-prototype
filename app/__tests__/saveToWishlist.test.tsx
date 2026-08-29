import { fireEvent, render, screen } from "@testing-library/react-native";
import catalogJson from "@/data/catalog.json";
import wishlistJson from "@/data/wishlist.json";
import type { Catalog, Wishlist } from "@/data/types";
import { MatchClient } from "@/match/transport";
import { InventorySimulator } from "@/revalidation/inventory";
import { byCategory, overview } from "@/search/catalogBrowse";
import { HomeScreen } from "@/screens/HomeScreen";
import { WishlistStore, defaultSizeFor, USER_SAVED_ROLE } from "@/wishlist/store";

jest.mock("@/data/images", () => ({ CATALOG_IMAGES: new Proxy({}, { get: () => 1 }) }));

const catalog = catalogJson as unknown as Catalog;
const wishlist = wishlistJson as unknown as Wishlist;

/**
 * A watch the demo user has not saved, and whose brand nothing saved shares.
 *
 * `parents.find(articleType === "Watches")` was enough while the wishlist held
 * eleven items and no accessories. It stopped being enough when the saved
 * wardrobe added watches and belts: the first watch in the catalog shares a
 * brand with a saved belt, so the "before" query already matched and the test
 * failed on data rather than on behaviour. What it needs is an *unsaved*
 * product, so that is what it asks for.
 */
const savedParentIds = new Set(wishlist.items.map((item) => item.parent_product_id));
const savedBrands = new Set(
  catalog.parents
    .filter((p) => savedParentIds.has(p.parent_product_id))
    .map((p) => p.brand)
);
const watch = catalog.parents.find(
  (p) =>
    p.articleType === "Watches" &&
    !savedParentIds.has(p.parent_product_id) &&
    !savedBrands.has(p.brand)
)!;
const shirt = catalog.parents.find((p) => p.articleType === "Shirts")!;

describe("the runtime wishlist store", () => {
  it("starts from the shipped fixture", () => {
    const store = new WishlistStore(wishlist);
    expect(store.items).toHaveLength(wishlist.items.length);
    expect(store.userId).toBe(wishlist.user_id);
  });

  it("never writes back to the fixture", () => {
    const before = wishlist.items.length;
    const store = new WishlistStore(wishlist);
    store.add(watch, watch.colourways[0], "Onesize", catalog.today);
    // The generated file is what every gate measures. A demo click must not
    // be able to change it.
    expect(wishlist.items).toHaveLength(before);
    expect(store.items).toHaveLength(before + 1);
  });

  it("saves a watch — the thing that could not be saved at all", () => {
    const store = new WishlistStore(wishlist);
    const colourway = watch.colourways[0];
    expect(store.isSaved(colourway.product_id)).toBe(false);

    const item = store.add(watch, colourway, "Onesize", catalog.today);
    expect(store.isSaved(colourway.product_id)).toBe(true);
    expect(item.role).toBe(USER_SAVED_ROLE);
    expect(item.parent_product_id).toBe(watch.parent_product_id);
    // The sku has to resolve, or revalidate() cannot read stock for it later.
    expect(colourway.skus.some((s) => s.sku === item.sku)).toBe(true);
  });

  it("records price and seller at save time, so a later change is detectable", () => {
    const store = new WishlistStore(wishlist);
    const colourway = watch.colourways[0];
    const item = store.add(watch, colourway, "Onesize", catalog.today);
    expect(item.price_at_save).toBe(colourway.price);
    expect(item.seller_at_save).toBe(colourway.seller);
  });

  it("toggles rather than stacking duplicates", () => {
    const store = new WishlistStore(wishlist);
    const colourway = watch.colourways[0];
    const n = store.items.length;

    expect(store.toggle(watch, colourway, "Onesize", catalog.today)).toBe("added");
    expect(store.items).toHaveLength(n + 1);
    // Saving the same product twice is one save, not two rows.
    store.add(watch, colourway, "Onesize", catalog.today);
    expect(store.items).toHaveLength(n + 1);

    expect(store.toggle(watch, colourway, "Onesize", catalog.today)).toBe("removed");
    expect(store.items).toHaveLength(n);
  });

  it("prefers a size that is actually in stock", () => {
    const inventory = new InventorySimulator(catalog);
    const inStock = inventory.sizesInStock(shirt, shirt.colourways[0].product_id);
    const chosen = defaultSizeFor(shirt, inStock);
    // Saving a variant nobody can buy would drop the user into a recovery
    // state they did nothing to cause.
    if (inStock.length > 0) expect(inStock).toContain(chosen);
    expect(shirt.sizes).toContain(chosen);
  });
});

describe("a saved item reaches the matcher", () => {
  it("matches a watch that was saved after the client was built", async () => {
    const store = new WishlistStore(wishlist);
    const client = new MatchClient({
      catalog,
      wishlist: store.asWishlist(),
      arm: "treatment_b",
      latencyMs: 0,
    });
    const request = {
      query: `${watch.brand} watch`,
      modality: "text" as const,
      filters: {},
      delivery_pincode: store.pincode,
      session_id: "s_save",
      search_id: "search_1",
    };

    const before = await client.requestMatch(request, true);
    expect(before.matches).toHaveLength(0);

    store.add(watch, watch.colourways[0], "Onesize", catalog.today);
    client.setWishlist(store.asWishlist());

    // Without setWishlist the index stays frozen at construction and a newly
    // saved product can never match -- the save would look like it worked and
    // do nothing.
    const after = await client.requestMatch(
      { ...request, session_id: "s_save_2" },
      true
    );
    expect(after.matches.length).toBeGreaterThan(0);
  });

  it("keeps a dismissal across a save", async () => {
    const store = new WishlistStore(wishlist);
    const client = new MatchClient({
      catalog,
      wishlist: store.asWishlist(),
      arm: "treatment_b",
      latencyMs: 0,
    });
    const request = {
      query: "shirt",
      modality: "text" as const,
      filters: {},
      delivery_pincode: store.pincode,
      session_id: "s_dismiss",
      search_id: "search_1",
    };
    await client.requestMatch(request, true);
    client.dismiss(request);

    store.add(watch, watch.colourways[0], "Onesize", catalog.today);
    client.setWishlist(store.asWishlist());

    // Rebuilding the client instead of updating it would have erased this.
    const after = await client.requestMatch(request, true);
    expect(after.suppressed).toBe(true);
  });
});

describe("the heart on a product grid", () => {
  function renderHome(saved: Set<number>, onToggle: (id: number) => void) {
    return render(
      <HomeScreen
        catalog={catalog}
        onOpenSearch={() => {}}
        onSelectCategory={() => {}}
        onSelectTile={() => {}}
        onSelectBrand={() => {}}
        savedProductIds={saved}
        onToggleSave={(tile) => onToggle(tile.colourway.product_id)}
      />
    );
  }

  it("offers a save control on every tile", () => {
    renderHome(new Set(), () => {});
    const tiles = screen.getAllByTestId(/^home-tile-/);
    const hearts = screen.getAllByTestId(/^save-\d+/);
    expect(hearts).toHaveLength(tiles.length);
  });

  it("saves the product it sits on", () => {
    const toggled: number[] = [];
    renderHome(new Set(), (id) => toggled.push(id));
    const first = overview(catalog, "all")[0];
    fireEvent.press(screen.getByTestId(`save-${first.colourway.product_id}`));
    expect(toggled).toEqual([first.colourway.product_id]);
  });

  it("shows a filled heart for something already saved", () => {
    const first = overview(catalog, "all")[0];
    renderHome(new Set([first.colourway.product_id]), () => {});
    const heart = screen.getByTestId(`save-${first.colourway.product_id}`);
    expect(heart.props.accessibilityState.selected).toBe(true);
    expect(heart.props.accessibilityLabel).toMatch(/^Remove /);
  });

  it("draws no heart at all when the grid is read-only", () => {
    // A heart wired to nothing reads as a broken control, which is why the
    // original was a plain View. Absent beats dead.
    render(
      <HomeScreen
        catalog={catalog}
        onOpenSearch={() => {}}
        onSelectCategory={() => {}}
        onSelectTile={() => {}}
        onSelectBrand={() => {}}
      />
    );
    expect(screen.queryAllByTestId(/^save-\d+/)).toHaveLength(0);
  });

  it("covers the accessories the user could not save", () => {
    renderHome(new Set(), () => {});
    for (const articleType of ["Watches", "Belts", "Sunglasses", "Wallets"]) {
      const ids = byCategory(catalog, "accessories")
        .filter((t) => t.parent.articleType === articleType)
        .map((t) => t.colourway.product_id);
      expect([articleType, ids.length > 0]).toEqual([articleType, true]);
      const onGrid = ids.filter((id) => screen.queryByTestId(`save-${id}`) !== null);
      expect([articleType, onGrid.length > 0]).toEqual([articleType, true]);
    }
  });
});
