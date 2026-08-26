"""Step 2: derive the fields the dataset does not ship.

The dataset has no `brand` column -- brand lives inside productDisplayName, as
the token span before the first gender token ("United Colors of Benetton Kids
Girls Washed Blue Skirt" -> "United Colors of Benetton"). Names with no gender
token fall back to a gazetteer bootstrapped from the names that did parse; what
still fails is reported and dropped rather than guessed (constraint C-4).

Step 3 lives here too: where a colour word in the display name contradicts
baseColour, identity_confidence drops. Those rows are kept deliberately -- they
are the mislabelled-listing case that E1's identity_confidence exists for.
"""

import re
import unicodedata
from collections import Counter

GENDER_TOKENS = {
    "men", "men's", "mens", "man",
    "women", "women's", "womens", "woman",
    "boys", "boy's", "boys'", "boy",
    "girls", "girl's", "girls'", "girl",
    "unisex", "kids", "kid's", "kids'", "children",
}

# The dataset's baseColour vocabulary, lowercased. Multi-word entries are
# matched first so "Navy Blue" never degrades into a bare "Blue" hit.
COLOUR_WORDS = [
    "navy blue", "off white", "light green", "sea green", "lime green",
    "mushroom brown", "rose gold", "fluorescent green", "nude", "coffee brown",
    "burgundy", "turquoise blue", "steel", "charcoal", "khaki", "maroon",
    "magenta", "lavender", "mustard", "olive", "beige", "bronze", "copper",
    "silver", "golden", "gold", "peach", "coral", "teal", "taupe", "rust",
    "cream", "tan", "black", "white", "grey", "gray", "blue", "green", "red",
    "yellow", "purple", "pink", "orange", "brown", "multi",
]

_PUNCT = re.compile(r"[^a-z0-9 ]+")
_WS = re.compile(r"\s+")
_STOPWORDS = {"and", "the", "of", "co", "company"}


def normalise(text):
    """Fold case, accents and punctuation so brand spellings collapse."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = _PUNCT.sub(" ", text.lower())
    return _WS.sub(" ", text).strip()


def brand_key(brand):
    """`Gini and Jony` and `Gini Jony` must resolve to the same key."""
    tokens = [t for t in normalise(brand).split() if t not in _STOPWORDS]
    return "".join(tokens)


def split_on_gender(name):
    """Return (brand, remainder) or (None, None) if no gender token is present."""
    tokens = name.split()
    for i, tok in enumerate(tokens):
        if normalise(tok) in GENDER_TOKENS:
            if i == 0:
                return None, None  # name starts with the gender word: no brand
            return " ".join(tokens[:i]), " ".join(tokens[i + 1:])
    return None, None


def build_gazetteer(rows, min_count=3):
    """Brands seen often enough via the gender rule become a lookup for the rest."""
    counts = Counter()
    for row in rows:
        brand, _ = split_on_gender(row.get("productDisplayName") or "")
        if brand:
            counts[brand] += 1
    return {brand_key(b): b for b, n in counts.items() if n >= min_count}


def brand_from_gazetteer(name, gazetteer):
    """Longest leading token run that matches a known brand key."""
    tokens = name.split()
    for span in range(min(5, len(tokens)), 0, -1):
        candidate = " ".join(tokens[:span])
        key = brand_key(candidate)
        if key and key in gazetteer:
            return gazetteer[key]
    return None


def colours_in(name):
    """Colour words present in a display name, longest match first."""
    haystack = " %s " % normalise(name)
    found = []
    for colour in COLOUR_WORDS:
        if " %s " % colour in haystack:
            if not any(colour in seen for seen in found):
                found.append(colour)
            haystack = haystack.replace(" %s " % colour, " ")
    return found


def identity_confidence(row):
    """Lower confidence where the display name disagrees with the structured data.

    Returns (score, list of reasons). A score below 0.8 must never render as
    "the same product" (source doc 4.3).
    """
    reasons = []
    score = 1.0
    name = row.get("productDisplayName") or ""
    base = normalise(row.get("baseColour") or "")

    named = colours_in(name)
    if base and named and not any(base == c or base in c or c in base for c in named):
        score -= 0.35
        reasons.append("colour_conflict:%s!=%s" % (base, "/".join(named)))
    if not base:
        score -= 0.15
        reasons.append("missing_base_colour")
    if not (row.get("articleType") or "").strip():
        score -= 0.2
        reasons.append("missing_article_type")
    return round(max(score, 0.0), 2), reasons


def _singular(token):
    """Crude but adequate: the dataset pluralises inconsistently."""
    if len(token) > 3 and token.endswith("es"):
        return token[:-2]
    if len(token) > 2 and token.endswith("s"):
        return token[:-1]
    return token


# The dataset spells the same garment several ways in the same table.
_ARTICLE_SYNONYMS = (
    (re.compile(r"\bt\s*-?\s*shirt"), "tshirt"),
    (re.compile(r"\bnight\s+suit"), "nightsuit"),
    (re.compile(r"\bflip\s+flop"), "flipflop"),
    (re.compile(r"\btrack\s+pant"), "trackpant"),
)


def _collapse_article_words(text):
    for pattern, replacement in _ARTICLE_SYNONYMS:
        text = pattern.sub(replacement, text)
    return text


def name_core(row, brand):
    """The descriptive remainder: name minus brand, gender, colour and garment.

    This is what makes two colourways of one style resolve to the same parent.
    An empty core is normal and useful -- it is how "Puma Men Grey T-shirt" and
    "Puma Men Black T-shirt" land on the same parent product -- but it also
    means the parent is generic, which synthesize.py records as low specificity
    so the matcher can hold generic parents to a higher bar.
    """
    name = row.get("productDisplayName") or ""
    _, remainder = split_on_gender(name)
    if remainder is None:
        remainder = name[len(brand):] if brand and name.startswith(brand) else name

    remainder = _collapse_article_words(normalise(remainder))
    drop = set()
    for colour in colours_in(remainder):
        drop.update(colour.split())
    drop.update(normalise(row.get("baseColour") or "").split())
    drop.update(_collapse_article_words(normalise(row.get("articleType") or "")).split())
    drop.update(_collapse_article_words(normalise(row.get("subCategory") or "")).split())
    drop = {_singular(t) for t in drop}

    core = [t for t in remainder.split() if _singular(t) not in drop]
    return " ".join(core)


def canonical_spellings(rows_with_brand):
    """One display spelling per brand, chosen by frequency.

    The dataset spells the same brand several ways -- ADIDAS and Adidas, Red
    Tape and Redtape, four variants of Gini and Jony. brand_key already folds
    them for matching, but the *display* string was whichever row happened to
    create the parent, so the same brand rendered two different ways on screen.
    Frequency picks the house spelling; the alphabetical tie-break keeps the
    choice stable across runs.
    """
    counts = {}
    for key, brand in rows_with_brand:
        counts.setdefault(key, Counter())[brand] += 1
    return {
        key: sorted(tally.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
        for key, tally in counts.items()
    }


def derive(rows):
    """Attach brand, brand_key, name_core and identity_confidence to every row.

    Returns (kept, dropped). Dropped rows had no recoverable brand.
    """
    gazetteer = build_gazetteer(rows)
    kept, dropped = [], []
    for row in rows:
        name = row.get("productDisplayName") or ""
        brand, _ = split_on_gender(name)
        source = "gender_token"
        if not brand:
            brand = brand_from_gazetteer(name, gazetteer)
            source = "gazetteer"
        if not brand:
            dropped.append(row)
            continue
        out = dict(row)
        out["brand"] = brand.strip()
        out["brand_key"] = brand_key(brand)
        out["brand_source"] = source
        out["name_core"] = name_core(row, brand)
        out["identity_confidence"], out["identity_flags"] = identity_confidence(row)
        kept.append(out)

    canonical = canonical_spellings((r["brand_key"], r["brand"]) for r in kept)
    for row in kept:
        row["brand"] = canonical[row["brand_key"]]
    return kept, dropped
