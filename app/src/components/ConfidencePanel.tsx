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
 * Clean, direct checklist design without repetitive "Why" buttons.
 * Signals are directly displayed with clear status indicators, labels,
 * and contextual details where relevant.
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
  /** Retained for event interface compatibility. */
  onSignalExpand?: (key: string) => void;
  initiallyExpanded?: boolean;
}

export function ConfidencePanel({
  signals,
  onExpand,
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
            <SignalRow key={signal.key} signal={signal} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SignalRow({ signal }: { signal: ConfidenceSignal }) {
  const label = SIGNAL_LABEL[signal.key] ?? signal.key;
  const statusCfg = STATUS_STYLE[signal.status];

  return (
    <View
      style={[
        styles.signalCard,
        { backgroundColor: statusCfg.bg, borderColor: statusCfg.border },
      ]}
      testID={`signal-${signal.key}`}
      accessible
      accessibilityLabel={`${label}: ${signal.value}. ${SIGNAL_STATUS_LABEL[signal.status]}`}
    >
      <View style={styles.signalHeader}>
        <View style={[styles.iconBox, { backgroundColor: statusCfg.iconBg }]}>
          <Text style={[styles.glyph, { color: statusCfg.text }]}>
            {GLYPH[signal.status]}
          </Text>
        </View>
        <View style={styles.signalText}>
          <Text style={styles.signalLabel}>{label}</Text>
          <Text style={styles.signalValue}>{signal.value}</Text>
          {signal.detail ? (
            <Text style={styles.signalDetail}>{signal.detail}</Text>
          ) : null}
        </View>
      </View>
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
    alignItems: "flex-start",
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.sm,
    paddingVertical: 8,
    gap: space.sm,
  },
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
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
  signalDetail: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 3,
    lineHeight: 15,
  },
});
