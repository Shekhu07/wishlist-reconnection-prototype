/**
 * Optional intent tags (improvement 7).
 *
 * Three rules shape this, and all three are restraints:
 *
 * 1. **Optional, and never a form in the way of saving.** The prompt is
 *    explicit: "Do not interrupt the initial Save action with a mandatory
 *    form." A tag is added afterwards, from the saved product, or never.
 *
 * 2. **User input only.** "Do not infer sensitive personal occasions without
 *    user input." Nothing here derives a tag from behaviour, and nothing
 *    should: an inferred "Gift idea" that is wrong is embarrassing, and an
 *    inferred one that is right is worse.
 *
 * 3. **Runtime, not generated data.** `data/wishlist.json` is built by
 *    tools/catalog/build.py and must not be hand-edited, so tags live here --
 *    beside PreferenceStore, keyed by item_id, seeded empty.
 */

export type IntentTag =
  | "occasion"
  | "workwear"
  | "travel"
  | "gift"
  | "outfit"
  | "compare_later"
  | "decide_later";

export const INTENT_TAGS: { key: IntentTag; label: string; surfaced: string }[] = [
  { key: "occasion", label: "For an occasion", surfaced: "Saved for an occasion" },
  { key: "workwear", label: "Workwear", surfaced: "Saved for Workwear" },
  { key: "travel", label: "Travel", surfaced: "Saved for Travel" },
  { key: "gift", label: "Gift idea", surfaced: "Saved as a gift idea" },
  { key: "outfit", label: "Complete my outfit", surfaced: "Saved to complete an outfit" },
  { key: "compare_later", label: "Compare later", surfaced: "Saved to compare later" },
  { key: "decide_later", label: "Decide later", surfaced: "Saved to decide later" },
];

const LABELS = new Map(INTENT_TAGS.map((tag) => [tag.key, tag]));

/** The line shown when a tagged item surfaces in Search. */
export function surfacedCopy(tag: IntentTag): string {
  return LABELS.get(tag)?.surfaced ?? "";
}

export function tagLabel(tag: IntentTag): string {
  return LABELS.get(tag)?.label ?? tag;
}

/**
 * Tags that say something about the user rather than about the product.
 *
 * "Gift idea" on a shared device is the case section 19 has in mind, and it is
 * the reason display is a preference rather than an assumption. Kept as an
 * explicit list rather than a judgement call at each call site.
 */
export const PRIVATE_TAGS: IntentTag[] = ["gift", "occasion"];

export class TagStore {
  private readonly tags = new Map<string, Set<IntentTag>>();

  /**
   * Whether tags may be shown in Search at all.
   *
   * True by default because a tag exists only if the user typed it, and
   * hiding what someone deliberately wrote is its own kind of surprise. The
   * control exists because "deliberately written" and "safe on the screen a
   * flatmate can see" are different questions.
   */
  showInSearch = true;

  add(itemId: string, tag: IntentTag): void {
    const existing = this.tags.get(itemId) ?? new Set<IntentTag>();
    existing.add(tag);
    this.tags.set(itemId, existing);
  }

  remove(itemId: string, tag: IntentTag): void {
    this.tags.get(itemId)?.delete(tag);
  }

  toggle(itemId: string, tag: IntentTag): void {
    if (this.for(itemId).includes(tag)) this.remove(itemId, tag);
    else this.add(itemId, tag);
  }

  /** Every tag on an item, in the canonical order rather than insertion order. */
  for(itemId: string): IntentTag[] {
    const set = this.tags.get(itemId);
    if (!set) return [];
    return INTENT_TAGS.map((entry) => entry.key).filter((key) => set.has(key));
  }

  /**
   * The one line Search may show for an item, or null.
   *
   * Returns at most one tag: a card carrying three intent lines stops being a
   * reminder and becomes a profile read back at the user. The first in
   * canonical order wins, so the surfaced line is stable across renders.
   */
  surfacedFor(itemId: string): IntentTag | null {
    if (!this.showInSearch) return null;
    return this.for(itemId)[0] ?? null;
  }

  get taggedCount(): number {
    let count = 0;
    for (const set of this.tags.values()) if (set.size > 0) count += 1;
    return count;
  }

  /** Harness: a demo set, so a researcher can see the state without typing. */
  seedDemo(itemIds: string[]): void {
    const demo: IntentTag[] = ["workwear", "outfit", "travel"];
    itemIds.forEach((itemId, index) => {
      if (index < demo.length) this.add(itemId, demo[index]);
    });
  }

  reset(): void {
    this.tags.clear();
    this.showInSearch = true;
  }
}
