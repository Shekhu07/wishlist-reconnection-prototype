/**
 * Design tokens, matched to the predecessor prototype's visual system.
 *
 * These began as values transcribed from the Myntra screenshots (source doc
 * section 4.1) and are no longer only that, so the old claim that everything
 * here is transcribed has been removed rather than left standing over values
 * it no longer describes.
 *
 * The neutrals now match `tailwind.config.ts` in ~/Documents/Prototype_MVP,
 * whose look was preferred side by side. Worth stating plainly: this is a
 * preference, not a correction. The `#282C3F` this replaces **is** Myntra's
 * real text colour and their `#141414` is a simplification of it, so the app
 * is now a shade further from the screenshots and closer to the prototype.
 *
 * `brandPink` needed no change -- both palettes already agreed on it.
 */

export const color = {
  brandPink: "#FF3F6C",
  textPrimary: "#141414",
  textSecondary: "#5C5C5C",
  borderSubtle: "#E9E9E9",
  surface: "#FFFFFF",
  surfaceMuted: "#F4F4F4",
  /**
   * The ground a list of cards sits on, so their elevation has something to
   * read against. White cards on a white page are just ruled boxes.
   */
  pageGround: "#FAFAFA",
  /**
   * Their `faint`, and deliberately not used for text.
   *
   * At roughly 2.8:1 on white it is below the 4.5:1 that WCAG AA asks of small
   * text, and C-7 makes contrast a launch gate rather than a preference. It is
   * recorded because the source palette has it; anything carrying meaning uses
   * `textSecondary` (about 7:1) instead.
   */
  faintDecorative: "#949494",
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

/**
 * Elevation.
 *
 * The design spec draws cards as surfaces that sit *on* a page rather than
 * boxes ruled onto it, and until now this file had no way to say that: every
 * surface in the app was a 1px hairline on white, which is why the chrome read
 * as a wireframe next to the same screens in the predecessor prototype.
 *
 * Two levels and no more. `card` is the resting state of anything in a list;
 * `float` is for something that has left the page -- a sheet, a drawer, the
 * harness pill. A third level invites a hierarchy nobody can perceive.
 *
 * Spelled with the React Native shadow props rather than a web `boxShadow`
 * string: react-native-web compiles these to `box-shadow`, and native keeps
 * working. `elevation` is Android's separate channel for the same thing.
 */
export const elevation = {
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  float: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
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
  /**
   * The half-point sizes come from the predecessor prototype, which sets them
   * per-use as Tailwind arbitrary values (`text-[13.5px]`, `text-[12.5px]`,
   * `text-[11.5px]`). Named here instead of scattered, so the scale stays one
   * decision rather than forty.
   */
  brand: { fontSize: 13.5, fontWeight: "700", letterSpacing: 0.4 },
  body: { fontSize: 12.5, fontWeight: "400" },
  chip: { fontSize: 11.5, fontWeight: "500" },
  /**
   * The design spec's tile scale, one step down from the screenshot values
   * above: a two-column grid of 12/700 brand over 11/400 name reads denser
   * than 14/12 without losing the hierarchy. Kept as its own entry rather
   * than editing `brand` and `body`, which the module and the compare screen
   * are built on and the spec does not change.
   */
  tileBrand: { fontSize: 12.5, fontWeight: "700", letterSpacing: 0.3 },
  tileName: { fontSize: 11.5, fontWeight: "400" },
  tilePrice: { fontSize: 12.5, fontWeight: "700" },
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

export const FRAME_MAX_WIDTH = 420;

