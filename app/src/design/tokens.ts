/**
 * Design tokens observed in the Myntra screenshots (source doc section 4.1).
 *
 * These are transcribed values, not invented ones. When the module needs a
 * colour that is not in this table, that is a signal to check the screenshots
 * rather than to add a shade here.
 */

export const color = {
  brandPink: "#FF3F6C",
  textPrimary: "#282C3F",
  textSecondary: "#7E818C",
  borderSubtle: "#EAEAEC",
  surface: "#FFFFFF",
  surfaceMuted: "#F5F5F6",
  /**
   * Present in the screenshots on the "Ask Maya" strip. Recorded so nobody
   * re-derives it, and deliberately NOT used by the module: tinting the module
   * this way would read as an AI recommendation rather than the user's own
   * saved item (source doc section 4.2).
   */
  accentAssistant: "#7C5CFF",
  accentAssistantSurface: "#F0EDFF",
} as const;

export const radius = {
  card: 12,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

/** 20/700 section header - 14/700 brand caps - 12/400 caption. */
export const type = {
  sectionHeader: { fontSize: 20, fontWeight: "700" },
  moduleHeader: { fontSize: 16, fontWeight: "700" },
  brand: { fontSize: 14, fontWeight: "700", letterSpacing: 0.4 },
  body: { fontSize: 12, fontWeight: "400" },
  chip: { fontSize: 11, fontWeight: "500" },
} as const;

/** Minimum touch target. A launch gate, not a preference (constraint C-7). */
export const MIN_TOUCH_TARGET = 44;

/** Saved-item thumbnail in the single-match card (source doc section 4.3). */
export const CARD_IMAGE = { width: 96, height: 128 } as const;

/** Carousel card width, reused from the "Continue browsing these brands" row. */
export const CAROUSEL_CARD_WIDTH = 156;
