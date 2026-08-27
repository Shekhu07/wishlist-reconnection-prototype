"""Step 4: pick the demo catalog, and guarantee every state has a real fixture.

Selection is deliberate, not random. The ten states in section 4.6 of the source
doc each need a product that can actually produce them, so this module picks
those first, by role, and only then fills the search grid out with plausible
neighbours.

Everything is sorted before it is sliced, so two runs on two machines produce
the same catalog.
"""

from collections import OrderedDict

# Query families the prototype ships with. Each is an article type the dataset
# has plenty of, in a size-bearing category so variant states are meaningful.
QUERY_FAMILIES = OrderedDict(
    [
        ("shirt", {"articleTypes": ["Shirts"], "gender": "Men"}),
        ("tshirt", {"articleTypes": ["Tshirts"], "gender": "Men"}),
        ("jeans", {"articleTypes": ["Jeans"], "gender": "Men"}),
        ("kurta", {"articleTypes": ["Kurtas"], "gender": "Women"}),
        ("casual shoes", {"articleTypes": ["Casual Shoes"], "gender": "Men"}),
        ("heels", {"articleTypes": ["Heels"], "gender": "Women"}),
        ("handbag", {"articleTypes": ["Handbags"], "gender": "Women"}),
        ("track pants", {"articleTypes": ["Track Pants"], "gender": "Men"}),
    ]
)

PARENTS_PER_FAMILY = 4
FILLER_PER_FAMILY = 9

# A generic parent ("plain men's shirt") can absorb hundreds of rows. Every
# colourway kept costs one 384x512 image on disk, so parents are trimmed to a
# handful of distinct colours -- more than enough to exercise Tier 2, and it
# keeps the committed image set around 300 files.
COLOURS_PER_WISHLISTED_PARENT = 6
COLOURS_PER_FILLER_PARENT = 2


def trim_colourways(parent, limit):
    """One colourway per distinct colour, best identity confidence wins."""
    by_colour = {}
    for colourway in parent["colourways"]:
        key = colourway["colour"].lower()
        current = by_colour.get(key)
        if current is None or (
            colourway["identity_confidence"],
            -colourway["product_id"],
        ) > (current["identity_confidence"], -current["product_id"]):
            by_colour[key] = colourway
    ordered = sorted(
        by_colour.values(),
        key=lambda c: (-c["identity_confidence"], c["product_id"]),
    )[:limit]
    trimmed = dict(parent)
    trimmed["colourways"] = ordered
    return trimmed



def _candidates(parents, spec, min_colourways=1):
    out = [
        p
        for p in parents.values()
        if p.get("articleType") in spec["articleTypes"]
        and p.get("gender") == spec["gender"]
        and len(p["colourways"]) >= min_colourways
        and p["sizes"] != ["Onesize"]
        or (
            p.get("articleType") in spec["articleTypes"]
            and p.get("gender") == spec["gender"]
            and len(p["colourways"]) >= min_colourways
            and spec["articleTypes"] == ["Handbags"]
        )
    ]
    # Most colourways first: those are what make the variant states possible.
    # parent_product_id breaks ties so the order never depends on dict order.
    out.sort(key=lambda p: (-len(p["colourways"]), p["parent_product_id"]))
    return out


def select(parents):
    """Return (catalog_parents, roles) where roles names the state fixtures."""
    chosen = OrderedDict()
    family_index = OrderedDict()
    roles = {}

    for family, spec in QUERY_FAMILIES.items():
        specific = [p for p in _candidates(parents, spec, 3) if p["specific"]]
        picks = specific[:PARENTS_PER_FAMILY]
        if len(picks) < PARENTS_PER_FAMILY:
            picks += [
                p
                for p in _candidates(parents, spec, 1)
                if p["parent_product_id"] not in {q["parent_product_id"] for q in picks}
            ][: PARENTS_PER_FAMILY - len(picks)]

        filler = [
            p
            for p in _candidates(parents, spec, 1)
            if p["parent_product_id"] not in {q["parent_product_id"] for q in picks}
        ][:FILLER_PER_FAMILY]

        family_index[family] = {
            "wishlisted": [p["parent_product_id"] for p in picks],
            "filler": [p["parent_product_id"] for p in filler],
        }
        for parent in picks:
            chosen.setdefault(
                parent["parent_product_id"],
                trim_colourways(parent, COLOURS_PER_WISHLISTED_PARENT),
            )
        for parent in filler:
            chosen.setdefault(
                parent["parent_product_id"],
                trim_colourways(parent, COLOURS_PER_FILLER_PARENT),
            )

    # State fixtures, assigned to the richest parent in each family so that the
    # colour and size choices below always have somewhere to land.
    families = list(QUERY_FAMILIES)
    roles["exact_available"] = family_index[families[0]]["wishlisted"][0]
    roles["multi_a"] = family_index[families[0]]["wishlisted"][1]
    roles["multi_b"] = family_index[families[0]]["wishlisted"][2]
    roles["multi_c"] = family_index[families[0]]["wishlisted"][3]
    roles["variant_unavailable"] = family_index[families[1]]["wishlisted"][0]
    roles["colour_variant"] = family_index[families[2]]["wishlisted"][0]
    roles["in_bag"] = family_index[families[3]]["wishlisted"][0]
    roles["purchased"] = family_index[families[4]]["wishlisted"][0]
    # Tier 2 needs a parent with several colourways: the saved colour loses the
    # saved size while another colour keeps it.
    roles["colour_alternative"] = family_index[families[5]]["wishlisted"][0]
    # E14 needs all three duplicate states from FR-11, and Save for Later had
    # no fixture at all.
    roles["saved_for_later"] = family_index[families[6]]["wishlisted"][0]
    # Must not reuse a parent another fixture already owns: this function
    # rewrites the parent's colourways, which would push a conflicted colourway
    # into position 0 and break whichever state was relying on it.
    low = _attach_low_identity(parents, chosen, set(roles.values()))
    if low:
        roles["low_identity"] = low

    return chosen, family_index, roles


IDENTITY_FLOOR = 0.8


def _attach_low_identity(parents, chosen, taken):
    """Keep one parent that owns a genuinely mislabelled colourway.

    trim_colourways sorts by identity confidence, so the conflicting rows the
    dataset supplies get dropped from every other parent. The C-4 fixture needs
    one to survive, and it has to be a real conflict rather than a fabricated
    one, so this scans for a parent in a demo family that actually has a
    colourway below the floor.
    """
    for family, spec in QUERY_FAMILIES.items():
        candidates = [
            p
            for p in _candidates(parents, spec, 2)
            if p["parent_product_id"] not in taken
            and any(c["identity_confidence"] < IDENTITY_FLOOR for c in p["colourways"])
        ]
        for parent in candidates:
            conflicted = sorted(
                (c for c in parent["colourways"] if c["identity_confidence"] < IDENTITY_FLOOR),
                key=lambda c: (c["identity_confidence"], c["product_id"]),
            )[0]
            clean = [
                c
                for c in sorted(parent["colourways"], key=lambda c: c["product_id"])
                if c["identity_confidence"] >= IDENTITY_FLOOR
            ][:2]
            trimmed = dict(parent)
            trimmed["colourways"] = [conflicted] + clean
            chosen[parent["parent_product_id"]] = trimmed
            return parent["parent_product_id"]
    return None
