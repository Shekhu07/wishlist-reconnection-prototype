import catalogJson from "@/data/catalog.json";
import type { Catalog } from "@/data/types";
import { buildGazetteers, parseIntent } from "@/match/intent";
import { buildQueryEvalSet } from "@/analytics/evalSets";
import { recordGate } from "./report";
import { realParents } from "./paths";

const catalog = catalogJson as unknown as Catalog;

/**
 * E2 gate: >= 90% field-level accuracy on 1,000 sampled queries.
 *
 * Field-level, not query-level: a parser that gets three of four fields right
 * on every query is far more useful than one that gets all four right on 75%
 * and garbage on the rest, and the gate should be able to tell them apart.
 *
 * Absence counts. If a query names no colour, the correct answer is "no
 * colour", and a parser that invents one has failed that field.
 */
describe("E2 gate — query field accuracy", () => {
  it("recovers at least 90% of fields across 1,000 queries", () => {
    const gaz = buildGazetteers(realParents(catalog));
    const cases = buildQueryEvalSet(catalog, 1000);
    const fields = ["brand", "articleType", "colour", "gender"] as const;

    const tally = Object.fromEntries(
      fields.map((field) => [field, { correct: 0, total: 0 }])
    ) as Record<(typeof fields)[number], { correct: number; total: number }>;
    const misses: string[] = [];

    for (const testCase of cases) {
      const intent = parseIntent(testCase.query, "text", gaz);
      for (const field of fields) {
        const expected = testCase.expected[field];
        const actual = intent[field]?.value;
        tally[field].total += 1;
        if ((expected ?? null) === (actual ?? null)) tally[field].correct += 1;
        else if (misses.length < 6) {
          misses.push(`"${testCase.query}" ${field}: expected ${expected ?? "none"}, got ${actual ?? "none"}`);
        }
      }
    }

    const correct = fields.reduce((sum, field) => sum + tally[field].correct, 0);
    const total = fields.reduce((sum, field) => sum + tally[field].total, 0);
    const accuracy = correct / total;
    const breakdown = fields
      .map((field) => `${field} ${((tally[field].correct / tally[field].total) * 100).toFixed(1)}%`)
      .join(", ");

    recordGate({
      id: "E2-parser",
      epic: "E2 — query field accuracy",
      requirement: "≥ 90% field-level on 1,000 queries",
      measured: `${(accuracy * 100).toFixed(1)}% overall (${breakdown})`,
      pass: accuracy >= 0.9,
      caveat:
        "Queries are assembled from catalog values, so they are well-formed by construction. Real queries carry typos, plurals, slang and brand misspellings that this set contains none of; treat the number as an upper bound.",
    });

    if (misses.length > 0) console.log("sample misses:", misses);
    expect(accuracy).toBeGreaterThanOrEqual(0.9);
  });

  it("degrades an unparsed field to unconstrained rather than to a guess", () => {
    const gaz = buildGazetteers(realParents(catalog));
    const intent = parseIntent("something nobody sells", "text", gaz);
    for (const field of ["brand", "articleType", "colour", "gender"] as const) {
      expect(intent[field]).toBeUndefined();
    }
  });
});
