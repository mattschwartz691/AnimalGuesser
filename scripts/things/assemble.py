#!/usr/bin/env python3
"""Combine the Things Guesser sources into data/things.json.

    python3 scripts/things/assemble.py

Reads data/things/world_sky.json (flags, outlines, constellations) and
data/things_plants.json (flowers, trees) and writes the single file the page
fetches. The format is the game's unpacked one -- {"animals": [...]} -- which
game.js reads directly; there is no need to pack a file this small.
"""
import json, os, collections

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WS = os.path.join(ROOT, "data", "things", "world_sky.json")
PL = os.path.join(ROOT, "data", "things_plants.json")
FD = os.path.join(ROOT, "data", "things_food.json")
OUT = os.path.join(ROOT, "data", "things.json")

def main():
    recs = json.load(open(WS)) if os.path.exists(WS) else []
    if os.path.exists(PL):
        p = json.load(open(PL))
        recs += p.get("flowers", []) + p.get("trees", [])
    else:
        print("   (no plants file yet -- flowers and trees will be missing)")
    if os.path.exists(FD):
        f = json.load(open(FD))
        recs += f.get("desserts", []) + f.get("dishes", []) + f.get("breakfast", [])
    else:
        print("   (no food file yet -- desserts and dishes will be missing)")

    # A tree is shown as a pair -- the whole tree and a close-up together --
    # so both of its photographs go on screen at once rather than one being
    # picked at random. Anything with a second photo gets the flag.
    pairs = 0
    for r in recs:
        if r["cats"][0] == "trees" and len(r.get("photos", [])) > 1:
            r["pair"] = True; pairs += 1

    # one category each, same rule as the animal game
    bad = [r["name"] for r in recs if len(r.get("cats", [])) != 1]
    assert not bad, "not in exactly one category: %s" % bad[:5]
    seen, uniq = set(), []
    for r in recs:
        k = (r["cats"][0], r["name"].lower())
        if k in seen:
            continue
        seen.add(k); uniq.append(r)

    json.dump({"source": "Flowers and trees from iNaturalist research-grade observations. "
                         "Flags from flagcdn. Outlines drawn from Natural Earth. "
                         "Desserts and dishes photographed by Wikimedia Commons contributors. "
                         "No AI-generated imagery.",
               "animals": uniq}, open(OUT, "w"), separators=(",", ":"))
    n = collections.Counter(r["cats"][0] for r in uniq)
    t = collections.Counter(r["tier"] for r in uniq)
    print(f"wrote {len(uniq):,} things -> data/things.json ({pairs} shown as a pair)")
    for k, v in n.most_common(): print(f"   {k:15s} {v:5,}")
    print("  tiers:", dict(t))

if __name__ == "__main__":
    main()
