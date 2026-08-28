import * as bundle from "@/copy/bundle";
import { BANNED_COPY_PATTERNS, COPY, formatPrice } from "@/copy/bundle";

/**
 * Constraint C-1 is a launch gate, so it is a test rather than a review note.
 * If someone adds "20% off" to the bundle, the build fails here.
 *
 * This used to enumerate the bundle's keys by hand, which meant every string
 * added after it was written -- the recovery copy, the advisories, the whole
 * compare vocabulary -- was silently outside the sweep. A ban list that only
 * covers what someone remembered to list is not a ban list. So it now walks the
 * module's exports and reaches every string, including the ones behind copy
 * functions, whether or not anyone remembers this file exists.
 */

/** Enough fields to satisfy every copy function's context in one call. */
const CONTEXT = {
  count: 3,
  savedSize: "M",
  savedColour: "Black",
  size: "M",
  colour: "Black",
  seller: "Vector Lifestyle",
  pincode: "560034",
};

function collect(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (typeof value === "function") {
    // Copy functions take a context and return copy. Formatters take numbers
    // and produce something harmless from an object; either way, whatever comes
    // back is swept. Anything that throws is not copy.
    try {
      collect((value as (ctx: unknown) => unknown)(CONTEXT), out);
    } catch {
      /* not a copy function */
    }
    return;
  }
  if (value instanceof RegExp) return;
  if (Array.isArray(value)) {
    for (const entry of value) collect(entry, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) collect(entry, out);
  }
}

function everyString(): string[] {
  const strings: string[] = [];
  collect(bundle, strings);
  return [...new Set(strings)].filter((text) => text.trim().length > 0);
}

describe("copy bundle (constraint C-1)", () => {
  it.each(everyString())("%s carries no monetary incentive or urgency", (text) => {
    for (const pattern of BANNED_COPY_PATTERNS) {
      expect(text).not.toMatch(pattern);
    }
  });

  it("renders price as neutral state text with no savings framing", () => {
    expect(formatPrice(2199)).toBe("₹2,199");
    expect(formatPrice(2199)).not.toMatch(/off|save|was|mrp/i);
  });

  it("never offers a dead-end Buy when the saved variant is unavailable", () => {
    // FR-7: no silent substitution, and no button that cannot do what it says.
    expect(COPY.exact_variant_unavailable.primaryAction).not.toMatch(/buy/i);
  });

  it("keeps both actions co-equal in wording length", () => {
    // Section 4.4: neither action may be subordinate. Wildly uneven labels
    // reintroduce hierarchy that identical geometry cannot fix.
    for (const copy of Object.values(COPY)) {
      const ratio = copy.primaryAction.length / copy.secondaryAction.length;
      expect(ratio).toBeGreaterThan(0.4);
      expect(ratio).toBeLessThan(2.5);
    }
  });
});
