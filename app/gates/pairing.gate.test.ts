import { completeTheLook } from "@/wishlist/lookCompletion";
import { slotFor, slotsComplement } from "@/wishlist/slots";
import { reconcile } from "@/commerce/reconcile";
import { InventorySimulator } from "@/revalidation/inventory";
import catalogJson from "@/data/catalog.json";
import wishlistJson from "@/data/wishlist.json";
import bagJson from "@/data/bag.json";
import sflJson from "@/data/saved-for-later.json";
import ordersJson from "@/data/orders.json";
import type { Catalog, Wishlist } from "@/data/types";
import type { Bag, CommerceState, Orders, SavedForLater } from "@/commerce/reconcile";
import { realParents } from "./paths";
import { recordGate } from "./report";

/**
 * The cross-category pairing gate.
 *
 * Swept over **every** catalog product as a seed, not a sample, because the
 * failure this guards against is a single wrong pairing rather than a wrong
 * average: a men's shoe suggested against a girls' dress teaches the user the
 * feature is guessing, and one such pair is enough to do it.
 *
 * The truth is recomputed here independently of the function under test. A
 * gate that reused the engine's own gates would only prove the engine is
 * self-consistent.
 */

const catalog = catalogJson as unknown as Catalog;
const wishlist = wishlistJson as unknown as Wishlist;

const KIDSWEAR = new Set(["Boys", "Girls"]);

describe("pairing gate", () => {
  it("suggests nothing that crosses gender, slot or lifecycle", () => {
    const commerce: CommerceState = {
      bag: bagJson as unknown as Bag,
      savedForLater: sflJson as unknown as SavedForLater,
      orders: ordersJson as unknown as Orders,
    };
    const inventory = new InventorySimulator(catalog);

    const genderCrossings: string[] = [];
    const slotClashes: string[] = [];
    const lifecycleLeaks: string[] = [];
    const notSaved: string[] = [];
    const savedIds = new Set(wishlist.items.map((item) => item.item_id));

    let seeds = 0;
    let suggestions = 0;
    // Density, recorded rather than asserted: the point of the change was to
    // move seeds from one companion to a whole ensemble, and a coherence gate
    // that only counts violations would report that as unchanged.
    let seedsWithAny = 0;
    let categorySum = 0;
    const ensembleSizes = new Map<number, number>();

    for (const parent of realParents(catalog)) {
      for (const colourway of parent.colourways) {
        seeds += 1;
        const picked = completeTheLook(parent, colourway, {
          catalog,
          wishlist,
          commerce,
          inventory,
        });

        const seenSlots = new Set<string>();
        if (picked.length > 0) seedsWithAny += 1;
        ensembleSizes.set(picked.length, (ensembleSizes.get(picked.length) ?? 0) + 1);
        categorySum += new Set(picked.map((s) => s.parent.articleType)).size;
        for (const suggestion of picked) {
          suggestions += 1;
          const label = `${parent.articleType}/${parent.gender} -> ${suggestion.parent.articleType}/${suggestion.parent.gender}`;

          // Recomputed rather than trusted.
          const sameGender = parent.gender === suggestion.parent.gender;
          const bothKids =
            KIDSWEAR.has(parent.gender) === KIDSWEAR.has(suggestion.parent.gender);
          if (!sameGender || !bothKids) genderCrossings.push(label);

          if (!slotsComplement(slotFor(parent), slotFor(suggestion.parent))) {
            slotClashes.push(label);
          }
          if (seenSlots.has(suggestion.slot)) slotClashes.push(`${label} (repeat slot)`);
          seenSlots.add(suggestion.slot);

          const state = reconcile(suggestion.item, commerce).state;
          if (state === "in_bag" || state === "purchased") lifecycleLeaks.push(label);

          // The rule that keeps this a memory feature rather than a recommender.
          if (!savedIds.has(suggestion.item.item_id)) notSaved.push(label);
        }
      }
    }

    const violations =
      genderCrossings.length + slotClashes.length + lifecycleLeaks.length + notSaved.length;

    recordGate({
      id: "PAIR-coherence",
      epic: "Pairing — cross-category coherence",
      requirement:
        "no suggestion crosses gender, repeats or clashes a slot, resurfaces a bought or bagged item, or comes from outside the wishlist",
      measured: `${violations} violations across ${suggestions.toLocaleString("en-IN")} suggestions from ${seeds.toLocaleString("en-IN")} seed products; ${seedsWithAny.toLocaleString("en-IN")} of them produce a look, averaging ${(categorySum / seedsWithAny).toFixed(2)} distinct categories each (${[...ensembleSizes.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([size, count]) => `${count.toLocaleString("en-IN")} at ${size}`)
        .join(", ")})`,
      pass: violations === 0,
      caveat:
        "Coverage is bounded by what the shipped wishlist contains — thirty items, of which five are shirts and two are excluded by the lifecycle gate. The saved wardrobe filled the accessory slots for men and women, which nothing saved reached before; whole slots still go untested because nothing saved fills them: no adult bottomwear for women, and no kidswear at all — which is also why 108 of the seeds here are dressed in nothing, and why the density figure is over the seeds that produce a look rather than over all of them. A pass means no wrong pairing among the pairings this data can produce, not that the engine is correct over a catalog it has never seen.",
    });

    // A sweep that produced no suggestions would satisfy every assertion above
    // while proving nothing at all.
    expect(seeds).toBeGreaterThan(100);
    expect(suggestions).toBeGreaterThan(0);

    expect(genderCrossings).toEqual([]);
    expect(slotClashes).toEqual([]);
    expect(lifecycleLeaks).toEqual([]);
    expect(notSaved).toEqual([]);
  });
});
