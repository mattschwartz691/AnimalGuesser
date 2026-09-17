#!/usr/bin/env python3
"""Fix the plant tiers, names and everyday aliases.

Ranking a genus by iNaturalist observations does not find the household
flower: the most-photographed rose is the invasive multiflora, and the most
photographed chrysanthemum is a Korean mountain species. So the easy tier is
stated outright here -- the flowers and trees a person actually meets -- with
everything else falling back to the observation ranking.

Also adds the everyday name as an accepted answer, so "sunflower" answers the
common sunflower and "oak" answers the English oak, and repairs the automatic
title-casing that produced "Poet'S Narcissus" and "Dog-Rose".

    python3 scripts/things/retier_plants.py
"""
import json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data", "things_plants.json")
UA = "AnimalGuesser/1.0 (hobby game; +https://github.com/mattschwartz691/AnimalGuesser)"
LEAVES, GREEN_LEAVES = 36, 38

# The flowers on a windowsill, a supermarket bunch or a front garden. Value is
# the everyday word a player will type.
HOUSEHOLD = {
    "Helianthus annuus": "sunflower",
    "Taraxacum officinale": "dandelion",
    "Papaver rhoeas": "poppy",
    "Viola odorata": "violet",
    "Tulipa gesneriana": "tulip",
    "Narcissus pseudonarcissus": "daffodil",
    "Dahlia pinnata": "dahlia",
    "Paeonia officinalis": "peony",
    "Hibiscus syriacus": "hibiscus",
    "Rosa rugosa": "rose",
    "Lavandula angustifolia": "lavender",
    "Hydrangea macrophylla": "hydrangea",
    "Bellis perennis": "daisy",
    "Dianthus caryophyllus": "carnation",
    "Chrysanthemum morifolium": "chrysanthemum",
    "Lilium candidum": "lily",
    "Tagetes erecta": "marigold",
    "Iris germanica": "iris",
    "Begonia cucullata": "begonia",
    "Petunia atkinsiana": "petunia",
    "Gerbera jamesonii": "gerbera",
    "Phalaenopsis amabilis": "orchid",
    "Antirrhinum majus": "snapdragon",
    "Primula vulgaris": "primrose",
    "Crocus vernus": "crocus",
}
# The trees anyone can name, with the word they will type.
EVERYDAY_TREES = {
    "Quercus robur": "oak",
    "Acer saccharum": "maple",
    "Pinus sylvestris": "pine",
    "Betula pendula": "birch",
    "Salix babylonica": "willow",
    "Fagus sylvatica": "beech",
    "Picea abies": "spruce",
    "Malus domestica": "apple tree",
    "Olea europaea": "olive tree",
    "Cocos nucifera": "palm tree",
    "Ginkgo biloba": "ginkgo",
    "Sequoiadendron giganteum": "redwood",
    "Aesculus hippocastanum": "horse chestnut",
    "Ulmus americana": "elm",
    "Fraxinus excelsior": "ash",
    "Tilia europaea": "lime tree",
    "Populus tremula": "aspen",
    "Juglans regia": "walnut tree",
    "Castanea sativa": "chestnut",
    "Cedrus libani": "cedar",
}
# Ranked easy by observation count but nobody's idea of a household plant.
DEMOTE = {
    "Rosa multiflora": "hard", "Tulipa sylvestris": "hard",
    "Narcissus poeticus": "medium", "Lilium martagon": "hard",
    "Chrysanthemum zawadzkii": "death", "Dianthus armeria": "hard",
    "Paeonia californica": "hard", "Dahlia coccinea": "medium",
    "Acer negundo": "medium", "Salix caprea": "medium",
    "Gerbera piloselloides": "death",
}


def fix_name(name):
    name = re.sub(r"'(\w)", lambda m: "'" + m.group(1).lower(), name)
    name = re.sub(r"-(\w)", lambda m: "-" + m.group(1).lower(), name)
    return name


def api(path, params):
    q = urllib.parse.urlencode(params)
    req = urllib.request.Request("https://api.inaturalist.org/v1/" + path + "?" + q,
                                 headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception:
            time.sleep(2 + 2 * attempt)
    return {}


def big(u):
    return re.sub(r"/(square|small|medium|large|original)\.", "/large.", u or "")


def fetch(sci, cat, everyday, want_leaf):
    d = api("taxa", {"q": sci, "rank": "species", "per_page": 5})
    t = next((x for x in d.get("results", []) if (x.get("name") or "") == sci), None)
    time.sleep(1.1)
    if not t:
        return None
    ph = t.get("default_photo") or {}
    url = big(ph.get("medium_url") or ph.get("url"))
    if not url:
        return None
    photos = [{"url": url,
               "credit": re.sub(r"\s+", " ", ph.get("attribution") or "").strip(),
               "obs": ""}]
    if want_leaf:
        o = api("observations", {"taxon_id": t["id"], "quality_grade": "research",
                                "photos": "true", "term_id": LEAVES,
                                "term_value_id": GREEN_LEAVES,
                                "order_by": "votes", "per_page": 5})
        time.sleep(1.1)
        for obs in o.get("results", []):
            for p in obs.get("photos", []):
                u = big(p.get("url"))
                if u and u != url:
                    photos.append({"url": u,
                                   "credit": re.sub(r"\s+", " ", p.get("attribution") or "").strip(),
                                   "obs": f"https://www.inaturalist.org/observations/{obs['id']}"})
                    break
            if len(photos) > 1:
                break
    common = fix_name((t.get("preferred_common_name") or sci).title())
    return {"id": t["id"], "tier": "easy", "group": "Plantae", "name": common,
            "sci": sci, "aliases": sorted({common.lower(), everyday}),
            "cats": [cat], "photos": photos}


def main():
    d = json.load(open(DATA))
    added = renamed = retiered = 0
    for cat, table, want_leaf in (("flowers", HOUSEHOLD, False),
                                  ("trees", EVERYDAY_TREES, True)):
        rows = d[cat]
        have = {r["sci"]: r for r in rows}
        for r in rows:
            n = fix_name(r["name"])
            if n != r["name"]:
                r["name"] = n; renamed += 1
            if r["sci"] in table:                    # a household name: easy, always
                if r["tier"] != "easy":
                    r["tier"] = "easy"; retiered += 1
                r["aliases"] = sorted(set(r["aliases"]) | {table[r["sci"]], r["name"].lower()})
            elif r["sci"] in DEMOTE:
                r["tier"] = DEMOTE[r["sci"]]; retiered += 1
            else:
                r["aliases"] = sorted({x.lower() for x in r["aliases"]} | {r["name"].lower()})
        missing = [s for s in table if s not in have]
        print(f"{cat}: {len(table) - len(missing)} of {len(table)} household names already "
              f"present, fetching {len(missing)}")
        for s in missing:
            rec = fetch(s, cat, table[s], want_leaf)
            if rec:
                rows.append(rec); added += 1
                print(f"   + {rec['name']:32s} {s}  ({table[s]})")
            else:
                print(f"   ? {s} -- not found, skipped")
    json.dump(d, open(DATA, "w"), indent=1)
    print(f"\nrenamed {renamed}, retiered {retiered}, added {added}")
    for cat in ("flowers", "trees"):
        import collections
        t = collections.Counter(r["tier"] for r in d[cat])
        print(f"   {cat:8s} {len(d[cat]):4d}  {dict(t)}")


if __name__ == "__main__":
    main()
