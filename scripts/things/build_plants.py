#!/usr/bin/env python3
"""Flowers and trees for Things Guesser, from iNaturalist.

Same source and the same rules as the animals: research-grade observations,
real photographs by real people, credited. "Flower" and "tree" are not ranks
of taxonomy, so membership comes from a curated list of genera -- the way the
animal game handles cat breeds and US birds, which taxonomy cannot answer
either. Observation count drives the difficulty tier.

    python3 scripts/things/build_plants.py
"""
import json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "data", "things_plants.json")
UA = "AnimalGuesser/1.0 (hobby game; +https://github.com/mattschwartz691/AnimalGuesser)"

FLOWER_GENERA = [
    "Rosa", "Tulipa", "Helianthus", "Lilium", "Narcissus", "Dahlia", "Iris",
    "Papaver", "Viola", "Primula", "Hibiscus", "Orchis", "Paeonia", "Aster",
    "Chrysanthemum", "Gerbera", "Zinnia", "Lavandula", "Digitalis", "Delphinium",
    "Echinacea", "Rudbeckia", "Crocus", "Hyacinthus", "Gladiolus", "Begonia",
    "Fuchsia", "Camellia", "Magnolia", "Wisteria", "Clematis", "Nymphaea",
    "Protea", "Passiflora", "Anemone", "Campanula", "Geranium", "Salvia",
    "Taraxacum", "Trifolium", "Calendula", "Cosmos", "Antirrhinum", "Petunia",
]
TREE_GENERA = [
    "Quercus", "Acer", "Pinus", "Picea", "Betula", "Fagus", "Populus", "Salix",
    "Ulmus", "Fraxinus", "Tilia", "Abies", "Cedrus", "Eucalyptus", "Ficus",
    "Prunus", "Malus", "Juglans", "Carya", "Platanus", "Liquidambar", "Sequoia",
    "Larix", "Tsuga", "Thuja", "Cupressus", "Juniperus", "Castanea", "Alnus",
    "Carpinus", "Sorbus", "Aesculus", "Catalpa", "Cornus", "Ilex", "Olea",
    "Citrus", "Cocos", "Phoenix", "Araucaria", "Ginkgo", "Taxus",
]

def api(path, params):
    q = urllib.parse.urlencode(params)
    req = urllib.request.Request("https://api.inaturalist.org/v1/" + path + "?" + q,
                                 headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:
            if attempt == 3:
                print("      giving up:", str(e)[:70]); return {}
            time.sleep(2 + attempt * 2)
    return {}

def big(url):
    return re.sub(r"/(square|small|medium|large|original)\.", "/large.", url or "")

def tier_for(n):
    if n >= 20000: return "easy"
    if n >= 4000:  return "medium"
    if n >= 600:   return "hard"
    return "death"

def genus_id(name):
    d = api("taxa", {"q": name, "rank": "genus", "per_page": 5})
    for t in d.get("results", []):
        if (t.get("name") or "").lower() == name.lower():
            return t["id"]
    return None

def species_of(gid, want):
    d = api("observations/species_counts",
            {"taxon_id": gid, "quality_grade": "research", "per_page": want})
    return d.get("results", [])

def collect(genera, cat, per_genus):
    out, seen = [], set()
    for i, g in enumerate(genera, 1):
        gid = genus_id(g)
        time.sleep(1.1)
        if not gid:
            print(f"   [{i}/{len(genera)}] {g:14s} -- no genus id"); continue
        rows = species_of(gid, per_genus)
        time.sleep(1.1)
        kept = 0
        for r in rows:
            t = r.get("taxon") or {}
            common = (t.get("preferred_common_name") or "").strip()
            photo = t.get("default_photo") or {}
            url = big(photo.get("medium_url") or photo.get("url"))
            sci = t.get("name") or ""
            if not common or not url or t.get("extinct") or sci in seen:
                continue
            seen.add(sci)
            out.append({
                "id": t["id"], "tier": tier_for(r.get("count", 0)),
                "group": "Plantae", "name": common.title(), "sci": sci,
                "aliases": [common.lower()], "cats": [cat],
                "photos": [{"url": url,
                            "credit": re.sub(r"\s+", " ", photo.get("attribution") or "").strip(),
                            "obs": ""}],
            })
            kept += 1
        print(f"   [{i}/{len(genera)}] {g:14s} {kept:3d} species")
    return out

def main():
    per = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    print(f"Flowers: {len(FLOWER_GENERA)} genera, up to {per} species each")
    flowers = collect(FLOWER_GENERA, "flowers", per)
    print(f"\nTrees: {len(TREE_GENERA)} genera, up to {per} species each")
    trees = collect(TREE_GENERA, "trees", per)
    json.dump({"flowers": flowers, "trees": trees}, open(OUT, "w"), indent=1)
    print(f"\nwrote {len(flowers)} flowers + {len(trees)} trees -> {OUT}")

if __name__ == "__main__":
    main()
