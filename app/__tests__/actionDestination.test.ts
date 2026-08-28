import { COPY } from "@/copy/bundle";
import { destinationFor, type CopyKey } from "@/match/contract";

/**
 * Does the button go where it says it goes?
 *
 * Nothing asserted this. `copy.test.ts` checks the label, `navigation.test.tsx`
 * checks the destination, and between them sat the actual bug: the module's
 * words change with the item's state -- "View Bag", "Reorder", "View Save for
 * Later" -- while the routing was positional, so "View Bag" opened the product
 * page. Two green tests, one broken promise.
 *
 * Found by clicking through the ten harness states in a browser, which is the
 * third time that has been the only way to see something.
 */

const KEYS = Object.keys(COPY) as CopyKey[];

/** What a label promises, as a predicate on where it may legitimately land. */
const PROMISES: { pattern: RegExp; allowed: string[] }[] = [
  { pattern: /^View Bag$/i, allowed: ["bag"] },
  { pattern: /^View order$/i, allowed: ["unbuilt"] },
  { pattern: /^View Save for Later$/i, allowed: ["unbuilt"] },
  { pattern: /^Compare/i, allowed: ["compare"] },
  { pattern: /^(Buy from Wishlist|Move to Bag|Reorder|See available sizes)$/i, allowed: ["saved"] },
];

describe("module actions go where their words say", () => {
  it("covers every copy key with a promise, so nothing slips through untested", () => {
    for (const key of KEYS) {
      for (const label of [COPY[key].primaryAction, COPY[key].secondaryAction]) {
        const promise = PROMISES.find((entry) => entry.pattern.test(label));
        expect(promise ? label : `no promise defined for "${label}"`).toBe(label);
      }
    }
  });

  it("routes every label to a destination it can actually honour", () => {
    const broken: string[] = [];
    for (const key of KEYS) {
      const cases: ["primary" | "secondary", string][] = [
        ["primary", COPY[key].primaryAction],
        ["secondary", COPY[key].secondaryAction],
      ];
      for (const [action, label] of cases) {
        const destination = destinationFor(key, action);
        const promise = PROMISES.find((entry) => entry.pattern.test(label));
        if (!promise || !promise.allowed.includes(destination)) {
          broken.push(`${key} ${action} "${label}" -> ${destination}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("sends View Bag to the bag, which is the case that was wrong", () => {
    expect(destinationFor("already_in_bag", "primary")).toBe("bag");
  });

  it("admits the screens this prototype does not have", () => {
    // A named stub beats landing the user somewhere plausible and wrong.
    expect(destinationFor("saved_for_later", "secondary")).toBe("unbuilt");
    expect(destinationFor("purchased_before", "secondary")).toBe("unbuilt");
  });

  it("leaves the ordinary reconnection path alone", () => {
    expect(destinationFor("exact_variant_available", "primary")).toBe("saved");
    expect(destinationFor("exact_variant_available", "secondary")).toBe("compare");
    expect(destinationFor("exact_variant_unavailable", "primary")).toBe("saved");
  });
});
