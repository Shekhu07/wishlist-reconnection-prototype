import { fireEvent, render, screen } from "@testing-library/react-native";
import catalogJson from "@/data/catalog.json";
import type { Catalog } from "@/data/types";
import { HomeScreen, type HomeScreenProps } from "@/screens/HomeScreen";
import { CATEGORIES, categoryCover } from "@/search/catalogBrowse";

jest.mock("@/data/images", () => ({ CATALOG_IMAGES: new Proxy({}, { get: () => 1 }) }));

const catalog = catalogJson as unknown as Catalog;

/** Every prop defaulted, so adding one does not touch nine call sites. */
function renderHome(props: Partial<HomeScreenProps> = {}) {
  return render(
    <HomeScreen
      catalog={catalog}
      onOpenSearch={() => {}}
      onSelectCategory={() => {}}
      onSelectTile={() => {}}
      onSelectBrand={() => {}}
      {...props}
    />
  );
}

// The cover photos are deliberately hidden from the accessibility tree -- the
// circle's own label already says where it goes -- so the queries that look
// for them have to opt into hidden elements.
const hidden = { includeHiddenElements: true } as const;

describe("the home screen", () => {
  it("shows every circle in the rail", () => {
    renderHome();
    for (const label of ["Fashion", "Beauty", "Kids", "Footwear", "Accessories", "Home"]) {
      expect(screen.getByLabelText(`Browse ${label}`)).toBeTruthy();
    }
  });

  it("filters the grid by gender tab", () => {
    renderHome();
    fireEvent.press(screen.getByLabelText("Show KIDS"));
    const kidsIds = new Set(
      catalog.parents
        .filter((p) => p.gender === "Boys" || p.gender === "Girls")
        .map((p) => p.parent_product_id)
    );
    const tiles = screen.getAllByTestId(/^home-tile-/);
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(kidsIds.has(tile.props.testID.replace("home-tile-", ""))).toBe(true);
    }
  });

  it("puts a photo in every category circle", () => {
    renderHome();
    for (const key of ["fashion", "beauty", "kids", "footwear", "accessories", "home"]) {
      expect(screen.getByTestId(`category-cover-${key}`, hidden)).toBeTruthy();
    }
  });

  it("keeps the cover photos out of the screen reader's way", () => {
    renderHome();
    // One announcement per circle, from the Pressable's own label.
    expect(screen.queryByTestId("category-cover-fashion")).toBeNull();
  });

  it("never shows the same photo twice above the fold", () => {
    renderHome();
    const covers = CATEGORIES.map(({ key }) => categoryCover(catalog, key));
    expect(new Set(covers).size).toBe(covers.length);
  });

  it("opens the grid on men, women and kids, not on one shelf", () => {
    renderHome();
    const byId = new Map(catalog.parents.map((p) => [p.parent_product_id, p]));
    const opening = screen
      .getAllByTestId(/^home-tile-/)
      .slice(0, 4)
      .map((tile) => byId.get(tile.props.testID.replace("home-tile-", ""))!);
    expect(opening.some((p) => p.gender === "Men")).toBe(true);
    expect(opening.some((p) => p.gender === "Women")).toBe(true);
    expect(opening.some((p) => p.gender === "Boys" || p.gender === "Girls")).toBe(true);
  });
});

describe("the home screen's new sections", () => {
  it("carries the banner carousel, brand rail and sale strip", () => {
    renderHome();
    expect(screen.getByTestId("banner-carousel")).toBeTruthy();
    expect(screen.getByTestId("brand-strip")).toBeTruthy();
    expect(screen.getByTestId("sale-strip")).toBeTruthy();
    expect(screen.getByText("Shop by Brand")).toBeTruthy();
    expect(screen.getByText("Trending Now")).toBeTruthy();
  });

  it("takes a brand card to a search for that brand", () => {
    const searched: string[] = [];
    renderHome({ onSelectBrand: (brand) => searched.push(brand) });
    const cards = screen.getAllByTestId(/^brand-card-/);
    expect(cards.length).toBeGreaterThan(0);
    fireEvent.press(cards[0]);
    expect(searched).toHaveLength(1);
    // A real brand from the catalog, not a placeholder string.
    expect(catalog.parents.some((p) => p.brand === searched[0])).toBe(true);
  });

  it("promises nothing about a saved item on the banners (C-1)", () => {
    renderHome();
    // The teaser is the only surface allowed to mention the wishlist, and it
    // is absent here. Nothing else on the page may reference saved items.
    expect(screen.queryByText(/your saved|wishlist/i)).toBeNull();
  });
});

describe("the home wishlist teaser", () => {
  it("is absent when the arm withholds wishlist surfaces", () => {
    // Not "the user saved nothing" -- the caller passes undefined for control
    // and shadow mode, and the screen must render without it.
    renderHome({ wishlist: undefined });
    expect(screen.queryByTestId("wishlist-teaser")).toBeNull();
  });

  it("shows the saved count and opens the wishlist", () => {
    let opened = 0;
    renderHome({ wishlist: { count: 11, imageId: 8847, onOpen: () => (opened += 1) } });
    const teaser = screen.getByTestId("wishlist-teaser");
    expect(teaser.props.accessibilityLabel).toBe("Wishlist, 11 items saved");
    fireEvent.press(teaser);
    expect(opened).toBe(1);
  });

  it("says nothing about price, discount or urgency on a saved item (C-1)", () => {
    const view = renderHome({
      wishlist: { count: 11, imageId: 8847, onOpen: () => {} },
    });
    const teaser = JSON.stringify(view.toJSON()).match(/wishlist-teaser[\s\S]*?left off/)?.[0] ?? "";
    expect(teaser).not.toBe("");
    for (const banned of [/\d+\s*%\s*off/i, /price/i, /waiting/i, /hurry/i, /\bdeal\b/i]) {
      expect([banned.source, banned.test(teaser)]).toEqual([banned.source, false]);
    }
  });

  it("renders nothing at all for a count of zero", () => {
    renderHome({ wishlist: { count: 0, imageId: null, onOpen: () => {} } });
    expect(screen.queryByTestId("wishlist-teaser")).toBeNull();
  });
});
