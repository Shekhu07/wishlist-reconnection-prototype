/**
 * E16: user controls and durable personalisation.
 *
 * Three things live here, and the third one carries a conflict worth stating
 * plainly rather than resolving quietly.
 *
 * **The global setting** (section 4.16) — already enforced service-side.
 *
 * **Per-item hide** — durable, and deliberately *not* the same thing as
 * dismissal. FR-8 is explicit that dismissing is a relevance signal and "never
 * a permanent opt-out": it lasts for the query family and the session. Hiding
 * is the permanent one. Collapsing them would either make a shrug permanent or
 * make a decision temporary, and both are worse than having two controls.
 *
 * **Preferred-action learning** — E16 asks for it; FR-5 and section 4.4 require
 * the two actions to stay co-equal, with neither visually subordinate. Those
 * cannot both be honoured by reordering or re-emphasising the buttons.
 *
 * It is worse than a design conflict during the experiment. Section 7 splits
 * Treatment A from B specifically to learn where the lift comes from, read off
 * the Buy-from-Wishlist and Compare-options rates. Personalising which action
 * leads would make those rates a measurement of the personaliser. So the
 * preference is *learned and recorded* here, and `shouldPersonalise` refuses to
 * apply it while an experiment is running. The learning is durable; acting on
 * it is a decision for after the read-out.
 */

export type PreferredAction = "buy_from_wishlist" | "compare_options";

export interface PreferenceState {
  /** Section 4.16. Enforced in the match client, before the matcher runs. */
  showWishlistInSearch: boolean;
  /** Durable per-item opt-out. Distinct from dismissal. */
  hiddenItemIds: string[];
  /** Evidence for preferred-action learning. */
  actionCounts: Record<PreferredAction, number>;
  /**
   * Whether a learned preference may change what the user sees. Off by
   * default, and refused outright while an experiment is running.
   */
  personaliseActions: boolean;
}

export const DEFAULT_PREFERENCES: PreferenceState = {
  showWishlistInSearch: true,
  hiddenItemIds: [],
  actionCounts: { buy_from_wishlist: 0, compare_options: 0 },
  personaliseActions: false,
};

/**
 * How much evidence before a preference is a preference.
 *
 * Two taps is a coincidence. The same discipline as the guardrail minimum
 * sample: a personalisation that fires on noise is worse than none, because
 * the user cannot tell it apart from the product being erratic.
 */
export const MIN_ACTIONS_FOR_PREFERENCE = 6;
/** And it has to be lopsided enough to be worth acting on. */
export const PREFERENCE_MARGIN = 0.65;

export class PreferenceStore {
  private state: PreferenceState;

  constructor(initial: Partial<PreferenceState> = {}) {
    this.state = {
      ...DEFAULT_PREFERENCES,
      ...initial,
      hiddenItemIds: [...(initial.hiddenItemIds ?? [])],
      actionCounts: { ...DEFAULT_PREFERENCES.actionCounts, ...initial.actionCounts },
    };
  }

  get showWishlistInSearch(): boolean {
    return this.state.showWishlistInSearch;
  }

  set showWishlistInSearch(value: boolean) {
    this.state = { ...this.state, showWishlistInSearch: value };
  }

  get personaliseActions(): boolean {
    return this.state.personaliseActions;
  }

  set personaliseActions(value: boolean) {
    this.state = { ...this.state, personaliseActions: value };
  }

  get hiddenItemIds(): readonly string[] {
    return this.state.hiddenItemIds;
  }

  get actionCounts(): Readonly<Record<PreferredAction, number>> {
    return this.state.actionCounts;
  }

  isHidden(itemId: string): boolean {
    return this.state.hiddenItemIds.includes(itemId);
  }

  hide(itemId: string): void {
    if (this.isHidden(itemId)) return;
    this.state = { ...this.state, hiddenItemIds: [...this.state.hiddenItemIds, itemId] };
  }

  /** Every durable control needs an undo, or it is a trap rather than a setting. */
  unhide(itemId: string): void {
    this.state = {
      ...this.state,
      hiddenItemIds: this.state.hiddenItemIds.filter((id) => id !== itemId),
    };
  }

  unhideAll(): void {
    this.state = { ...this.state, hiddenItemIds: [] };
  }

  recordAction(action: PreferredAction): void {
    this.state = {
      ...this.state,
      actionCounts: {
        ...this.state.actionCounts,
        [action]: this.state.actionCounts[action] + 1,
      },
    };
  }

  /**
   * The learned preference, or null when the evidence does not support one.
   *
   * Null is the common and correct answer. Returning a coin-flip winner
   * because something had to be returned is how personalisation earns its
   * reputation.
   */
  preferredAction(): PreferredAction | null {
    const { buy_from_wishlist: buy, compare_options: compare } = this.state.actionCounts;
    const total = buy + compare;
    if (total < MIN_ACTIONS_FOR_PREFERENCE) return null;
    if (buy / total >= PREFERENCE_MARGIN) return "buy_from_wishlist";
    if (compare / total >= PREFERENCE_MARGIN) return "compare_options";
    return null;
  }

  snapshot(): PreferenceState {
    return {
      ...this.state,
      hiddenItemIds: [...this.state.hiddenItemIds],
      actionCounts: { ...this.state.actionCounts },
    };
  }
}

/**
 * May a learned preference change what this user sees right now?
 *
 * Three conditions, and the experiment one is not negotiable. Reordering the
 * actions for some users would put a second, uncontrolled variable inside a
 * test whose whole purpose is to attribute a lift to one of three mechanisms.
 */
export function shouldPersonalise(
  store: PreferenceStore,
  experimentRunning: boolean
): boolean {
  if (experimentRunning) return false;
  if (!store.personaliseActions) return false;
  return store.preferredAction() !== null;
}
