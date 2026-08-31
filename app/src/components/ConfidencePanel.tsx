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
import { MIN_TOUCH_TARGET, color, radius, space, type } from "@/design/tokens";

/**
 * DC-03 / DC-04: The Decision Confidence Layer & Trust Dashboard.
 *
 * Modernized with sleek visual micro-cards, dynamic status indicators,
 * and transparent provenance disclosures while adhering strictly to:
 * - C-1 (Zero monetary incentive / anti-urgency)
 * - C-7 (Accessibility touch targets and semantic roles)
 * - DC Provenance (Mandatory data source attribution)
 */

const GLYPH: Record<SignalStatus, string> = {
  ok: "✓",
  attention: "!",
  blocked: "×",
  unknown: "?",
};

const STATUS_STYLE: Record<
  SignalStatus,
  { bg: string; border: string; text: string; iconBg: string }
> = {
  ok: {
    bg: "#FAFCFA",
    border: "#DCFCE7",
    text: "#059669",
    iconBg: "#ECFDF5",
  },
  attention: {
    bg: "#FFFCF5",
    border: "#FEF3C7",
    text: "#D97706",
    iconBg: "#FFFBEB",
  },
  blocked: {
    bg: "#FFF8F8",
    border: "#FEE2E2",
    text: "#DC2626",
    iconBg: "#FEF2F2",
  },
  unknown: {
    bg: "#F8FAFC",
    border: "#E2E8F0",
    text: "#64748B",
    iconBg: "#F1F5F9",
  },
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

  const blocking = signals.filter((s) => s.status === "blocked");
  const okCount = signals.filter((s) => s.status === "ok").length;

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
        <View style={styles.headerBadge}>
          <View style={styles.headerBadgeDot} />
        </View>
        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            <Text style={styles.title} accessibilityRole="header">
              {CONFIDENCE_TITLE}
            </Text>
            <View style={styles.trustPill}>
              <Text style={styles.trustPillText}>
                {blocking.length ? "Needs Attention" : `${okCount} Verified Checks`}
              </Text>
            </View>
          </View>
          {!expanded ? (
            <Text style={styles.summary} numberOfLines={1}>
              {blocking.length
                ? blocking.map((s) => s.value).join(" · ")
                : signals
                    .filter((s) => s.status === "ok")
                    .slice(0, 2)
                    .map((s) => s.value)
                    .join(" · ")}
            </Text>
          ) : (
            <Text style={styles.subtitle}>
              Factual signals backed by verifiable marketplace data
            </Text>
          )}
        </View>
        <View style={styles.chevronWrap}>
          <Text style={styles.chevron}>{expanded ? "▲" : "▼"}</Text>
        </View>
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
  const statusCfg = STATUS_STYLE[signal.status];

  return (
    <View
      style={[
        styles.signalCard,
        { backgroundColor: statusCfg.bg, borderColor: statusCfg.border },
      ]}
      testID={`signal-${signal.key}`}
    >
      <Pressable
        testID={`signal-why-${signal.key}`}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${signal.value}. ${SIGNAL_STATUS_LABEL[signal.status]}. Why this is shown`}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          const next = !open;
          setOpen(next);
          if (next) onExpand?.(signal.key);
        }}
        style={styles.signalHeader}
      >
        <View style={[styles.iconBox, { backgroundColor: statusCfg.iconBg }]}>
          <Text style={[styles.glyph, { color: statusCfg.text }]}>
            {GLYPH[signal.status]}
          </Text>
        </View>
        <View style={styles.signalText}>
          <Text style={styles.signalLabel}>{label}</Text>
          <Text style={styles.signalValue}>{signal.value}</Text>
        </View>
        <View style={[styles.whyPill, open && styles.whyPillActive]}>
          <Text style={[styles.whyText, open && styles.whyTextActive]}>
            {open ? "Hide" : "Why"}
          </Text>
        </View>
      </Pressable>

      {open ? (
        <View style={styles.source} testID={`signal-source-${signal.key}`}>
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceBadgeText}>PROVENANCE</Text>
          </View>
          <Text style={styles.sourceText}>{signal.source}</Text>
          {signal.detail ? <Text style={styles.detailText}>{signal.detail}</Text> : null}
          {signal.synthetic ? (
            <View style={styles.syntheticBadge}>
              <Text style={styles.syntheticText}>Prototype Data · Factual Verification</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: space.lg,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    backgroundColor: "#FAFBFD",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    gap: space.sm,
  },
  headerBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  headerBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#059669",
  },
  headerText: { flex: 1 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  trustPill: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  trustPillText: {
    fontSize: 10.5,
    fontWeight: "600",
    color: "#2563EB",
  },
  summary: {
    ...type.chip,
    color: color.textSecondary,
    marginTop: 3,
  },
  subtitle: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  chevronWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  chevron: {
    fontSize: 10,
    color: "#64748B",
    fontWeight: "700",
  },
  signals: {
    padding: space.sm,
    gap: space.xs,
    backgroundColor: "#FFFFFF",
  },
  signalCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: space.xs,
  },
  signalHeader: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    gap: space.sm,
  },
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: {
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
  },
  signalText: { flex: 1 },
  signalLabel: {
    fontSize: 10.5,
    fontWeight: "600",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  signalValue: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#1E293B",
    marginTop: 1,
  },
  whyPill: {
    backgroundColor: "#FFF0F4",
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#FFE4EC",
  },
  whyPillActive: {
    backgroundColor: "#FF3F6C",
    borderColor: "#FF3F6C",
  },
  whyText: {
    fontSize: 11,
    color: color.brandPink,
    fontWeight: "700",
  },
  whyTextActive: {
    color: "#FFFFFF",
  },
  source: {
    marginTop: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    backgroundColor: "#F8FAFC",
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: color.brandPink,
    marginLeft: space.sm,
    marginRight: space.sm,
    marginBottom: space.xs,
    gap: 3,
  },
  sourceBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#EEF2F6",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  sourceBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: 0.5,
  },
  sourceText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#334155",
  },
  detailText: {
    fontSize: 11.5,
    color: "#64748B",
    lineHeight: 16,
  },
  syntheticBadge: {
    marginTop: 2,
  },
  syntheticText: {
    fontSize: 10,
    color: "#94A3B8",
    fontStyle: "italic",
  },
});
