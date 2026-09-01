#!/usr/bin/env python3
"""Tag the birds that occur in North America with the `nabirds` category.

Membership is not something taxonomy can answer, so it comes from
iNaturalist's own place index: every bird species with a research-grade,
*native* observation inside the North America continent place (id 97394).

The native filter matters. Without it the list picks up escaped and farmed
birds -- an emu, an ostrich and a kookaburra all have research-grade North
American records, and none of them belong in this category.

    python3 scripts/add_na_birds.py
"""
import json, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "animals.json")
UA = "AnimalGuesser/1.0 (hobby game; +https://github.com/mattschwartz691/AnimalGuesser)"
AVES, NORTH_AMERICA = 3, 97394


def fetch_ids():
    ids, page = set(), 1
    while True:
        q = urllib.parse.urlencode({"taxon_id": AVES, "place_id": NORTH_AMERICA,
                                    "quality_grade": "research",
                                    "native": "true",
                                    "per_page": 500, "page": page})
        req = urllib.request.Request(
            "https://api.inaturalist.org/v1/observations/species_counts?" + q,
            headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            d = json.load(r)
        res = d.get("results", [])
        if not res:
            break
        for x in res:
            ids.add(x["taxon"]["id"])
        print(f"  page {page}: {len(ids):,} species so far")
        if len(res) < 500:
            break
        page += 1
        time.sleep(1.1)
    return ids


def main():
    d = json.load(open(DATA))
    if d.get("v") == 2:
        sys.exit("data/animals.json is packed; run: python3 scripts/pack.py --unpack")
    print(f"Fetching North American birds (place {NORTH_AMERICA})...")
    na = fetch_ids()
    print(f"\n{len(na):,} bird species recorded in North America")

    tagged = birds = 0
    for a in d["animals"]:
        cats = set(a.get("cats", []))
        cats.discard("nabirds")
        if "birds" in cats:
            birds += 1
            if a["id"] in na:
                cats.add("nabirds")
                tagged += 1
        a["cats"] = sorted(cats)
    json.dump(d, open(DATA, "w"), indent=1)
    print(f"tagged {tagged:,} of the {birds:,} birds in the game as North American")


if __name__ == "__main__":
    main()
