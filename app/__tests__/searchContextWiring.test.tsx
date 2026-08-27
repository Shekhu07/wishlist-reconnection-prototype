import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import App from "../App";
import { EventLog, type SearchPerformed } from "@/analytics/events";

jest.mock("@/data/images", () => ({ CATALOG_IMAGES: new Proxy({}, { get: () => 1 }) }));

const waitForModule = () => waitFor(() => expect(screen.getByTestId("wishlist-module")).toBeTruthy());

// Home is the entry point now (Task 12): App no longer opens directly on
// search results, so this test has to reach results the same way a
// participant would first -- same helper as navigation.test.tsx's Ruling B.
function renderAtResults() {
  render(<App />);
  fireEvent.press(screen.getByLabelText("Search for products"));
  const input = screen.getByLabelText("Search for products");
  fireEvent.changeText(input, "mark taylor shirts");
  fireEvent(input, "submitEditing");
}

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
    // Home is the entry point now (Task 12), so reach results first -- this
    // itself fires search_performed events (the initial mount, then the
    // typed search) that are not what this test is about. The spy is
    // installed only once we're already on results, so what it observes is
    // exactly two consecutive re-picks of the currently active scenario
    // (scenarios[1] = state_2_one_exact, "State 2: One exact match", which
    // the typed search above does not change), isolating the regression Task
    // 6 fixed: re-selecting an already-active scenario must still log a
    // fresh, distinctly-sessioned search rather than being deduped by
    // scenario identity.
    renderAtResults();
    await waitForModule();

    const emitSpy = jest.spyOn(EventLog.prototype, "emit");

    // Task 13 moved the harness controls behind a collapsed pill.
    fireEvent.press(screen.getByLabelText(/Open the state harness/));
    fireEvent.press(screen.getByLabelText("State 2: One exact match"));
    await waitForModule();
    fireEvent.press(screen.getByLabelText("State 2: One exact match"));
    await waitForModule();

    const searchEvents = emitSpy.mock.calls
      .map(([event]) => event as SearchPerformed)
      .filter((event) => event.type === "search_performed");

    expect(searchEvents).toHaveLength(2);
    expect(searchEvents[0].session_id).not.toBe(searchEvents[1].session_id);
  });
});
