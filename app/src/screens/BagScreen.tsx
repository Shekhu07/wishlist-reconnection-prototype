import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import type { BagLine, CommerceState } from "@/commerce/reconcile";
import { CATALOG_IMAGES } from "@/data/images";
import type { Catalog } from "@/data/types";
import { color, space, type } from "@/design/tokens";
import { formatPrice } from "@/copy/bundle";
import { Button } from "@/components/Button";

export interface BagScreenProps {
  catalog: Catalog;
  commerce: CommerceState;
  /** Absent leaves the bag read-only, which is what it was before checkout. */
  onCheckout?: () => void;
}

/** Line prices summed from the catalog, never from a stored total. */
export function bagTotal(catalog: Catalog, commerce: CommerceState): number {
  let total = 0;
  for (const line of commerce.bag.items) {
    const parent = catalog.parents.find(
      (p) => p.parent_product_id === line.parent_product_id
    );
    const colourway = parent?.colourways.find((c) =>
      c.skus.some((s) => s.sku === line.sku)
    );
    if (colourway) total += colourway.price * line.quantity;
  }
  return total;
}

/**
 * The bag, read through commerce/reconcile.ts's Bag/BagLine shape -- the same
 * object the bottom-nav badge counts -- so what the badge says and what this
 * screen lists can never disagree.
 *
 * BagLine has no product_id (unlike WishlistItem), so the image comes back by
 * matching the sku inside the parent's colourways, the same shape of lookup
 * revalidate.ts uses to resolve a wishlist item's colourway.
 */
export function BagScreen({ catalog, commerce, onCheckout }: BagScreenProps) {
  const { items } = commerce.bag;

  if (items.length === 0) {
    return (
      <View style={styles.empty} testID="bag-screen">
        <Text style={styles.emptyText}>Your bag is empty</Text>
      </View>
    );
  }

  const total = bagTotal(catalog, commerce);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="bag-screen">
      {items.map((line) => (
        <BagRow key={line.sku} line={line} catalog={catalog} />
      ))}

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue} testID="bag-total">
          {formatPrice(total)}
        </Text>
      </View>

      {onCheckout ? (
        <Button label="Proceed to Checkout" filled onPress={onCheckout} testID="go-checkout" />
      ) : null}
    </ScrollView>
  );
}

function BagRow({ line, catalog }: { line: BagLine; catalog: Catalog }) {
  const parent = catalog.parents.find((p) => p.parent_product_id === line.parent_product_id);
  const colourway = parent?.colourways.find((c) => c.skus.some((s) => s.sku === line.sku));

  return (
    <View style={styles.row} testID={`bag-line-${line.sku}`}>
      {colourway ? (
        <Image
          source={CATALOG_IMAGES[colourway.product_id]}
          style={styles.image}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.image} />
      )}
      <View style={styles.details}>
        <Text style={styles.brand} numberOfLines={1}>
          {(parent?.brand ?? "").toUpperCase()}
        </Text>
        <Text style={styles.name} numberOfLines={1}>
          {colourway?.display_name ?? line.colour}
        </Text>
        <Text style={styles.meta}>
          {line.colour} · {line.size} · Qty {line.quantity}
        </Text>
        {colourway ? <Text style={styles.price}>{formatPrice(colourway.price)}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { padding: space.lg, gap: space.md },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.surface },
  emptyText: { ...type.body, color: color.textSecondary },
  row: {
    flexDirection: "row",
    gap: space.md,
    marginBottom: space.md,
  },
  image: {
    width: 88,
    height: 112,
    borderRadius: 8,
    backgroundColor: color.surfaceMuted,
  },
  details: { flex: 1, justifyContent: "center", gap: 2 },
  brand: { ...type.brand, color: color.textPrimary },
  name: { ...type.body, color: color.textSecondary },
  meta: { ...type.chip, color: color.textSecondary },
  price: { ...type.body, fontWeight: "700", color: color.textPrimary, marginTop: space.xs },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: color.borderSubtle,
    paddingTop: 14,
  },
  totalLabel: { fontSize: 13, color: color.textSecondary },
  totalValue: { ...type.railHeader, color: color.textPrimary },
});
