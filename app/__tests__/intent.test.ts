import { buildGazetteers, parseIntent } from "@/match/intent";

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
});
