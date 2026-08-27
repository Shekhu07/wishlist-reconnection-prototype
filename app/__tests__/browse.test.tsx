import { render, screen } from "@testing-library/react-native";
import catalogJson from "@/data/catalog.json";
import type { Catalog } from "@/data/types";
import { BrowseScreen } from "@/screens/BrowseScreen";
import { StubScreen } from "@/screens/StubScreen";

jest.mock("@/data/images", () => ({ CATALOG_IMAGES: new Proxy({}, { get: () => 1 }) }));

const catalog = catalogJson as unknown as Catalog;

describe("browse screens", () => {
  it("shows only products under the price it promises", () => {
    render(<BrowseScreen catalog={catalog} filter="under999" onSelectTile={() => {}} />);
    const tiles = screen.getAllByTestId(/^browse-tile-/);
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(Number(tile.props.accessibilityValue.text)).toBeLessThan(999);
    }
  });

  it("says what a stub is instead of rendering nothing", () => {
    render(<StubScreen reason="Delivery in 30 minutes is not in this prototype." />);
    expect(screen.getByText(/not in this prototype/)).toBeTruthy();
  });
});
