import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { HarnessPill } from "@/shell/HarnessPill";

describe("the harness pill", () => {
  it("stays shut until tapped", () => {
    const onToggle = jest.fn();
    render(
      <HarnessPill stateNumber={2} suppression={null} open={false} onToggle={onToggle}>
        <Text testID="switcher">controls</Text>
      </HarnessPill>
    );
    expect(screen.queryByTestId("switcher")).toBeNull();
    fireEvent.press(screen.getByLabelText(/Open the state harness/));
    expect(onToggle).toHaveBeenCalled();
  });

  it("names a suppression on its face", () => {
    render(
      <HarnessPill stateNumber={2} suppression="frequency_cap" open={false} onToggle={() => {}}>
        <Text testID="switcher">controls</Text>
      </HarnessPill>
    );
    expect(screen.getByText(/cap/i)).toBeTruthy();
  });
});
