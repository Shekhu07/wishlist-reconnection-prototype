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
  /** Product imagery, per the ProductTile spec. */
  tile: 6,
  /** Banner and section cards on the home screen. */
  banner: 14,
  /** The bottom sheet's top corners. */
  sheet: 16,
} as const;

/**
 * Surfaces the design spec introduces that the screenshot palette had no name
 * for. Kept apart from `color` above so the transcribed values stay
 * transcribed: these come from `Myntra MVP.dc.html`, not from the app.
 */
export const spec = {
  brandPinkDark: "#E8305D",
  logoGradientFrom: "#FF3F6C",
  logoGradientTo: "#FF9A3F",
  saleSurfaceFrom: "#FFF2F6",
  bannerPink: "#FFE1E9",
  bannerViolet: "#E7E4FF",
  bannerNeutral: "#EFEFEF",
  /** The recovery card on the product screen. */
  recoveryBorder: "#F0DFC0",
  recoverySurface: "#FFF6E5",
  recoveryText: "#7A5A1E",
  /** Confidence-signal glyph colours. */
  signalOk: "#1B7A55",
  signalAttention: "#7A5A1E",
  signalBlocked: "#B3261E",
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
  /**
   * The design spec's tile scale, one step down from the screenshot values
   * above: a two-column grid of 12/700 brand over 11/400 name reads denser
   * than 14/12 without losing the hierarchy. Kept as its own entry rather
   * than editing `brand` and `body`, which the module and the compare screen
   * are built on and the spec does not change.
   */
  tileBrand: { fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  tileName: { fontSize: 11, fontWeight: "400" },
  tilePrice: { fontSize: 12, fontWeight: "700" },
  /** "Shop by Brand", "Trending Now". */
  railHeader: { fontSize: 15, fontWeight: "700" },
  /** The SEE ALL affordance beside a rail header. */
  railAction: { fontSize: 11, fontWeight: "700" },
} as const;

/** Minimum touch target. A launch gate, not a preference (constraint C-7). */
export const MIN_TOUCH_TARGET = 44;

/** Saved-item thumbnail in the single-match card (source doc section 4.3). */
export const CARD_IMAGE = { width: 96, height: 128 } as const;

/** Carousel card width, reused from the "Continue browsing these brands" row. */
export const CAROUSEL_CARD_WIDTH = 156;

/**
 * The phone frame the prototype renders inside on a desktop browser. Anything
 * that spans the window rather than the frame reads as belonging to the
 * browser instead of to the app.
 */
export const FRAME_MAX_WIDTH = 480;
