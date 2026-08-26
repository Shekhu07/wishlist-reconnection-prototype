import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
}

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
