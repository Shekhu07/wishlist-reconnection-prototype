import { COMPARE_AXES } from "@/copy/bundle";
import {
  COMPARE_PRIORITIES,
  PRIORITY_AXES,
  orderedAxes,
  type ComparePriority,
} from "@/compare/priority";
import { REASON_COPY, reasonFor } from "@/compare/reasons";
import { tradeOffCaveat, tradeOffs, type DecideColumn } from "@/compare/decide";
import { makeCatalog } from "./helpers/fixtures";

/**
 * Improvements 4 and 5: the comparison as a decision rather than a table.
 *
 * Two rules do most of the work here, and both are about restraint. A priority
 * reorders and never hides. An explanation is derived or absent, never
 * generated.
 */

describe("comparison priority", () => {
  it("offers exactly the six criteria the prompt names", () => {
    expect(COMPARE_PRIORITIES.map((entry) => entry.key)).toEqual([
      "fit",
      "delivery",
      "comfort",
      "occasion",
      "reviews",
      "returns",
    ]);
  });

  it("never lets price be a priority (C-1)", () => {
    // Price stays visible as a row at every priority, but it is not something
    // the user can rank by -- that is where monetary logic would re-enter.
    expect(COMPARE_PRIORITIES.map((entry) => entry.key)).not.toContain("price");
    for (const axes of Object.values(PRIORITY_AXES)) {
      expect(axes).not.toContain("price");
    }
  });

  it("reorders the axes without dropping a single one", () => {
    const all = COMPARE_AXES.map((axis) => axis.key).sort();
    for (const { key } of COMPARE_PRIORITIES) {
      const ordered = orderedAxes(key).map((axis) => axis.key);
      // Improvement 4: "without hiding important information". Hiding the rows
      // a user did not prioritise would decide for them which trade-offs are
      // allowed to exist.
      expect([...ordered].sort()).toEqual(all);
      expect(ordered.slice(0, PRIORITY_AXES[key].length).sort()).toEqual(
        [...PRIORITY_AXES[key]].sort()
      );
    }
  });

  it("leaves the table alone when no priority is chosen", () => {
    expect(orderedAxes(null)).toEqual(COMPARE_AXES);
  });

  it("maps every priority onto axes the table actually has", () => {
    const known = new Set(COMPARE_AXES.map((axis) => axis.key));
    for (const axes of Object.values(PRIORITY_AXES)) {
      for (const axis of axes) expect(known.has(axis)).toBe(true);
    }
  });
});

describe("why an option appears", () => {
  const catalog = makeCatalog();
  const saved = catalog.parents[0];
  const savedColourway = saved.colourways[0];
  const context = {
    savedParent: saved,
    savedColourway,
    pincode: "560034",
    today: catalog.today,
  };

  it("calls another colourway of the same product what it is", () => {
    const sibling = saved.colourways[1];
    expect(reasonFor(saved, sibling, context)).toBe("different_colour");
  });

  it("recognises the same brand in a different style", () => {
    const rival = catalog.parents[1];
    const sameBrand = { ...rival, brand_key: saved.brand_key };
    expect(reasonFor(sameBrand, rival.colourways[0], context)).toBe("same_brand");
  });

  it("does not call two missing fit labels a similarity", () => {
    // Both null is an absence of data, not a match. Claiming "similar fit"
    // from two blanks is precisely the invented explanation the prompt bans.
    const other = catalog.parents[2];
    const noFit = { ...other.colourways[0], fit: null };
    const savedNoFit = { ...savedColourway, fit: null };
    const reason = reasonFor(other, noFit, { ...context, savedColourway: savedNoFit });
    expect(reason).not.toBe("similar_fit");
  });

  it("returns null rather than inventing a reason it cannot support", () => {
    const other = catalog.parents[2]; // different brand, type, style and fit
    const unrelated = { ...other.colourways[0], fit: "Skinny Fit", seller: "Myntra Retail" };
    const reason = reasonFor(other, unrelated, context);
    // Either a derivable reason, or nothing. Never a filler string.
    expect(reason === null || reason in REASON_COPY).toBe(true);
  });

  it("gives every reason key copy to render", () => {
    for (const key of Object.keys(REASON_COPY)) {
      expect(REASON_COPY[key as keyof typeof REASON_COPY].trim()).not.toBe("");
    }
  });
});

describe("help me decide", () => {
  const columns: DecideColumn[] = [
    {
      key: "saved",
      label: "Your saved item",
      isSaved: true,
      values: { fit: "Regular Fit", sizes: "M in stock", delivery: "Delivery by Fri, 28 Aug" },
    },
    {
      key: "alt",
      label: "Highlander Check Shirt",
      isSaved: false,
      values: { fit: "Slim Fit", sizes: "M unavailable", delivery: "Delivery by Fri, 28 Aug" },
    },
  ];

  it("reads back the axes the chosen priority is about, and only those", () => {
    const lines = tradeOffs(columns, "fit");
    expect(lines.map((line) => line.axis)).toEqual(PRIORITY_AXES.fit);
  });

  it("includes every option, with the saved one marked", () => {
    const [first] = tradeOffs(columns, "fit");
    expect(first.readings).toHaveLength(2);
    expect(first.readings.filter((r) => r.isSaved)).toHaveLength(1);
  });

  it("keys readings uniquely even when two options share a name", () => {
    // buildColumns deliberately backfills with other colourways of the same
    // product, so two options can carry the same brand and display name. The
    // browser found this as a duplicate-React-key error; keying on the label
    // collides, keying on the column does not.
    const sameName: DecideColumn[] = [
      { key: "alt-1", label: "Mark Taylor Striped Shirt", isSaved: false, values: { fit: "Regular Fit" } },
      { key: "alt-2", label: "Mark Taylor Striped Shirt", isSaved: false, values: { fit: "Slim Fit" } },
    ];
    const [line] = tradeOffs(sameName, "fit");
    const keys = line.readings.map((reading) => reading.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("marks an axis that cannot separate the options", () => {
    // Both deliver on the same day, so delivery is not a reason to choose
    // either. Saying so beats presenting it as though it were.
    const [delivery] = tradeOffs(columns, "delivery");
    expect(delivery.undifferentiated).toBe(true);
  });

  it("never names a winner", () => {
    for (const priority of COMPARE_PRIORITIES.map((p) => p.key)) {
      const lines = tradeOffs(columns, priority as ComparePriority);
      const caveat = tradeOffCaveat(priority as ComparePriority, lines);
      // Improvement 5: it "must not claim that one item is universally best".
      expect(caveat).not.toMatch(/best|better|recommend|should (buy|choose|pick)|winner|top pick/i);
      // And no option's name may appear in the closing line at all -- that is
      // the shape a recommendation takes when it sneaks back in.
      for (const column of columns) expect(caveat).not.toContain(column.label);
    }
  });

  it("says so when the chosen priority separates nothing", () => {
    const lines = tradeOffs(columns, "delivery");
    expect(tradeOffCaveat("delivery", lines)).toMatch(/do not differ/i);
  });

  it("uses no price or discount logic anywhere in its reasoning", () => {
    for (const priority of COMPARE_PRIORITIES.map((p) => p.key)) {
      const lines = tradeOffs(columns, priority as ComparePriority);
      expect(lines.map((line) => line.axis)).not.toContain("price");
    }
  });
});
