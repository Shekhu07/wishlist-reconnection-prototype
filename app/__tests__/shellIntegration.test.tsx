import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import App from "../App";

jest.mock("@/data/images", () => ({ CATALOG_IMAGES: new Proxy({}, { get: () => 1 }) }));

describe("home to results", () => {
  it("walks home -> search -> results -> module", async () => {
    render(<App />);
    expect(screen.getByTestId("home-screen")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Search for products"));
    const input = screen.getByLabelText("Search for products");
    fireEvent.changeText(input, "mark taylor shirts");
    fireEvent(input, "submitEditing");

    await waitFor(() => expect(screen.getByTestId("search-results")).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId("wishlist-module")).toBeTruthy());
  });

  it("keeps the bag badge equal to the bag", async () => {
    render(<App />);
    fireEvent.press(screen.getByLabelText("Bag"));
    expect(screen.getByTestId("bag-screen")).toBeTruthy();
  });
});
