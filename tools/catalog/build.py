"""Orchestrates the catalog pipeline and emits everything the app reads.

    python tools/catalog/build.py            # build (skips work already done)
    python tools/catalog/build.py --check    # build, then validate the output
    python tools/catalog/build.py --force    # rebuild from scratch

Outputs, all generated -- never hand-edit them:
    app/src/data/catalog.json     parent products, colourways, SKUs
    app/src/data/wishlist.json    the demo user's saved items
    app/src/data/scenarios.json   one fixture per state in section 4.6
    app/src/data/images.ts        static require() map, because Metro cannot
                                  resolve a require() built at runtime
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import curate  # noqa: E402
import derive  # noqa: E402
import fetch_images  # noqa: E402
import fetch_metadata  # noqa: E402
import home_tiles  # noqa: E402
import synthesize  # noqa: E402

DATA_DIR = os.path.join("app", "src", "data")
IMAGE_DIR = os.path.join("app", "assets", "catalog", "images")

USER_ID = "u_demo"
PINCODE = "560034"
# Fixed so the recency term in the match score does not drift with wall time.
TODAY = "2026-08-26"
# The wardrobe items are saved more recently than the oldest fixtures and
# spread out from there, so the Wishlist reads as a list built over months
# rather than eleven items and a block of nineteen saved the same afternoon.
SAVED_EXTRA_FIRST_DAYS_AGO = 4
# Eleven state fixtures plus the wardrobe. Asserted in validate() because the
# count is a product decision, not an emergent one: a saved group that quietly
# found fewer parents than it asked for would otherwise just shorten the list.
WISHLIST_SIZE = 30


def _saved_at(days_ago):
    from datetime import date, timedelta

    return (date.fromisoformat(TODAY) - timedelta(days=days_ago)).isoformat()


def _mid_size(parent):
    sizes = parent["sizes"]
    return sizes[len(sizes) // 2]


def _colourway(parent, index=0):
    return parent["colourways"][index]


def _sku_for(parent, colourway, size):
    for sku in colourway["skus"]:
        if sku["size"] == size:
            return sku
    return colourway["skus"][0]


def build_wishlist(chosen, roles, extras=None):
    """The demo user's saved items: one per state fixture, then the wardrobe.

    Stock is overridden on exactly two SKUs among the fixtures, and both
    overrides are recorded in the catalog so nobody later mistakes them for
    emergent behaviour.

    `extras` is curate.saved_extras() -- the earrings, black jeans, belts and
    watches that take the list from eleven items to thirty. They carry a role
    of their own so they are still traceable to the group that produced them,
    but no role in `catalog.roles`, so no state fixture can ever resolve to
    one.
    """
    items = []
    overrides = []

    def save(role, *, days_ago, colour_index=0, size=None,
             force_stock=None, size_out_everywhere=False,
             size_in_stock_elsewhere=False, _parent=None):
        # A fixture names its parent through `roles`; a wardrobe item has no
        # role there by design, so it hands the parent over directly.
        parent = _parent if _parent is not None else chosen[roles[role]]
        colourway = _colourway(parent, colour_index)
        size = size or _mid_size(parent)
        sku = _sku_for(parent, colourway, size)
        if force_stock is not None and sku["in_stock"] != force_stock:
            sku["in_stock"] = force_stock
            sku["stock_override"] = True
            overrides.append({"sku": sku["sku"], "in_stock": force_stock, "role": role})

        # State 5 is "your size is gone", which is only true when it is gone in
        # every colour. Leaving one colourway stocked makes it a tier 2 case
        # instead, and the fixture would stop testing the state it names.
        if size_out_everywhere:
            for other in parent["colourways"]:
                for candidate in other["skus"]:
                    if candidate["size"] == size and candidate["in_stock"]:
                        candidate["in_stock"] = False
                        candidate["stock_override"] = True
                        overrides.append(
                            {"sku": candidate["sku"], "in_stock": False, "role": role}
                        )
        # Tier 2's fixture: the saved colour loses this size, another colour of
        # the same product keeps it. Without both halves pinned the scenario
        # would drift with the seeded stock.
        if size_in_stock_elsewhere:
            for other in parent["colourways"]:
                if other["product_id"] == colourway["product_id"]:
                    continue
                for candidate in other["skus"]:
                    if candidate["size"] == size and not candidate["in_stock"]:
                        candidate["in_stock"] = True
                        candidate["stock_override"] = True
                        overrides.append(
                            {"sku": candidate["sku"], "in_stock": True, "role": role}
                        )
                break

        items.append(
            {
                "item_id": "wi_%s" % role,
                "role": role,
                "parent_product_id": parent["parent_product_id"],
                "product_id": colourway["product_id"],
                "sku": sku["sku"],
                "colour": colourway["colour"],
                "size": size,
                "saved_at": _saved_at(days_ago),
                "price_at_save": colourway["price"],
                "seller_at_save": colourway["seller"],
            }
        )

    save("exact_available", days_ago=43, force_stock=True)
    save("multi_a", days_ago=12, force_stock=True)
    save("multi_b", days_ago=27, force_stock=True)
    save("multi_c", days_ago=61, force_stock=True)
    save("colour_variant", days_ago=19, force_stock=True)
    save("variant_unavailable", days_ago=34, force_stock=False, size_out_everywhere=True)
    # E14: in-bag and purchased are no longer flags on the wishlist record.
    # They are derived from the bag and the order history, which is what makes
    # them true rather than declared.
    save("in_bag", days_ago=8, force_stock=True)
    save("purchased", days_ago=96, force_stock=True)
    save("saved_for_later", days_ago=52, force_stock=True)
    save(
        "colour_alternative",
        days_ago=17,
        force_stock=False,
        size_in_stock_elsewhere=True,
    )
    # Saved, matching, and deliberately never rendered: its identity confidence
    # is below the floor, so the module stays empty (constraint C-4).
    if "low_identity" in roles:
        parent = chosen[roles["low_identity"]]
        conflicted = min(
            range(len(parent["colourways"])),
            key=lambda i: parent["colourways"][i]["identity_confidence"],
        )
        save("low_identity", days_ago=22, colour_index=conflicted)

    # The wardrobe. Saved in stock and in the group's colour: the eleven
    # fixtures above already own every unavailable state there is, and a
    # thirty-item list whose stock drifts with the seed would make those
    # eleven harder to read rather than the demo richer.
    for group, group_parents in (extras or {}).items():
        slug = group.replace("'", "").replace(" ", "_")
        for index, parent in enumerate(group_parents, start=1):
            chosen[parent["parent_product_id"]] = parent
            save(
                "%s_%d" % (slug, index),
                days_ago=SAVED_EXTRA_FIRST_DAYS_AGO + 3 * len(items),
                force_stock=True,
                _parent=parent,
            )

    return {"user_id": USER_ID, "pincode": PINCODE, "items": items}, overrides


def build_commerce(wishlist):
    """Bag, Save-for-Later and order history, as their own records.

    FR-11 asks for three duplicate states to be *detected*, which means they
    have to exist somewhere other than on the wishlist item claiming them. A
    saved item that says "I am in the bag" is an assertion; a bag that contains
    it is a fact, and only the second can go out of date correctly.
    """
    by_role = {item["role"]: item for item in wishlist["items"]}

    bag = {"items": []}
    saved_for_later = {"items": []}
    orders = {"orders": []}

    if "in_bag" in by_role:
        item = by_role["in_bag"]
        bag["items"].append(
            {
                "sku": item["sku"],
                "parent_product_id": item["parent_product_id"],
                "size": item["size"],
                "colour": item["colour"],
                "added_at": _saved_at(3),
                "quantity": 1,
            }
        )

    if "saved_for_later" in by_role:
        item = by_role["saved_for_later"]
        saved_for_later["items"].append(
            {
                "sku": item["sku"],
                "parent_product_id": item["parent_product_id"],
                "size": item["size"],
                "colour": item["colour"],
                # Moved out of the bag rather than never added: that is what
                # Save for Later means, and why it is a distinct state.
                "moved_at": _saved_at(21),
            }
        )

    if "purchased" in by_role:
        item = by_role["purchased"]
        orders["orders"].append(
            {
                "order_id": "ord_%s" % item["item_id"],
                "placed_at": _saved_at(74),
                "delivered_at": _saved_at(69),
                "lines": [
                    {
                        "sku": item["sku"],
                        "parent_product_id": item["parent_product_id"],
                        "size": item["size"],
                        "colour": item["colour"],
                        "quantity": 1,
                        "price_paid": item["price_at_save"],
                    }
                ],
            }
        )

    return bag, saved_for_later, orders


def unsaved_family(chosen, roles):
    """An article type present in the catalog that the demo user has not saved."""
    saved = {chosen[pid]["articleType"] for pid in roles.values()}
    for family, spec in curate.QUERY_FAMILIES.items():
        if not set(spec["articleTypes"]) & saved:
            return family
    return "blazer"


def build_scenarios(chosen, roles, wishlist):
    """One entry per state in section 4.6, addressable from the E12 harness."""
    by_role = {item["role"]: item for item in wishlist["items"]}

    def parent_of(role):
        return chosen[roles[role]]

    return [
        {
            "id": "state_1_no_match",
            "state": 1,
            "label": "No match",
            "query": "formal blazer",
            "modality": "text",
            "filters": {},
            "authenticated": True,
            "expect": {"moduleVisible": False, "matchCount": 0},
            "note": "Validates that search is unchanged when nothing matches.",
        },
        {
            "id": "state_2_one_exact",
            "state": 2,
            "label": "One exact match",
            "query": "%s %s" % (parent_of("exact_available")["brand"].lower(),
                                parent_of("exact_available")["articleType"].lower()),
            "modality": "text",
            "filters": {},
            "authenticated": True,
            "expect": {"moduleVisible": True, "matchCount": 1,
                       "copyKey": "exact_variant_available"},
        },
        {
            "id": "state_3_multiple",
            "state": 3,
            "label": "Multiple exact matches",
            "query": "check shirt",
            "modality": "text",
            "filters": {},
            "authenticated": True,
            "expect": {"moduleVisible": True, "matchCount": 3,
                       "copyKey": "multiple_matches"},
        },
        {
            "id": "state_4_variant_available",
            "state": 4,
            "label": "Variant available",
            # Brand-qualified, like states 2 and 5, so the hard filters isolate
            # this one saved item. A bare article type stopped isolating it the
            # moment the saved wardrobe added black jeans in the same size:
            # the fixture would have matched three items and stopped testing
            # the state it names.
            "query": "%s %s" % (parent_of("colour_variant")["brand"].lower(),
                                parent_of("colour_variant")["articleType"].lower()),
            "modality": "text",
            "filters": {"size": [by_role["colour_variant"]["size"]]},
            "authenticated": True,
            "expect": {"moduleVisible": True, "matchCount": 1,
                       "copyKey": "saved_size_available"},
        },
        {
            "id": "state_5_variant_unavailable",
            "state": 5,
            "label": "Variant unavailable",
            "query": "%s %s" % (parent_of("variant_unavailable")["brand"].lower(),
                                parent_of("variant_unavailable")["articleType"].lower()),
            "modality": "text",
            "filters": {},
            "authenticated": True,
            "expect": {"moduleVisible": True, "matchCount": 1,
                       "copyKey": "exact_variant_unavailable"},
        },
        {
            "id": "state_6_similar_not_exact",
            "state": 6,
            "label": "Similar not exact (Phase 5)",
            # A family the user has saved nothing in, but which a Tier 3
            # system would connect to their saved bottomwear. v1 correctly
            # stays silent, and the harness makes that silence visible.
            "query": unsaved_family(chosen, roles),
            "modality": "text",
            "filters": {},
            "authenticated": True,
            "outOfScope": True,
            "expect": {"moduleVisible": False, "matchCount": 0},
            "note": (
                "Tier 3 semantic similarity is excluded from v1 by constraint "
                "C-5. The harness shows this state so the exclusion is visible "
                "rather than forgotten."
            ),
        },
        {
            "id": "state_tier2_colour_alternative",
            "state": 4,
            "label": "Saved colour gone, another available",
            "query": "%s %s" % (parent_of("colour_alternative")["brand"].lower(),
                                parent_of("colour_alternative")["articleType"].lower()),
            "modality": "text",
            "filters": {},
            "authenticated": True,
            "expect": {"moduleVisible": True, "matchCount": 1,
                       "copyKey": "colour_variant_available"},
            "note": (
                "Tier 2: the same product in a different colour, offered only "
                "because the saved colour cannot be bought in this size. The "
                "card still reports the colour and size the user saved."
            ),
        },
        {
            "id": "state_7_already_in_bag",
            "state": 7,
            "label": "Already in Bag",
            "query": parent_of("in_bag")["articleType"].lower(),
            "modality": "text",
            "filters": {},
            "authenticated": True,
            "expect": {"moduleVisible": True, "matchCount": 1,
                       "copyKey": "already_in_bag"},
        },
        {
            "id": "state_saved_for_later",
            "state": 7,
            "label": "In Save for Later",
            "query": parent_of("saved_for_later")["articleType"].lower(),
            "modality": "text",
            "filters": {},
            "authenticated": True,
            "expect": {"moduleVisible": True, "matchCount": 1,
                       "copyKey": "saved_for_later"},
            "note": (
                "The third duplicate state in FR-11. Derived from the "
                "Save-for-Later record, not asserted by the wishlist item -- "
                "the user moved this out of their bag on purpose."
            ),
        },
        {
            "id": "state_8_purchased_before",
            "state": 8,
            "label": "Purchased before",
            "query": parent_of("purchased")["articleType"].lower(),
            "modality": "text",
            "filters": {},
            "authenticated": True,
            "expect": {"moduleVisible": True, "matchCount": 1,
                       "copyKey": "purchased_before"},
        },
        {
            "id": "state_9_dismissed",
            "state": 9,
            "label": "Dismissed",
            "query": "check shirt",
            "modality": "text",
            "filters": {},
            "authenticated": True,
            "dismissFirst": True,
            "expect": {"moduleVisible": False, "matchCount": 0, "suppressed": True},
            "note": "Dismissal suppresses the query family for the session.",
        },
        {
            "id": "state_10_logged_out",
            "state": 10,
            "label": "Logged out",
            "query": "check shirt",
            "modality": "text",
            "filters": {},
            "authenticated": False,
            "expect": {"moduleVisible": False, "matchCount": 0},
            "note": (
                "Identical empty shape to any other miss. Nothing in the "
                "response may reveal that a wishlist exists (constraint C-6)."
            ),
        },
        {
            "id": "state_low_identity",
            "state": 1,
            "label": "Below identity floor (renders nothing)",
            # Brand and article type together, so the hard filters isolate this
            # one saved item -- otherwise the query would sweep in the other
            # saved shirts and the point of the fixture would be lost.
            "query": "%s %s" % (parent_of("low_identity")["brand"].lower(),
                                parent_of("low_identity")["articleType"].lower()),
            "modality": "text",
            "filters": {},
            "authenticated": True,
            "expect": {"moduleVisible": False, "matchCount": 0},
            "note": (
                "A saved item does match this query, but its identity "
                "confidence is below the floor, so precision wins and the "
                "module renders nothing (constraint C-4)."
            ),
        },
    ]


def write_images_module(product_ids):
    """Metro needs literal require() calls, so the map is generated, not dynamic.

    Only emits entries for ids whose .jpg files actually exist on disk, to avoid
    dangling requires that break the Metro bundle at build time.
    """
    lines = [
        "/**",
        " * GENERATED by tools/catalog/build.py -- do not edit.",
        " *",
        " * Metro resolves require() at build time, so a runtime-built path will",
        " * not bundle. Every catalog image therefore needs a literal entry.",
        " */",
        "",
        'import type { ImageSourcePropType } from "react-native";',
        "",
        "export const CATALOG_IMAGES: Record<number, ImageSourcePropType> = {",
    ]
    omitted = []
    for pid in product_ids:
        path = os.path.join(IMAGE_DIR, "%d.jpg" % pid)
        if os.path.exists(path):
            lines.append('  %d: require("../../assets/catalog/images/%d.jpg"),' % (pid, pid))
        else:
            omitted.append(pid)
    lines.append("};")
    lines.append("")
    with open(os.path.join(DATA_DIR, "images.ts"), "w") as fh:
        fh.write("\n".join(lines))

    if omitted:
        print("WARNING: %d ids not present in the image directory (omitted from CATALOG_IMAGES): %s" % (len(omitted), omitted))
    return omitted


def prune_images(product_ids):
    """Drop images no longer referenced, so the committed set matches the catalog."""
    keep = {"%d.jpg" % pid for pid in product_ids}
    removed = 0
    for name in sorted(os.listdir(IMAGE_DIR)):
        if name.endswith(".jpg") and name not in keep:
            os.remove(os.path.join(IMAGE_DIR, name))
            removed += 1
    if removed:
        print("pruned %d image(s) no longer in the catalog" % removed)


def run(force=False, check=False):
    os.makedirs(DATA_DIR, exist_ok=True)

    rows = fetch_metadata.run(force=force)
    derived, dropped = derive.derive(rows)
    print("derived %d rows, dropped %d with no recoverable brand" % (len(derived), len(dropped)))

    parents = synthesize.build_parents(derived)
    chosen, families, roles = curate.select(parents)
    print("curated %d parents" % len(chosen))

    # Browse-only accessories -- watches, belts, sunglasses, wallets. Real
    # dataset rows, appended after the families for the same reason the home
    # range is: nothing select() never returned can become a state fixture.
    accessories = curate.showcase(parents, set(chosen))
    for parent in accessories.values():
        chosen[parent["parent_product_id"]] = parent
    print("added %d showcase accessories" % len(accessories))

    # The rest of the demo user's wardrobe -- browse-visible like the showcase,
    # and additionally saved. Taken after the showcase so a saved earring can
    # never shadow a parent a family or a showcase group already owns.
    extras = curate.saved_extras(parents, set(chosen))
    for group_parents in extras.values():
        for parent in group_parents:
            chosen[parent["parent_product_id"]] = parent
    print("added %d saved wardrobe parents across %d groups"
          % (sum(len(v) for v in extras.values()), len(extras)))

    # The invented home range, kept out of curate.select() so it can never be
    # picked as a state fixture. See the spec, section 3.2.
    home_parents = synthesize.build_home_parents()
    for parent in home_parents:
        chosen[parent["parent_product_id"]] = parent
    home_ids = {
        c["product_id"] for p in home_parents for c in p["colourways"]
    }

    wishlist, overrides = build_wishlist(chosen, roles, extras)
    bag, saved_for_later, orders = build_commerce(wishlist)
    scenarios = build_scenarios(chosen, roles, wishlist)

    catalog = {
        "generated_from": fetch_metadata.PARQUET_URL,
        "today": TODAY,
        "parents": list(chosen.values()),
        "families": families,
        "roles": roles,
        # Which parents came from where. Inferring "showcase" from articleType
        # stopped working the moment the wardrobe added watches and belts the
        # user has actually saved, and the browse-only invariant is worth
        # keeping, so the split is recorded rather than guessed.
        "showcase": sorted(accessories),
        "saved_groups": {
            group: [p["parent_product_id"] for p in group_parents]
            for group, group_parents in extras.items()
        },
        "stock_overrides": overrides,
    }

    product_ids = sorted(
        c["product_id"] for p in chosen.values() for c in p["colourways"]
    )
    print("catalog covers %d colourways" % len(product_ids))

    fetch_ids = [pid for pid in product_ids if pid not in home_ids]
    fetch_images.run(fetch_ids, IMAGE_DIR, force=force)
    home_tiles.write(home_parents, IMAGE_DIR)
    prune_images(product_ids)
    omitted_from_images_module = write_images_module(product_ids)

    for name, payload in (
        ("catalog.json", catalog),
        ("wishlist.json", wishlist),
        ("scenarios.json", scenarios),
        ("bag.json", bag),
        ("saved-for-later.json", saved_for_later),
        ("orders.json", orders),
    ):
        with open(os.path.join(DATA_DIR, name), "w") as fh:
            json.dump(payload, fh, indent=2, ensure_ascii=False, sort_keys=True)
        print("wrote %s" % os.path.join(DATA_DIR, name))

    if check:
        validate(catalog, wishlist, scenarios, product_ids, omitted_from_images_module)
    return catalog


def validate(catalog, wishlist, scenarios, product_ids, omitted_from_images_module=()):
    from PIL import Image

    problems = []

    missing = [p for p in product_ids if not os.path.exists(os.path.join(IMAGE_DIR, "%d.jpg" % p))]
    if missing:
        problems.append("%d catalog images missing on disk" % len(missing))

    # A file existing on disk at validate-time does not prove
    # write_images_module() saw it: if image generation happens after the
    # require() map is written, the file check above passes while the map
    # silently dropped the entry (write_images_module() only prints a
    # WARNING for that, which nothing enforces). Check the map's own report
    # of what it left out, independent of what is on disk right now.
    if omitted_from_images_module:
        problems.append(
            "%d colourway(s) missing from CATALOG_IMAGES (images.ts) despite being in the catalog: %s"
            % (len(omitted_from_images_module), list(omitted_from_images_module))
        )

    for pid in product_ids[:: max(1, len(product_ids) // 25)]:
        path = os.path.join(IMAGE_DIR, "%d.jpg" % pid)
        if os.path.exists(path):
            with Image.open(path) as img:
                if img.size != (384, 512):
                    problems.append("%s is %dx%d, expected 384x512" % (path, *img.size))

    known_skus = {
        sku["sku"]
        for parent in catalog["parents"]
        for colourway in parent["colourways"]
        for sku in colourway["skus"]
    }
    for item in wishlist["items"]:
        if item["sku"] not in known_skus:
            problems.append("wishlist item %s points at an unknown SKU" % item["item_id"])

    if len(wishlist["items"]) != WISHLIST_SIZE:
        problems.append(
            "wishlist holds %d items, expected %d"
            % (len(wishlist["items"]), WISHLIST_SIZE)
        )

    states = {s["state"] for s in scenarios}
    for expected in range(1, 11):
        if expected not in states:
            problems.append("no fixture for state %d" % expected)

    if problems:
        print("\nCHECK FAILED")
        for problem in problems:
            print("  - %s" % problem)
        raise SystemExit(1)
    print("\nCHECK PASSED: %d images, %d parents, %d scenarios, all 10 states covered"
          % (len(product_ids), len(catalog["parents"]), len(scenarios)))


if __name__ == "__main__":
    run(force="--force" in sys.argv, check="--check" in sys.argv)
