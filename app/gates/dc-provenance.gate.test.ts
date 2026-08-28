import { SIGNAL_SOURCE } from "@/copy/bundle";
import { signalsFor, type ConfidenceSignal } from "@/confidence/signals";
import { InventorySimulator } from "@/revalidation/inventory";
import { revalidate } from "@/revalidation/revalidate";
import catalogJson from "@/data/catalog.json";
import wishlistJson from "@/data/wishlist.json";
import type { Catalog, Wishlist } from "@/data/types";
import { realParents } from "./paths";
import { recordGate } from "./report";

/**
 * The Decision Confidence Layer's provenance gate.
 *
 * Section 7's rule, made measurable: no signal may claim anything without
 * saying where the claim came from, and no generated field may be presented as
 * real. Both are launch conditions rather than review notes -- the whole
 * feature is evidence, and evidence that cannot cite itself is persuasion.
 *
 * Swept across every wishlist item and every stock condition the prototype can
 * produce, not a happy path.
 */

const catalog = catalogJson as unknown as Catalog;
const wishlist = wishlistJson as unknown as Wishlist;

/** The four fields tools/catalog/synthesize.py invents that this panel reads. */
const SYNTHETIC_KEYS = new Set(["fit", "material", "returns", "reviews"]);

interface Sweep {
  signals: ConfidenceSignal[];
  label: string;
}

function sweep(): Sweep[] {
  const real = new Set(realParents(catalog).map((parent) => parent.parent_product_id));
  const out: Sweep[] = [];

  for (const item of wishlist.items) {
    if (!real.has(item.parent_product_id)) continue;

    // Every stock condition the prototype can reach, plus both an address the
    // seller serves and one it may not.
    const conditions: [string, (inventory: InventorySimulator) => void][] = [
      ["stocked", () => {}],
      ["saved size gone", (inv) => inv.sellOut(item.sku)],
      ["product withdrawn", (inv) => inv.sellOutProduct(item.parent_product_id)],
    ];

    for (const [name, mutate] of conditions) {
      for (const pincode of ["560034", "100001"]) {
        const inventory = new InventorySimulator(catalog);
        mutate(inventory);
        const result = revalidate(item, catalog, inventory, pincode);
        if (!result) continue;

        // Both the saved variant and a deviation from it, because the panel
        // has to stay honest once the user starts changing things.
        const others = result.parent.colourways
          .map((colourway) => colourway.colour)
          .filter((colour) => colour !== item.colour);
        const selections = [
          { size: item.size, colour: item.colour },
          ...(others.length ? [{ size: item.size, colour: others[0] }] : []),
        ];

        for (const selected of selections) {
          out.push({
            signals: signalsFor(result, selected),
            label: `${item.item_id} · ${name} · ${pincode} · ${selected.colour}/${selected.size}`,
          });
        }
      }
    }
  }
  return out;
}

describe("DC provenance gate", () => {
  const sweeps = sweep();

  it("gives every signal a source, and labels every generated one", () => {
    const missingSource: string[] = [];
    const mislabelled: string[] = [];
    let signalCount = 0;

    for (const { signals, label } of sweeps) {
      for (const signal of signals) {
        signalCount += 1;
        if (!signal.source || signal.source.trim() === "") {
          missingSource.push(`${label} · ${signal.key}`);
        }
        // The two halves of constraint 8: a generated field must be flagged,
        // and a real one must not be. Getting the second wrong is worse -- it
        // teaches the reader to discount evidence that is actually sound.
        const shouldBeSynthetic = SYNTHETIC_KEYS.has(signal.key);
        if (signal.synthetic !== shouldBeSynthetic) {
          mislabelled.push(`${label} · ${signal.key}`);
        }
        if (signal.synthetic && !signal.source.includes("prototype data")) {
          mislabelled.push(`${label} · ${signal.key} (source omits the label)`);
        }
      }
    }

    // A sweep that examined nothing would pass every assertion above.
    expect(sweeps.length).toBeGreaterThan(0);
    expect(signalCount).toBeGreaterThan(0);

    recordGate({
      id: "DC-provenance",
      epic: "DC — signal provenance",
      requirement: "every signal cites a source; every generated field is labelled as such",
      measured: `${missingSource.length} sourceless and ${mislabelled.length} mislabelled across ${signalCount.toLocaleString("en-IN")} signals in ${sweeps.length} states`,
      pass: missingSource.length === 0 && mislabelled.length === 0,
      caveat:
        "Checks that a source string exists and that the synthetic flag matches the known generated fields. It cannot check that a source is *true* — that the delivery date really came from this seller's serviceability, say — only that one is claimed and that generated data is never presented as real.",
    });

    expect(missingSource).toEqual([]);
    expect(mislabelled).toEqual([]);
  });

  it("never claims a confirmed status without evidence behind it", () => {
    // "ok" is a claim. Fit and reviews carry no verdict in this catalog and
    // must stay `unknown` forever; a blocked signal must never read as fine.
    const overclaims: string[] = [];
    for (const { signals, label } of sweeps) {
      for (const signal of signals) {
        if ((signal.key === "fit" || signal.key === "reviews") && signal.status !== "unknown") {
          overclaims.push(`${label} · ${signal.key} claimed ${signal.status}`);
        }
        if (signal.status === "ok" && signal.value.trim() === "") {
          overclaims.push(`${label} · ${signal.key} confirmed nothing`);
        }
      }
    }
    expect(overclaims).toEqual([]);
  });

  it("keeps the source table complete", () => {
    for (const { signals } of sweeps.slice(0, 1)) {
      for (const signal of signals) {
        expect(SIGNAL_SOURCE[signal.key]).toBeTruthy();
      }
    }
  });
});
