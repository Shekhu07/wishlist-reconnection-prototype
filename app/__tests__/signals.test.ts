import { SIGNAL_SOURCE } from "@/copy/bundle";
import { signalsFor, summaryOf, type ConfidenceSignal } from "@/confidence/signals";
import { InventorySimulator } from "@/revalidation/inventory";
import { revalidate, type RevalidationResult } from "@/revalidation/revalidate";
import { makeCatalog, makeWishlist } from "./helpers/fixtures";

/**
 * The Decision Confidence Layer's evidence spine.
 *
 * The load-bearing property is not that any particular signal reads well. It is
 * that no signal can claim anything without saying where the claim came from,
 * and that generated data is never presented as real (improvement prompt,
 * constraint 8).
 */

const SAVED = { size: "M", colour: "Blue" };

function build(
  mutate: (inventory: InventorySimulator) => void = () => {},
  pincode = "560034"
): RevalidationResult {
  const catalog = makeCatalog();
  const inventory = new InventorySimulator(catalog);
  mutate(inventory);
  const result = revalidate(makeWishlist().items[0], catalog, inventory, pincode);
  if (!result) throw new Error("fixture does not revalidate");
  return result;
}

function byKey(signals: ConfidenceSignal[], key: string): ConfidenceSignal {
  const found = signals.find((s) => s.key === key);
  if (!found) throw new Error(`no ${key} signal`);
  return found;
}

describe("confidence signals", () => {
  it("gives every signal a non-empty source", () => {
    // Section 7: a signal that cannot say where it came from is persuasion,
    // not evidence. This is the property the DC provenance gate measures.
    for (const signal of signalsFor(build(), SAVED)) {
      expect(signal.source.trim()).not.toBe("");
      expect(signal.source).toBe(SIGNAL_SOURCE[signal.key]);
    }
  });

  it("marks every generated field as prototype data, and no real one", () => {
    const signals = signalsFor(build(), SAVED);
    const synthetic = signals.filter((s) => s.synthetic).map((s) => s.key).sort();
    // Exactly the five fields tools/catalog/synthesize.py invents that this
    // panel reads. Asserted as a whole list so a real field cannot be quietly
    // relabelled as generated, or -- much worse -- the reverse.
    expect(synthetic).toEqual(["fit", "material", "returns", "reviews"]);
    for (const signal of signals) {
      expect(signal.source.includes("prototype data")).toBe(signal.synthetic);
    }
  });

  it("never claims fit confidence, because there is no fit data", () => {
    const fit = byKey(signalsFor(build(), SAVED), "fit");
    expect(fit.status).toBe("unknown");
    expect(fit.value).toMatch(/size guide/i);
  });

  it("states review coverage without drawing a quality verdict", () => {
    const reviews = byKey(signalsFor(build(), SAVED), "reviews");
    expect(reviews.status).toBe("unknown");
    expect(reviews.value).toContain("320");
  });

  it("keeps the saved variant visible once the selection deviates", () => {
    // FR-7 / DC-05: a changed selection is shown alongside what was saved,
    // never in place of it.
    const signal = byKey(
      signalsFor(build(), { size: "L", colour: "Blue" }),
      "saved_variant"
    );
    expect(signal.status).toBe("attention");
    expect(signal.value).toContain("New selection: Blue · L");
    expect(signal.value).toContain("Originally saved: Blue · M");
  });

  it("answers availability from the colour being looked at, not the saved one", () => {
    // The Red colourway stocks M; if we sell out Blue's M only, a signal that
    // read the saved colourway's stock would wrongly report M as gone for Red.
    const result = build((inventory) => inventory.sellOut("sku_1001_M"));
    expect(byKey(signalsFor(result, SAVED), "size_availability").status).toBe("blocked");
    const onRed = byKey(signalsFor(result, { size: "M", colour: "Red" }), "size_availability");
    expect(onRed.status).toBe("ok");
    expect(onRed.value).toBe("Size M available");
  });

  it("separates the five variant states improvement 2 asks for", () => {
    const state = (result: RevalidationResult, selected = SAVED) => {
      const signals = signalsFor(result, selected);
      return {
        size: byKey(signals, "size_availability").status,
        colour: byKey(signals, "colour_availability").status,
      };
    };

    // 1. Both available.
    expect(state(build())).toEqual({ size: "ok", colour: "ok" });

    // 2. Saved size gone, colour fine.
    expect(state(build((inv) => inv.sellOut("sku_1001_M")))).toEqual({
      size: "blocked",
      colour: "ok",
    });

    // 3. Saved colour gone entirely, another colour available.
    const colourGone = build((inv) => {
      for (const size of ["S", "M", "L"]) inv.sellOut(`sku_1001_${size}`);
    });
    expect(byKey(signalsFor(colourGone, SAVED), "colour_availability").value).toContain(
      "Saved colour Blue unavailable"
    );

    // 4. Both gone: two separate blocked signals, not one merged verdict --
    // "your colour is gone" and "your size is gone" have different next steps.
    expect(state(colourGone)).toEqual({ size: "blocked", colour: "blocked" });

    // 5. Whole product gone.
    const productGone = build((inv) => inv.sellOutProduct("pp_shirt"));
    expect(productGone.blocking).toBe("product_unavailable");
    expect(state(productGone)).toEqual({ size: "blocked", colour: "blocked" });
  });

  it("blocks delivery rather than inventing a date the seller cannot honour", () => {
    const signal = byKey(signalsFor(build(() => {}, "100001"), SAVED), "delivery");
    expect(signal.status).toBe("blocked");
    expect(signal.value).toMatch(/not deliverable/i);
  });

  it("states a price change without a direction of travel (C-1)", () => {
    const catalog = makeCatalog();
    const inventory = new InventorySimulator(catalog);
    const item = { ...makeWishlist().items[0], price_at_save: 1499 };
    const result = revalidate(item, catalog, inventory, "560034");
    const price = byKey(signalsFor(result!, SAVED), "price");
    expect(price.status).toBe("attention");
    // Both numbers are present so the user can see the change themselves, and
    // no sentence connects them into a reason to buy.
    expect(price.value).toBe("₹1,999");
    expect(price.detail).toContain("You saved it at ₹1,499");
    // The ban is on a *direction* of travel, which is what turns a fact into an
    // incentive. "since you saved this" is the wishlist verb, not a direction.
    expect(price.detail).not.toMatch(/dropped|fallen|risen|lower|higher|cheaper|savings?\b/i);
  });

  it("summarises to four signals and keeps them in DC-01's order", () => {
    const summary = summaryOf(signalsFor(build(), SAVED));
    expect(summary.map((s) => s.key)).toEqual([
      "saved_variant",
      "size_availability",
      "delivery",
      "fit",
    ]);
  });
});
