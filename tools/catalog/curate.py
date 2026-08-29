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
        ("shirt", {"articleTypes": ["Shirts"], "genders": ["Men"]}),
        ("tshirt", {"articleTypes": ["Tshirts"], "genders": ["Men"]}),
        ("jeans", {"articleTypes": ["Jeans"], "genders": ["Men"]}),
        ("kurta", {"articleTypes": ["Kurtas"], "genders": ["Women"]}),
        ("casual shoes", {"articleTypes": ["Casual Shoes"], "genders": ["Men"]}),
        ("heels", {"articleTypes": ["Heels"], "genders": ["Women"]}),
        ("handbag", {"articleTypes": ["Handbags"], "genders": ["Women"], "onesize_ok": True}),
        ("track pants", {"articleTypes": ["Track Pants"], "genders": ["Men"]}),
        # Appended, never inserted: select() assigns state fixtures by
        # families[0..6], so inserting here would silently repoint what
        # state 2 means while every test stayed green.
        ("kids tshirt", {"articleTypes": ["Tshirts"], "genders": ["Boys"]}),
        ("kids top", {"articleTypes": ["Tops"], "genders": ["Girls"]}),
        ("kids dress", {"articleTypes": ["Dresses"], "genders": ["Girls"]}),
        ("perfume", {"articleTypes": ["Perfume and Body Mist"], "genders": ["Women"], "onesize_ok": True}),
        ("lipstick", {"articleTypes": ["Lipstick"], "genders": ["Women"], "onesize_ok": True}),
        ("nail polish", {"articleTypes": ["Nail Polish"], "genders": ["Women"], "onesize_ok": True}),
    ]
)

PARENTS_PER_FAMILY = 4
FILLER_PER_FAMILY = 9

# Accessories the shop should visibly stock, so the Accessories circle is not
# thirteen handbags and the app reads like the real one.
#
# These are NOT query families, and the difference is load-bearing. A family
# owns four wishlisted parents, nine filler, and a slot in the state-fixture
# table that select() indexes positionally -- adding one reshapes the demo.
# A showcase group is browse-only: a few real rows, no wishlist item, no role,
# no fixture. It exists to be found by Search and by the Accessories circle.
#
# Every row here is a real dataset row, which is the whole reason the list is
# short. Nothing in it is invented, so nothing in it needs the `synthetic`
# quarantine the home range carries.
SHOWCASE_GROUPS = OrderedDict(
    [
        ("watch", {"articleTypes": ["Watches"], "genders": ["Men"]}),
        ("women's watch", {"articleTypes": ["Watches"], "genders": ["Women"]}),
        ("belt", {"articleTypes": ["Belts"], "genders": ["Men"]}),
        ("sunglasses", {"articleTypes": ["Sunglasses"], "genders": ["Women"]}),
        ("wallet", {"articleTypes": ["Wallets"], "genders": ["Men"]}),
    ]
)

PARENTS_PER_SHOWCASE = 3
COLOURS_PER_SHOWCASE_PARENT = 2

# The rest of the demo user's wardrobe.
#
# Eleven saved items is a fixture table: one item per state in section 4.6 and
# nothing else, which is why the Wishlist screen, the slot model and look
# completion were all being exercised against a list shorter than a single
# screen. These groups take it to thirty, across the categories a real shopper
# saves from -- earrings, black jeans, belts and watches, men's and women's.
#
# They sit between a family and a showcase group, and the distinction is the
# same one that keeps showcase browse-only: a saved group owns wishlist items
# but never a role, so nothing here can become a state fixture and repoint what
# "state 2" means. `count` is how many parents the group contributes, and each
# contributes exactly one saved item.
SAVED_GROUPS = OrderedDict(
    [
        ("earrings", {"articleTypes": ["Earrings"], "genders": ["Women"], "count": 5}),
        # The one group that names a colour, so the saved item genuinely is a
        # pair of black jeans rather than whatever colour sorted first.
        ("black jeans", {"articleTypes": ["Jeans"], "genders": ["Men"],
                         "colour": "Black", "count": 4}),
        ("men's belt", {"articleTypes": ["Belts"], "genders": ["Men"], "count": 2}),
        ("women's belt", {"articleTypes": ["Belts"], "genders": ["Women"], "count": 2}),
        ("men's watch", {"articleTypes": ["Watches"], "genders": ["Men"], "count": 3}),
        ("women's watch", {"articleTypes": ["Watches"], "genders": ["Women"], "count": 3}),
    ]
)

COLOURS_PER_SAVED_PARENT = 2

# A generic parent ("plain men's shirt") can absorb hundreds of rows. Every
# colourway kept costs one 384x512 image on disk, so parents are trimmed to a
# handful of distinct colours -- more than enough to exercise Tier 2, and it
# keeps the committed image set around 300 files.
COLOURS_PER_WISHLISTED_PARENT = 6
COLOURS_PER_FILLER_PARENT = 2


def trim_colourways(parent, limit, prefer_colour=None):
    """One colourway per distinct colour, best identity confidence wins.

    `prefer_colour` promotes one colour to position 0 and guarantees it
    survives the slice. The saved groups below need it: "black jeans" is a
    colour claim, and identity confidence -- which is what everything else
    sorts on -- knows nothing about colour, so without this the black
    colourway is exactly as likely to be trimmed away as any other.
    """
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
    )
    if prefer_colour:
        key = prefer_colour.lower()
        ordered.sort(key=lambda c: c["colour"].lower() != key)
    ordered = ordered[:limit]
    trimmed = dict(parent)
    trimmed["colourways"] = ordered
    return trimmed



def _candidates(parents, spec, min_colourways=1):
    """Parents that could serve a family, richest in colourways first.

    Onesize parents are excluded because a size ladder of one cannot produce
    the variant states -- with two exceptions that are genuinely sized in the
    real world but not in this dataset: handbags, and everything in Personal
    Care, which has no size to lose. Their families need candidates or the
    category is empty.
    """
    sized_exempt = spec.get("onesize_ok", False)
    out = []
    for parent in parents.values():
        if parent.get("articleType") not in spec["articleTypes"]:
            continue
        if parent.get("gender") not in spec["genders"]:
            continue
        if len(parent["colourways"]) < min_colourways:
            continue
        if parent["sizes"] == ["Onesize"] and not sized_exempt:
            continue
        out.append(parent)
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


def showcase(parents, taken):
    """Browse-only accessories, picked after the families have taken theirs.

    Deliberately called from build.run() rather than from select(), for the
    same reason the invented home range is: anything select() returns can be
    reached by the state-fixture table, and a watch has no business being
    state 2. Passing `taken` keeps a showcase parent from shadowing a parent
    a family already owns.

    Onesize is not filtered here. A family excludes onesize parents because a
    size ladder of one cannot produce the variant states; these products are
    never a fixture, so they have no variant state to produce, and watches and
    sunglasses genuinely have no size to lose.
    """
    picked = OrderedDict()
    for spec in SHOWCASE_GROUPS.values():
        # Every group here is onesize-exempt, so the flag is injected rather
        # than repeated five times. Without it _candidates drops the lot:
        # watches, sunglasses and wallets are all Onesize, and the only thing
        # that survived the filter was a belt the dataset had mis-filed under
        # Topwear -- which then carried an XS-XXL apparel ladder.
        spec = dict(spec, onesize_ok=True)
        candidates = [
            parent
            for parent in _candidates(parents, spec, 1)
            if parent["parent_product_id"] not in taken
            and parent["parent_product_id"] not in picked
            # A generic parent ("plain men's watch") absorbs hundreds of rows
            # and reads as a placeholder on a tile. With only three slots to
            # spend per group, spend them on named products.
            and parent["specific"]
        ]
        for parent in candidates[:PARENTS_PER_SHOWCASE]:
            picked[parent["parent_product_id"]] = trim_colourways(
                parent, COLOURS_PER_SHOWCASE_PARENT
            )
    return picked


def saved_extras(parents, taken):
    """Parents the demo user has saved, beyond the eleven state fixtures.

    Called from build.run() after select() and showcase(), for the same reason
    both of those are ordered the way they are: `taken` is every parent already
    spoken for, and nothing returned here may shadow a family parent, a
    showcase parent or a role. A saved group is browse-visible like a showcase
    group -- these are real dataset rows in the real catalog -- and the only
    thing it adds is a wishlist item.

    Onesize is not filtered: belts and watches have no size ladder in this
    dataset, and these parents are never a fixture, so they have no variant
    state to produce.
    """
    picked = OrderedDict()
    for group, spec in SAVED_GROUPS.items():
        colour = spec.get("colour")
        candidates = [
            parent
            for parent in _candidates(parents, dict(spec, onesize_ok=True), 1)
            if parent["parent_product_id"] not in taken
            and parent["parent_product_id"] not in picked
            # A generic parent ("plain men's watch") absorbs hundreds of rows
            # and reads as a placeholder on a saved row.
            and parent["specific"]
            and (
                colour is None
                or any(c["colour"].lower() == colour.lower() for c in parent["colourways"])
            )
        ]
        chosen = candidates[: spec["count"]]
        if len(chosen) < spec["count"]:
            raise RuntimeError(
                "saved group %r wanted %d parents, found %d"
                % (group, spec["count"], len(chosen))
            )
        picked[group] = [
            trim_colourways(parent, COLOURS_PER_SAVED_PARENT, prefer_colour=colour)
            for parent in chosen
        ]
    return picked


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
