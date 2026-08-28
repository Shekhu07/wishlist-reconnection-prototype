import { DEFAULT_CONFIG } from "@/match/contract";
import { MODALITY_MODES, isStricterThanText, modeFor, thresholdFor } from "@/match/modality";
import { INTENT_TAGS, PRIVATE_TAGS, TagStore, surfacedCopy } from "@/wishlist/tags";
import { BANNED_COPY_PATTERNS } from "@/copy/bundle";
import { makeCatalog, makeWishlist } from "./helpers/fixtures";
import { buildIndex, match } from "@/match/matcher";
// The real catalog, because the threshold ladder needs a genuine spread of
// scores to be observable at all; the two-product fixture cannot produce one.
import realCatalogJson from "@/data/catalog.json";
import realWishlistJson from "@/data/wishlist.json";
import type { Catalog, Wishlist } from "@/data/types";

const realCatalog = realCatalogJson as unknown as Catalog;
const realWishlist = realWishlistJson as unknown as Wishlist;

/**
 * Improvements 7, 9 and 10 -- the later-phase surfaces.
 *
 * All three are off by default and out of the primary experiment. What is
 * tested here is mostly what they refuse to do.
 */

describe("intent tags (improvement 7)", () => {
  it("starts empty, because a tag exists only if someone wrote it", () => {
    const store = new TagStore();
    expect(store.for("wi_1")).toEqual([]);
    expect(store.taggedCount).toBe(0);
  });

  it("never infers a tag from anything", () => {
    // The prompt: "Do not infer sensitive personal occasions without user
    // input." The store has no input but explicit calls, which is the
    // structural version of that promise.
    const store = new TagStore();
    store.add("wi_1", "workwear");
    expect(store.for("wi_2")).toEqual([]);
  });

  it("surfaces at most one line per item", () => {
    // Three intent lines on a card stops being a reminder and becomes a
    // profile read back at the user.
    const store = new TagStore();
    store.add("wi_1", "workwear");
    store.add("wi_1", "travel");
    store.add("wi_1", "gift");
    expect(store.for("wi_1")).toHaveLength(3);
    expect(typeof store.surfacedFor("wi_1")).toBe("string");
  });

  it("is stable across renders rather than ordered by when it was added", () => {
    const a = new TagStore();
    a.add("wi_1", "travel");
    a.add("wi_1", "workwear");
    const b = new TagStore();
    b.add("wi_1", "workwear");
    b.add("wi_1", "travel");
    expect(a.surfacedFor("wi_1")).toBe(b.surfacedFor("wi_1"));
  });

  it("can be withheld from Search entirely", () => {
    // Section 19's shared-device case. "Gift idea" is written deliberately and
    // is still not something everyone wants on a screen a flatmate can see.
    const store = new TagStore();
    store.add("wi_1", "gift");
    expect(store.surfacedFor("wi_1")).toBe("gift");
    store.showInSearch = false;
    expect(store.surfacedFor("wi_1")).toBeNull();
    // The tag itself survives; only its display is suppressed.
    expect(store.for("wi_1")).toEqual(["gift"]);
  });

  it("toggles off as easily as on", () => {
    const store = new TagStore();
    store.toggle("wi_1", "travel");
    expect(store.for("wi_1")).toEqual(["travel"]);
    store.toggle("wi_1", "travel");
    expect(store.for("wi_1")).toEqual([]);
  });

  it("names the private ones explicitly rather than leaving it to judgement", () => {
    for (const tag of PRIVATE_TAGS) {
      expect(INTENT_TAGS.map((entry) => entry.key)).toContain(tag);
    }
  });

  it("carries no banned copy in any surfaced line", () => {
    for (const entry of INTENT_TAGS) {
      const line = surfacedCopy(entry.key);
      expect(line).not.toBe("");
      for (const pattern of BANNED_COPY_PATTERNS) expect(line).not.toMatch(pattern);
    }
  });
});

describe("later-phase input modes (improvement 10)", () => {
  it("holds every later-phase mode to a stricter bar than text (C-8)", () => {
    for (const mode of MODALITY_MODES) {
      expect(isStricterThanText(mode.modality)).toBe(true);
    }
    expect(thresholdFor("voice")).toBeGreaterThan(thresholdFor("text"));
    expect(thresholdFor("image")).toBeGreaterThan(thresholdFor("text"));
  });

  it("keeps every one of them out of the primary experiment", () => {
    for (const mode of MODALITY_MODES) expect(mode.outOfExperiment).toBe(true);
  });

  it("marks the image mode as not being what its name suggests", () => {
    // Visual similarity is Tier 4. C-5 excludes Tier 3 and 4 from v1, and E15
    // is the one epic in the plan deliberately unbuilt for that reason.
    // Shipping a fake would undo the constraint the precision story rests on.
    const image = modeFor("image");
    expect(image?.genuine).toBe(false);
    expect(image?.note).toMatch(/NOT similarity search/);
    expect(image?.note).toMatch(/C-5/);
  });

  it("does not quietly claim the others are fake too", () => {
    for (const modality of ["voice", "category", "recent"] as const) {
      expect(modeFor(modality)?.genuine).toBe(true);
    }
  });

  it("never claims a model where the rules parser is doing the work", () => {
    expect(modeFor("recent")?.note).toMatch(/No model is involved/);
  });

  it("reads its thresholds from the contract rather than restating them", () => {
    expect(thresholdFor("voice")).toBe(DEFAULT_CONFIG.tau.voice);
    expect(thresholdFor("image")).toBe(DEFAULT_CONFIG.tau.image);
  });

  it("actually rejects under a stricter mode what it accepts under text", () => {
    // A threshold nobody can observe doing work is a label. Measured on the
    // real catalog: "shirt" clears tau.text and clears neither of the stricter
    // bars, and "blue jeans" sits between voice and image -- so both steps of
    // the C-8 ladder are load-bearing rather than decorative.
    const index = buildIndex(realCatalog, realWishlist);
    const at = (query: string, modality: "text" | "voice" | "image") =>
      match(
        { query, modality, filters: {}, delivery_pincode: "560034", session_id: "s", search_id: "x" },
        index
      ).matches.length;

    expect(at("shirt", "text")).toBeGreaterThan(0);
    expect(at("shirt", "voice")).toBe(0);

    expect(at("blue jeans", "voice")).toBeGreaterThan(0);
    expect(at("blue jeans", "image")).toBe(0);
  });
});
