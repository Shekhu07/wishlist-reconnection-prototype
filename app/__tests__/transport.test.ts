import { DEFAULT_CONFIG, EMPTY_RESPONSE } from "@/match/contract";
import { MatchClient } from "@/match/transport";
import { makeCatalog, makeWishlist } from "./helpers/fixtures";

const request = {
  query: "mark taylor shirt",
  modality: "text" as const,
  filters: {},
  delivery_pincode: "560034",
  session_id: "s1",
  search_id: "search_1",
};

function client(options: Partial<ConstructorParameters<typeof MatchClient>[0]> = {}) {
  return new MatchClient({ catalog: makeCatalog(), wishlist: makeWishlist(), ...options });
}

describe("match transport (constraint C-3, fail-open)", () => {
  it("resolves with matches on the happy path", async () => {
    const result = await client({ latencyMs: 10 }).requestMatch(request, true);
    expect(result.matches).toHaveLength(1);
  });

  it("fails open to empty when the call exceeds the hard timeout", async () => {
    const result = await client({ forceTimeout: true }).requestMatch(request, true);
    expect(result).toEqual(EMPTY_RESPONSE);
  });

  it("returns inside the hard timeout even when the matcher never would", async () => {
    const started = Date.now();
    await client({ forceTimeout: true }).requestMatch(request, true);
    // 250 ms budget plus scheduler slack; the point is that it does not wait
    // for the underlying call.
    expect(Date.now() - started).toBeLessThan(400);
  });

  it("gives a logged-out caller the identical empty shape (constraint C-6)", async () => {
    const subject = client({ latencyMs: 10 });
    const loggedOut = await subject.requestMatch(request, false);
    expect(loggedOut).toEqual(EMPTY_RESPONSE);
    // Nothing anywhere in the payload may hint that a wishlist exists.
    expect(JSON.stringify(loggedOut)).not.toMatch(/wi_|sku_|Blue/);
  });

  it("opens the breaker after a sustained timeout rate and then returns instantly", async () => {
    // A short window keeps the test quick; the behaviour under test is the
    // rate threshold, not the window size.
    const config = { ...DEFAULT_CONFIG, breakerWindow: 4 };
    const subject = client({ forceTimeout: true, config });
    for (let i = 0; i < config.breakerWindow; i += 1) {
      await subject.requestMatch(request, true);
    }
    const started = Date.now();
    const result = await subject.requestMatch(request, true);
    expect(result).toEqual(EMPTY_RESPONSE);
    // Breaker open means the call is not attempted at all.
    expect(Date.now() - started).toBeLessThan(50);
    expect(subject.shadow[subject.shadow.length - 1].breakerOpen).toBe(true);
  });

  it("suppresses the query family for the session after a dismissal (FR-8)", async () => {
    const subject = client({ latencyMs: 10 });
    expect((await subject.requestMatch(request, true)).matches).toHaveLength(1);
    subject.dismiss(request);
    const after = await subject.requestMatch(request, true);
    expect(after.matches).toHaveLength(0);
    expect(after.suppressed).toBe(true);
    // Dismissal is a relevance signal, not a permanent opt-out.
    expect(subject.suppression.log).toHaveLength(1);
  });

  it("dismisses by query family, so word order does not create a loophole", async () => {
    const subject = client({ latencyMs: 10 });
    subject.dismiss(request);
    const reordered = { ...request, query: "shirt taylor mark" };
    expect((await subject.requestMatch(reordered, true)).suppressed).toBe(true);
  });

  it("restores the module on undo", async () => {
    const subject = client({ latencyMs: 10 });
    subject.dismiss(request);
    subject.undo(request);
    expect((await subject.requestMatch(request, true)).matches).toHaveLength(1);
  });

  it("stops showing the same item past its daily cap (E7)", async () => {
    const subject = client({ latencyMs: 10 });
    for (let i = 0; i < subject.config.perItemDailyCap; i += 1) {
      expect((await subject.requestMatch(request, true)).matches).toHaveLength(1);
    }
    expect((await subject.requestMatch(request, true)).matches).toHaveLength(0);
  });

  it("logs every call to the shadow topic, rendered or not", async () => {
    const subject = client({ forceTimeout: true });
    await subject.requestMatch(request, true);
    expect(subject.shadow).toHaveLength(1);
    expect(subject.shadow[0]).toMatchObject({ timedOut: true, rendered: 0 });
  });
});
