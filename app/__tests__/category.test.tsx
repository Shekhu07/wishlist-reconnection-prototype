import { render, screen } from "@testing-library/react-native";
import catalogJson from "@/data/catalog.json";
import type { Catalog } from "@/data/types";
import { CategoryScreen } from "@/screens/CategoryScreen";
import { CATEGORIES, byCategory, categoryLabel } from "@/search/catalogBrowse";

jest.mock("@/data/images", () => ({ CATALOG_IMAGES: new Proxy({}, { get: () => 1 }) }));

const catalog = catalogJson as unknown as Catalog;

/**
 * The six home circles used to open a stub. These are the tests that say the
 * stub is gone -- each circle now lands on the products it names, with a
 * photo on every tile.
 */
describe("a home category screen", () => {
  it("shows products in every circle, none of them empty", () => {
    for (const { key } of CATEGORIES) {
      const view = render(
        <CategoryScreen catalog={catalog} categoryKey={key} onSelectTile={() => {}} />
      );
      expect(screen.getAllByTestId(/^category-tile-/).length).toBeGreaterThan(0);
      view.unmount();
    }
  });

  it("shows exactly the products in that category, and all of them", () => {
    for (const { key } of CATEGORIES) {
      const expected = byCategory(catalog, key).map((t) => t.parent.parent_product_id);
      const view = render(
        <CategoryScreen catalog={catalog} categoryKey={key} onSelectTile={() => {}} />
      );
      const shown = screen
        .getAllByTestId(/^category-tile-/)
        .map((tile) => tile.props.testID.replace("category-tile-", ""));
      expect([...shown].sort()).toEqual([...expected].sort());
      view.unmount();
    }
  });

  it("heads the screen with the label from the circle that opened it", () => {
    render(<CategoryScreen catalog={catalog} categoryKey="footwear" onSelectTile={() => {}} />);
    expect(screen.getByText(categoryLabel("footwear"))).toBeTruthy();
  });

  it("counts what it actually rendered", () => {
    render(<CategoryScreen catalog={catalog} categoryKey="beauty" onSelectTile={() => {}} />);
    const tiles = screen.getAllByTestId(/^category-tile-/);
    expect(screen.getByText(`${tiles.length} items`)).toBeTruthy();
  });

  it("mixes men's and women's products in a category that holds both", () => {
    const byId = new Map(catalog.parents.map((p) => [p.parent_product_id, p]));
    render(<CategoryScreen catalog={catalog} categoryKey="footwear" onSelectTile={() => {}} />);
    const opening = screen
      .getAllByTestId(/^category-tile-/)
      .slice(0, 4)
      .map((tile) => byId.get(tile.props.testID.replace("category-tile-", ""))!);
    expect(opening.some((p) => p.gender === "Men")).toBe(true);
    expect(opening.some((p) => p.gender === "Women")).toBe(true);
  });
});
