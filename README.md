# Wishlist Search-Reconnection — prototype

A buildable prototype of the "From your Wishlist" search-reconnection module
specified in [`Wishlist_Reconnection_MVP_Prototype_Plan.md`](./Wishlist_Reconnection_MVP_Prototype_Plan.md).

This repository covers **Slice 1** (the catalog pipeline, the identity and
variant graph, the match layer, and the module UI in all ten of its states) and
**Slice 2** (the Buy-from-Wishlist revalidation flow, E5, and the Compare view,
E6).

## Running it

```bash
python3 -m venv .venv && .venv/bin/pip install pyarrow pillow
.venv/bin/python tools/catalog/build.py --check     # builds the catalog (~2 GB of transfer, once)

cd app && npm install
npm test                                            # everything, including the gates
npm run gates                                       # just the acceptance gates, writes docs/gate-report.md
npm run web                                         # open the prototype
```

The dark bar at the top of the app is the **E12 state harness**. Every state
from section 4.6 of the plan is one tap, plus a match-latency control and the
swapped-fill treatment the plan defers to Phase 5. When the module is absent,
the harness says why — timed out, breaker open, dismissed, or resolved past the
render grace — so an intentional suppression is never mistaken for a broken build.

| | |
|---|---|
| ![One exact match](docs/state2-one-exact-match.png) | ![Variant unavailable](docs/state5-variant-unavailable.png) |
| **State 2** — one exact match | **State 5** — saved size gone. The primary action becomes "See available sizes": no dead-end Buy, no silent substitution. |
| ![Saved product](docs/e5-saved-product.png) | ![Recovery](docs/e5-recovery-sold-out.png) |
| **E5** — the saved product, colour and size preselected, all five facts revalidated at the boundary | **E5 recovery** — stock moved between the module render and the tap. Named state, saved variant untouched. |
| ![Compare](docs/e6-compare.png) | |
| **E6** — the saved item first and labelled, against four query-relevant alternatives on eight axes. No discount column. | |

## Acceptance gates

The plan attaches a `✅ Gate` line to every P0 epic. Five of them are things
code can measure, and `npm run gates` measures them, writing
[`docs/gate-report.md`](docs/gate-report.md):

| Epic | Requirement |
|---|---|
| E1 | exact-match precision ≥ 99% over a 500-pair set |
| E1 | zero silent variant substitutions across a 10,000-run fuzz |
| E2 | ≥ 90% field-level parser accuracy over 1,000 queries |
| E3 | match p95 ≤ 120 ms |
| E8 | no wishlist field in any unauthenticated response **or log line** |

The report records what each number **is not evidence for**, alongside the
number. That column is the point. The E1 labels are generated rather than
hand-labelled, and the generator derives brand the same way the matcher does,
so an error shared by both cancels out — a passing precision figure guards
against regression but is not the Phase 1 exit evidence the plan asks for. The
latency figure is in-process JavaScript, not the 500 rps load test. A gate
report that omitted those caveats would be worse than no gate report.

Two of the three P0 gaps the gates exposed were invisible to every unit test:
tier 2 matching never fired at all (dead code behind a passing suite), and the
identity floor gated the colourway being drawn rather than the saved one, so an
item too untrustworthy to show could still surface a sibling colour.

## Two-phase freshness

The availability the module renders is **advisory** — true when the match
resolved, possibly not true now. The binding read happens at the action
boundary, in `revalidation/revalidate.ts`, and is allowed to contradict the
card the user just tapped. That disagreement is the point, so the harness can
force it: **Sell out saved size**, **Sell out product** and the delivery
address selector each drive a different named recovery state.

Blocking reasons are named rather than generic, because each has a different
next step: a sold-out size, a withdrawn product, and an unservable address are
not the same conversation. Advisories (price or seller changed) are stated as
facts with no direction of travel — "it went down" would be an incentive, which
constraint C-1 rules out.

## Where the data comes from

The plan names the Kaggle *Fashion Product Images (Small)* dataset. Three
things about it shape the pipeline, and all three were verified rather than
assumed:

- **There is no `brand` column.** Brand lives inside `productDisplayName`, as
  the token span before the first gender token. The rule recovers 98.4% of
  rows; the rest fall back to a gazetteer bootstrapped from the ones that
  parsed, and what still fails is dropped rather than guessed.
- **There is no size, price, seller, stock or SKU.** All of it is synthesised
  from a SHA-1 of the SKU id, so the catalog is byte-identical on every machine.
- **The images are 60×80**, far too small for the 96×128 pt card. A mirror of
  the same 44,072 rows at 384×512 supplies the images instead.

Five of E6's eight comparison axes — rating, review count, material, fit and
returns — are also absent from the dataset and are synthesised. The Compare
screen says so on itself: a comparison invites a judgement, and a judgement
built on invented numbers is worth nothing unless the reader knows.

The dataset's own noise is kept on purpose. 1,122 rows have a colour in their
title that contradicts `baseColour` — "Carlton London Women **Black** Heels"
recorded as Bronze. Those get a low `identity_confidence` and are exactly the
mislabelled-listing case the plan's E1 exists to handle.

## Layout

```
tools/catalog/     the pipeline: fetch → derive → curate → synthesise → images
app/src/match/     contract, rules-based query parser, tier 1+2 matcher,
                   suppression, circuit breaker, fail-open transport
app/src/components/WishlistModule/   the module
app/src/harness/   the E12 state switcher
app/src/data/      generated — never hand-edit
```

## The constraints, and where they are enforced

| Constraint | Where |
|---|---|
| C-1 no monetary incentive | `copy/bundle.ts` ban list, asserted in `__tests__/copy.test.ts` |
| C-3 search never waits on matching | `search/localSearch.ts` takes no wishlist argument; `match/transport.ts` fails open inside 250 ms |
| C-4 precision over recall | Below τ returns empty, never a weak card (`match/matcher.ts`) |
| C-5 no semantic similarity | Tier 3/4 are absent, not stubbed |
| C-6 no cross-account leak | Logged-out callers take the same path to the same frozen empty response |
| C-7 accessibility | Labels, focus order and ≥44×44 targets asserted in `__tests__/module.test.tsx` |
| FR-7 no silent substitution | An alternative is only ever offered once the saved variant is blocked, and buying a different size relabels the button with the size it is actually buying |
| C-8 higher bar for voice/image | Per-modality τ in `match/contract.ts` |
| §4.16 user control | `preferences.showWishlistInSearch`, enforced in `match/transport.ts` before the matcher runs — a preference the UI honours but the service ignores is not a control |
