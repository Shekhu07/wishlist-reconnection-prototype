import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  CONFIDENCE_COLLAPSE,
  CONFIDENCE_EXPAND,
  CONFIDENCE_TITLE,
  SIGNAL_LABEL,
  SIGNAL_STATUS_LABEL,
} from "@/copy/bundle";
import type { ConfidenceSignal, SignalStatus } from "@/confidence/signals";
import { MIN_TOUCH_TARGET, color, radius, space, spec, type } from "@/design/tokens";

/**
 * DC-03 / DC-04: the decision confidence section.
 *
 * Progressive disclosure, per design principle 2: the panel opens to a compact
 * list of statuses and values, and the *source* of each signal is one tap
 * further in. Section 7 is the reason the source exists at all -- "size
 * guidance is based on this brand's size guide" is a claim someone can check,
 * and "high fit confidence" is not.
 *
 * The collapsed state still says the load-bearing things, following the
 * harness's own summarise() rule: a collapsed panel that hides a blocked
 * signal is worse than no panel, because it reads as reassurance.
 */

const GLYPH: Record<SignalStatus, string> = {
  ok: "✓",
  attention: "!",
  blocked: "×",
  unknown: "?",
};

const GLYPH_COLOUR: Record<SignalStatus, string> = {
  ok: spec.signalOk,
  attention: spec.signalAttention,
  blocked: spec.signalBlocked,
  unknown: color.textSecondary,
};

export interface ConfidencePanelProps {
  signals: ConfidenceSignal[];
  /** Fires once per open, for `confidence_layer_viewed`. */
  onExpand?: () => void;
  /** Fires per signal opened, for `confidence_signal_expanded`. */
  onSignalExpand?: (key: string) => void;
  initiallyExpanded?: boolean;
}

export function ConfidencePanel({
  signals,
  onExpand,
  onSignalExpand,
  initiallyExpanded = false,
}: ConfidencePanelProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);

  // Anything blocking is named on the collapsed face. Section 19's "graceful
  // staleness" rule: explain what changed, never present a broken state as fine.
  const blocking = signals.filter((s) => s.status === "blocked");

  return (
    <View style={styles.panel} testID="confidence-panel">
      <Pressable
        testID="confidence-toggle"
        accessibilityRole="button"
        accessibilityLabel={expanded ? CONFIDENCE_COLLAPSE : CONFIDENCE_EXPAND}
        accessibilityState={{ expanded }}
        onPress={() => {
          const next = !expanded;
          setExpanded(next);
          if (next) onExpand?.();
        }}
        style={styles.header}
      >
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">
            {CONFIDENCE_TITLE}
          </Text>
          {!expanded ? (
            <Text style={styles.summary}>
              {blocking.length
                ? blocking.map((s) => s.value).join(" · ")
                : signals
                    .filter((s) => s.status === "ok")
                    .slice(0, 2)
                    .map((s) => s.value)
                    .join(" · ")}
            </Text>
          ) : null}
        </View>
        <Text style={styles.chevron}>{expanded ? "▲" : "▼"}</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.signals}>
          {signals.map((signal) => (
            <SignalRow key={signal.key} signal={signal} onExpand={onSignalExpand} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SignalRow({
  signal,
  onExpand,
}: {
  signal: ConfidenceSignal;
  onExpand?: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = SIGNAL_LABEL[signal.key] ?? signal.key;

  return (
    <View style={styles.signal} testID={`signal-${signal.key}`}>
      <Pressable
        testID={`signal-why-${signal.key}`}
        accessibilityRole="button"
        // The spoken form carries the status word, because a glyph is not text
        // and "✓" announced alone tells a screen-reader user nothing.
        accessibilityLabel={`${label}: ${signal.value}. ${SIGNAL_STATUS_LABEL[signal.status]}. Why this is shown`}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          const next = !open;
          setOpen(next);
          if (next) onExpand?.(signal.key);
        }}
        style={styles.signalHeader}
      >
        <Text style={[styles.glyph, { color: GLYPH_COLOUR[signal.status] }]}>
          {GLYPH[signal.status]}
        </Text>
        <View style={styles.signalText}>
          <Text style={styles.signalLabel}>{label}</Text>
          <Text style={styles.signalValue}>{signal.value}</Text>
        </View>
        <Text style={styles.why}>{open ? "Hide" : "Why"}</Text>
      </Pressable>

      {open ? (
        <View style={styles.source} testID={`signal-source-${signal.key}`}>
          <Text style={styles.sourceText}>{signal.source}</Text>
          {signal.detail ? <Text style={styles.detailText}>{signal.detail}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: space.lg,
    borderWidth: 1,
    borderColor: color.borderSubtle,
    borderRadius: radius.card,
    // Deliberately untinted, for the same reason section 4.2 gives for the
    // module container: a tinted box on this screen reads as promotion.
    backgroundColor: color.surface,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.sm,
  },
  headerText: { flex: 1 },
  title: { ...type.body, fontWeight: "700", color: color.textPrimary },
  summary: { ...type.chip, color: color.textSecondary, marginTop: 2 },
  chevron: { ...type.chip, color: color.textSecondary },
  signals: { borderTopWidth: 1, borderTopColor: color.borderSubtle },
  signal: { borderBottomWidth: 1, borderBottomColor: color.borderSubtle },
  signalHeader: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.sm,
  },
  glyph: { fontSize: 14, fontWeight: "700", width: 16, textAlign: "center" },
  signalText: { flex: 1 },
  signalLabel: { ...type.chip, color: color.textSecondary },
  signalValue: { ...type.body, color: color.textPrimary },
  why: { ...type.chip, color: color.brandPink, fontWeight: "700" },
  source: {
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    paddingLeft: space.md + 16 + space.sm,
    gap: 2,
  },
  sourceText: { ...type.chip, color: color.textSecondary },
  detailText: { ...type.body, color: color.textSecondary, lineHeight: 17 },
});
