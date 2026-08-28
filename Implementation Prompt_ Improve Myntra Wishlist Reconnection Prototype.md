# Implementation Prompt: Improve Myntra Wishlist Reconnection Prototype

You are a senior product designer and front-end engineer improving the deployed Myntra Wishlist Reconnection prototype:

https://wishlist-reconnection-prototype.vercel.app/

Your task is to fix the prototype’s current gaps and add the highest-value opportunities identified in the case study. Do not rebuild the concept from scratch. Preserve the existing search-triggered Wishlist reconnection model, its visual language, the state harness, and the existing interaction logic wherever they are working well.

## Product objective

Increase the percentage of users who purchase at least one item from their Wishlist within 30 days of adding it, without using monetary incentives.

The experience must help the user answer:

> “Did I already save something relevant, and is it still right for me?”

The product should create **memory plus agency**. It should reconnect a saved item to current search intent, reduce uncertainty, and preserve the user’s freedom to buy, compare, dismiss, or continue browsing.

## Non-negotiable constraints

1. Do not add discounts, coupons, cashback, loyalty rewards, price drops, sale urgency, countdowns, artificial scarcity, or any other monetary incentive.
2. Do not force a redirect from Search to Wishlist.
3. Do not auto-add a Wishlist item to Bag.
4. Do not silently substitute a different size, color, seller, or product.
5. Do not expose Wishlist information when the user is logged out or when the account context is unavailable.
6. Keep normal Search results primary. The Wishlist module must remain a separate, non-blocking contextual layer.
7. Use exact canonical-product matches as the default. Do not enable broad semantic or visual similarity in the main MVP unless it is clearly labeled as a later-phase experiment.
8. Do not use fabricated ratings, reviews, fit, materials, delivery, return, or inventory data as if they were real. If the prototype uses seeded data, label it clearly as prototype data.
9. Preserve and extend the existing state harness for testing, experiment arms, shadow mode, latency simulation, pincode changes, stock sell-out, ramping, and kill-switch behavior.
10. All new behavior must be instrumentable with clear event names and properties.

## Current strengths to preserve

The prototype already includes:

- Search-triggered “From your Wishlist” reconnection.
- Match count such as “4 items match your search.”
- Saved product image, brand, category, saved color, saved size, price, and delivery promise.
- “Buy from Wishlist” and “Compare options” as co-equal actions.
- Comparison view with price, rating, reviews, material, fit, user size, delivery, and returns rows.
- Variant-unavailable, saved-color-unavailable, Already in Bag, Save for Later, Purchased Before, Dismissed, Logged Out, No Match, and Similar-not-exact states.
- Query-family/session-level dismissal.
- Privacy-safe logged-out behavior.
- Shadow mode, Control/A/B arms, ramp percentage, latency controls, stock controls, pincode controls, and kill-switch drill.

## Improvements to implement

### 1. Add a Decision Confidence Layer

Improve the saved-item module and saved-product detail page so that the user can understand whether the saved item is still a good decision.

Show the following where data is available:

- Saved color and size.
- Current size availability.
- Current color availability.
- Delivery promise for the selected location.
- Fit confidence or size guidance.
- Material or fabric information.
- Returnability.
- Review quality and review count.
- Seller or listing context.

Use factual, neutral language. Examples:

- “Your saved Size L is available.”
- “Saved color: Black. Other colors are available.”
- “Delivery available to 400001.”
- “Check size guide before moving to Bag.”

Do not use manipulative messages such as “Only a few left,” “Buy before it’s gone,” or “You may lose this deal.”

### 2. Make variant handling explicit

On the saved-product detail page, add a visible color selector in addition to the existing size selector.

Separate the following states:

- Saved color and saved size available.
- Saved color unavailable but another color available.
- Saved size unavailable but another size available.
- Both saved color and saved size unavailable.
- Entire product unavailable.

The interface must preserve the original saved variant as a reference. If the user selects another color or size, clearly show that the selection changed.

Never silently replace the saved variant.

### 3. Improve the Buy from Wishlist path

When the user chooses Buy from Wishlist:

1. Open the saved product state.
2. Preselect the saved size and color if still available.
3. Display the selected variant explicitly.
4. Revalidate inventory, seller, price, delivery, and returns.
5. Provide a clear Move to Bag action.
6. If successful, show “Added to Bag from Wishlist.”
7. Offer View Bag, Continue comparing, and Keep browsing.
8. Preserve the original Search query and result position when the user returns.

If the variant becomes unavailable between product view and Move to Bag, show a recovery state rather than a generic error.

### 4. Improve the Compare options path

Keep Compare options as a co-equal action to Buy from Wishlist. Do not visually subordinate it.

Improve the comparison view by:

- Keeping the saved item clearly labeled as “Your saved item.”
- Adding a visible “Why this option appears” explanation for alternatives.
- Showing a maximum of three to five relevant alternatives.
- Grouping alternatives by meaningful reasons such as Similar fit, Same style, Different color, Earlier delivery, or Same brand family.
- Showing the saved item’s selected size and color next to each alternative.
- Allowing the user to select one comparison priority: Fit, Delivery, Comfort, Occasion, Reviews, or Returns.
- Reordering the explanatory rows based on the selected priority without hiding important information.
- Allowing the user to return to the original Search results without losing context.

Every explanation must be based on actual seeded product attributes. Do not invent explanations that the data cannot support.

### 5. Add a lightweight “Help me decide” path

Do not show this action for every user by default. Add it as an optional third action in the comparison experience or after evidence suggests that uncertainty is the dominant barrier.

The flow should ask one short question:

> “What matters most for this purchase?”

Offer neutral criteria:

- Fit.
- Delivery.
- Comfort.
- Occasion.
- Reviews.
- Returns.

The result should explain the trade-off among the saved item and alternatives. It must not claim that one item is universally best, and it must not use price or discounts as the primary recommendation logic.

### 6. Add “Why this appeared?” transparency

Add a small, accessible explanation to the Wishlist module:

> “Shown because your search matches a product in your Wishlist.”

Add controls for:

- Hide for this search.
- Hide this saved item.
- Don’t show Wishlist matches in Search.
- Undo.

Maintain the current query-family/session suppression behavior after dismissal. Record dismissal as relevance feedback, not as a permanent rejection of all future reconnection.

### 7. Add optional Wishlist intent tags

Allow users to optionally add context when saving or editing a Wishlist item. Suggested tags:

- For an occasion.
- Workwear.
- Travel.
- Gift idea.
- Complete my outfit.
- Compare later.
- Decide later.

Tags must be optional. Do not interrupt the initial Save action with a mandatory form.

When a tagged item is surfaced in a relevant search, use transparent copy such as:

- “Saved for Workwear.”
- “Saved to complete an outfit.”

Do not infer sensitive personal occasions without user input.

### 8. Add comparison re-entry

If the user compares options but does not add anything to Bag, preserve the comparison state for the current session.

Show a quiet re-entry option such as:

> “Continue your comparison”

The user must be able to dismiss this state. Do not use push notifications in this iteration.

### 9. Add Wishlist-to-look completion as a later-phase prototype

Create a clearly separated future-phase state in the harness, not a default production behavior.

When a user searches for one category, such as shirts, optionally show one or two complementary items from their saved items or recent views, with an explanation such as:

- “Works with your saved jeans.”
- “Complete the look.”

Keep this experience sparse and removable. Do not create an overwhelming recommendation carousel, and do not add complementary products solely to increase basket size.

### 10. Improve search and intent coverage carefully

Preserve the current exact text-search flow as the primary MVP.

Add later-phase prototypes for:

- Voice query: “Show me the black shoes I saved.”
- Ask Maya query: “Find the shirt I saved for office wear.”
- Image search for a visually similar saved item.
- Category or brand-page reconnection.

Each later-phase mode should have a higher confidence threshold and its own visible state in the harness. Do not mix semantic or visual similarity with exact matching in the primary experiment.

## Edge-case requirements

Ensure the improved prototype supports and visibly demonstrates:

| Edge case | Expected behavior |
|---|---|
| Saved size unavailable | Do not substitute silently; offer size choices, alert if supported, and Compare options |
| Saved color unavailable | Preserve the saved color label; show other colors as alternatives |
| Whole product unavailable | Explain that the saved product is unavailable; offer similar options without pretending they are identical |
| Multiple matches | Show a maximum of three in the module; provide View all matching Wishlist items |
| Low-confidence match | Render nothing and leave Search unchanged |
| Already in Bag | Show View Bag and Compare options; prevent duplicate addition |
| In Save for Later | Show Move to Bag and View Save for Later |
| Purchased before | Show Reorder and View order; do not frame as a new purchase |
| Dismissed | Suppress for the query family/session and allow Undo where appropriate |
| Logged out | Do not reveal that a Wishlist exists |
| Search filters conflict | Respect explicit filters and suppress conflicting saved items |
| Delivery pincode changes | Recompute delivery context before action |
| Latency | Search results render independently; module loads progressively or suppresses safely |
| Inventory changes after click | Revalidate at the action boundary and show recovery state |
| Shared device/privacy | Provide a setting to disable Wishlist matches in Search |
| Generated prototype data | Label clearly and never present it as real marketplace data |

## State harness additions

Add or preserve controls for:

- Exact match, variant match, semantic similarity, and no-match confidence tiers.
- Saved size available/unavailable.
- Saved color available/unavailable.
- Whole product unavailable.
- Delivery pincode changes.
- Product already in Bag.
- Product in Save for Later.
- Product purchased before.
- User dismissal and Undo.
- Logged-out state.
- Filter conflict.
- Match latency from fast to slow.
- Shadow mode.
- Control, Reconnection, Variant Continuity, and future Confidence Layer arms.
- Ramp percentage.
- Kill-switch drill.

## Analytics instrumentation

Add or preserve these events:

- `wishlist_add`
- `search_submitted`
- `wishlist_match_eligible`
- `wishlist_module_rendered`
- `wishlist_module_viewed`
- `wishlist_module_action`
- `wishlist_item_opened`
- `compare_view_opened`
- `compare_priority_selected`
- `help_me_decide_opened`
- `wishlist_relevance_feedback`
- `saved_variant_revalidated`
- `move_to_bag_clicked`
- `move_to_bag_result`
- `comparison_reentry_opened`
- `purchase_completed`
- `wishlist_module_suppressed`
- `wishlist_module_error`
- `wishlist_visibility_preference_changed`

Include properties for user/session/search IDs, experiment arm, product/SKU/variant, saved color and size, match type, match-score bucket, query type, filters, inventory state, delivery state, app version, platform, latency, dismissal state, and timestamps.

## Validation requirements

Before considering the prototype complete:

1. Test the exact-match happy path from Search to Buy from Wishlist to Move to Bag.
2. Test Compare options and priority-based comparison.
3. Test saved size and color changes without silent substitution.
4. Test every edge case listed above.
5. Confirm Search remains usable when no match, low-confidence match, or logged-out state occurs.
6. Confirm the module is dismissible and suppression works correctly.
7. Confirm the module does not block Search or degrade under simulated latency.
8. Confirm the experiment arms and ramp controls remain functional.
9. Confirm all prototype data is labeled and no fabricated data is presented as real.
10. Confirm no monetary incentive or urgency-based persuasion has been introduced.

## Definition of done

The improved prototype is complete when it demonstrates:

- A trustworthy exact-match reconnection experience.
- A clear and low-friction Buy from Wishlist path.
- A genuinely useful Compare options path.
- Transparent variant, inventory, delivery, and return handling.
- Decision confidence support without monetary incentives.
- Strong privacy and user-control behavior.
- A usable failure-state and experiment harness.
- Analytics that connect exposure to the 30-day Wishlist-to-Purchase outcome.

Do not optimize for the highest number of module clicks. Optimize for **relevant reconnection, confident decisions, successful Bag movement, and incremental 30-day purchase conversion without damaging trust.**
