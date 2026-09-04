import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  COMPARE_PRIORITIES,
  PRIORITY_AXES,
  orderedAxes,
  type ComparePriority,
} from "@/compare/priority";
import { REASON_COPY, reasonFor, type ReasonKey } from "@/compare/reasons";
import { tradeOffCaveat, tradeOffs, type DecideColumn } from "@/compare/decide";
import { Sheet } from "@/components/Sheet";
import {
  COMPARE_AXES,
  KEEP_COMPARISON,
  COMPARE_SAVED_LABEL,
  COMPARE_SYNTHETIC_NOTE,
  formatDelivery,
  formatPrice,
  formatReturns,
} from "@/copy/bundle";
import { CATALOG_IMAGES } from "@/data/images";
import type { Catalog, Colourway, ParentProduct, WishlistItem } from "@/data/types";
import { MIN_TOUCH_TARGET, color, radius, space, type } from "@/design/tokens";
import type { InventorySimulator } from "@/revalidation/inventory";
import { deliveryDateFor, servesPincode } from "@/revalidation/revalidate";
import { buildSearchIndex, search } from "@/search/localSearch";

/**
 * E6: the saved item beside up to four query-relevant alternatives.
 *
 * This is the agency half of "memory plus agency". The saved item is always
 * the first column and is labelled as such -- the user is comparing against
 * their own choice, not being sold away from it.
 *
 * There is no discount, offer or savings column, and adding one would be a
 * constraint C-1 violation rather than a feature. `compare.test.ts` asserts it.
 */

const MAX_ALTERNATIVES = 4;

export interface CompareScreenProps {
  catalog: Catalog;
  item: WishlistItem;
  parent: ParentProduct;
  colourway: Colourway;
  query: string;
  pincode: string;
  inventory: InventorySimulator;
  onBack: () => void;
  onChoose: (productId: number) => void;
  onPriority?: (priority: ComparePriority | null) => void;
  /** CR-01: fires once per comparison, with the ids that are on screen. */
  onOpened?: (productIds: number[]) => void;
  /** Restores a priority the user already chose (CR-03). */
  initialPriority?: ComparePriority | null;
  /** Improvement 5: off by default, so it is never a third co-equal action. */
  helpMeDecide?: boolean;
  onHelpMeDecide?: () => void;
  /** CR-01: states plainly that leaving will not destroy this. */
  onKeepComparison?: () => void;
}

export interface CompareColumn {
  key: string;
  parent: ParentProduct;
  colourway: Colourway;
  isSaved: boolean;
  sizeAvailable: boolean;
  /** Why this option is on screen. Null where the data supports no claim. */
  reason: ReasonKey | null;
}

/**
 * Alternatives are drawn from the organic search results for the same query,
 * restricted to the same article type. Reusing `search()` keeps one definition
 * of "relevant to this query" rather than inventing a second one here.
 */
export function buildColumns(
  catalog: Catalog,
  parent: ParentProduct,
  colourway: Colourway,
  item: WishlistItem,
  query: string,
  inventory: InventorySimulator,
  pincode: string
): CompareColumn[] {
  const index = buildSearchIndex(catalog);
  const relevant = search(query, index, 80).filter(
    (result) =>
      result.parent.articleType === parent.articleType &&
      result.colourway.product_id !== colourway.product_id
  );

  // One entry per product first, then colourways of products already shown.
  // Comparing a shirt against the same shirt in another colour is a colour
  // picker, not decision support -- but a near-empty table is worse, so
  // same-product colourways still backfill the remaining columns.
  const seenParents = new Set([parent.parent_product_id]);
  const distinct = relevant.filter((result) => {
    if (seenParents.has(result.parent.parent_product_id)) return false;
    seenParents.add(result.parent.parent_product_id);
    return true;
  });
  const alternatives = [
    ...distinct,
    ...relevant.filter((result) => !distinct.includes(result)),
  ].slice(0, MAX_ALTERNATIVES);

  const sizeAvailable = (candidate: ParentProduct, candidateColourway: Colourway) =>
    inventory
      .sizesInStock(candidate, candidateColourway.product_id)
      .includes(item.size);

  const reasonContext = {
    savedParent: parent,
    savedColourway: colourway,
    pincode,
    today: catalog.today,
  };

  return [
    {
      key: `saved-${colourway.product_id}`,
      parent,
      colourway,
      isSaved: true,
      sizeAvailable: sizeAvailable(parent, colourway),
      // The saved item needs no explanation for being here; it is the subject.
      reason: null,
    },
    ...alternatives.map((result) => ({
      key: `alt-${result.colourway.product_id}`,
      parent: result.parent,
      colourway: result.colourway,
      isSaved: false,
      sizeAvailable: sizeAvailable(result.parent, result.colourway),
      reason: reasonFor(result.parent, result.colourway, reasonContext),
    })),
  ];
}

export function CompareScreen({
  catalog,
  item,
  parent,
  colourway,
  query,
  pincode,
  inventory,
  onBack,
  onChoose,
  onPriority,
  onOpened,
  initialPriority = null,
  helpMeDecide = false,
  onHelpMeDecide,
  onKeepComparison,
}: CompareScreenProps) {
  const [priority, setPriority] = useState<ComparePriority | null>(initialPriority);
  const [decideOpen, setDecideOpen] = useState(false);

  const columns = useMemo(
    () => buildColumns(catalog, parent, colourway, item, query, inventory, pincode),
    [catalog, parent, colourway, item, query, inventory, pincode]
  );

  // Reordered, never filtered: hiding the rows a user did not prioritise would
  // decide for them which trade-offs are allowed to exist (improvement 4).
  // Reported once per set of columns, not once per render: the comparison is
  // persisted on open, and re-persisting on every keystroke would make
  // `comparison_persisted` count renders instead of comparisons.
  const productIds = useMemo(
    () => columns.map((column) => column.colourway.product_id),
    [columns]
  );
  useEffect(() => {
    onOpened?.(productIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productIds]);

  const axes = orderedAxes(priority);
  const isPrioritised = (axis: (typeof COMPARE_AXES)[number]["key"]) =>
    priority !== null && PRIORITY_AXES[priority].includes(axis);

  const valueFor = (column: CompareColumn, axis: (typeof COMPARE_AXES)[number]["key"]) => {
    const { colourway: cw } = column;
    switch (axis) {
      case "price":
        return formatPrice(cw.price);
      case "rating":
        // Fixed to one decimal: a column of 3.3 against 4 reads as a
        // formatting slip and makes the comparison harder than it needs to be.
        return `${cw.rating.toFixed(1)} ★`;
      case "review_count":
        return cw.review_count.toLocaleString("en-IN");
      case "material":
        return cw.material;
      case "fit":
        return cw.fit ?? "—";
      case "sizes":
        return column.sizeAvailable ? `${item.size} in stock` : `${item.size} unavailable`;
      case "delivery":
        return servesPincode(cw.seller, pincode)
          ? formatDelivery(deliveryDateFor(catalog.today, cw.product_id))
          : "Not deliverable";
      case "returns":
        return formatReturns(cw.returns_days);
      case "occasion":
        // Real dataset columns, so this row says nothing the data cannot back.
        return [cw.usage, cw.season].filter(Boolean).join(" · ") || "—";
      default:
        return "—";
    }
  };

  return (
    <View style={styles.screen} testID="compare-screen">
      {/* The shell's header bar carries the title and the back control for
          this route (`titleFor` in shell/TopBar). A second "← Back to
          results" here, under a chevron that already goes back, was two
          controls for one destination -- and the reason this screen used to
          show two back affordances stacked. */}
      <Text style={styles.note}>{COMPARE_SYNTHETIC_NOTE}</Text>

      <Text style={styles.priorityHeading}>What matters most for this purchase?</Text>
      <View style={styles.priorities}>
        {COMPARE_PRIORITIES.map((entry) => {
          const active = priority === entry.key;
          return (
            <Pressable
              key={entry.key}
              testID={`priority-${entry.key}`}
              accessibilityRole="button"
              accessibilityLabel={`Compare by ${entry.label}`}
              accessibilityState={{ selected: active }}
              onPress={() => {
                // Tapping the active one clears it, so the user can get back to
                // the unranked table without reloading the screen.
                const next = active ? null : entry.key;
                setPriority(next);
                onPriority?.(next);
              }}
              style={[styles.priority, active && styles.priorityActive]}
            >
              <Text style={[styles.priorityText, active && styles.priorityTextActive]}>
                {entry.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {helpMeDecide ? (
        <Pressable
          testID="help-me-decide"
          accessibilityRole="button"
          accessibilityLabel="Help me decide"
          onPress={() => {
            if (!priority) return;
            setDecideOpen(true);
            onHelpMeDecide?.();
          }}
          disabled={!priority}
          style={[styles.decide, !priority && styles.decideDisabled]}
        >
          <Text style={styles.decideText}>
            {priority ? "Help me decide" : "Pick what matters first"}
          </Text>
        </Pressable>
      ) : null}

      {columns.length === 1 ? (
        <View style={styles.singleColumnBanner} testID="compare-single-column-banner">
          <Text style={styles.singleColumnBannerText}>
            No other matching alternatives found in this category. Showing your saved item.
          </Text>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.table}>
        <View style={styles.axisColumn}>
          <View style={styles.headerCell} />
          {axes.map((axis) => (
            <View key={axis.key} style={styles.axisCell}>
              <Text style={styles.axisLabel}>{axis.label}</Text>
            </View>
          ))}
          <View style={styles.actionCell} />
        </View>

        {columns.map((column) => (
          <View
            key={column.key}
            style={[styles.column, column.isSaved && styles.columnSaved]}
            testID={column.isSaved ? "compare-column-saved" : "compare-column"}
          >
            <View style={styles.headerCell}>
              {column.isSaved ? (
                <Text style={styles.savedBadge}>{COMPARE_SAVED_LABEL}</Text>
              ) : (
                <View style={styles.savedBadgeSpacer} />
              )}
              <Image
                source={CATALOG_IMAGES[column.colourway.product_id]}
                style={styles.thumb}
                resizeMode="cover"
              />
              <Text style={styles.brand} numberOfLines={1}>
                {column.parent.brand.toUpperCase()}
              </Text>
              <Text style={styles.name} numberOfLines={2}>
                {column.colourway.display_name}
              </Text>
              <Text style={styles.colour}>{column.colourway.colour}</Text>
              {/* Improvement 4: the saved size and colour sit against every
                  alternative, so "does this come in what I saved" is answerable
                  without tracking back to the first column. */}
              <Text style={styles.against}>
                {column.isSaved
                  ? `Saved: ${item.colour} · ${item.size}`
                  : `vs ${item.colour} · ${item.size}`}
              </Text>
              {/* No reason line where the data supports no claim. A missing
                  explanation is a smaller problem than an invented one. */}
              {column.reason ? (
                <Text style={styles.reason} testID={`reason-${column.key}`}>
                  {REASON_COPY[column.reason]}
                </Text>
              ) : null}
            </View>

            {axes.map((axis) => (
              <View
                key={axis.key}
                style={[styles.cell, isPrioritised(axis.key) && styles.cellPrioritised]}
              >
                <Text style={styles.cellText}>{valueFor(column, axis.key)}</Text>
              </View>
            ))}

            <View style={styles.actionCell}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  column.isSaved
                    ? `Open your saved ${column.colourway.display_name}`
                    : `Open ${column.parent.brand} ${column.colourway.display_name}`
                }
                onPress={() => onChoose(column.colourway.product_id)}
                style={[styles.choose, column.isSaved ? styles.filled : styles.outlined]}
              >
                <Text style={column.isSaved ? styles.labelFilled : styles.labelOutlined}>
                  {column.isSaved ? "Open saved item" : "Open"}
                </Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* CR-01. The comparison is already persisted the moment it opens, so
          this button changes nothing -- which is exactly why it exists. The
          wireframes ask for it because a user who does not know their work
          survives leaving will not leave, and behaviour nobody can see is
          behaviour nobody relies on. */}
      {onKeepComparison ? (
        <Pressable
          testID="keep-comparison"
          accessibilityRole="button"
          accessibilityLabel={KEEP_COMPARISON}
          onPress={onKeepComparison}
          style={styles.keep}
        >
          <Text style={styles.keepText}>{KEEP_COMPARISON}</Text>
        </Pressable>
      ) : null}

      <Sheet
        open={decideOpen}
        title="What matters most for this purchase?"
        onClose={() => setDecideOpen(false)}
        testID="decide-sheet"
      >
        {priority ? <DecideBody columns={columns} priority={priority} valueFor={valueFor} /> : null}
      </Sheet>
    </View>
  );
}

/**
 * Improvement 5's answer, which deliberately does not answer.
 *
 * It restates what the table already says on the axes the user picked, side by
 * side, and names no winner. Any ranking here would be an opinion dressed as
 * arithmetic, built on five synthesised fields, handed to someone who asked
 * for help -- and the prompt rules it out in as many words.
 */
function DecideBody({
  columns,
  priority,
  valueFor,
}: {
  columns: CompareColumn[];
  priority: ComparePriority;
  valueFor: (column: CompareColumn, axis: (typeof COMPARE_AXES)[number]["key"]) => string;
}) {
  const decideColumns: DecideColumn[] = columns.map((column) => ({
    key: column.key,
    // Colour is part of the name here because buildColumns deliberately
    // backfills with other colourways of the same product -- two options
    // reading "Mark Taylor Striped Shirt" tell the user nothing, and React
    // saw the collision before a person did.
    label: column.isSaved
      ? COMPARE_SAVED_LABEL
      : `${column.parent.brand} ${column.colourway.display_name} · ${column.colourway.colour}`,
    isSaved: column.isSaved,
    values: Object.fromEntries(
      COMPARE_AXES.map((axis) => [axis.key, valueFor(column, axis.key)])
    ),
  }));
  const lines = tradeOffs(decideColumns, priority);

  return (
    <>
      {lines.map((line) => (
        <View key={line.axis} testID={`tradeoff-${line.axis}`}>
          <Text style={styles.tradeAxis}>
            {line.axisLabel}
            {line.undifferentiated ? " · the same for every option" : ""}
          </Text>
          {line.readings.map((reading) => (
            <Text key={reading.key} style={styles.tradeReading}>
              {reading.isSaved ? "★ " : "• "}
              {reading.label}: {reading.value}
            </Text>
          ))}
        </View>
      ))}
      <Text style={styles.tradeCaveat} testID="tradeoff-caveat">
        {tradeOffCaveat(priority, lines)}
      </Text>
    </>
  );
}

const COLUMN_WIDTH = 150;
const AXIS_WIDTH = 104;
const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 240;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  note: {
    ...type.chip,
    color: color.textSecondary,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  table: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  axisColumn: { width: AXIS_WIDTH },
  axisCell: { height: ROW_HEIGHT, justifyContent: "center" },
  axisLabel: { ...type.body, color: color.textSecondary },
  column: {
    width: COLUMN_WIDTH,
    borderLeftWidth: 1,
    borderLeftColor: color.borderSubtle,
    paddingLeft: space.sm,
  },
  columnSaved: { backgroundColor: color.surfaceMuted },
  headerCell: { height: HEADER_HEIGHT, justifyContent: "flex-end", paddingBottom: space.sm },
  savedBadge: {
    ...type.chip,
    color: color.brandPink,
    fontWeight: "700",
    marginBottom: space.xs,
  },
  savedBadgeSpacer: { height: 17, marginBottom: space.xs },
  thumb: { width: 96, height: 128, borderRadius: 6, backgroundColor: color.surfaceMuted },
  brand: { ...type.brand, fontSize: 12, color: color.textPrimary, marginTop: space.sm },
  name: { ...type.body, color: color.textSecondary },
  colour: { ...type.chip, color: color.textSecondary, marginTop: 2 },
  cell: { height: ROW_HEIGHT, justifyContent: "center" },
  // A tint rather than a reorder alone: once the rows move, the user needs to
  // see *which* ones moved and why, or the table just looks shuffled.
  cellPrioritised: { backgroundColor: "#FFF7F9" },
  priorityHeading: {
    ...type.body,
    fontWeight: "700",
    color: color.textPrimary,
    paddingHorizontal: space.lg,
    paddingBottom: space.xs,
  },
  priorities: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  priority: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderSubtle,
  },
  priorityActive: { borderColor: color.brandPink, borderWidth: 2 },
  priorityText: { ...type.body, color: color.textPrimary },
  priorityTextActive: { color: color.brandPink, fontWeight: "700" },
  decide: {
    minHeight: MIN_TOUCH_TARGET,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    borderRadius: radius.card - 8,
    borderWidth: 1,
    borderColor: color.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  decideDisabled: { opacity: 0.5 },
  keep: {
    minHeight: MIN_TOUCH_TARGET,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    alignItems: "center",
    justifyContent: "center",
  },
  keepText: { ...type.body, fontWeight: "700", color: color.textSecondary },
  decideText: { ...type.body, fontWeight: "700", color: color.textPrimary },
  reason: { ...type.chip, color: color.textSecondary, marginTop: 2 },
  against: { ...type.chip, color: color.textSecondary, marginTop: 2 },
  tradeAxis: { ...type.body, fontWeight: "700", color: color.textPrimary, marginTop: space.sm },
  tradeReading: { ...type.body, color: color.textSecondary, marginTop: 2 },
  tradeCaveat: {
    ...type.chip,
    color: color.textSecondary,
    marginTop: space.md,
    lineHeight: 16,
  },
  cellText: { ...type.body, color: color.textPrimary },
  actionCell: { height: 64, justifyContent: "center" },
  choose: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.card - 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: space.sm,
  },
  filled: { backgroundColor: color.brandPink, borderColor: color.brandPink },
  outlined: { backgroundColor: color.surface, borderColor: color.brandPink },
  labelFilled: { fontSize: 13, fontWeight: "700", color: color.surface },
  labelOutlined: { fontSize: 13, fontWeight: "700", color: color.brandPink },
  singleColumnBanner: {
    marginHorizontal: space.lg,
    marginBottom: space.md,
    padding: space.md,
    backgroundColor: color.surfaceMuted,
    borderRadius: radius.card - 8,
    borderWidth: 1,
    borderColor: color.borderSubtle,
  },
  singleColumnBannerText: {
    ...type.body,
    fontSize: 13,
    color: color.textSecondary,
    textAlign: "center",
  },
});
