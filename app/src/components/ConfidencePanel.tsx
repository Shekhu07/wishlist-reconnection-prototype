import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  CONFIDENCE_COLLAPSE,
  CONFIDENCE_EXPAND,
  CONFIDENCE_TITLE,
  SIGNAL_LABEL,
  SIGNAL_STATUS_LABEL,
} from "@/copy/bundle";
import type { ConfidenceSignal, SignalKey, SignalStatus } from "@/confidence/signals";
import { MIN_TOUCH_TARGET, color, radius, space, type } from "@/design/tokens";

/**
 * SmartBuy Checklist — Premium Decision Confidence & Trust Dashboard.
 *
 * Categorized into 3 intuitive pillars:
 * 1. Selection & Fit (Size, Colour, Brand Fit Guidance)
 * 2. Delivery & Fulfillment (Address Serviceability, Seller)
 * 3. Quality & Assurance (Material, Returns Policy, Reviews, Price Continuity)
 */

const GLYPH: Record<SignalStatus, string> = {
  ok: "✓",
  attention: "!",
  blocked: "×",
  unknown: "ℹ",
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
    text: "#475569",
    iconBg: "#F1F5F9",
  },
};

interface PillarGroup {
  id: string;
  title: string;
  shortName: string;
  icon: string;
  keys: SignalKey[];
}

const PILLARS: PillarGroup[] = [
  {
    id: "fit",
    title: "Selection & Fit",
    shortName: "Sizing",
    icon: "📐",
    keys: ["saved_variant", "size_availability", "colour_availability", "fit"],
  },
  {
    id: "delivery",
    title: "Shipping & Fulfillment",
    shortName: "Shipping",
    icon: "🚚",
    keys: ["delivery", "seller"],
  },
  {
    id: "quality",
    title: "Guarantees & Assurance",
    shortName: "Guarantees",
    icon: "🛡️",
    keys: ["material", "returns", "reviews", "price"],
  },
];

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
  const isAllClear = blocking.length === 0;

  const signalMap = new Map(signals.map((s) => [s.key, s]));

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
        <View style={[styles.headerBadge, isAllClear ? styles.badgeOk : styles.badgeAttention]}>
          <Text style={styles.headerBadgeIcon}>{isAllClear ? "✓" : "!"}</Text>
        </View>
        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            <Text style={styles.title} accessibilityRole="header">
              {CONFIDENCE_TITLE}
            </Text>
            <View style={[styles.trustPill, isAllClear ? styles.trustPillOk : styles.trustPillAttention]}>
              <Text style={[styles.trustPillText, isAllClear ? styles.trustTextOk : styles.trustTextAttention]}>
                {blocking.length ? "Needs Attention" : `${okCount} Checks Verified`}
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
          ) : null}
        </View>
        <View style={styles.chevronWrap}>
          <Text style={styles.chevron}>{expanded ? "▲" : "▼"}</Text>
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.bodyContainer}>
          {/* Visual Readiness Progress Bar */}
          <View style={styles.readinessBar}>
            <View style={styles.gaugeHeader}>
              <Text style={styles.gaugeLabel}>READINESS STATUS</Text>
              <Text style={styles.gaugeStatus}>
                {isAllClear ? "Ready to Bag" : "Attention Required"}
              </Text>
            </View>
            <View style={styles.gaugeSegments}>
              {PILLARS.map((pillar) => {
                const pillarSignals = pillar.keys
                  .map((k) => signalMap.get(k))
                  .filter((s): s is ConfidenceSignal => s !== undefined);
                const hasBlock = pillarSignals.some((s) => s.status === "blocked");
                const hasAttention = pillarSignals.some((s) => s.status === "attention");
                const segStyle = hasBlock
                  ? styles.segmentBlocked
                  : hasAttention
                  ? styles.segmentAttention
                  : styles.segmentOk;

                return (
                  <View key={pillar.id} style={styles.segmentWrap}>
                    <View style={[styles.segment, segStyle]} />
                    <Text style={styles.segmentName}>{pillar.shortName}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Categorized Pillars */}
          <View style={styles.pillarsContainer}>
            {PILLARS.map((pillar) => {
              const pillarSignals = pillar.keys
                .map((k) => signalMap.get(k))
                .filter((s): s is ConfidenceSignal => s !== undefined);

              if (pillarSignals.length === 0) return null;

              return (
                <View key={pillar.id} style={styles.pillarSection}>
                  <View style={styles.pillarHeader}>
                    <Text style={styles.pillarIcon}>{pillar.icon}</Text>
                    <Text style={styles.pillarTitle}>{pillar.title.toUpperCase()}</Text>
                  </View>
                  <View style={styles.pillarCards}>
                    {pillarSignals.map((signal) => (
                      <SignalRow key={signal.key} signal={signal} />
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
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
          <View style={styles.signalTopRow}>
            <Text style={styles.signalLabel}>{label}</Text>
            <View
              style={[
                styles.statusChip,
                { backgroundColor: statusCfg.iconBg, borderColor: statusCfg.border },
              ]}
            >
              <Text style={[styles.statusChipText, { color: statusCfg.text }]}>
                {signal.status === "ok"
                  ? "VERIFIED"
                  : signal.status === "blocked"
                  ? "UNAVAILABLE"
                  : signal.status === "attention"
                  ? "NOTE"
                  : "INFO"}
              </Text>
            </View>
          </View>
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
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
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
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  badgeOk: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  badgeAttention: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  headerBadgeIcon: {
    fontSize: 12,
    fontWeight: "800",
    color: "#059669",
  },
  headerText: { flex: 1 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
  },
  title: {
    fontSize: 14.5,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  trustPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  trustPillOk: {
    backgroundColor: "#EFF6FF",
    borderColor: "#DBEAFE",
  },
  trustPillAttention: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  trustPillText: {
    fontSize: 10.5,
    fontWeight: "700",
  },
  trustTextOk: {
    color: "#2563EB",
  },
  trustTextAttention: {
    color: "#D97706",
  },
  summary: {
    ...type.chip,
    color: color.textSecondary,
    marginTop: 3,
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
  bodyContainer: {
    backgroundColor: "#F8FAFC",
  },
  readinessBar: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  gaugeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  gaugeLabel: {
    fontSize: 9.5,
    fontWeight: "700",
    color: "#94A3B8",
    letterSpacing: 0.6,
  },
  gaugeStatus: {
    fontSize: 11,
    fontWeight: "700",
    color: "#059669",
  },
  gaugeSegments: {
    flexDirection: "row",
    gap: space.sm,
  },
  segmentWrap: {
    flex: 1,
    gap: 3,
  },
  segment: {
    height: 4,
    borderRadius: 2,
  },
  segmentOk: {
    backgroundColor: "#10B981",
  },
  segmentAttention: {
    backgroundColor: "#F59E0B",
  },
  segmentBlocked: {
    backgroundColor: "#EF4444",
  },
  segmentName: {
    fontSize: 9.5,
    fontWeight: "600",
    color: "#64748B",
  },
  pillarsContainer: {
    padding: space.sm,
    gap: space.md,
  },
  pillarSection: {
    gap: space.xs,
  },
  pillarHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 2,
    marginBottom: 2,
  },
  pillarIcon: {
    fontSize: 12,
  },
  pillarTitle: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: 0.6,
  },
  pillarCards: {
    gap: 6,
  },
  signalCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 6,
  },
  signalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    minHeight: MIN_TOUCH_TARGET - 4,
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: space.sm,
  },
  iconBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  glyph: {
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  signalText: { flex: 1 },
  signalTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 1,
  },
  signalLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statusChip: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.5,
  },
  statusChipText: {
    fontSize: 8.5,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  signalValue: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#1E293B",
  },
  signalDetail: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
    lineHeight: 15,
  },
});
