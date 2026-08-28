import { DEFAULT_CONFIG, type MatchConfig, type Modality } from "./contract";

/**
 * Later-phase input modes (improvement 10).
 *
 * The prompt asks for voice, Ask-Maya, image and category/brand-page
 * reconnection as later-phase prototypes, each with a higher confidence
 * threshold and its own visible harness state, and each kept out of the
 * primary experiment. Three of those four are real here. One is not, and
 * saying which is the point of this file.
 */

export interface ModalityMode {
  modality: Modality;
  label: string;
  /** What the harness tells a researcher this state actually does. */
  note: string;
  /**
   * False where the mode is a labelled stand-in rather than the thing it
   * names. Surfaced in the UI, not just in a comment.
   */
  genuine: boolean;
  /** Out of the primary experiment, always. */
  outOfExperiment: true;
}

export const MODALITY_MODES: ModalityMode[] = [
  {
    modality: "voice",
    label: "Voice",
    note: "Real: the same exact matcher and rules parser, held to the higher voice threshold (C-8). The query is typed rather than spoken; nothing about the matching differs.",
    genuine: true,
    outOfExperiment: true,
  },
  {
    modality: "category",
    label: "Category / brand page",
    note: "Real: reconnection from a category or brand context rather than a typed query, at the category threshold.",
    genuine: true,
    outOfExperiment: true,
  },
  {
    modality: "recent",
    label: "Ask Maya",
    note: "Real: a natural-language question routed through the existing rules parser. No model is involved, and none is claimed.",
    genuine: true,
    outOfExperiment: true,
  },
  {
    modality: "image",
    label: "Image (not similarity search)",
    /**
     * The one that is not what its name suggests, said plainly.
     *
     * Visual similarity is Tier 4. Constraint C-5 excludes Tier 3 and 4 from
     * v1, and E15 is the single epic in the whole plan left deliberately
     * unbuilt for that reason. Building an embedding path here to satisfy a
     * later-phase checkbox would quietly undo the constraint the entire
     * precision story rests on -- and the resulting false positives are
     * exactly what C-4 says are worse than misses.
     *
     * So this state runs *exact* matching from a chosen seed product and says
     * so on screen. A stub that admits what it is beats a demo that implies a
     * capability the system does not have.
     */
    note: "NOT similarity search. Runs exact matching from a seed product at the image threshold. Visual similarity is Tier 4, which constraint C-5 excludes from v1.",
    genuine: false,
    outOfExperiment: true,
  },
];

/**
 * The threshold for a modality, which is already per-modality in the contract
 * (C-8). Reading it through here keeps the harness honest: the higher bar is a
 * real consequence of the mode, not a label on a chip.
 */
export function thresholdFor(
  modality: Modality,
  config: MatchConfig = DEFAULT_CONFIG
): number {
  return config.tau[modality] ?? config.tau.text;
}

export function modeFor(modality: Modality): ModalityMode | undefined {
  return MODALITY_MODES.find((mode) => mode.modality === modality);
}

/** Every later-phase mode is held to a stricter bar than plain text (C-8). */
export function isStricterThanText(
  modality: Modality,
  config: MatchConfig = DEFAULT_CONFIG
): boolean {
  return thresholdFor(modality, config) >= thresholdFor("text", config);
}
