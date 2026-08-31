# Wishlist Search-Reconnection — MVP Prototype Plan

**Source:** `Myntra_Wishlist_Search_Reconnection_MVP_Roadmap.md` + two Myntra app screenshots (home, search-entry)
**Build context:** standalone buildable prototype (greenfield, mock catalog), full product pod of 8–12
**Planning date:** 25 Aug 2026 · **Assumed kickoff:** Mon 7 Sep 2026

---

## 0. Executive summary

The source doc is already a strong product spec. What it lacks is an *engineering* plan: what gets built, in what order, on what, by whom, and by when. This document supplies that.

Three decisions drive everything below:

1. **The MVP is a deterministic matching problem, not an ML problem.** Tier 1/Tier 2 matching is a canonical-ID join plus a rules-based query parser. No embeddings, no model, no vector DB in v1. This removes the single largest source of schedule risk and directly serves the doc's precision-over-recall constraint (§4.7).
2. **Canonical product identity is the critical path.** Everything — the module, the variant preservation, the revalidation, the duplicate prevention — sits on a reliable parent-product ↔ SKU ↔ wishlist-record mapping. It is the first thing built and the thing most likely to slip.
3. **Search must never wait for the match service.** The match call is fire-and-forget alongside search, with a hard timeout and fail-open behaviour. This is a hard architectural constraint (§4.20), not a performance nice-to-have.

**Honest scope caveat:** the primary metric is a *30-day user-level* rate. A greenfield prototype has no organic user base, so Phase 3 (shadow) and Phase 4 (A/B) require a recruited panel — see §7.4. Without one, Phases 3–4 become instrumented rehearsals and the 30-day number cannot be produced. Resolve this in Phase 0, not Phase 4.

---

## 1. Requirements extracted from the source

### 1.1 Functional requirements

| ID | Requirement | Source |
|---|---|---|
| FR-1 | Wishlist matching triggers only on expressed search intent, never on app launch | §2 Stage A |
| FR-2 | Matches render in a separate labelled module; wishlist status never boosts organic search ranking | §1, §3 |
| FR-3 | Module shows max 3 items; overflow behind "View all matching Wishlist items" | §3, §4.6 |
| FR-4 | Saved variant (colour + size) is displayed explicitly and preserved through to Bag | §2 Stage D, §4.5 |
| FR-5 | Two co-equal actions: Buy from Wishlist / Compare options | §2 Stage C |
| FR-6 | Inventory, price, seller, delivery are revalidated at the action boundary | §4.14 |
| FR-7 | Unavailable variants are never silently substituted | §4.1, §4.5 |
| FR-8 | Dismissal suppresses the module for the query and session, and logs a relevance signal | §2 Stage F, §4.17 |
| FR-9 | Explicit search filters are hard predicates — non-conforming saved items are hidden by default | §4.18 |
| FR-10 | Logged-out sessions reveal nothing about wishlist existence | §4.15 |
| FR-11 | Duplicate states (in Bag, Save for Later, purchased before) are detected and re-labelled | §4.9–4.11 |
| FR-12 | Full instrumentation for a 30-day cohort, incl. shadow-mode logging | §6 Phase 3, §7 |

### 1.2 Hard constraints (non-negotiable, treat as acceptance gates)

| ID | Constraint | Consequence for the build |
|---|---|---|
| C-1 | **No monetary incentive of any kind** — no discount badge, no coupon, no cashback, no sale urgency | Price is rendered as neutral state text. Ban discount tokens from the module's component library at lint level. |
| C-2 | **No push notifications in v1** | No notification service in scope. Reconnection lives inside active search only. |
| C-3 | **Search results render independently of matching** | Async, non-blocking, timeout-bounded, fail-open. |
| C-4 | **Precision > recall** — a false positive is worse than a miss | Conservative threshold; when confidence is low, render nothing. |
| C-5 | **No semantic or visual similarity in v1** | Tier 3/4 explicitly out of scope until exact-match performance is proven. |
| C-6 | **Wishlist data never crosses the account boundary** | Auth-gated endpoint, no timing or payload-shape leak for logged-out users. |
| C-7 | **Accessibility is a launch gate, not a follow-up** | Screen-reader labels, focus order, contrast, dismiss target ≥44×44 — blocking in CI. |
| C-8 | **Voice and image queries use a higher confidence threshold** | Separate threshold parameter keyed on input modality. |

### 1.3 Derived technical constraints

- **Latency budget:** match service p95 ≤ 120 ms, hard timeout 250 ms, circuit-breaker opens at 5% timeout rate.
- **Two-phase freshness:** availability read at module render is *advisory*; the binding read happens at the Move-to-Bag boundary. The UI must be able to fail gracefully between the two.
- **Suppression state is per (user × query-family × session × day)** — a TTL-native problem, which drives the Redis choice in §3.
- **Confidence thresholds are runtime-tunable** without a client release, because Phase 3 exists specifically to tune them.

---

## 2. Prioritised feature roadmap

Priority scheme: **P0** ships in the first release (the doc's §8 boundary). **P1** is required for the A/B result to be *interpretable* — guardrails and instrumentation. **P2** is Phase 5/6 expansion. **P3** is explicitly excluded from v1.

### 2.1 Epics

| # | Epic | Priority | Phase | Primary owner | Why it matters |
|---|---|---|---|---|---|
| E1 | Canonical product & variant graph | **P0** | 1 | Backend | Critical path. Nothing else is trustworthy without it. |
| E2 | Query intent extraction (rules-based) | **P0** | 1 | Backend | Turns a query string into the filter predicate set the matcher needs. |
| E3 | Match service — Tier 1 + Tier 2 | **P0** | 1→3 | Backend | The product. Scoring, thresholds, caps, fail-open. |
| E4 | "From your Wishlist" module UI (10 states) | **P0** | 2 | Mobile + Design | Where the whole idea is either understood or not. |
| E5 | Buy-from-Wishlist path + revalidation | **P0** | 2 | Mobile + Backend | Variant continuity is Treatment B's entire hypothesis. |
| E6 | Compare options view | **P0** | 2 | Mobile + Design | The agency half of "memory plus agency". |
| E7 | Dismissal, suppression & frequency caps | **P0** | 2 | Backend + Mobile | Prevents the module from training users to ignore it. |
| E8 | Auth & privacy boundary | **P0** | 1 | Backend | C-6. Logged-out leak is a launch blocker. |
| E9 | Event pipeline, shadow mode & 30-day cohort models | **P1** | 3 | Data Eng + DS | Phase 3 is impossible without it; Phase 4 is unreadable without it. |
| E10 | Experimentation harness, flags & kill switch | **P1** | 4 | Backend + DS | Assignment, ramp, guardrail monitoring, instant rollback. |
| E11 | Accessibility & performance hardening | **P1** | 2→4 | Mobile + QA | C-3, C-7. Gate, not polish. |
| E12 | Prototype state harness | **P1** | 2 | Mobile | Deterministically drives all 10 states for research and QA. |
| E13 | Multi-match ranking & colour/variant matching | P2 | 5 | Backend | Only after exact-match precision is understood. |
| E14 | Purchased-before / Save-for-Later reconciliation | P2 | 5 | Backend | Depends on order + bag state integration. |
| E15 | Semantic & visual similarity (Tier 3/4) | P2 | 5 | ML | Separate treatment. Materially higher false-positive risk. |
| E16 | User controls & durable personalisation | P2 | 6 | Full pod | Settings, per-item hide, preferred-action learning. |
| E17 | Push notifications, discount messaging, social sharing | **P3** | — | — | Excluded by C-1/C-2. Do not build. |

### 2.2 P0 backlog with acceptance criteria

**E1 — Canonical product & variant graph**
- `parent_product` ↔ `sku` ↔ `wishlist_item` resolve bidirectionally in one query, ≤20 ms p95.
- A wishlist record persists: parent ID, SKU, colour, size, seller, saved timestamp, price-at-save.
- Merged/retired listings resolve to a successor with an explicit `identity_confidence` field; low confidence never renders as "the same product" (§4.3).
- ✅ **Gate:** exact-match precision ≥ 99% on a 500-pair hand-labelled set; zero silent variant substitutions in a 10k-run fuzz test.

**E2 — Query intent extraction**
- Parses category, brand, colour, gender, occasion, price band, size from typed queries using a taxonomy + gazetteer, no model.
- Emits a structured `SearchIntent` with per-field confidence.
- Voice/image queries carry a `modality` flag that raises the threshold (C-8).
- ✅ **Gate:** ≥90% field-level accuracy on 1,000 sampled queries; unparsed fields degrade to "unconstrained", never to a guess.

**E3 — Match service**
- Score = `w1·identity + w2·category_align + w3·brand_align + w4·variant_align + w5·recency + w6·prior_engagement`, all weights and the threshold τ runtime-configurable.
- Tier 1 (same canonical product/SKU) and Tier 2 (same product, different colour) only.
- Hard filter predicates applied before scoring (FR-9). Below τ → empty response, not a low-confidence card.
- Fail-open: timeout, error, or circuit-open all return empty in ≤250 ms.
- ✅ **Gate:** p95 ≤ 120 ms at 500 rps; zero measurable impact on search render time; shadow-mode false-positive rate below the Phase 3 threshold.

**E4 — Module UI** — see §4 for the full visual spec. All ten states from §5 of the source doc, driven by E12.
- ✅ **Gate:** ≥80% of usability participants correctly explain why the module appeared, unprompted.

**E5 — Buy from Wishlist**
- Opens saved product with saved colour + size preselected; revalidates inventory, price, seller, returns, delivery against the *current* address (§4.13).
- On failure, preserves search context and renders a named recovery state — never a generic error (§4.14).
- Distinguishes *variant* unavailable (§4.1) from *product* unavailable in every variant (§4.2): the latter renders identity plus similar styles with Remove/Hide, and never a dead-end Buy button.
- ✅ **Gate:** 100% of variant-unavailable cases render recovery, not substitution; search context restored on every back-navigation.

**E6 — Compare options**
- Saved item plus ≤4 query-relevant alternatives; comparison axes are price, rating, review count, material, fit, size availability, delivery, returns.
- No discount badge may be a comparison axis (C-1).
- ✅ **Gate:** copy and component audit confirms zero monetary-incentive surfaces.

**E7 — Suppression**
- Dismissal hides the module for the query family for the remainder of the session; logged as a relevance signal, never as permanent opt-out.
- Frequency caps per item, query family, session and day.
- ✅ **Gate:** no user sees the same item's module more than N times/day (N configurable, default 2).

**E8 — Privacy boundary**
- Logged-out requests return an identical empty shape with matched timing — no existence oracle.
- Per-user "Don't show saved items in search" control respected server-side (§4.16).
- ✅ **Gate:** security review passes; no wishlist field appears in any unauthenticated response or log line.

### 2.3 What is explicitly *not* in v1

Semantic similarity · visual similarity · push notifications · discount, coupon or cashback messaging · sale urgency copy · social sharing · cross-device personalisation · back-in-stock alerts (unless the mock inventory service supports them trivially) · home-screen or PDP reconnection surfaces.

---

## 3. Recommended technology stack

Chosen for a greenfield build a pod of 8–12 can actually ship in two quarters, with the match service independently deployable because it alone carries a latency SLO and needs its own kill switch.

### 3.1 Architecture

```
┌──────────────────────────────────────────────────────────┐
│  React Native (Expo) client — iOS · Android · web preview │
└───────────────┬──────────────────────────────────────────┘
                │  one request, two parallel fan-outs
        ┌───────▼────────┐
        │  BFF / Edge    │  FastAPI · aggregates, never blocks on match
        └──┬──────────┬──┘
           │          │
   ┌───────▼──┐   ┌───▼───────────────┐   250 ms hard timeout
   │  Search  │   │  Match Service    │   fail-open → empty
   │ OpenSearch│  │  FastAPI (own svc)│
   └──────────┘   └───┬───────┬───────┘
                      │       │
        ┌─────────────▼─┐ ┌───▼─────────────────────────┐
        │ Core Monolith │ │ Redis — suppression, caps,  │
        │ FastAPI:      │ │ per-user match index cache  │
        │ catalog ·     │ └─────────────────────────────┘
        │ wishlist ·    │
        │ inventory ·   │──► Postgres 16 (system of record)
        │ bag · orders  │
        └───────┬───────┘
                │  events
        ┌───────▼──────────────────────────────────────┐
        │ Redpanda → ClickHouse → dbt → Metabase       │
        │ GrowthBook: flags · assignment · guardrails  │
        └──────────────────────────────────────────────┘
```

### 3.2 Stack decisions

| Layer | Recommendation | Rationale | Considered instead |
|---|---|---|---|
| Client | **React Native + Expo, TypeScript** | One codebase for iOS/Android plus a web build that doubles as the research prototype. Expo Dev Client makes the 10-state harness trivial to distribute to researchers. | Flutter (fine, but the web-preview path is weaker for usability sessions); native ×2 (too expensive for one pod) |
| Component layer | **Custom tokens + Restyle**, Storybook for the state matrix | The Myntra design language (§4) is specific enough that a generic UI kit fights you | React Native Paper / NativeBase |
| Backend | **Python 3.12 + FastAPI, Pydantic v2**, async throughout | Matches the team's existing competence; async is a genuine fit for the parallel fan-out; Pydantic gives typed contracts free | Node/NestJS, Go (Go wins on p95 but costs velocity the pod doesn't have) |
| Service topology | **Modular monolith + separately deployed match-service** | Only match-service needs independent scaling, its own SLO, and a kill switch. Splitting further is premature. | Full microservices (ops tax), single monolith (no isolation for the risky part) |
| System of record | **PostgreSQL 16** (JSONB for product attributes) | Relational identity graph is exactly the E1 problem. JSONB absorbs fashion attribute sprawl. | MongoDB (weak for the join-heavy identity graph) |
| Search | **OpenSearch 2.x** — BM25 + filters + aliases | You need a credible search experience to embed the module in; filter predicates must be shared between search and matcher | Postgres FTS (won't feel like real search); Algolia/Typesense (fine, less control over filter semantics) |
| Cache & state | **Redis 7** | Suppression, frequency caps and dismissal are TTL-native. Also caches the per-user wishlist match index. | In-process cache (breaks with >1 replica) |
| Vector store | **Qdrant — deferred to Phase 5** | Provisioned but unused in v1. Introducing it early invites Tier 3/4 scope creep the doc explicitly forbids (C-5). | — |
| Events | **Redpanda** (Kafka API, single binary) | Kafka semantics without the Kafka operational cost; shadow mode generates high-volume events | Kinesis (vendor lock), direct-to-DB (loses replay) |
| Analytics warehouse | **ClickHouse** + **dbt** | Cohort and funnel queries over event volumes; dbt models the 30-day cohort as versioned SQL | Snowflake/BigQuery (overkill and costly for a prototype) |
| BI | **Metabase** | Fast dashboards for the §7 metric set | Superset |
| Experimentation | **GrowthBook** (self-hosted) | Feature flags, deterministic assignment, sequential testing, guardrail alerts, and the kill switch — all in one, open source | Build-your-own (weeks of work, no upside), LaunchDarkly (cost) |
| Observability | **OpenTelemetry → Prometheus / Tempo / Loki, Grafana** | The latency SLO is a product constraint; it needs first-class dashboards and alerts | Datadog (cost) |
| Infra | **Docker Compose** local · **AWS ECS Fargate** staging · **Terraform** · **GitHub Actions** | Fargate gives one pod containers without owning Kubernetes | EKS (ops burden), Lambda (cold starts vs a 120 ms SLO) |
| Catalog seed | **Kaggle Fashion Product Images dataset** (~44k items with brand, articleType, baseColour, gender, season) | Real attribute distributions and images; enough variant sprawl to exercise E1 honestly | Fully synthetic (too clean — hides the identity problems that are the whole point) |
| Inventory simulator | Custom service with configurable stock churn | Edge cases §4.1, §4.2, §4.14 need stock to actually go out from under the user | Static stock (can't test the recovery paths) |
| A11y tooling | `@react-native-aria`, Accessibility Scanner + axe in CI, manual VoiceOver/TalkBack pass | C-7 is a gate | Manual only |

### 3.3 Match service contract (sketch)

```
POST /v1/wishlist/match
Authorization: Bearer <user token>          # 401 → empty, timing-matched

{
  "query": "black midi dress",
  "modality": "text",                        # text | voice | image | recent | category
  "filters": {"size": ["M"], "color": ["black"], "price_max": 3000},
  "delivery_pincode": "492001",
  "session_id": "…"
}

200 OK
{
  "matches": [{
    "parent_product_id": "…", "sku": "…", "tier": 1, "confidence": 0.97,
    "saved": {"color": "Black", "size": "M", "saved_at": "2026-07-14T…"},
    "current": {"available": true, "price": 2199, "seller": "…",
                "delivery_by": "2026-08-28", "state": "purchasable"},
    "copy_key": "exact_variant_available"
  }],
  "capped_total": 1,
  "suppressed": false
}
```

Every response is logged to the shadow topic with full scoring detail, whether or not it renders.

---

## 4. UI specification (derived from the provided screenshots)

The two screenshots are the visual source of truth. The single most useful finding: **Myntra's search-entry screen already contains the exact component the module needs** — the "Continue browsing these brands" horizontal card carousel. Reusing that geometry means the module reads as native on day one and requires no new component language.

### 4.1 Design tokens observed

| Token | Value | Observed in |
|---|---|---|
| `brand/pink` | `#FF3F6C` | active ALL tab indicator, bottom-nav Home highlight, active category label |
| `text/primary` | `#282C3F` | "Recent searches", "Continue browsing these brands" |
| `text/secondary` | `#7E818C` | product category captions ("FLIP FLOPS", "SHIRTS") |
| `border/subtle` | `#EAEAEC` | card borders, search-field border |
| `surface` | `#FFFFFF` | search-entry screen |
| `surface/warm` | cream → white vertical gradient | home screen header |
| `accent/assistant` | `#7C5CFF` on `#F0EDFF` | the "Ask Maya" strip |
| `radius/card` | 12 px | brand cards |
| `radius/pill` | 999 px | search bar, recent-search chips |
| Type scale | 20/700 section header · 14/700 brand caps · 12/400 caption | throughout |

### 4.2 Module placement

On the search **results** screen: directly beneath the sticky search field and the filter/sort row, **above the first row of the product grid**, horizontally inset 16 px. It scrolls away with the results — never sticky.

**Container:** white surface, 1 px `#EAEAEC` border, 12 px radius, 12 px inset padding. **Deliberately not tinted.** The home screen is already dense with promotional colour ("END OF SEASON SALE 40–70% Off", the teal partner strip, the AD banner); a tinted container would read as another ad and inherit exactly the promotional tone C-1 forbids. A neutral bordered container reads as *state*, which is what the doc asks for.

Avoid the lavender `Ask Maya` treatment specifically — reusing it would imply the module is AI-generated recommendation rather than the user's own saved item.

### 4.3 Module anatomy

```
┌────────────────────────────────────────────────┐
│ ♥ From your Wishlist                        ✕  │  16/700 · heart in #FF3F6C
│ You saved this earlier                         │  12/400 · #7E818C
├────────────────────────────────────────────────┤
│ ┌──────┐  H&M                                  │  14/700 caps
│ │ img  │  Ribbed Midi Dress                    │  12/400 · #7E818C · 2-line clamp
│ │96×128│  Saved: Black · M                     │  11/500 chip · #F5F5F6 bg
│ └──────┘  ₹2,199 · Delivery by Fri, 28 Aug     │  12/400 · neutral, no strike-through
├────────────────────────────────────────────────┤
│ [  Buy from Wishlist  ] [ Compare options ]    │  two equal 44px buttons
└────────────────────────────────────────────────┘
```

- **Single match:** horizontal card (96×128 image left, details right), both buttons full-width beneath.
- **2–3 matches:** horizontal carousel reusing the 156 px brand-card geometry; each card is tappable into the saved-product state, and the co-equal pair moves to a module-level row (`Buy from Wishlist` acts on the first card only when a single card is focused — otherwise the header carries `Compare these`). This is a deliberate adaptation of §Stage C: at multi-match, co-equality is preserved at the *module* level rather than per card, because three pairs of buttons is the clutter §4.6 warns against.
- **Dismiss:** `✕` with a 44×44 hit target; on tap the module collapses to a one-line `Hidden for now — Undo` strip that itself disappears after 5 s.

### 4.4 Button treatment and the co-equality risk

The doc requires that neither action be visually subordinate. Filled-vs-outlined does introduce mild hierarchy. Mitigation: identical dimensions, identical type weight and size, identical corner radius, and stable order. **Then verify it** — Phase 5 should run a treatment with the fills swapped to confirm the choice isn't driving the Buy/Compare split. Until that runs, treat the split as directional, not causal.

### 4.5 Loading behaviour

No skeleton placeholder. A skeleton that resolves to nothing both teases the user and shifts the grid. Rule: the module renders **only** if the match resolves before the grid's first paint, or within 400 ms of it *and* the user has not yet scrolled. Otherwise it is suppressed for that query and logged as a latency miss.

### 4.6 The ten prototype states

Built as a Storybook matrix and exposed in-app behind the E12 debug switcher, so researchers can drive any state deterministically without seeding data.

| # | State | Copy key |
|---|---|---|
| 1 | No match | *(module absent — validates search is unchanged)* |
| 2 | One exact match | "You saved this earlier" |
| 3 | Multiple exact matches | "From your Wishlist — 3 items match your search" |
| 4 | Variant available | "Your saved Size M is available" |
| 5 | Variant unavailable | "You saved this, but your selected size is unavailable" |
| 6 | Similar not exact *(Phase 5)* | "Similar to something in your Wishlist" |
| 7 | Already in Bag | "Already in Bag" + View Bag |
| 8 | Purchased before | "Purchased before" + Reorder / View order / Remove |
| 9 | Dismissed | "Hidden for now" + Undo |
| 10 | Logged out | *(module absent, no existence signal)* |

Banned copy, enforced by a lint rule on the copy bundle: "You forgot", "You were planning to buy", "Buy now before it's gone", "Only N left", "Price dropped", and any percentage-off string.

---

## 5. Development timeline

**Pod of 11 · 2-week sprints · kickoff Mon 7 Sep 2026 · experiment launch Mar 2027**

### 5.1 Pod composition

| Role | Count | Focus |
|---|---|---|
| Product Manager | 1 | Scope, gates, experiment design |
| Product Designer | 1 | Module, compare view, all 10 states |
| UX Researcher | 0.5 | Phase 0 discovery, Phase 2 usability |
| Mobile (React Native) | 2 | E4, E5, E6, E11, E12 |
| Backend | 3 | 1× identity/catalog (E1, E8), 2× match + revalidation (E2, E3, E5, E7) |
| Data Engineer | 1 | E9 pipeline, shadow topic, dbt models |
| Data Scientist / Analyst | 1 | Thresholds, shadow analysis, E10 experiment design |
| QA / SDET | 1 | Edge-case matrix, accessibility gate, fuzz testing |
| Eng Manager / Tech Lead | 0.5 | Architecture, critical path |

### 5.2 Schedule

| Sprint | Dates | Phase | Deliverable | Gate |
|---|---|---|---|---|
| **S0** | 7–18 Sep | 0 | Repo, CI/CD, Compose stack, catalog seeded from Kaggle set, inventory simulator, **panel-recruitment decision (§7.4)** | Environment reproducible from `docker compose up` |
| **S1** | 21 Sep–2 Oct | 0 | Search-after-save behavioural analysis; 8–10 moderated discovery sessions; opportunity sizing | **Phase 0 exit:** evidence that search-after-save is meaningful, and clarity on whether users want recall, comparison, or something new |
| **S2** | 5–16 Oct | 1 | E1 identity graph + E8 auth boundary. E2 query parser started in parallel. | Identity resolution ≤20 ms p95 |
| **S3** | 19–30 Oct | 1 | E2 complete, E3 scoring skeleton, OpenSearch index with shared filter semantics | Parser ≥90% field accuracy |
| **S4** | 2–13 Nov | 1 | E3 Tier 1+2, thresholds externalised, fail-open + circuit breaker. Mobile starts E12 harness and E4 shell. | **Phase 1 exit:** exact-match precision ≥99%; zero silent variant substitution across 10k fuzz runs |
| **S5** | 16–27 Nov | 2 | E4 all 10 states, E7 suppression, E5 happy path | Design review + copy lint pass |
| **S6** | 30 Nov–11 Dec | 2 | E6 compare view, E5 recovery states, E11 first a11y pass | VoiceOver/TalkBack pass; no CLS on the results grid |
| **S7** | 14 Dec–8 Jan | 2 | Usability testing (n=12–15), iterate. *Reduced capacity — holiday period.* Data Eng builds E9 pipeline in parallel. | **Phase 2 exit:** ≥80% of participants find the saved item, explain why it appeared, choose Buy/Compare appropriately, and recover from an unavailable variant |
| **S8** | 11–22 Jan | 3 | Shadow mode live: matching runs, nothing renders. Full scoring telemetry to ClickHouse. | Zero measurable search latency delta |
| **S9** | 25 Jan–5 Feb | 3 | Shadow run continues; DS tunes τ per modality; false-positive audit | **Phase 3 exit:** stable opportunity volume, acceptable precision, no latency impact |
| **S10** | 8–19 Feb | 4 | Build Treatment A and Treatment B behind GrowthBook flags; guardrail dashboards; kill switch drill | Rollback verified under load |
| **S11** | 22 Feb–5 Mar | 4 | Final a11y + performance hardening; dbt 30-day cohort models validated on shadow data | **Launch gate:** all P0 acceptance criteria green |
| **S12+** | from 9 Mar | 4 | Staged ramp 1% → 5% → 20% → 50%, guardrails monitored at each step | No degradation in search-to-purchase rate or checkout quality |
| — | ~mid-Apr 2027 | 4 | **30-day cohort read-out** | Treatment B shows incremental lift without harming search |
| — | Q2 2027 | 5–6 | E13–E16; semantic/visual similarity as *separate* treatments | — |

### 5.3 Critical path

`E1 identity graph → E3 match service → E9 shadow instrumentation → E10 experiment`

Everything else parallelises around it. If E1 slips a sprint, the whole schedule slips a sprint — protect it, and staff it with the strongest backend engineer. E4/E6 (mobile) and E9 (data) can run ahead against contract mocks.

### 5.4 Sequencing rule that matters most

**Do not launch Phase 4 during a major sale event.** The screenshots show the app saturated with End-of-Season-Sale messaging. An experiment whose entire hypothesis is that reconnection works *without* monetary incentive is uninterpretable when every surrounding surface is shouting 40–70% off. The Feb–Mar window is deliberate: post-festive, pre-summer-EORS. If the calendar shifts, shift the launch, not the design.

---

## 6. Risk register

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Canonical identity is messier than expected (merged listings, seller changes) | Slips critical path | High | Timebox to S2–S4; ship Tier 1 only if Tier 2 identity confidence is weak |
| No real user base → 30-day metric unobtainable | Phase 4 produces nothing | **High** | Resolve in S0: recruit a 300–500 person panel, or reframe Phases 3–4 as rehearsals with explicit, stated limits |
| False positives train users to ignore the module | Kills the concept | Medium | Conservative τ, shadow-mode tuning, precision as the Phase 3 gate |
| Module adds latency to search | Guardrail breach | Medium | Hard timeout, fail-open, circuit breaker, latency in the launch gate |
| Filled/outlined buttons bias the Buy/Compare split | Misreads the mechanism | Medium | Swap-fill treatment in Phase 5 before drawing causal conclusions |
| Sale-calendar confound | Uninterpretable result | Medium | §5.4 |
| Scope creep into semantic similarity | Blows the schedule, raises FP risk | Medium | Qdrant provisioned but unused; C-5 is a written constraint, not a preference |
| Holiday capacity dip in S7 | Two-week slip | High | Already absorbed in the schedule — S7 is a four-week sprint |

---

## 7. Instrumentation — who emits what

The source doc defines the metric set. What it does not say is which component is responsible for emitting each one, which is what makes the set buildable. Every row below is a dbt model over the ClickHouse event stream; all of them must be validated against shadow data in S11, before the experiment starts.

| Metric | Role | Emitted by | Available from |
|---|---|---|---|
| 30-day Wishlist-to-Purchase Rate | **Primary** | Core (order events) + E9 cohort model | S11 (validated on shadow) |
| Match exposure rate | Opportunity | E3 match service | S8 (shadow) |
| Match precision | **Quality gate** | E3 scoring log + E4 interaction events | S9 |
| Buy-from-Wishlist rate | Mechanism | E4 / E5 | S12 |
| Compare-options rate | Mechanism | E4 / E6 | S12 |
| Saved-item purchase rate | Direct impact | E9 cohort model | S12 + 30d |
| Search-to-purchase rate | **Guardrail** | Core (existing funnel) | S8 |
| Dismissal rate | Relevance signal | E7 | S12 |
| Duplicate-add rate | Flow integrity | E5 / E14 | S12 |
| Variant recovery rate | Fashion-specific quality | E5 | S12 |
| Latency & error rate | **Guardrail** | E11 / OpenTelemetry | S4 |

**Three of these are guardrails with automatic kill-switch thresholds** wired into GrowthBook: search-to-purchase rate, latency p95, and error rate. If any breaches during the ramp, the flag flips to control without waiting for a human.

The mechanism metrics matter more than they look. The whole point of splitting Treatment A from Treatment B is to learn *where* the lift comes from — reconnection alone, comparison, or variant continuity. If A and B are indistinguishable, variant preservation is not the mechanism and Phase 5 should be re-planned around comparison instead.

---

## 8. Open decisions for Abhishek

1. **Panel recruitment (S0, blocking).** Without ~300–500 recruited testers, the 30-day primary metric cannot be produced. Decide in Sprint 0 whether to recruit, or to reframe Phases 3–4 explicitly as instrumented rehearsals.
2. **Tier 2 in v1 or not.** The doc says "yes, if product identity is clear." That is an E1 outcome, not a pre-commitment — decide at the S4 gate on real precision numbers.
3. **Multi-match co-equality.** §4.3 proposes moving the button pair to module level at 2–3 matches. This is an adaptation of the source doc; confirm before S5.
4. **Back-in-stock alerts.** §4.1/§4.2 mention them "where operationally supported." Cheap in a mock inventory service, but they edge toward the notification territory C-2 excludes. Recommend: build the capture, suppress the delivery, in v1.

---

## 9. One-paragraph summary

Build the identity graph first, because everything true about this product depends on it. Keep v1 deterministic — a rules-based query parser and a canonical-ID join, no model, no vectors — so that precision is something you can reason about rather than tune blindly. Render the module in Myntra's existing carousel geometry with a neutral bordered container, so it reads as memory rather than as another ad on a screen already full of them. Never let search wait for it. Then run shadow mode long enough to trust the threshold, and only then run the experiment — outside a sale window, with the 30-day cohort already modelled and validated. Expansion into semantic similarity is a Phase 5 conversation that should not be had until exact match has earned it.
