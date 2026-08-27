import { fireEvent, render, screen } from "@testing-library/react-native";
import catalogJson from "@/data/catalog.json";
import type { Catalog } from "@/data/types";
import { SearchEntryScreen } from "@/screens/SearchEntryScreen";

jest.mock("@/data/images", () => ({ CATALOG_IMAGES: new Proxy({}, { get: () => 1 }) }));

const catalog = catalogJson as unknown as Catalog;

const setup = (overrides = {}) => {
  const props = {
    catalog,
    recents: ["crocs"],
    onSubmit: jest.fn(),
    onClearRecents: jest.fn(),
    onBack: jest.fn(),
    onNotImplemented: jest.fn(),
    ...overrides,
  };
  render(<SearchEntryScreen {...props} />);
  return props;
};

describe("the search entry screen", () => {
  it("submits what was typed", () => {
    const props = setup();
    const input = screen.getByLabelText("Search for products");
    fireEvent.changeText(input, "nike shoes");
    fireEvent(input, "submitEditing");
    expect(props.onSubmit).toHaveBeenCalledWith("nike shoes");
  });

  it("does not submit an empty query", () => {
    const props = setup();
    fireEvent(screen.getByLabelText("Search for products"), "submitEditing");
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("submits a recent search on tap", () => {
    const props = setup();
    fireEvent.press(screen.getByLabelText("Search again for crocs"));
    expect(props.onSubmit).toHaveBeenCalledWith("crocs");
  });

  it("names voice and image search rather than doing nothing", () => {
    const props = setup();
    fireEvent.press(screen.getByLabelText("Search by voice"));
    expect(props.onNotImplemented).toHaveBeenCalled();
  });
});
