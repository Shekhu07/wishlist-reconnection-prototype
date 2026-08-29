import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { AppShell } from "@/shell/AppShell";
import { rootFor, type Nav, type Tab } from "@/shell/nav";

const nav: Nav = { tab: "home", stack: [rootFor("home")] };

describe("the app shell", () => {
  it("shows the five destinations and the bag count", () => {
    render(
      <AppShell nav={nav} bagCount={3} onTab={() => {}} onBack={() => {}} onOpenSearch={() => {}} onOpenWishlist={() => {}} onOpenProfile={() => {}}>
        <Text>screen</Text>
      </AppShell>
    );
    // Named as the predecessor prototype names them: MNow is the 30-minute
    // tab and Luxe the luxury one, under Myntra's own product names.
    for (const label of ["Home", "Explore", "MNow", "Luxe", "Bag"]) {
      expect(screen.getByLabelText(new RegExp(label))).toBeTruthy();
    }
    expect(screen.getByTestId("bag-badge")).toHaveTextContent("3");
  });

  it("hides the badge at zero rather than showing a nought", () => {
    render(
      <AppShell nav={nav} bagCount={0} onTab={() => {}} onBack={() => {}} onOpenSearch={() => {}} onOpenWishlist={() => {}} onOpenProfile={() => {}}>
        <Text>screen</Text>
      </AppShell>
    );
    expect(screen.queryByTestId("bag-badge")).toBeNull();
  });

  it("reports the tab that was tapped", () => {
    const tapped: Tab[] = [];
    render(
      <AppShell nav={nav} bagCount={0} onTab={(t) => tapped.push(t)} onBack={() => {}} onOpenSearch={() => {}} onOpenWishlist={() => {}} onOpenProfile={() => {}}>
        <Text>screen</Text>
      </AppShell>
    );
    fireEvent.press(screen.getByLabelText(/Bag/));
    expect(tapped).toEqual(["bag"]);
  });
});
