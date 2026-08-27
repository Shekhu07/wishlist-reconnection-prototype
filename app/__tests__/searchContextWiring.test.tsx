import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import App from "../App";
import { EventLog, type SearchPerformed } from "@/analytics/events";

jest.mock("@/data/images", () => ({ CATALOG_IMAGES: new Proxy({}, { get: () => 1 }) }));

const waitForModule = () => waitFor(() => expect(screen.getByTestId("wishlist-module")).toBeTruthy());

/**
 * Task 6 changed the search_performed effect's dependency from [scenario.id]
 * to [context.seq] specifically so that re-picking the same scenario still
 * logs a search. That is exactly the kind of change the pure-function tests
 * in searchContext.test.ts cannot see: they never mount App, so a revert of
 * the dependency array back to [scenario.id] would leave them green.
 *
 * This test mounts App and spies on the shared EventLog.prototype.emit (App
 * builds its own EventLog internally and doesn't expose it, so this is how
 * the shadow-mode tests reach emitted events from outside too) to assert
 * that re-selecting the currently active scenario produces a second
 * search_performed event with a distinct session_id, not zero and not a
 * duplicate.
 */
describe("search_performed logs per search, not per scenario identity", () => {
  it("fires two search_performed events with distinct session_ids when the same scenario is re-picked", async () => {
    const emitSpy = jest.spyOn(EventLog.prototype, "emit");

    render(<App />);
    await waitForModule();

    // App mounts on scenarios[1] = state_2_one_exact ("State 2: One exact
    // match"), so re-pressing its own row in the StateSwitcher re-selects
    // the currently active scenario.
    fireEvent.press(screen.getByLabelText("State 2: One exact match"));
    await waitForModule();

    const searchEvents = emitSpy.mock.calls
      .map(([event]) => event as SearchPerformed)
      .filter((event) => event.type === "search_performed");

    expect(searchEvents).toHaveLength(2);
    expect(searchEvents[0].session_id).not.toBe(searchEvents[1].session_id);
  });
});
