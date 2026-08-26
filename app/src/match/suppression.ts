import { normalise } from "./intent";

/**
 * E7: dismissal, suppression and frequency caps.
 *
 * State is per (user x query-family x session x day), which is why the real
 * system puts this in Redis with TTLs. In the prototype it is in memory, but
 * the key shape is the same so the port is mechanical.
 *
 * Dismissal is a relevance signal, never a permanent opt-out (FR-8).
 */

export interface SuppressionEvent {
  userId: string;
  queryFamily: string;
  sessionId: string;
  day: string;
  at: number;
}

/**
 * The family is the query's structured shape, not its literal text, so
 * "check shirt" and "shirt check" dismiss together while "jeans" does not.
 */
export function queryFamily(query: string): string {
  return normalise(query).split(" ").filter(Boolean).sort().join("+");
}

export class SuppressionStore {
  private readonly dismissed = new Set<string>();
  private readonly impressions = new Map<string, number>();
  readonly log: SuppressionEvent[] = [];

  private key(userId: string, sessionId: string, family: string): string {
    return `${userId}|${sessionId}|${family}`;
  }

  private capKey(userId: string, day: string, itemId: string): string {
    return `${userId}|${day}|${itemId}`;
  }

  dismiss(userId: string, sessionId: string, query: string, day: string): void {
    const family = queryFamily(query);
    this.dismissed.add(this.key(userId, sessionId, family));
    this.log.push({ userId, queryFamily: family, sessionId, day, at: Date.now() });
  }

  undismiss(userId: string, sessionId: string, query: string): void {
    this.dismissed.delete(this.key(userId, sessionId, queryFamily(query)));
  }

  isDismissed(userId: string, sessionId: string, query: string): boolean {
    return this.dismissed.has(this.key(userId, sessionId, queryFamily(query)));
  }

  /** FR-3 / E7: no user sees the same item's module more than N times a day. */
  isCapped(userId: string, day: string, itemId: string, cap: number): boolean {
    return (this.impressions.get(this.capKey(userId, day, itemId)) ?? 0) >= cap;
  }

  recordImpression(userId: string, day: string, itemId: string): void {
    const key = this.capKey(userId, day, itemId);
    this.impressions.set(key, (this.impressions.get(key) ?? 0) + 1);
  }

  reset(): void {
    this.dismissed.clear();
    this.impressions.clear();
    this.log.length = 0;
  }
}
