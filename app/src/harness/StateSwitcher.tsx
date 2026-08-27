import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ExperimentArm } from "@/analytics/events";
import type { Scenario } from "@/data/types";
import { MIN_TOUCH_TARGET, color, radius, space, type } from "@/design/tokens";

/**
 * E12: the prototype state harness.
 *
 * Researchers need to drive any of the ten states deterministically without
 * seeding data, so every scenario is one tap. The doc suggests Storybook for
 * the same matrix; this covers it inside the app the participants actually
 * use, which is one mechanism instead of two.
 */

export interface StateSwitcherProps {
  scenarios: Scenario[];
  activeId: string;
  onSelect: (scenario: Scenario) => void;
  latencyMs: number;
  onLatencyChange: (ms: number) => void;
  swapFills: boolean;
  onSwapFills: (value: boolean) => void;
  note?: string;
  /** E5 controls: move stock and address under the user, per plan section 3.2. */
  pincode: string;
  onPincodeChange: (pincode: string) => void;
  onSellOutSize: () => void;
  onSellOutProduct: () => void;
  onResetStock: () => void;
  stockChanged: boolean;
  /** Section 4.16: the per-user control, so it can be shown working. */
  showWishlistInSearch: boolean;
  onToggleWishlistInSearch: (value: boolean) => void;
  /** Phase 3: matching runs, nothing renders. */
  shadowMode: boolean;
  onToggleShadowMode: (value: boolean) => void;
  eventCount: number;
  /** E10: arm, ramp and the kill switch. */
  arm: ExperimentArm;
  onArmChange: (arm: ExperimentArm) => void;
  ramp: number;
  rampSteps: number[];
  killed: boolean;
  onAdvanceRamp: () => void;
  onToggleKill: () => void;
  /** Bumped whenever the flag mutates, so this bar re-renders. */
  flagVersion: number;
  /** E16: durable per-item hides, and a way back out of them. */
  hiddenCount: number;
  onUnhideAll: () => void;
}

const ARM_LABELS: Record<ExperimentArm, string> = {
  control: "Control",
  treatment_a: "A · reconnection",
  treatment_b: "B · + variant",
};

const LATENCIES = [60, 240, 420, 900];

/**
 * Home, plus two addresses chosen because some sellers refuse to ship there.
 * 795001 blocks the seller behind the default state-2 item, so section 4.13 is
 * one tap away rather than something a researcher has to go hunting for.
 */
const PINCODES = ["560034", "194101", "795001"];

export function StateSwitcher({
  scenarios,
  activeId,
  onSelect,
  latencyMs,
  onLatencyChange,
  swapFills,
  onSwapFills,
  note,
  pincode,
  onPincodeChange,
  onSellOutSize,
  onSellOutProduct,
  onResetStock,
  stockChanged,
  showWishlistInSearch,
  onToggleWishlistInSearch,
  shadowMode,
  onToggleShadowMode,
  eventCount,
  arm,
  onArmChange,
  ramp,
  killed,
  onAdvanceRamp,
  onToggleKill,
  hiddenCount,
  onUnhideAll,
}: StateSwitcherProps) {
  return (
    <View style={styles.bar} testID="state-switcher">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {scenarios.map((scenario) => {
          const active = scenario.id === activeId;
          return (
            <Pressable
              key={scenario.id}
              accessibilityRole="button"
              accessibilityLabel={`State ${scenario.state}: ${scenario.label}`}
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(scenario)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {scenario.state}. {scenario.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Text style={styles.controlLabel}>Match latency</Text>
        {LATENCIES.map((ms) => (
          <Pressable
            key={ms}
            accessibilityRole="button"
            accessibilityLabel={`Set match latency to ${ms} milliseconds`}
            onPress={() => onLatencyChange(ms)}
            style={[styles.chip, latencyMs === ms && styles.chipActive]}
          >
            <Text style={[styles.chipText, latencyMs === ms && styles.chipTextActive]}>
              {ms} ms
            </Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Swap button fills for the Phase 5 co-equality check"
          onPress={() => onSwapFills(!swapFills)}
          style={[styles.chip, swapFills && styles.chipActive]}
        >
          <Text style={[styles.chipText, swapFills && styles.chipTextActive]}>
            Swap fills
          </Text>
        </Pressable>
      </ScrollView>

      {/* Two-phase freshness is only observable if stock can actually move
          between the advisory read and the binding one. These do that. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Text style={styles.controlLabel}>Deliver to</Text>
        {PINCODES.map((pin) => (
          <Pressable
            key={pin}
            accessibilityRole="button"
            accessibilityLabel={`Set delivery pincode to ${pin}`}
            onPress={() => onPincodeChange(pin)}
            style={[styles.chip, pincode === pin && styles.chipActive]}
          >
            <Text style={[styles.chipText, pincode === pin && styles.chipTextActive]}>{pin}</Text>
          </Pressable>
        ))}
        <Text style={styles.controlLabel}>Stock</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sell out the saved size before the next action"
          onPress={onSellOutSize}
          style={styles.chip}
        >
          <Text style={styles.chipText}>Sell out saved size</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sell out the whole product before the next action"
          onPress={onSellOutProduct}
          style={styles.chip}
        >
          <Text style={styles.chipText}>Sell out product</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reset stock to the seeded catalog"
          onPress={onResetStock}
          style={[styles.chip, stockChanged && styles.chipWarn]}
        >
          <Text style={[styles.chipText, stockChanged && styles.chipTextActive]}>
            {stockChanged ? "Reset stock ●" : "Reset stock"}
          </Text>
        </Pressable>
        <Text style={styles.controlLabel}>Phase 3</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Toggle shadow mode: match but render nothing"
          accessibilityState={{ checked: shadowMode }}
          onPress={() => onToggleShadowMode(!shadowMode)}
          style={[styles.chip, shadowMode && styles.chipWarn]}
        >
          <Text style={[styles.chipText, shadowMode && styles.chipTextActive]}>
            {shadowMode ? "Shadow mode: on" : "Shadow mode: off"}
          </Text>
        </Pressable>
        <Text style={styles.controlLabel}>{eventCount} events</Text>
        <Text style={styles.controlLabel}>Hidden {hiddenCount}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Restore all hidden items"
          onPress={onUnhideAll}
          style={[styles.chip, hiddenCount > 0 && styles.chipWarn]}
        >
          <Text style={[styles.chipText, hiddenCount > 0 && styles.chipTextActive]}>
            Unhide all
          </Text>
        </Pressable>
        <Text style={styles.controlLabel}>Setting</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Toggle the user setting: show saved items in search"
          accessibilityState={{ checked: showWishlistInSearch }}
          onPress={() => onToggleWishlistInSearch(!showWishlistInSearch)}
          style={[styles.chip, !showWishlistInSearch && styles.chipWarn]}
        >
          <Text style={[styles.chipText, !showWishlistInSearch && styles.chipTextActive]}>
            {showWishlistInSearch
              ? "Wishlist in search: on"
              : "Wishlist in search: off"}
          </Text>
        </Pressable>
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Text style={styles.controlLabel}>Arm</Text>
        {(Object.keys(ARM_LABELS) as ExperimentArm[]).map((candidate) => (
          <Pressable
            key={candidate}
            accessibilityRole="button"
            accessibilityLabel={`Show the ${ARM_LABELS[candidate]} arm`}
            accessibilityState={{ selected: arm === candidate }}
            onPress={() => onArmChange(candidate)}
            style={[styles.chip, arm === candidate && styles.chipActive]}
          >
            <Text style={[styles.chipText, arm === candidate && styles.chipTextActive]}>
              {ARM_LABELS[candidate]}
            </Text>
          </Pressable>
        ))}
        <Text style={styles.controlLabel}>Ramp {(ramp * 100).toFixed(0)}%</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Advance the ramp one step"
          onPress={onAdvanceRamp}
          style={styles.chip}
        >
          <Text style={styles.chipText}>Advance ramp</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={killed ? "Clear the kill switch" : "Run the kill-switch drill"}
          onPress={onToggleKill}
          style={[styles.chip, killed && styles.chipWarn]}
        >
          <Text style={[styles.chipText, killed && styles.chipTextActive]}>
            {killed ? "Killed — clear" : "Kill-switch drill"}
          </Text>
        </Pressable>
      </ScrollView>

      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: "#1A1B22",
    paddingVertical: space.sm,
    gap: space.sm,
  },
  row: { gap: space.sm, paddingHorizontal: space.md, alignItems: "center" },
  controlLabel: { ...type.chip, color: "#9A9CA8", marginRight: space.xs },
  chip: {
    minHeight: MIN_TOUCH_TARGET - 12,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: "#2A2C36",
  },
  chipActive: { backgroundColor: color.brandPink },
  chipWarn: { backgroundColor: "#B4761E" },
  chipText: { ...type.chip, color: "#C9CBD4" },
  chipTextActive: { color: color.surface, fontWeight: "700" },
  note: {
    ...type.chip,
    color: "#9A9CA8",
    paddingHorizontal: space.md,
    lineHeight: 15,
  },
});
