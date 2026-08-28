import { fireEvent, render, screen } from "@testing-library/react-native";
import catalogJson from "@/data/catalog.json";
import wishlistJson from "@/data/wishlist.json";
import type { Catalog, Wishlist } from "@/data/types";
import { BACK_LABELS, BANNED_COPY_PATTERNS, RECOVERY_COPY, formatPrice } from "@/copy/bundle";
import { SavedProductScreen } from "@/screens/SavedProductScreen";
import { InventorySimulator } from "@/revalidation/inventory";
import { revalidate, type RevalidationResult } from "@/revalidation/revalidate";
import { WishlistScreen } from "@/screens/WishlistScreen";
import { TopBar } from "@/shell/TopBar";

jest.mock("@/data/images", () => ({ CATALOG_IMAGES: new Proxy({}, { get: () => 1 }) }));

const catalog = catalogJson as unknown as Catalog;
const wishlist = wishlistJson as unknown as Wishlist;
const PINCODE = wishlist.pincode;

function resultsFor(): RevalidationResult[] {
  const inventory = new InventorySimulator(catalog);
  return wishlist.items
    .map((item) => revalidate(item, catalog, inventory, PINCODE))
    .filter((result): result is RevalidationResult => result !== null);
}

describe("the wishlist page", () => {
  it("lists every saved item", () => {
    const results = resultsFor();
    render(<WishlistScreen results={results} pincode={PINCODE} onSelectItem={() => {}} />);
    expect(screen.getAllByTestId(/^wishlist-row-/)).toHaveLength(results.length);
    for (const result of results) {
      expect(screen.getByTestId(`wishlist-row-${result.item.item_id}`)).toBeTruthy();
    }
  });

  it("states the saved colour and size on every row (FR-4)", () => {
    const results = resultsFor();
    render(<WishlistScreen results={results} pincode={PINCODE} onSelectItem={() => {}} />);
    for (const result of results) {
      const row = screen.getByTestId(`wishlist-row-${result.item.item_id}`);
      expect(row.props.accessibilityLabel).toContain(
        `saved ${result.item.colour} · ${result.item.size}`
      );
    }
  });

  it("opens the saved item it names", () => {
    const results = resultsFor();
    const opened: string[] = [];
    render(
      <WishlistScreen results={results} pincode={PINCODE} onSelectItem={(id) => opened.push(id)} />
    );
    const target = results[1].item.item_id;
    fireEvent.press(screen.getByTestId(`wishlist-row-${target}`));
    expect(opened).toEqual([target]);
  });

  it("says which named thing is wrong rather than 'unavailable' (4.14)", () => {
    const results = resultsFor();
    const blocked = results.filter((result) => result.blocking);
    // The fixture pins stock so blocking states are reachable; if that ever
    // stops being true this assertion is measuring nothing, so check it.
    expect(blocked.length).toBeGreaterThan(0);

    render(<WishlistScreen results={results} pincode={PINCODE} onSelectItem={() => {}} />);
    for (const result of blocked) {
      const expected = RECOVERY_COPY[result.blocking!]({
        size: result.item.size,
        colour: result.item.colour,
        seller: result.current.seller,
        pincode: PINCODE,
      }).title;
      expect(
        screen.getByTestId(`wishlist-status-${result.item.item_id}`).props.children
      ).toBe(expected);
    }
  });

  it("never shows an available size in place of a sold-out saved one (FR-7)", () => {
    const results = resultsFor();
    const blocked = results.find((r) => r.blocking === "variant_unavailable");
    if (!blocked) return;
    render(<WishlistScreen results={results} pincode={PINCODE} onSelectItem={() => {}} />);
    const row = screen.getByTestId(`wishlist-row-${blocked.item.item_id}`);
    // The row still names the size the user saved, not one that happens to be
    // in stock.
    expect(row.props.accessibilityLabel).toContain(`· ${blocked.item.size}`);
  });

  it("prices saved items neutrally, with no incentive anywhere (C-1)", () => {
    const results = resultsFor();
    const view = render(
      <WishlistScreen results={results} pincode={PINCODE} onSelectItem={() => {}} />
    );
    const text = JSON.stringify(view.toJSON());
    for (const pattern of BANNED_COPY_PATTERNS) {
      expect([pattern.source, pattern.test(text)]).toEqual([pattern.source, false]);
    }
    // And the price that is shown is the plain one: no MRP, no strike-through.
    const priced = results.find((result) => !result.blocking);
    if (priced) {
      expect(text).toContain(formatPrice(priced.current.price));
      expect(text).not.toContain(String(priced.colourway.mrp.toLocaleString("en-IN")));
    }
  });

  it("names the Wishlist on Back when that is where the user came from", () => {
    const results = resultsFor();
    render(
      <SavedProductScreen
        result={results[0]}
        pincode={PINCODE}
        backFrom="wishlist"
        onBack={() => {}}
        onMoveToBag={() => {}}
        onRecoveryPrimary={() => {}}
        onRecoverySecondary={() => {}}
        onChooseSize={() => {}}
        selectedSize={results[0].item.size}
      />
    );
    // "Back to results" is a lie on this route: the user never saw results.
    expect(screen.getByText(BACK_LABELS.wishlist.text)).toBeTruthy();
    expect(screen.queryByText(BACK_LABELS.results.text)).toBeNull();
  });

  it("still names results for every other route in (default)", () => {
    const results = resultsFor();
    render(
      <SavedProductScreen
        result={results[0]}
        pincode={PINCODE}
        onBack={() => {}}
        onMoveToBag={() => {}}
        onRecoveryPrimary={() => {}}
        onRecoverySecondary={() => {}}
        onChooseSize={() => {}}
        selectedSize={results[0].item.size}
      />
    );
    expect(screen.getByText(BACK_LABELS.results.text)).toBeTruthy();
  });

  it("says so when nothing is saved instead of rendering an empty page", () => {
    render(<WishlistScreen results={[]} pincode={PINCODE} onSelectItem={() => {}} />);
    expect(screen.getByTestId("wishlist-empty")).toBeTruthy();
    expect(screen.queryAllByTestId(/^wishlist-row-/)).toHaveLength(0);
  });
});

describe("reaching the wishlist from the homepage", () => {
  const home = { name: "home" } as const;

  it("opens it from the heart on the home header", () => {
    let opened = 0;
    render(
      <TopBar
        screen={home}
        onBack={() => {}}
        onOpenSearch={() => {}}
        onOpenWishlist={() => {
          opened += 1;
        }}
        wishlistCount={wishlist.items.length}
      />
    );
    fireEvent.press(screen.getByTestId("open-wishlist"));
    expect(opened).toBe(1);
  });

  it("shows how many items are saved", () => {
    render(
      <TopBar
        screen={home}
        onBack={() => {}}
        onOpenSearch={() => {}}
        onOpenWishlist={() => {}}
        wishlistCount={wishlist.items.length}
      />
    );
    expect(screen.getByTestId("wishlist-badge")).toBeTruthy();
    expect(screen.getByLabelText(`Wishlist, ${wishlist.items.length} saved`)).toBeTruthy();
  });

  it("carries no badge when nothing is saved", () => {
    render(
      <TopBar
        screen={home}
        onBack={() => {}}
        onOpenSearch={() => {}}
        onOpenWishlist={() => {}}
        wishlistCount={0}
      />
    );
    expect(screen.queryByTestId("wishlist-badge")).toBeNull();
    expect(screen.getByLabelText("Wishlist")).toBeTruthy();
  });
});
