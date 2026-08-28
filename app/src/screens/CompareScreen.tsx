import { useMemo } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  COMPARE_AXES,
  COMPARE_SAVED_LABEL,
  COMPARE_SYNTHETIC_NOTE,
  COMPARE_TITLE,
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
}

export interface CompareColumn {
  key: string;
  parent: ParentProduct;
  colourway: Colourway;
  isSaved: boolean;
  sizeAvailable: boolean;
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
  inventory: InventorySimulator
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

  return [
    {
      key: `saved-${colourway.product_id}`,
      parent,
      colourway,
      isSaved: true,
      sizeAvailable: sizeAvailable(parent, colourway),
    },
    ...alternatives.map((result) => ({
      key: `alt-${result.colourway.product_id}`,
      parent: result.parent,
      colourway: result.colourway,
      isSaved: false,
      sizeAvailable: sizeAvailable(result.parent, result.colourway),
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
}: CompareScreenProps) {
  const columns = useMemo(
    () => buildColumns(catalog, parent, colourway, item, query, inventory),
    [catalog, parent, colourway, item, query, inventory]
  );

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
      <Pressable
        testID="compare-back"
        accessibilityRole="button"
        accessibilityLabel="Back to search results"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        onPress={onBack}
        style={styles.back}
      >
        <Text style={styles.backText}>← Back to results</Text>
      </Pressable>

      <Text style={styles.title} accessibilityRole="header">
        {COMPARE_TITLE}
      </Text>
      <Text style={styles.note}>{COMPARE_SYNTHETIC_NOTE}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.table}>
        <View style={styles.axisColumn}>
          <View style={styles.headerCell} />
          {COMPARE_AXES.map((axis) => (
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
            </View>

            {COMPARE_AXES.map((axis) => (
              <View key={axis.key} style={styles.cell}>
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
    </View>
  );
}

const COLUMN_WIDTH = 150;
const AXIS_WIDTH = 104;
const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 240;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  back: { padding: space.lg, minHeight: MIN_TOUCH_TARGET, justifyContent: "center" },
  backText: { ...type.body, fontWeight: "700", color: color.textPrimary },
  title: { ...type.sectionHeader, color: color.textPrimary, paddingHorizontal: space.lg },
  note: {
    ...type.chip,
    color: color.textSecondary,
    paddingHorizontal: space.lg,
    paddingTop: space.xs,
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
});
