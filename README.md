# Wishlist Search-Reconnection — prototype

A buildable prototype of the "From your Wishlist" search-reconnection module
specified in [`Wishlist_Reconnection_MVP_Prototype_Plan.md`](./Wishlist_Reconnection_MVP_Prototype_Plan.md).

This repository is **Slice 1** of that plan: the catalog pipeline, the identity
and variant graph, the match layer, and the module UI in all ten of its states.
The Buy-from-Wishlist revalidation flow (E5) and the Compare view (E6) are
Slice 2 — both buttons render and emit their events, and route to a stub.

## Running it

```bash
python3 -m venv .venv && .venv/bin/pip install pyarrow pillow
.venv/bin/python tools/catalog/build.py --check     # builds the catalog (~2 GB of transfer, once)

cd app && npm install
npm test                                            # matcher, transport, copy lint, a11y, fixtures
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
| C-8 higher bar for voice/image | Per-modality τ in `match/contract.ts` |
