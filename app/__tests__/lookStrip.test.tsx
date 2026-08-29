import { render, screen } from "@testing-library/react-native";
import { LookStrip } from "@/components/LookStrip";
import { LOOK_SIZE_GONE } from "@/copy/bundle";
import { completeTheLook, MAX_LOOK_SUGGESTIONS } from "@/wishlist/lookCompletion";
import { InventorySimulator } from "@/revalidation/inventory";
import catalogJson from "@/data/catalog.json";
import wishlistJson from "@/data/wishlist.json";
import bagJson from "@/data/bag.json";
import sflJson from "@/data/saved-for-later.json";
import ordersJson from "@/data/orders.json";
import type { Catalog, Wishlist } from "@/data/types";
import type { Bag, CommerceState, Orders, SavedForLater } from "@/commerce/reconcile";

jest.mock("@/data/images", () => ({ CATALOG_IMAGES: new Proxy({}, { get: () => 1 }) }));

/**
 * The strip, rendered against the real engine output rather than hand-built
 * suggestions -- a fixture would let the component and the engine drift apart
 * on exactly the case this file exists to cover.
 */

const catalog = catalogJson as unknown as Catalog;
const wishlist = wishlistJson as unknown as Wishlist;
const noop = () => undefined;

function kurtaLook() {
  const parent = catalog.parents.find(
    (p) => p.articleType === "Kurtas" && p.gender === "Women"
  )!;
  const commerce: CommerceState = {
    bag: bagJson as unknown as Bag,
    savedForLater: sflJson as unknown as SavedForLater,
    orders: ordersJson as unknown as Orders,
  };
  return completeTheLook(parent, parent.colourways[0], {
    catalog,
    wishlist,
    commerce,
    inventory: new InventorySimulator(catalog),
  });
}

describe("the look strip", () => {
  it("lays out a whole ensemble, not one companion", () => {
    const suggestions = kurtaLook();
    expect(suggestions.length).toBe(MAX_LOOK_SUGGESTIONS);
    render(<LookStrip suggestions={suggestions} onOpen={noop} />);
    for (const suggestion of suggestions) {
      expect(screen.getByTestId(`look-${suggestion.item.item_id}`)).toBeTruthy();
    }
  });

  it("says so on a card whose saved size has gone", () => {
    // The seat for the footwear slot goes to the only women's footwear saved,
    // and it is out of stock in the saved size. Ranking earns it the seat;
    // this line is what stops the card reading as an ordinary suggestion and
    // the user finding out at the size selector.
    const suggestions = kurtaLook();
    const gone = suggestions.filter((s) => !s.buyable);
    expect(gone.length).toBeGreaterThan(0);

    render(<LookStrip suggestions={suggestions} onOpen={noop} />);
    for (const suggestion of gone) {
      expect(screen.getByTestId(`look-gone-${suggestion.item.item_id}`)).toBeTruthy();
      const card = screen.getByTestId(`look-${suggestion.item.item_id}`);
      expect(card.props.accessibilityLabel).toContain(LOOK_SIZE_GONE);
    }
    for (const suggestion of suggestions.filter((s) => s.buyable)) {
      expect(screen.queryByTestId(`look-gone-${suggestion.item.item_id}`)).toBeNull();
    }
  });
});
