import { fireEvent, render, screen } from "@testing-library/react-native";
import bagJson from "@/data/bag.json";
import catalogJson from "@/data/catalog.json";
import ordersJson from "@/data/orders.json";
import savedForLaterJson from "@/data/saved-for-later.json";
import type { Catalog } from "@/data/types";
import type { Bag, CommerceState, Orders, SavedForLater } from "@/commerce/reconcile";
import { reconcile, removeFromBag } from "@/commerce/reconcile";
import { formatPrice } from "@/copy/bundle";
import { BagScreen, bagTotal } from "@/screens/BagScreen";
import { CheckoutScreen } from "@/screens/CheckoutScreen";

jest.mock("@/data/images", () => ({ CATALOG_IMAGES: new Proxy({}, { get: () => 1 }) }));

const catalog = catalogJson as unknown as Catalog;

function commerceFixture(): CommerceState {
  return {
    bag: { items: [...(bagJson as unknown as Bag).items] },
    savedForLater: { items: [...(savedForLaterJson as unknown as SavedForLater).items] },
    orders: { orders: [...(ordersJson as unknown as Orders).orders] },
  };
}

describe("the bag total", () => {
  it("sums line prices from the catalog rather than a stored figure", () => {
    const commerce = commerceFixture();
    expect(commerce.bag.items.length).toBeGreaterThan(0);

    const expected = commerce.bag.items.reduce((sum, line) => {
      const parent = catalog.parents.find(
        (p) => p.parent_product_id === line.parent_product_id
      )!;
      const colourway = parent.colourways.find((c) =>
        c.skus.some((s) => s.sku === line.sku)
      )!;
      return sum + colourway.price * line.quantity;
    }, 0);

    expect(bagTotal(catalog, commerce)).toBe(expected);
  });

  it("shows the same total it computes", () => {
    const commerce = commerceFixture();
    render(<BagScreen catalog={catalog} commerce={commerce} onCheckout={() => {}} />);
    expect(screen.getByTestId("bag-total").props.children).toBe(
      formatPrice(bagTotal(catalog, commerce))
    );
  });

  it("stays read-only when no checkout route is given", () => {
    render(<BagScreen catalog={catalog} commerce={commerceFixture()} />);
    // An unwired "Proceed to Checkout" would read as a broken control.
    expect(screen.queryByTestId("go-checkout")).toBeNull();
  });
});

describe("checkout", () => {
  const summary = { count: 2, total: 3498 };

  it("shows what is being bought before it is bought", () => {
    render(
      <CheckoutScreen
        summary={summary}
        placed={false}
        pincode="400001"
        onPlaceOrder={() => {}}
        onContinueShopping={() => {}}
      />
    );
    expect(screen.getByTestId("checkout-total").props.children).toBe(formatPrice(3498));
    expect(screen.getByText(/Home · 400001/)).toBeTruthy();
  });

  it("admits the payment row is an illustration", () => {
    render(
      <CheckoutScreen
        summary={summary}
        placed={false}
        pincode="400001"
        onPlaceOrder={() => {}}
        onContinueShopping={() => {}}
      />
    );
    // Three tappable-looking options that all do nothing would imply a
    // payment flow was built and tested. The screen says otherwise.
    expect(screen.getByText(/does not take a payment/i)).toBeTruthy();
  });

  it("cannot place an empty order", () => {
    render(
      <CheckoutScreen
        summary={{ count: 0, total: 0 }}
        placed={false}
        pincode="400001"
        onPlaceOrder={() => {}}
        onContinueShopping={() => {}}
      />
    );
    expect(screen.getByTestId("place-order").props.accessibilityState.disabled).toBe(true);
  });

  it("confirms the order rather than silently emptying the bag", () => {
    let continued = 0;
    render(
      <CheckoutScreen
        summary={null}
        placed
        pincode="400001"
        onPlaceOrder={() => {}}
        onContinueShopping={() => (continued += 1)}
      />
    );
    expect(screen.getByTestId("checkout-placed")).toBeTruthy();
    expect(screen.getByText("Order placed")).toBeTruthy();
    fireEvent.press(screen.getByTestId("continue-shopping"));
    expect(continued).toBe(1);
  });
});

describe("taking a line back out of the bag", () => {
  it("removes only the line asked for, and reports that it did", () => {
    // The bag could be filled from four places and emptied from none, so a
    // mis-tap was unrecoverable without reloading -- and `in_bag` had no way
    // back to `none` for anyone driving a session.
    const commerce = commerceFixture();
    const target = commerce.bag.items[0];
    const others = commerce.bag.items.slice(1).map((line) => line.sku);

    expect(removeFromBag(target.sku, commerce)).toBe(true);
    expect(commerce.bag.items.map((line) => line.sku)).toEqual(others);

    // A second call changes nothing and says so, so a caller never announces
    // a removal that did not happen.
    expect(removeFromBag(target.sku, commerce)).toBe(false);
  });

  it("frees the item to be suggested again once it leaves", () => {
    // The property that makes this worth deriving rather than flagging: the
    // module withholds anything in the bag, so removal has to hand it back.
    const commerce = commerceFixture();
    const line = commerce.bag.items[0];
    const item = {
      item_id: "wi_probe",
      sku: line.sku,
      parent_product_id: line.parent_product_id,
      product_id: 0,
      colour: line.colour,
      size: line.size,
      saved_at: "2026-08-01",
      price_at_save: 0,
      seller_at_save: "",
      role: "probe",
    };
    expect(reconcile(item, commerce).state).toBe("in_bag");
    removeFromBag(line.sku, commerce);
    expect(reconcile(item, commerce).state).toBe("none");
  });

  it("offers Remove on every bag row, and none without a handler", () => {
    const commerce = commerceFixture();
    const { unmount } = render(
      <BagScreen catalog={catalog} commerce={commerce} onRemove={() => {}} />
    );
    for (const line of commerce.bag.items) {
      expect(screen.getByTestId(`bag-remove-${line.sku}`)).toBeTruthy();
    }
    unmount();

    render(<BagScreen catalog={catalog} commerce={commerce} />);
    expect(screen.queryAllByTestId(/^bag-remove-/)).toHaveLength(0);
  });

  it("hands the row's sku to the handler", () => {
    const commerce = commerceFixture();
    const removed: string[] = [];
    render(
      <BagScreen catalog={catalog} commerce={commerce} onRemove={(sku) => removed.push(sku)} />
    );
    const target = commerce.bag.items[0];
    fireEvent.press(screen.getByTestId(`bag-remove-${target.sku}`));
    expect(removed).toEqual([target.sku]);
  });
});
