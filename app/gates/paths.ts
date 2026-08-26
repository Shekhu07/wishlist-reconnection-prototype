import { join } from "path";

export const REPO_ROOT = join(__dirname, "..", "..");
export const RESULTS_FILE = join(REPO_ROOT, "docs", ".gate-results.jsonl");
export const REPORT_FILE = join(REPO_ROOT, "docs", "gate-report.md");
