import { appendFileSync } from "fs";
import { RESULTS_FILE } from "./paths";

/**
 * Gates record what they measured, not just whether they passed.
 *
 * A green test tells you nothing about margin. "Precision 99.4% against a
 * threshold of 99%" is a different conversation from "precision 100%", and
 * both pass. The report is the deliverable; the assertion is the alarm.
 */
export interface GateResult {
  id: string;
  epic: string;
  requirement: string;
  measured: string;
  pass: boolean;
  /** Anything that limits what the number is evidence for. Never optional. */
  caveat: string;
}

export function recordGate(result: GateResult): void {
  appendFileSync(RESULTS_FILE, `${JSON.stringify(result)}\n`);
}
