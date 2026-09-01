import type { Modality, SearchFilters } from "./contract";

/**
 * E2: rules-based query intent extraction. No model, no embeddings.
 *
 * The gazetteers are built from the catalog itself at load time, so the parser
 * can never claim a brand or colour the catalog does not contain. Fields it
 * cannot parse degrade to "unconstrained" -- never to a guess (source doc 2.2).
 */

export interface IntentField<T> {
  value: T;
  confidence: number;
}

export interface SearchIntent {
  raw: string;
  tokens: string[];
  modality: Modality;
  brand?: IntentField<string>;
  articleType?: IntentField<string>;
  colour?: IntentField<string>;
  gender?: IntentField<string>;
  /** Terms left over after the structured fields were claimed. */
  residual: string[];
}

export interface Gazetteers {
  /** normalised brand key -> canonical brand name */
  brands: Map<string, string>;
  /** normalised article term -> canonical articleType */
  articleTypes: Map<string, string>;
  colours: Map<string, string>;
  genders: Map<string, string>;
}

const GENDER_TERMS: Record<string, string> = {
  men: "Men",
  mens: "Men",
  man: "Men",
  male: "Men",
  women: "Women",
  womens: "Women",
  woman: "Women",
  female: "Women",
  boys: "Boys",
  girls: "Girls",
  unisex: "Unisex",
  kids: "Boys",
};

const FASHION_SYNONYMS: Record<string, string> = {
  denim: "Jeans",
  denims: "Jeans",
  tee: "Tshirts",
  tees: "Tshirts",
  jewelry: "Earrings",
  jewellery: "Earrings",
  flats: "Heels",
  flat: "Heels",
  sandals: "Heels",
  sandal: "Heels",
  wedges: "Heels",
  wedge: "Heels",
  sneakers: "Casual Shoes",
  sneaker: "Casual Shoes",
  boots: "Casual Shoes",
  boot: "Casual Shoes",
  loafers: "Casual Shoes",
  loafer: "Casual Shoes",
  purse: "Handbags",
  purses: "Handbags",
  shades: "Sunglasses",
};

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singularize(word: string): string {
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (
    word.endsWith("ches") ||
    word.endsWith("shes") ||
    word.endsWith("sses") ||
    word.endsWith("xes") ||
    word.endsWith("zes")
  ) {
    return word.slice(0, -2);
  }
  if (word.endsWith("es") && !word.endsWith("shoes") && !word.endsWith("eyes")) {
    return word.slice(0, -2);
  }
  if (word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * "T-shirt", "tshirts" and "t shirt" must all reach the same articleType.
 *
 * Multi-word types need their head/trailing nouns too (e.g. "casual shoes" -> "shoes", "shoe").
 * claimSpan reads spans of at most three tokens.
 */
function articleVariants(articleType: string): string[] {
  const base = normalise(articleType);
  const collapsed = base.replace(/\s+/g, "");
  const singular = singularize(base);
  const singularCollapsed = singularize(collapsed);
  const variants = [base, collapsed, singular, singularCollapsed];

  const words = base.split(" ");
  if (words.length > 1) {
    const lastWord = words[words.length - 1];
    const lastSingular = singularize(lastWord);
    variants.push(lastWord, lastSingular);
    const firstWord = words[0];
    const firstSingular = singularize(firstWord);
    variants.push(firstWord, firstSingular);
  }
  return Array.from(new Set(variants.filter((v) => v.length > 1)));
}

export function buildGazetteers(
  parents: {
    brand: string;
    articleType: string;
    colourways: { colour: string }[];
    subCategory?: string;
    masterCategory?: string;
  }[]
): Gazetteers {
  const brands = new Map<string, string>();
  const articleTypes = new Map<string, string>();
  const colours = new Map<string, string>();
  const genders = new Map<string, string>();

  for (const [term, canonical] of Object.entries(GENDER_TERMS)) {
    genders.set(term, canonical);
  }
  const headTerms: Array<[string, string]> = [];
  for (const parent of parents) {
    brands.set(normalise(parent.brand).replace(/\s+/g, ""), parent.brand);
    const base = normalise(parent.articleType);
    const words = base.split(" ");
    for (const variant of articleVariants(parent.articleType)) {
      // Sub-terms (head or trailing words) are fallbacks, applied only after
      // every exact variant is in. "Gloss" must not shadow "Lip Gloss".
      if (words.length > 1 && (variant === words[0] || variant === words[words.length - 1] || variant === singularize(words[0]) || variant === singularize(words[words.length - 1]))) {
        headTerms.push([variant, parent.articleType]);
        continue;
      }
      articleTypes.set(variant, parent.articleType);
    }
    if (parent.subCategory) {
      for (const variant of articleVariants(parent.subCategory)) {
        headTerms.push([variant, parent.articleType]);
      }
    }
    if (parent.masterCategory) {
      for (const variant of articleVariants(parent.masterCategory)) {
        headTerms.push([variant, parent.articleType]);
      }
    }
    for (const colourway of parent.colourways) {
      colours.set(normalise(colourway.colour), colourway.colour);
    }
  }
  for (const [term, canonical] of headTerms) {
    if (!articleTypes.has(term)) articleTypes.set(term, canonical);
  }
  for (const [synonym, canonical] of Object.entries(FASHION_SYNONYMS)) {
    if (!articleTypes.has(synonym)) articleTypes.set(synonym, canonical);
  }
  return { brands, articleTypes, colours, genders };
}

/** Longest-span match so "navy blue" never degrades to "blue". */
function claimSpan<T>(
  tokens: string[],
  claimed: boolean[],
  lookup: Map<string, T>,
  maxSpan: number,
  collapseSpaces = false
): { value: T; span: number } | undefined {
  for (let span = Math.min(maxSpan, tokens.length); span >= 1; span -= 1) {
    for (let start = 0; start + span <= tokens.length; start += 1) {
      if (claimed.slice(start, start + span).some(Boolean)) continue;
      const phrase = tokens.slice(start, start + span).join(" ");
      const key = collapseSpaces ? phrase.replace(/\s+/g, "") : phrase;
      const hit = lookup.get(key) ?? (collapseSpaces ? undefined : lookup.get(phrase.replace(/\s+/g, "")));
      if (hit !== undefined) {
        for (let i = start; i < start + span; i += 1) claimed[i] = true;
        return { value: hit, span };
      }
    }
  }
  return undefined;
}

export function parseIntent(
  query: string,
  modality: Modality,
  gaz: Gazetteers
): SearchIntent {
  const tokens = normalise(query).split(" ").filter(Boolean);
  const claimed = tokens.map(() => false);

  // Order matters: multi-word brands are claimed before article types, so
  // "Peter England shirt" does not lose "England" to a colour or noise term.
  const brand = claimSpan(tokens, claimed, gaz.brands, 4, true);
  const articleType = claimSpan(tokens, claimed, gaz.articleTypes, 3);
  const colour = claimSpan(tokens, claimed, gaz.colours, 2);
  const gender = claimSpan(tokens, claimed, gaz.genders, 1);

  // A longer matched span is stronger evidence than a single ambiguous token.
  const confidenceFor = (span: number) => Math.min(0.6 + 0.2 * span, 1);

  return {
    raw: query,
    tokens,
    modality,
    brand: brand && { value: brand.value, confidence: confidenceFor(brand.span) },
    articleType:
      articleType && {
        value: articleType.value,
        confidence: confidenceFor(articleType.span),
      },
    colour: colour && { value: colour.value, confidence: confidenceFor(colour.span) },
    gender: gender && { value: gender.value, confidence: confidenceFor(gender.span) },
    residual: tokens.filter((_, i) => !claimed[i]),
  };
}

/**
 * FR-9: explicit filters are hard predicates, so they merge into the intent as
 * constraints rather than as scoring hints.
 */
export function mergeFilters(intent: SearchIntent, filters: SearchFilters): SearchFilters {
  const merged: SearchFilters = { ...filters };
  if (intent.brand && !merged.brand) merged.brand = [intent.brand.value];
  if (intent.articleType && !merged.articleType) {
    merged.articleType = [intent.articleType.value];
  }
  if (intent.gender && !merged.gender) merged.gender = [intent.gender.value];
  return merged;
}
