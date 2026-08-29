import { fireEvent, render, screen } from "@testing-library/react-native";
import catalogJson from "@/data/catalog.json";
import wishlistJson from "@/data/wishlist.json";
import type { Catalog, Wishlist } from "@/data/types";
import { BACK_LABELS, BANNED_COPY_PATTERNS, RECOVERY_COPY, formatPrice } from "@/copy/bundle";
import { SavedProductScreen } from "@/screens/SavedProductScreen";
import { InventorySimulator } from "@/revalidation/inventory";
import { revalidate, type RevalidationResult } from "@/revalidation/revalidate";
import { WishlistScreen } from "@/screens/WishlistScreen";
import bagJson from "@/data/bag.json";
import sflJson from "@/data/saved-for-later.json";
import ordersJson from "@/data/orders.json";
import type { Bag, CommerceState, Orders, SavedForLater } from "@/commerce/reconcile";
import { TopBar } from "@/shell/TopBar";

jest.mock("@/data/images", () => ({ CATALOG_IMAGES: new Proxy({}, { get: () => 1 }) }));

const catalog = catalogJson as unknown as Catalog;
const wishlist = wishlistJson as unknown as Wishlist;
const PINCODE = wishlist.pincode;

/** The shipped commerce state, for the lifecycle pill each row now carries. */
function commerceState(): CommerceState {
  return {
    bag: JSON.parse(JSON.stringify(bagJson)) as Bag,
    savedForLater: JSON.parse(JSON.stringify(sflJson)) as SavedForLater,
    orders: ordersJson as unknown as Orders,
  };
}

function resultsFor(): RevalidationResult[] {
  const inventory = new InventorySimulator(catalog);
  return wishlist.items
    .map((item) => revalidate(item, catalog, inventory, PINCODE))
    .filter((result): result is RevalidationResult => result !== null);
}

describe("the wishlist page", () => {
  it("lists every saved item", () => {
    const results = resultsFor();
    render(<WishlistScreen results={results} pincode={PINCODE} commerce={commerceState()} onSelectItem={() => {}} />);
    expect(screen.getAllByTestId(/^wishlist-row-/)).toHaveLength(results.length);
    for (const result of results) {
      expect(screen.getByTestId(`wishlist-row-${result.item.item_id}`)).toBeTruthy();
    }
  });

  it("states the saved colour and size on every row (FR-4)", () => {
    const results = resultsFor();
    render(<WishlistScreen results={results} pincode={PINCODE} commerce={commerceState()} onSelectItem={() => {}} />);
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
      <WishlistScreen results={results} pincode={PINCODE} commerce={commerceState()} onSelectItem={(id) => opened.push(id)} />
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

    render(<WishlistScreen results={results} pincode={PINCODE} commerce={commerceState()} onSelectItem={() => {}} />);
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
    render(<WishlistScreen results={results} pincode={PINCODE} commerce={commerceState()} onSelectItem={() => {}} />);
    const row = screen.getByTestId(`wishlist-row-${blocked.item.item_id}`);
    // The row still names the size the user saved, not one that happens to be
    // in stock.
    expect(row.props.accessibilityLabel).toContain(`· ${blocked.item.size}`);
  });

  it("prices saved items neutrally, with no incentive anywhere (C-1)", () => {
    const results = resultsFor();
    const view = render(
      <WishlistScreen results={results} pincode={PINCODE} commerce={commerceState()} onSelectItem={() => {}} />
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
    render(<WishlistScreen results={[]} pincode={PINCODE} commerce={commerceState()} onSelectItem={() => {}} />);
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
        onOpenProfile={() => {}}
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
        onOpenProfile={() => {}}
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
        onOpenProfile={() => {}}
        wishlistCount={0}
      />
    );
    expect(screen.queryByTestId("wishlist-badge")).toBeNull();
    expect(screen.getByLabelText("Wishlist")).toBeTruthy();
  });
});

describe("the lifecycle a saved row is in", () => {
  it("marks the bought item and the bagged one, and nothing else", () => {
    // The list knew all of this already -- reconcile() derives it from the bag
    // and the order history -- and showed none of it, so a row the user had
    // bought looked exactly like one they had not.
    const results = resultsFor();
    render(
      <WishlistScreen
        results={results}
        pincode={PINCODE}
        commerce={commerceState()}
        onSelectItem={() => {}}
      />
    );

    expect(screen.getByTestId("wishlist-lifecycle-wi_purchased")).toBeTruthy();

    const pills = screen.queryAllByTestId(/^wishlist-lifecycle-/);
    // Absence is the information: a row with nothing to say carries no pill.
    expect(pills.length).toBeLessThan(results.length);
  });

  it("drops the pill when the item leaves the bag", () => {
    // The property a stored flag could not deliver, and the reason this is
    // derived on render rather than written onto the row.
    const results = resultsFor();
    const commerce = commerceState();
    const bagged = commerce.bag.items[0];
    const row = results.find((r) =>
      r.parent.colourways.some((c) => c.skus.some((s) => s.sku === bagged.sku))
    );
    expect(row).toBeTruthy();

    const { rerender } = render(
      <WishlistScreen
        results={results}
        pincode={PINCODE}
        commerce={commerce}
        onSelectItem={() => {}}
      />
    );
    expect(screen.getByTestId(`wishlist-lifecycle-${row!.item.item_id}`)).toBeTruthy();

    const emptied = commerceState();
    emptied.bag.items = [];
    rerender(
      <WishlistScreen
        results={results}
        pincode={PINCODE}
        commerce={emptied}
        onSelectItem={() => {}}
      />
    );
    expect(screen.queryByTestId(`wishlist-lifecycle-${row!.item.item_id}`)).toBeNull();
  });
});

describe("the order the wishlist lists in", () => {
  it("puts the most recently saved first", () => {
    // The fixture file holds the five state-fixture shirts at the top, so the
    // page opened on five near-identical photographs of the same model and
    // read as a rendering bug. Recency is what a saved list is ordered by; the
    // category interleaving is a side effect, not the justification.
    const results = resultsFor();
    render(
      <WishlistScreen
        results={results}
        pincode={PINCODE}
        commerce={commerceState()}
        onSelectItem={() => {}}
      />
    );

    const byId = new Map(results.map((r) => [r.item.item_id, r.item.saved_at]));
    const rendered = screen
      .getAllByTestId(/^wishlist-row-/)
      .map((row) => byId.get(row.props.testID.replace("wishlist-row-", ""))!);

    expect(rendered).toEqual([...rendered].sort().reverse());
    // And the guard that made this worth doing: the opening screen is no
    // longer one article type over and over.
    const parentById = new Map(results.map((r) => [r.item.item_id, r.parent.articleType]));
    const openingTypes = screen
      .getAllByTestId(/^wishlist-row-/)
      .slice(0, 4)
      .map((row) => parentById.get(row.props.testID.replace("wishlist-row-", ""))!);
    expect(new Set(openingTypes).size).toBeGreaterThan(1);
  });
});

describe("unsaving from the list", () => {
  it("offers a heart on every row and names what it removes", () => {
    const results = resultsFor();
    render(
      <WishlistScreen
        results={results}
        pincode={PINCODE}
        commerce={commerceState()}
        onRemoveItem={() => {}}
        onSelectItem={() => {}}
      />
    );
    for (const result of results) {
      const heart = screen.getByTestId(`wishlist-remove-${result.item.item_id}`);
      expect(heart.props.accessibilityLabel).toContain(result.parent.brand);
      expect(heart.props.accessibilityLabel).toContain("Remove");
    }
  });

  it("reports the product id the store removes by, not the item id", () => {
    // WishlistStore.remove takes a product_id, and so does the heart on every
    // grid tile. Passing anything else here would make unsaving from this
    // list and unsaving from a tile two operations that can disagree.
    const results = resultsFor();
    const removed: number[] = [];
    render(
      <WishlistScreen
        results={results}
        pincode={PINCODE}
        commerce={commerceState()}
        onRemoveItem={(productId) => removed.push(productId)}
        onSelectItem={() => {}}
      />
    );
    fireEvent.press(screen.getByTestId(`wishlist-remove-${results[0].item.item_id}`));
    // results[0] is whatever sorts first by recency, so read the id off the
    // row rather than assuming the fixture order.
    const first = [...results].sort((a, b) =>
      b.item.saved_at.localeCompare(a.item.saved_at)
    )[0];
    expect(removed).toEqual([results[0].item.product_id]);
    expect(typeof first.item.product_id).toBe("number");
  });

  it("leaves rows read-only when no handler is given", () => {
    const results = resultsFor();
    render(
      <WishlistScreen
        results={results}
        pincode={PINCODE}
        commerce={commerceState()}
        onSelectItem={() => {}}
      />
    );
    expect(screen.queryAllByTestId(/^wishlist-remove-/)).toHaveLength(0);
  });

  it("does not nest the heart inside the row's own button", () => {
    // A button inside a button is invalid and gives a keyboard user two
    // targets they cannot separate -- the defect the search suggestion row
    // already hit once. The heart is a sibling of the row Pressable.
    const results = resultsFor();
    render(
      <WishlistScreen
        results={results}
        pincode={PINCODE}
        commerce={commerceState()}
        onRemoveItem={() => {}}
        onSelectItem={() => {}}
      />
    );
    const row = screen.getByTestId(`wishlist-row-${results[0].item.item_id}`);
    const nested = (node: { children?: unknown[] }): boolean =>
      (node.children ?? []).some(
        (child) =>
          typeof child === "object" &&
          child !== null &&
          ((child as { props?: { testID?: string } }).props?.testID?.startsWith(
            "wishlist-remove-"
          ) ||
            nested(child as { children?: unknown[] }))
      );
    expect(nested(row)).toBe(false);
  });
});
