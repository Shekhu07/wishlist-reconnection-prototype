import { fireEvent, render, screen } from "@testing-library/react-native";
import catalogJson from "@/data/catalog.json";
import type { Catalog } from "@/data/types";
import { HomeScreen } from "@/screens/HomeScreen";

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

  it("carries no offer copy on the banner", () => {
    render(<HomeScreen catalog={catalog} onOpenSearch={() => {}} onSelectCategory={() => {}} onSelectTile={() => {}} />);
    expect(screen.queryByText(/your saved|wishlist/i)).toBeNull();
  });
});
