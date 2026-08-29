import { formatAmount } from "./currency";

/**
 * Pricing copy for ordinary catalog browsing (home, search results, browse) --
 * distinct from @/copy/bundle, which is every string inside the wishlist
 * reconnection module and is held to C-1's no-monetary-incentive rule.
 * General catalog tiles are not the module: an MRP strikethrough and a
 * discount % here are ordinary catalog pricing, not the incentive C-1 bans.
 * Never import this into anything under src/components/WishlistModule or the
 * saved-product/compare screens -- those stay on @/copy/bundle's formatPrice.
 */
export function formatMrp(paise: number): string {
  return formatAmount(paise);
}

export function discountPercent(price: number, mrp: number): number {
  return Math.round((1 - price / mrp) * 100);
}
