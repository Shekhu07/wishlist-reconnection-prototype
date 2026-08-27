import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MIN_TOUCH_TARGET, color, radius, space, type } from "@/design/tokens";
import type { SuppressionReason } from "@/state/useWishlistMatch";

/**
 * The state harness, collapsed to a pill.
 *
 * Task 12's `StateSwitcher` renders every control inline, above `BottomNav`,
 * always visible -- the right shape for driving the ten states, the wrong one
 * for "what does this look like to a participant": harness chrome that never
 * goes away is chrome a screenshot can't avoid capturing. This wraps it in a
 * single tap target that starts shut. The state number is always on the
 * pill's face so a researcher can tell which scenario is loaded without
 * opening it; the suppression word joins it only when the module is off
 * screen for a reason worth flagging as intentional rather than broken.
 */

const SUPPRESSION_SHORT: Record<NonNullable<SuppressionReason>, string> = {
  timed_out: "timeout",
  breaker_open: "breaker",
  dismissed: "dismissed",
  too_late: "too late",
  user_scrolled: "scrolled",
  frequency_cap: "capped",
};

export interface HarnessPillProps {
  stateNumber: number;
  suppression: SuppressionReason;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function HarnessPill({ stateNumber, suppression, open, onToggle, children }: HarnessPillProps) {
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open the state harness — state ${stateNumber}`}
        onPress={onToggle}
        style={styles.pill}
      >
        <Text style={styles.pillText}>
          {stateNumber}
          {suppression ? ` · ${SUPPRESSION_SHORT[suppression]}` : ""}
        </Text>
      </Pressable>
      {open ? (
        <View style={styles.overlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close the state harness"
            style={styles.scrim}
            onPress={onToggle}
          />
          <View style={styles.sheet}>
            <ScrollView>{children}</ScrollView>
          </View>
        </View>
      ) : null}
    </>
  );
}

// BottomNav is `MIN_TOUCH_TARGET` (44) tall plus its own vertical padding
// (space.xs top and bottom) and a 1px top border -- the pill sits clear of
// all of it rather than guessing a round number.
const BOTTOM_NAV_HEIGHT = MIN_TOUCH_TARGET + space.xs * 2 + 1;

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    right: space.lg,
    bottom: BOTTOM_NAV_HEIGHT + space.md,
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: color.textPrimary,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  pillText: { ...type.chip, color: color.surface, fontWeight: "700" },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 20,
  },
  scrim: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "70%",
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
  },
});
