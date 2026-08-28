import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import App from "../App";
import { InventorySimulator } from "@/revalidation/inventory";
import { revalidate } from "@/revalidation/revalidate";
import { makeCatalog, makeWishlist } from "./helpers/fixtures";
import { variantRecoveryRate } from "@/analytics/metrics";
import { EventLog } from "@/analytics/events";

jest.mock("@/data/images", () => ({ CATALOG_IMAGES: new Proxy({}, { get: () => 1 }) }));

/**
 * Section 7's variant recovery rate, measured from the product rather than
 * from the simulator.
 *
 * `variant_recovery_shown` and `variant_recovery_resolved` were declared in
 * events.ts and consumed by `variantRecoveryRate`, and nothing in the app
 * emitted either -- so the metric had exactly one possible value from real
 * usage, forever, and looked healthy because the simulated population filled
 * it in. A rate that cannot move is not a measurement.
 */

describe("variant recovery telemetry", () => {
  it("computes nothing from an empty log, rather than a flattering zero", () => {
    // rate() returns null for a zero denominator by policy. Worth pinning:
    // a 0% recovery rate and "nobody has hit a recovery state" are different
    // findings, and only one of them is a problem.
    expect(variantRecoveryRate(new EventLog().all()).value).toBeNull();
  });

  it("counts a resolution against the recovery that was actually shown", () => {
    const log = new EventLog();
    const base = { ts: "2026-08-26", user_id: "u", session_id: "s", arm: "treatment_b" as const };
    log.emit({ ...base, type: "variant_recovery_shown", sku: "sku_1", reason: "variant_unavailable" });
    log.emit({ ...base, type: "variant_recovery_resolved", sku: "sku_1", resolved_by: "other_size" });
    log.emit({ ...base, type: "variant_recovery_shown", sku: "sku_2", reason: "variant_unavailable" });
    log.emit({ ...base, type: "variant_recovery_resolved", sku: "sku_2", resolved_by: "abandoned" });

    // Abandoning is not recovering, so the rate is one in two, not two in two.
    expect(variantRecoveryRate(log.all())).toMatchObject({ numerator: 1, denominator: 2 });
  });

  it("reaches a recovery state through the app and moves the numbers", async () => {
    render(<App />);

    fireEvent.press(screen.getByLabelText("Search for products"));
    const input = screen.getByLabelText("Search for products");
    fireEvent.changeText(input, "mark taylor shirts");
    fireEvent(input, "submitEditing");
    await waitFor(() => expect(screen.getByTestId("wishlist-module")).toBeTruthy());

    // Sell the saved size out from under the user, which is what the harness
    // control does, then open the saved product: the binding read now
    // contradicts the card and the recovery state renders.
    const openHarness = () =>
      fireEvent.press(screen.getByLabelText(/Open the state harness/));
    openHarness();
    fireEvent.press(screen.getByLabelText("Sell out the saved size before the next action"));
    openHarness();
    fireEvent.press(screen.getByTestId("wishlist-action-primary"));

    await waitFor(() => expect(screen.getByTestId("saved-product")).toBeTruthy());
    expect(screen.getByTestId("recovery-variant_unavailable")).toBeTruthy();

    const count = () => {
      const text = screen.getByTestId("harness-event-count").children.join("");
      return Number(text.replace(/\D/g, ""));
    };
    openHarness();
    const beforeResolution = count();
    openHarness();

    // Taking the recovery's own action has to be observable. Before the fix
    // this changed nothing in the log at all.
    fireEvent.press(screen.getByTestId("recovery-primary"));
    openHarness();
    expect(count()).toBeGreaterThan(beforeResolution);
  });
});

describe("the recovery state itself still refuses to substitute", () => {
  it("offers other sizes without changing what was saved (FR-7)", () => {
    const catalog = makeCatalog();
    const inventory = new InventorySimulator(catalog);
    const item = makeWishlist().items[0];
    inventory.sellOut(item.sku);
    const result = revalidate(item, catalog, inventory, "560034")!;

    expect(result.blocking).toBe("variant_unavailable");
    expect(result.item.size).toBe("M");
    expect(result.current.sizesInStock).not.toContain("M");
    // Alternatives exist to be offered, not applied.
    expect(result.alternatives.length).toBeGreaterThan(0);
  });
});
