import {
  BANNED_COPY_PATTERNS,
  COPY,
  DISMISSED_COPY,
  DISMISS_LABEL,
  UNDO_LABEL,
  VIEW_ALL,
  formatPrice,
} from "@/copy/bundle";

/**
 * Constraint C-1 is a launch gate, so it is a test rather than a review note.
 * If someone adds "20% off" to the bundle, the build fails here.
 */

function everyString(): string[] {
  const context = { count: 3, savedSize: "M", savedColour: "Black" };
  const strings: string[] = [DISMISS_LABEL, DISMISSED_COPY, UNDO_LABEL, VIEW_ALL];
  for (const copy of Object.values(COPY)) {
    strings.push(copy.title, copy.primaryAction, copy.secondaryAction, copy.subtitle(context));
  }
  return strings;
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
