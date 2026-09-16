#!/usr/bin/env python3
"""Two corrections to data/animals.json.

1. Drop photographs of dead animals. iNaturalist records this as an annotation
   ("Alive or Dead"), so any photo whose observation is annotated Dead is
   removed. Only the photos that carry an observation id can be checked this
   way, which is why the script reports how much of the set it could see.

2. Rebuild the Felines category as every extant wild cat, once each. The
   domestic cat is not a wild cat and moves to Mammals; any wild cat missing
   from the game is fetched, preferring an observation annotated Alive.

    python3 scripts/fix_cats_and_dead.py            # do it
    python3 scripts/fix_cats_and_dead.py --dry-run  # just report
"""
import json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "animals.json")
UA = "AnimalGuesser/1.0 (hobby game; +https://github.com/mattschwartz691/AnimalGuesser)"
FELIDAE, ALIVE_OR_DEAD, DEAD, ALIVE = 41944, 17, 19, 18
DRY = "--dry-run" in sys.argv


def api(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:
            if attempt == 3:
                print("      request failed:", str(e)[:70]); return {}
            time.sleep(2 + 2 * attempt)
    return {}


def obs_id(p):
    m = re.match(r"^https://www\.inaturalist\.org/observations/(\d+)$", p.get("obs") or "")
    return m.group(1) if m else None


def dead_observations(ids):
    """Which of these observation ids are annotated Dead."""
    dead = set()
    for i in range(0, len(ids), 100):
        chunk = ids[i:i + 100]
        d = api("https://api.inaturalist.org/v1/observations/" + ",".join(chunk) + "?per_page=200")
        for o in d.get("results", []):
            for an in o.get("annotations", []):
                if (an.get("controlled_attribute_id") == ALIVE_OR_DEAD
                        and an.get("controlled_value_id") == DEAD):
                    dead.add(str(o["id"]))
        print(f"      checked {min(i+100, len(ids)):,}/{len(ids):,}, {len(dead)} dead so far")
        time.sleep(1.1)
    return dead


def big(url):
    return re.sub(r"/(square|small|medium|large|original)\.", "/large.", url or "")


def live_photo(taxon_id):
    """A photo from an observation annotated Alive, falling back to any."""
    for params in ({"term_id": ALIVE_OR_DEAD, "term_value_id": ALIVE}, {}):
        q = {"taxon_id": taxon_id, "quality_grade": "research", "photos": "true",
             "per_page": 5, "order_by": "votes"}
        q.update(params)
        d = api("https://api.inaturalist.org/v1/observations?" + urllib.parse.urlencode(q))
        for o in d.get("results", []):
            for ph in o.get("photos", []):
                u = big(ph.get("url"))
                if u:
                    return {"url": u,
                            "credit": re.sub(r"\s+", " ", ph.get("attribution") or "").strip(),
                            "obs": f"https://www.inaturalist.org/observations/{o['id']}"}
        time.sleep(1.1)
    return None


def extant_wild_cats():
    """Every living cat species, domestic cat excluded."""
    out, page = {}, 1
    while True:
        d = api(f"https://api.inaturalist.org/v1/taxa?taxon_id={FELIDAE}&rank=species"
                f"&is_active=true&per_page=200&page={page}")
        res = d.get("results", [])
        if not res:
            break
        for t in res:
            if t.get("extinct") or t.get("name") == "Felis catus":
                continue
            out[t["name"]] = t
        if len(res) < 200:
            break
        page += 1
        time.sleep(1.1)
    return out


def main():
    d = json.load(open(DATA))
    if d.get("v") == 2:
        sys.exit("data/animals.json is packed; run: python3 scripts/pack.py --unpack")
    animals = d["animals"]

    # ---- 1. photographs of dead animals --------------------------------
    withobs = [(a, p) for a in animals for p in a["photos"] if obs_id(p)]
    total = sum(len(a["photos"]) for a in animals)
    print(f"1. dead-animal photos\n   {total:,} photos, {len(withobs):,} carry an "
          f"observation id ({len(withobs)/total*100:.1f}%) and can be checked")
    ids = sorted({obs_id(p) for _, p in withobs})
    dead = dead_observations(ids)
    removed = kept_last = 0
    for a in animals:
        keep = [p for p in a["photos"] if obs_id(p) not in dead]
        if len(keep) != len(a["photos"]):
            if not keep:                       # never leave an animal with none
                keep = a["photos"][:1]; kept_last += 1
            removed += len(a["photos"]) - len(keep)
            if not DRY:
                a["photos"] = keep
    print(f"   {len(dead)} observations annotated Dead -> {removed} photos removed"
          + (f", {kept_last} animals kept a last photo rather than be left blank" if kept_last else ""))

    # ---- 2. felines = every extant wild cat, once ------------------------
    print("\n2. felines")
    by_sci = {a["sci"]: a for a in animals}
    for a in animals:
        if a["sci"] == "Felis catus" and "felines" in a.get("cats", []):
            if not DRY:
                a["cats"] = ["mammals"]          # a house cat is not a wild cat
            print("   Domestic Cat moved out of Felines -> Mammals")
    wild = extant_wild_cats()
    print(f"   {len(wild)} extant wild cat species according to iNaturalist")
    have = {a["sci"] for a in animals if "felines" in a.get("cats", [])}
    missing = [s for s in wild if s not in by_sci]
    present_wrong_cat = [s for s in wild if s in by_sci and s not in have]
    print(f"   already in Felines: {len(have & set(wild))}")
    print(f"   in the game but filed elsewhere: {len(present_wrong_cat)}")
    print(f"   missing from the game entirely: {len(missing)}")

    for s in present_wrong_cat:
        if not DRY:
            by_sci[s]["cats"] = ["felines"]
    added = 0
    for s in missing:
        t = wild[s]
        common = (t.get("preferred_common_name") or s).strip()
        ph = live_photo(t["id"])
        time.sleep(1.1)
        if not ph:
            print(f"      no photo for {common} ({s}) -- skipped"); continue
        if not DRY:
            animals.append({"id": t["id"], "tier": "death", "group": "Mammalia",
                            "name": common.title(), "sci": s,
                            "aliases": [common.lower()], "cats": ["felines"],
                            "photos": [ph]})
        added += 1
        print(f"      + {common.title():32s} {s}")
    print(f"   added {added}")

    if DRY:
        print("\n(dry run -- nothing written)"); return
    json.dump(d, open(DATA, "w"), indent=1)
    fel = [a for a in animals if "felines" in a.get("cats", [])]
    print(f"\nwrote data/animals.json -- felines now {len(fel)}, "
          f"{len(animals):,} animals total")


if __name__ == "__main__":
    main()
