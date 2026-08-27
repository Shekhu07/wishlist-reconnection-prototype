import catalogJson from "@/data/catalog.json";
import wishlistJson from "@/data/wishlist.json";
import type { Catalog, Wishlist } from "@/data/types";
import { DEFAULT_CONFIG } from "@/match/contract";
import { buildIndex, match } from "@/match/matcher";
import { buildSearchIndex, search } from "@/search/localSearch";
import { pick, seeded } from "@/analytics/evalSets";
import { recordGate } from "./report";

const catalog = catalogJson as unknown as Catalog;
const wishlist = wishlistJson as unknown as Wishlist;

const ITERATIONS = 5000;

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

/**
 * E3 gate: p95 <= 120 ms, and no measurable impact on search render time.
 *
 * The plan's budget is for a Python service under load and includes network,
 * queueing and serialisation. None of that exists here, so the honest claim is
 * narrower: the matching work itself is nowhere near the budget, which means
 * the budget will be spent on transport rather than on computation. Treat this
 * as a floor for the real thing, never as a substitute for load-testing it.
 */
describe("E3 gate — match latency", () => {
  it("computes a match far inside the 120 ms budget", () => {
    const random = seeded(31337);
    const index = buildIndex(catalog, wishlist);
    const queries = catalog.parents.map((parent) =>
      `${parent.brand} ${parent.articleType}`.toLowerCase()
    );

    // Warm the JIT, or the first hundred samples measure compilation.
    for (let i = 0; i < 500; i += 1) {
      match(
        { query: queries[i % queries.length], modality: "text", filters: {}, delivery_pincode: "560034", session_id: "warm" },
        index,
        DEFAULT_CONFIG
      );
    }

    // performance.now() quantises to whole milliseconds here, and a match
    // takes microseconds, so it reports a flat 0.000 and tells you nothing.
    // hrtime gives nanoseconds.
    const samples: number[] = [];
    for (let i = 0; i < ITERATIONS; i += 1) {
      const query = pick(queries, random);
      const started = process.hrtime.bigint();
      match(
        { query, modality: "text", filters: {}, delivery_pincode: "560034", session_id: `perf_${i}` },
        index,
        DEFAULT_CONFIG
      );
      samples.push(Number(process.hrtime.bigint() - started) / 1e6);
    }

    samples.sort((a, b) => a - b);
    const p50 = percentile(samples, 0.5);
    const p95 = percentile(samples, 0.95);
    const p99 = percentile(samples, 0.99);

    recordGate({
      id: "E3-latency",
      epic: "E3 — match latency",
      requirement: "p95 ≤ 120 ms",
      // Two decimals, not three. The figure varies by a factor of two between
      // runs on an idle machine; reporting it to a microsecond claims a
      // precision the measurement does not have, and churns the diff on every
      // regeneration for no information.
      measured: `p50 ${p50.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms, p99 ${p99.toFixed(2)} ms over ${ITERATIONS.toLocaleString("en-IN")} calls (budget 120 ms)`,
      pass: p95 <= 120,
      caveat:
        "In-process JavaScript on one machine with the catalog already in memory. It is not the 500 rps load test the plan asks for, and excludes network, serialisation, queueing and database access. It shows the matching work is not the bottleneck; it does not show the service meets its SLO.",
    });

    expect(p95).toBeLessThanOrEqual(120);
  });

  it("renders search results without waiting for matching at all", () => {
    // Constraint C-3 is structural rather than statistical here: search takes
    // no wishlist argument and returns synchronously, so there is no ordering
    // in which it could block on the match call.
    const searchIndex = buildSearchIndex(catalog);
    const started = process.hrtime.bigint();
    const results = search("check shirt", searchIndex);
    const elapsed = Number(process.hrtime.bigint() - started) / 1e6;

    expect(results.length).toBeGreaterThan(0);
    expect(search.length).toBeLessThanOrEqual(3);
    expect(elapsed).toBeLessThan(120);
  });
});
