#!/usr/bin/env python3
"""Tag every animal under a taxon with a category key.

Used for categories that ARE a branch of the tree of life, unlike the
habitat and place based ones. Membership comes from iNaturalist's taxonomy:
every species under the given taxon that has a research-grade photo.

    python3 scripts/add_taxon_category.py felines 41944      # Felidae
"""
import json, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "animals.json")
UA = "AnimalGuesser/1.0 (hobby game; +https://github.com/mattschwartz691/AnimalGuesser)"


def fetch_ids(taxon_id):
    ids, page = set(), 1
    while True:
        q = urllib.parse.urlencode({"taxon_id": taxon_id, "quality_grade": "research",
                                    "per_page": 500, "page": page})
        req = urllib.request.Request(
            "https://api.inaturalist.org/v1/observations/species_counts?" + q,
            headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            res = json.load(r).get("results", [])
        if not res:
            break
        for x in res:
            ids.add(x["taxon"]["id"])
            for anc in (x["taxon"].get("ancestor_ids") or []):
                pass
        if len(res) < 500:
            break
        page += 1
        time.sleep(1.1)
    return ids


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    key, taxon_id = sys.argv[1], int(sys.argv[2])
    d = json.load(open(DATA))
    if d.get("v") == 2:
        sys.exit("data/animals.json is packed; run: python3 scripts/pack.py --unpack")

    print(f"Fetching species under taxon {taxon_id}...")
    ids = fetch_ids(taxon_id)
    print(f"  {len(ids):,} species with research-grade photos")

    tagged = []
    for a in d["animals"]:
        cats = set(a.get("cats", []))
        cats.discard(key)
        if a["id"] in ids:
            cats.add(key)
            tagged.append(a["name"])
        a["cats"] = sorted(cats)
    json.dump(d, open(DATA, "w"), indent=1)
    print(f"tagged {len(tagged)} animals as '{key}'")
    for n in sorted(tagged):
        print(f"    {n}")


if __name__ == "__main__":
    main()
