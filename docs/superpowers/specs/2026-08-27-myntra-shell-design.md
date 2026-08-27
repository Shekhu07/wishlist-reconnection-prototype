# The app shell — design

**Date:** 2026-08-27
**Status:** awaiting review
**Scope:** put the module inside the app it is meant to appear in. Two new
screens (home, search entry), a navigation shell around the three that exist,
and a deployment target of mobile web on Vercel.

---

## 1. Why

Every screen this prototype has starts at the search results. A participant
arrives already searching, having never typed the query, and the module appears
in a page with no app around it. Three of the questions §7.4 says a 300–500
panel *can* answer — whether people understand why the module appeared, whether
the ten states read correctly, whether the swapped-fill check holds — are
questions about a moment inside a session. The moment has no session around it.

The two screenshots supplied are that session: the home screen a search starts
from, and the search-entry screen that a query is typed into. Building them is
not decoration; it is the difference between testing a component and testing the
experience the plan describes.

**A second reason, and the one that constrains the build:** the target is
mobile web on Vercel. Not Expo Go, not a native build. The artifact is a URL a
participant opens on their own phone, which is also the cheapest way to run an
unmoderated panel.

## 2. What "exactly like the screenshots" can and cannot mean

The screenshots are of Myntra. The repo already treats them as a source —
`design/tokens.ts` calls its values "transcribed, not invented". This design
continues that and draws a hard line in the same place:

- **Layout, spacing, type scale, colour, and interaction are copied.** That is
  the point of the exercise, and it is what the tokens file already does.
- **Trademarked assets are not.** The Myntra wordmark is drawn as a pink `M`
  glyph in `MyntraMark.tsx` — a shape, not a trace of the logo. The ALDO ad
  becomes a catalog image under the sale overlay. The partner-strip logos become
  the catalog's own brand names.
- **The OS chrome in the screenshots is not ours to draw.** The status bar and
  the keyboard belong to the phone. On mobile web the browser supplies both.

## 3. The catalog widens to cover the shell

The screenshots have a category rail. The committed catalog had rows for three
of its circles and none for the other two, so the first version of this design
proposed empty states. That was checked against the source dataset rather than
assumed, and the check changed the answer:

| Circle | Rows in the cached dataset | Verdict |
|---|---|---|
| Fashion (Apparel) | 20,298 | already curated |
| Footwear | 9,152 | already curated |
| Accessories | 11,088 | already curated |
| **Kids** (Boys 589 + Girls 477) | **1,066** | **real — curate it in** |
| **Beauty** (Personal Care) | **1,759** | **real — curate it in** |
| **Home** | **1** | not a category. See §3.2 |

### 3.1 Kids and Beauty are a curation change, not new data

`tools/catalog/curate.py` selects the demo catalog from `QUERY_FAMILIES`. Kids
and Beauty were never absent from the dataset; they were absent from that list.
Families are **appended**, which matters more than it looks: `select()` assigns
state fixtures by `families[0..6]`, so appending leaves every existing role
pointing at the same product and the 247 tests keep their ground truth. Inserting
would silently repoint `exact_available` and rewrite what state 2 means.

Each family needs 13 parents (4 wishlisted + 9 filler). Verified against the
derived parent set:

| New family | gender + articleType | parents available |
|---|---|---|
| `kids tshirt` | Boys · Tshirts | 174 |
| `kids top` | Girls · Tops | 55 |
| `kids dress` | Girls · Dresses | 29 |
| `perfume` | Women · Perfume and Body Mist | 217 |
| `lipstick` | Women · Lipstick | 47 |
| `nail polish` | Women · Nail Polish | 81 |

Two consequences worth stating rather than discovering later:

- **`QUERY_FAMILIES` needs `genders`, not `gender`.** Kids is Boys *and* Girls,
  and the current spec shape holds one value.
- **Beauty is `Onesize`.** `synthesize.size_ladder()` falls through to the
  default ladder for perfume and lipstick, so beauty items browse correctly and
  never produce a saved-size state. That is right rather than missing: there is
  no size to lose, so the variant-unavailable path has nothing to say.
- **Nail polish is a genuine Tier 2 fixture.** 81 parents across many colours is
  the "saved colour gone, another colour available" case occurring naturally in
  a category that is nothing but colour.

Cost: roughly 250 new images at 384×512 (4 wishlisted parents × 6 colourways +
9 filler × 2, per family), taking the committed set from 308 to about 560. The
gate, shadow, experiment and panel reports are all regenerated, because the
catalog they measure has changed.

### 3.2 Home is synthesised, and this is the exception

The dataset has exactly one Home row — a cushion cover. One product is not a
category, so on review the decision was taken to **invent a home range**: this
is the first invented product data in the catalog, and it is recorded here
rather than left for someone to find.

Everything else in `catalog.json` is a real dataset row with price, stock,
seller and size synthesised on top of it. Home inverts that: the products
themselves are fabricated. Two safeguards, because the cost of forgetting is
that a future reader treats a home product as evidence of something:

- Every synthetic home parent carries `"synthetic": true` in `catalog.json`,
  and `masterCategory: "Home"` implies it. Nothing else in the catalog carries
  that flag.
- **Home is excluded from every measurement.** The gate suites, the shadow
  read-out, the τ sweep and the E1 precision set all filter it out. A precision
  number computed partly over products that were invented to fill a circle would
  be measuring the generator.

**Images.** The mirror has no photograph of a product that does not exist, so
home tiles are generated with Pillow at 384×512: a flat field in the product's
`baseColour` with the article type set in it. They are deliberately not
photographic. A borrowed fashion photograph would be the actual lie — a
participant would read it as a real listing.

Home products are browsable and nothing more. They are not wishlisted, they
never enter a match, and no state fixture depends on one.

## 4. Architecture

### 4.1 The query gets a second owner, and that is the real change

Today the query is `scenario.query`. The harness selects a scenario, and the
scenario carries the query, the modality, the filters and the authentication
state into `MatchRequest`. `session_id` is `sess_${scenario.id}`, and
`search_performed` fires on `[scenario.id]`.

A live search field is a **second source of the same values**, and if both write
into `MatchRequest` independently the harness and the search field will overwrite
each other in ways that are invisible in the UI and visible only as a corrupt
event log.

So they are unified behind one value:

```ts
interface SearchIntent {
  query: string;
  modality: Modality;
  filters?: MatchRequest["filters"];
  authenticated: boolean;
  source: "scenario" | "user";
  seq: number;          // increments per search; session_id is derived from it
}
```

- Selecting a scenario sets the intent wholesale, exactly as today.
- Submitting a typed query sets `{ query, source: "user", seq: seq + 1 }`,
  keeps `authenticated` and `modality` from the active scenario (so state 10,
  logged out, survives a typed search), and **drops the scenario's forced
  filters**, because those exist to stage a state rather than to describe what
  the user asked for.
- `session_id` becomes `sess_${seq}`, and `search_performed` fires on `seq`.
  Each search is one search in the funnel. Under the current code a researcher
  who re-picks the same scenario logs nothing, and a typed search would log
  nothing at all — §7's funnel would undercount the moment free search exists.

`useWishlistMatch` and `MatchClient` are untouched. This is a change to who
builds `MatchRequest`, not to what happens to it.

### 4.2 Navigation

`App.tsx` keeps its state machine. `Route` grows a tab and a stack:

```ts
type Tab = "home" | "search" | "under999" | "luxury" | "bag";
type Screen =
  | { name: "home" }
  | { name: "searchEntry" }
  | { name: "results" }
  | { name: "saved"; itemId: string }
  | { name: "compare"; itemId: string }
  | { name: "bag" }
  | { name: "empty"; reason: string };   // KIDS, Beauty, From 30 min

interface Nav { tab: Tab; stack: Screen[] }   // stack[stack.length - 1] renders
```

`goBack()` pops; popping the last entry returns to the tab root. The three
existing screens are re-parented, not rewritten — `SearchResultsScreen`,
`SavedProductScreen` and `CompareScreen` keep their props and their tests.

**Browser history.** `useSyncedHistory(nav, setNav)` — web-only, ~30 lines —
pushes on navigation and listens for `popstate`. On a phone browser, back is a
swipe people make without thinking; a prototype that exits to the previous site
when they do has lost the session. Every screen gets a URL (`/`, `/search`,
`/results?q=…`, `/bag`), which also makes a state linkable in a test plan.

No navigation library. React Navigation would cost three dependencies and a
rewrite of `navigation.test.tsx`, which currently drives this state machine
directly; that test passing unchanged is the evidence that the match, revalidation
and experiment machinery survived the reshuffle.

### 4.3 The shell

```
src/shell/
  AppShell.tsx        top bar + screen + bottom nav + harness pill
  TopBar.tsx          contextual: home bar, search-entry bar, or plain back bar
  DeliverToBar.tsx    "Deliver to <name> — <address>" + ₹0 wallet pill
  MyntraMark.tsx      the drawn M
  CategoryTabs.tsx    ALL / MEN / WOMEN / KIDS + grid glyph
  BottomNav.tsx       Home · Under ₹999 · From 30 min · Luxury · Bag + badge
  useSyncedHistory.ts
src/screens/
  HomeScreen.tsx      category rail, banner carousel, partner strip, grid
  SearchEntryScreen.tsx
  BagScreen.tsx
  EmptyScreen.tsx
src/components/home/
  CategoryRail.tsx    circular category buttons
  BannerCarousel.tsx  paged catalog images + dots
  PartnerStrip.tsx
  BrandCarousel.tsx   "Continue browsing these brands"
  RecentSearches.tsx  chips + Clear All
  AskMayaStrip.tsx
```

`AskMayaStrip` uses `color.accentAssistant`, which the tokens file records and
deliberately withholds from the module. That comment stays true and gains its
counterpart: the assistant purple now appears on the strip it was transcribed
from, and nowhere near the saved item — which is exactly the distinction the
token comment exists to protect.

### 4.4 What is live, what is empty, what is decorative

**Live.** Search field → search entry → submit → results with the module.
Recent searches (session-scoped, seeded with the plan's demo queries). Brand
cards → results for that brand and article type. ALL/MEN/WOMEN filtering the
home grid. Apparel/Footwear/Accessories circles. Bag tab reading reconciled
state with a real badge. Under ₹999 and Luxury as genuine price filters
(`price < 999`; Luxury is the top price decile, computed from the catalog at
render). Back.

**Empty, and saying why.** From 30 min is the only stub left in the nav; KIDS,
Beauty and Home are now populated (§3).

**Decorative, and labelled.** The banner carousel rotates catalog images under
the sale overlay — the overlay text is fixed copy, and it advertises no
discount on any saved item, because C-1 bans a monetary incentive attached to
the wishlist and a banner that happened to discount the saved item would be
one. The partner strip is static. Mic, camera, Image Search and Camera Search
tap to a named Phase 5 state rather than doing nothing; C-8 already defines a
higher τ per modality, so these are a wired follow-on and the state says so.

### 4.5 The harness

The pill sits bottom-right, above the bottom nav, showing the active state
number and — as the collapsed bar does now — a summary of anything currently
suppressing the module. Tapping opens `StateSwitcher` in a sheet over the app;
tapping the scrim dismisses it.

The pill has to carry the suppression summary for the reason the absent-module
note already exists: a harness that hides its state lets a deliberate suppression
read as a broken build. Moving the controls off the screen is only safe if what
they are currently doing stays on it.

## 5. Mobile web on Vercel

- `npx expo export -p web` → `dist/`.
- `vercel.json`: SPA rewrite to `/index.html`, so a deep link into `/results`
  survives a cold load.
- `viewport-fit=cover` and `env(safe-area-inset-*)` padding on the bottom nav
  and the harness pill, so neither sits under the home indicator.
- `theme-color`, `apple-mobile-web-app-capable` and a web manifest, so Add to
  Home Screen opens it without browser chrome.
- The phone frame (`FRAME_MAX_WIDTH = 480`) stays for desktop viewing and is
  full-bleed below it.

**Risk, named rather than assumed:** react-native-web's handling of
`env(safe-area-inset-*)` is not something this repo has exercised. If the string
value does not pass through a `StyleSheet`, the fallback is a constant inset
applied under `Platform.OS === "web"`. This gets verified in a browser at
430×932 before it is called done, not asserted from the type signature.

## 6. Testing

TDD, as the repo does it. New suites:

- `shell.test.tsx` — tab switching, stack push/pop, back at a tab root, and
  that the bottom nav's five destinations resolve to a screen (including the
  empty ones, with their reason).
- `searchEntry.test.tsx` — typing and submitting produces a new `SearchIntent`
  with `source: "user"`, a fresh `seq`, and a `search_performed` event; recent
  searches accumulate and Clear All empties them.
- `homeFilters.test.ts` — MEN/WOMEN and the three populated categories filter
  the grid; KIDS, Beauty and Home return empty **and** the screen reports the
  reason rather than rendering nothing.
- `intent.test.ts` (extend) — a scenario selection and a typed search cannot
  both own the request; the scenario's authentication survives a typed query;
  scenario filters do not.
- `bagScreen.test.tsx` — the badge equals the reconciled bag count and follows
  an add.

**The regression guard:** all 247 existing tests pass unchanged. If
`navigation.test.tsx`, `module.test.tsx` or the gate suites need editing to go
green, the shell has reached into the match layer and the change is wrong.

## 7. Non-goals

- No native build, no Expo Go, no EAS. The target is a URL.
- No navigation library.
- No scraped assets. New catalog data is limited to what §3 describes:
  widened curation of rows already in the cached dataset, plus the synthetic
  home range and its generated tiles.
- Voice and image search are not implemented, only named.
- The preferred-action personalisation stays off (E16 §, unchanged): the shell
  gives it more surfaces to act on, and every one of them stays inert while an
  experiment is running.

## 8. Open question for review

The bottom nav's middle three are the least defensible part of this design.
Under ₹999 and Luxury become real price filters because the catalog has prices,
which makes them honest but also makes them **two more entry points into a
results screen the module can appear in** — and the module's frequency cap and
suppression are per session. If a participant browses Luxury, then Under ₹999,
then searches, the module may be capped before the search that matters.

Options: leave them live and let the cap be part of what gets observed; or make
them empty states like KIDS. The design currently takes the first, and the
first is the one that could quietly cost a research session.
