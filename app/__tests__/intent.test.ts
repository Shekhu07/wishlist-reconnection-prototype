import { buildGazetteers, parseIntent } from "@/match/intent";
import catalogJson from "@/data/catalog.json";
import type { Catalog } from "@/data/types";

const catalog = catalogJson as unknown as Catalog;

const parents = [
  {
    brand: "Peter England",
    articleType: "Shirts",
    colourways: [{ colour: "Navy Blue" }, { colour: "Blue" }],
  },
  { brand: "Puma", articleType: "Tshirts", colourways: [{ colour: "Black" }] },
];

const gaz = buildGazetteers(parents as never);

describe("query intent extraction (E2)", () => {
  it("extracts a multi-word brand without losing its tail", () => {
    const intent = parseIntent("peter england shirt", "text", gaz);
    expect(intent.brand?.value).toBe("Peter England");
    expect(intent.articleType?.value).toBe("Shirts");
    expect(intent.residual).toEqual([]);
  });

  it("prefers the longest colour span so navy blue never becomes blue", () => {
    const intent = parseIntent("navy blue shirt", "text", gaz);
    expect(intent.colour?.value).toBe("Navy Blue");
  });

  it("matches t-shirt, tshirt and t shirt to one article type", () => {
    for (const query of ["t-shirt", "tshirt", "t shirt"]) {
      expect(parseIntent(query, "text", gaz).articleType?.value).toBe("Tshirts");
    }
  });

  it("leaves unparsed fields unconstrained rather than guessing", () => {
    const intent = parseIntent("something entirely unknown", "text", gaz);
    expect(intent.brand).toBeUndefined();
    expect(intent.articleType).toBeUndefined();
    expect(intent.colour).toBeUndefined();
    expect(intent.residual.length).toBeGreaterThan(0);
  });

  it("carries the modality through so thresholds can key on it (C-8)", () => {
    expect(parseIntent("shirt", "voice", gaz).modality).toBe("voice");
  });

  it("claims a multi-word article type by its head noun", () => {
    const gaz = buildGazetteers(catalog.parents);
    const intent = parseIntent("nike perfume", "text", gaz);
    expect(intent.articleType?.value).toBe("Perfume and Body Mist");
  });

  // The live catalog has no "Lip Gloss" product (its Beauty article types are
  // only Lipstick, Nail Polish and Perfume and Body Mist), so the guard can't
  // be exercised against catalog.parents. This synthetic gazetteer puts a
  // short exact type ("Perfume") alongside the four-token type whose head is
  // the same word, so a false pass (head noun winning) is actually possible
  // to observe.
  it("does not let a head noun shadow an exact article type that owns the term", () => {
    const synthetic = [
      { brand: "Sample", articleType: "Perfume", colourways: [{ colour: "Clear" }] },
      {
        brand: "Sample",
        articleType: "Perfume and Body Mist",
        colourways: [{ colour: "Clear" }],
      },
    ];
    const gaz = buildGazetteers(synthetic as never);
    const intent = parseIntent("perfume", "text", gaz);
    expect(intent.articleType?.value).toBe("Perfume");
  });
});
