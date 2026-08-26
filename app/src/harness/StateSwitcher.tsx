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
}

const LATENCIES = [60, 240, 420, 900];

export function StateSwitcher({
  scenarios,
  activeId,
  onSelect,
  latencyMs,
  onLatencyChange,
  swapFills,
  onSwapFills,
  note,
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
  chipText: { ...type.chip, color: "#C9CBD4" },
  chipTextActive: { color: color.surface, fontWeight: "700" },
  note: {
    ...type.chip,
    color: "#9A9CA8",
    paddingHorizontal: space.md,
    lineHeight: 15,
  },
});
