import { fireEvent, render, screen } from "@testing-library/react-native";
import catalogJson from "@/data/catalog.json";
import type { Catalog } from "@/data/types";
import { HomeScreen } from "@/screens/HomeScreen";
import { CATEGORIES, categoryCover } from "@/search/catalogBrowse";

jest.mock("@/data/images", () => ({ CATALOG_IMAGES: new Proxy({}, { get: () => 1 }) }));

const catalog = catalogJson as unknown as Catalog;

describe("the home screen", () => {
  it("shows every circle in the rail", () => {
    render(<HomeScreen catalog={catalog} onOpenSearch={() => {}} onSelectCategory={() => {}} onSelectTile={() => {}} />);
    for (const label of ["Fashion", "Beauty", "Kids", "Footwear", "Accessories", "Home"]) {
      expect(screen.getByLabelText(`Browse ${label}`)).toBeTruthy();
    }
  });

  it("filters the grid by gender tab", () => {
    render(<HomeScreen catalog={catalog} onOpenSearch={() => {}} onSelectCategory={() => {}} onSelectTile={() => {}} />);
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

  // The cover photos are deliberately hidden from the accessibility tree --
  // the circle's own label already says where it goes -- so the queries that
  // look for them have to opt into hidden elements.
  const hidden = { includeHiddenElements: true } as const;

  it("puts a photo in every category circle", () => {
    render(<HomeScreen catalog={catalog} onOpenSearch={() => {}} onSelectCategory={() => {}} onSelectTile={() => {}} />);
    for (const key of ["fashion", "beauty", "kids", "footwear", "accessories", "home"]) {
      expect(screen.getByTestId(`category-cover-${key}`, hidden)).toBeTruthy();
    }
  });

  it("keeps the cover photos out of the screen reader's way", () => {
    render(<HomeScreen catalog={catalog} onOpenSearch={() => {}} onSelectCategory={() => {}} onSelectTile={() => {}} />);
    // One announcement per circle, from the Pressable's own label.
    expect(screen.queryByTestId("category-cover-fashion")).toBeNull();
  });

  it("puts a product shot on each partner card", () => {
    render(<HomeScreen catalog={catalog} onOpenSearch={() => {}} onSelectCategory={() => {}} onSelectTile={() => {}} />);
    expect(screen.getAllByTestId(/^partner-image-/, hidden).length).toBeGreaterThan(0);
  });

  it("never shows the same photo twice above the fold", () => {
    // The first brand in the catalog also wins the Fashion circle on review
    // count, so the rail and the partner cards collided on one photo.
    render(<HomeScreen catalog={catalog} onOpenSearch={() => {}} onSelectCategory={() => {}} onSelectTile={() => {}} />);
    const shown = [
      ...CATEGORIES.map(({ key }) => categoryCover(catalog, key)),
      ...screen
        .getAllByTestId(/^partner-image-/, hidden)
        .map((img) => Number(img.props.testID.replace("partner-image-", ""))),
    ];
    expect(new Set(shown).size).toBe(shown.length);
  });

  it("opens the grid on men, women and kids, not on one shelf", () => {
    render(<HomeScreen catalog={catalog} onOpenSearch={() => {}} onSelectCategory={() => {}} onSelectTile={() => {}} />);
    const byId = new Map(catalog.parents.map((p) => [p.parent_product_id, p]));
    const opening = screen
      .getAllByTestId(/^home-tile-/)
      .slice(0, 4)
      .map((tile) => byId.get(tile.props.testID.replace("home-tile-", ""))!);
    expect(opening.some((p) => p.gender === "Men")).toBe(true);
    expect(opening.some((p) => p.gender === "Women")).toBe(true);
    expect(opening.some((p) => p.gender === "Boys" || p.gender === "Girls")).toBe(true);
  });

  it("carries no offer copy on the banner", () => {
    render(<HomeScreen catalog={catalog} onOpenSearch={() => {}} onSelectCategory={() => {}} onSelectTile={() => {}} />);
    expect(screen.queryByText(/your saved|wishlist/i)).toBeNull();
  });
});
