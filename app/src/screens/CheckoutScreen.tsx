import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { formatPrice } from "@/copy/bundle";
import { color, radius, space, type } from "@/design/tokens";

/**
 * Checkout, from the design spec.
 *
 * Deliberately not a real payment flow, and it does not pretend to be one:
 * the method row is a static illustration, not three controls that look
 * selectable and do nothing. This shell's rule for an unbuilt surface is that
 * it must not imply a feature was tested, and three tappable-looking payment
 * options that all behave identically is exactly that implication.
 *
 * Placing the order is real, though, in the one sense that matters here: it
 * moves the bag into order history, and reconcile.ts keys the module's
 * "already bought" suppression off order history. So a purchase made here
 * changes what the wishlist module says afterwards, which is the behaviour
 * E14 is about.
 */

export interface CheckoutScreenProps {
  /** Null once the order is placed. */
  summary: { count: number; total: number } | null;
  placed: boolean;
  pincode: string;
  onPlaceOrder: () => void;
  onContinueShopping: () => void;
}

export function CheckoutScreen({
  summary,
  placed,
  pincode,
  onPlaceOrder,
  onContinueShopping,
}: CheckoutScreenProps) {
  if (placed) {
    return (
      <View style={styles.placed} testID="checkout-placed">
        <Text style={styles.tick}>✓</Text>
        <Text style={styles.placedTitle}>Order placed</Text>
        <Text style={styles.placedBody}>You'll get delivery updates on this order.</Text>
        <View style={styles.placedAction}>
          <Button
            label="Continue Shopping"
            filled
            grow={false}
            onPress={onContinueShopping}
            testID="continue-shopping"
          />
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="checkout-screen">
      <View style={styles.card}>
        <Text style={styles.cardLabel}>DELIVER TO</Text>
        <Text style={styles.cardBody}>Home · {pincode}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>PAYMENT METHOD</Text>
        <View style={styles.methodRow}>
          <View style={[styles.method, styles.methodActive]}>
            <Text style={styles.methodActiveText}>UPI</Text>
          </View>
          <View style={styles.method}>
            <Text style={styles.methodText}>Card</Text>
          </View>
          <View style={styles.method}>
            <Text style={styles.methodText}>COD</Text>
          </View>
        </View>
        <Text style={styles.note}>
          Illustration only — this prototype does not take a payment.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>ORDER SUMMARY</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            {summary?.count ?? 0} {summary?.count === 1 ? "item" : "items"}
          </Text>
          <Text style={styles.summaryText} testID="checkout-total">
            {formatPrice(summary?.total ?? 0)}
          </Text>
        </View>
      </View>

      <Button
        label="Place Order"
        filled
        onPress={onPlaceOrder}
        disabled={!summary || summary.count === 0}
        testID="place-order"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { padding: space.lg, gap: space.lg },
  card: {
    borderWidth: 1,
    borderColor: color.borderSubtle,
    borderRadius: radius.card,
    padding: 14,
  },
  cardLabel: { ...type.tileBrand, color: color.textSecondary },
  cardBody: { fontSize: 13, color: color.textPrimary, marginTop: 6 },
  methodRow: { flexDirection: "row", gap: space.sm, marginTop: 10 },
  method: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.borderSubtle,
    alignItems: "center",
  },
  methodActive: { borderWidth: 2, borderColor: color.brandPink },
  methodText: { ...type.body, color: color.textSecondary },
  methodActiveText: { ...type.body, fontWeight: "700", color: color.brandPink },
  note: { ...type.chip, fontWeight: "400", color: color.textSecondary, marginTop: 10 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: space.sm,
  },
  summaryText: { ...type.body, color: color.textPrimary },
  placed: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    padding: space.xl,
    backgroundColor: color.surface,
  },
  tick: { fontSize: 34, color: color.textPrimary },
  placedTitle: { ...type.moduleHeader, color: color.textPrimary },
  placedBody: { ...type.body, color: color.textSecondary, textAlign: "center" },
  placedAction: { marginTop: space.lg },
});
