import { join } from "path";

export const REPO_ROOT = join(__dirname, "..", "..");
export const RESULTS_FILE = join(REPO_ROOT, "docs", ".gate-results.jsonl");
export const REPORT_FILE = join(REPO_ROOT, "docs", "gate-report.md");

/**
 * The parents a measurement is allowed to see.
 *
 * Domain concern, not a test-path concern -- it lives under `src/` at
 * `@/analytics/catalog` so app code can depend on it without reaching into
 * test/report infra. Re-exported here so gate files keep a single import
 * root for everything in this module.
 */
export { realParents } from "@/analytics/catalog";
