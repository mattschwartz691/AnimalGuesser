#!/usr/bin/env python3
"""Tier the trees by where they grow and how well known they are.

    easy    common American trees
    medium  less common American trees
    hard    trees of the wider world that should still ring a bell -- famous
            for something, or ordinary somewhere else
    death   everything else

None of that is derivable: "American" is a range question and "familiar" is not
a fact about a plant at all, so all three tiers are named outright and anything
unnamed falls to death. Species missing from the game are fetched, with the
second leaf-biased photograph the pair view needs.

    python3 scripts/things/retier_trees.py
"""
import json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data", "things_plants.json")
UA = "AnimalGuesser/1.0 (hobby game; +https://github.com/mattschwartz691/AnimalGuesser)"
LEAVES, GREEN_LEAVES = 36, 38

# Common American trees -- a street, a park or a back yard in the States.
EASY = {
    "Acer saccharum": "maple", "Acer rubrum": "red maple",
    "Quercus alba": "white oak", "Quercus rubra": "red oak",
    "Pinus strobus": "white pine", "Fagus grandifolia": "beech",
    "Populus tremuloides": "aspen", "Betula papyrifera": "birch",
    "Prunus serotina": "black cherry", "Ulmus americana": "elm",
    "Cercis canadensis": "redbud", "Cornus florida": "dogwood",
    "Magnolia grandiflora": "magnolia", "Pseudotsuga menziesii": "douglas fir",
    "Sequoia sempervirens": "redwood", "Sequoiadendron giganteum": "sequoia",
    "Quercus virginiana": "live oak", "Taxodium distichum": "bald cypress",
    "Liquidambar styraciflua": "sweetgum", "Platanus occidentalis": "sycamore",
    "Gleditsia triacanthos": "honey locust", "Juglans nigra": "black walnut",
    "Carya illinoinensis": "pecan", "Pinus taeda": "loblolly pine",
    "Pinus ponderosa": "ponderosa pine", "Malus domestica": "apple tree",
    "Picea pungens": "blue spruce", "Tsuga canadensis": "hemlock",
}
# Less common American trees -- around, but you have to know them.
MEDIUM = {
    "Carya ovata", "Quercus macrocarpa", "Quercus palustris", "Acer saccharinum",
    "Acer negundo", "Liriodendron tulipifera", "Robinia pseudoacacia",
    "Celtis occidentalis", "Oxydendrum arboreum", "Diospyros virginiana",
    "Catalpa speciosa", "Maclura pomifera", "Sassafras albidum",
    "Tilia americana", "Betula alleghaniensis", "Betula nigra",
    "Pinus banksiana", "Pinus contorta", "Picea sitchensis",
    "Tsuga heterophylla", "Juniperus virginiana", "Populus deltoides",
    "Aesculus glabra", "Nyssa sylvatica", "Abies balsamea",
    "Thuja occidentalis", "Quercus velutina", "Carya glabra",
    "Yucca brevifolia",          # American, and famous, but not an everyday tree
    "Fraxinus americana", "Pinus echinata",
}
# The wider world, but nameable: famous, or ordinary somewhere else.
HARD = {
    "Quercus robur", "Pinus sylvestris", "Picea abies", "Fagus sylvatica",
    "Betula pendula", "Olea europaea", "Ginkgo biloba", "Cocos nucifera",
    "Phoenix dactylifera", "Adansonia digitata", "Eucalyptus globulus",
    "Cedrus libani", "Prunus serrulata", "Ficus benghalensis", "Quercus suber",
    "Aesculus hippocastanum", "Hevea brasiliensis", "Mangifera indica",
    "Tectona grandis", "Araucaria araucana", "Araucaria heterophylla",
    "Salix babylonica", "Castanea sativa",
    "Fraxinus excelsior", "Tilia cordata", "Acer platanoides",
    "Citrus sinensis", "Juglans regia", "Corylus avellana", "Laurus nobilis",
    "Punica granatum", "Ficus carica", "Cupressus sempervirens",
}


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


def fix_name(n):
    n = re.sub(r"'(\w)", lambda m: "'" + m.group(1).lower(), n)
    return re.sub(r"-(\w)", lambda m: "-" + m.group(1).lower(), n)


def fetch(sci, tier, everyday):
    d = api("taxa", {"q": sci, "rank": "species", "per_page": 6})
    t = next((x for x in d.get("results", []) if (x.get("name") or "") == sci), None)
    time.sleep(1.1)
    if not t:
        return None
    ph = t.get("default_photo") or {}
    url = big(ph.get("medium_url") or ph.get("url"))
    if not url:
        return None
    photos = [{"url": url,
               "credit": re.sub(r"\s+", " ", ph.get("attribution") or "").strip(), "obs": ""}]
    o = api("observations", {"taxon_id": t["id"], "quality_grade": "research",
                            "photos": "true", "term_id": LEAVES,
                            "term_value_id": GREEN_LEAVES, "order_by": "votes",
                            "per_page": 5})
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
    al = {common.lower()}
    if everyday:
        al.add(everyday)
    return {"id": t["id"], "tier": tier, "group": "Plantae", "name": common,
            "sci": sci, "aliases": sorted(al), "cats": ["trees"], "photos": photos}


def main():
    d = json.load(open(DATA))
    trees = d["trees"]
    have = {r["sci"]: r for r in trees}
    moved = 0
    for r in trees:
        want = ("easy" if r["sci"] in EASY else
                "medium" if r["sci"] in MEDIUM else
                "hard" if r["sci"] in HARD else "death")
        if r["tier"] != want:
            r["tier"] = want; moved += 1
        if r["sci"] in EASY:
            r["aliases"] = sorted(set(r["aliases"]) | {EASY[r["sci"]], r["name"].lower()})
    print(f"retiered {moved} of {len(trees)} trees already in the game")

    added = 0
    for table, tier in ((EASY, "easy"), (MEDIUM, "medium"), (HARD, "hard")):
        missing = [s for s in table if s not in have]
        print(f"\n{tier}: {len(table) - len(missing)} of {len(table)} present, "
              f"fetching {len(missing)}")
        for s in missing:
            rec = fetch(s, tier, table[s] if isinstance(table, dict) else None)
            if rec:
                trees.append(rec); added += 1
                print(f"   + {rec['name']:34s} {s}" +
                      ("  (two photos)" if len(rec["photos"]) > 1 else "  (one photo)"))
            else:
                print(f"   ? {s} -- not found")
    json.dump(d, open(DATA, "w"), indent=1)
    import collections
    print(f"\nadded {added}; trees now {len(trees)}")
    print("  ", dict(collections.Counter(r["tier"] for r in trees)))


if __name__ == "__main__":
    main()
