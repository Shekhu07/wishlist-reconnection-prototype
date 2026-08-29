/**
 * How a rupee amount is written, in one place.
 *
 * `copy/bundle.ts` and `copy/catalog.ts` both render prices and are
 * deliberately kept apart -- catalog.ts carries MRP strikethrough and discount
 * percentages, which C-1 forbids anywhere near a saved item, and the import
 * boundary between them is what enforces that. But the *number format* is not
 * a C-1 concern, and having each file spell it out separately is how the two
 * drift into rendering the same price two ways.
 *
 * The prefix matches the predecessor prototype, which writes `Rs. 2,199`
 * throughout rather than the glyph.
 */
export function formatAmount(paise: number): string {
  return `Rs. ${paise.toLocaleString("en-IN")}`;
}
