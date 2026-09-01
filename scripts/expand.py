#!/usr/bin/env python3
"""Expand data/animals.json with the most-photographed animals on Earth.

Source is the same as the curated core: iNaturalist research-grade observations,
i.e. real photographs taken by real people. Nothing AI-generated.

Species are pulled in descending order of how often people photograph them,
which is also a decent proxy for how likely someone is to recognise one -- so
observation count drives the difficulty tier.

The hand-curated animals already in the file are never overwritten: their
tiers, aliases and multiple photos are better than anything derived here.

    python3 scripts/expand.py [target_count]
"""
import json, sys, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "animals.json")
UA = "AnimalGuesser/1.0 (hobby game; +https://github.com/mattschwartz691/AnimalGuesser)"
PER_PAGE = 500

# iNaturalist taxon ids, each verified against the API rather than guessed.
SEA_CLADES = {
    196614,  # Chondrichthyes - sharks, rays
    47273,   # Elasmobranchii
    152871,  # Cetacea - whales, dolphins
    46306,   # Sirenia - manatees, dugongs
    41687,   # Phocidae - true seals
    41736,   # Otariidae - eared seals, sea lions
    41764,   # Odobenidae - walruses
    47549,   # Echinodermata - sea stars, urchins, crinoids
    47534,   # Cnidaria - jellyfish, corals, anemones
    51508,   # Ctenophora - comb jellies
    48824,   # Porifera - sponges
    47459,   # Cephalopoda - octopus, squid, cuttlefish
    47584,   # Bivalvia - clams, mussels, oysters
    47429,   # Polyplacophora - chitons
    47113,   # Nudibranchia - sea slugs
}
FISH_CLADES = {
    47178,   # Actinopterygii - ray-finned fish
    196614,  # Chondrichthyes
    47273,   # Elasmobranchii
    49099,   # Myxini - hagfish
    49231,   # Petromyzonti - lampreys
}
LAND_SNAILS = 47485    # Stylommatophora - land snails and slugs
LAND_CLASSES = {"Insecta", "Arachnida", "Aves", "Mammalia", "Reptilia", "Amphibia"}


def get(page):
    q = urllib.parse.urlencode({"taxon_id": 1, "quality_grade": "research",
                                "per_page": PER_PAGE, "page": page})
    req = urllib.request.Request(
        "https://api.inaturalist.org/v1/observations/species_counts?" + q,
        headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception:
            if attempt == 3:
                raise
            time.sleep(3 * (attempt + 1))


def big(url):
    return re.sub(r"/(square|small|medium|large|original)\.", "/large.", url or "")


def categorise(t):
    """Categories from taxonomy alone -- this has to scale to tens of thousands
    of species, so unlike the curated core it cannot be hand-checked. Marine
    status is inferred from wholly-marine clades; a fish not in one of them is
    left uncategorised as to habitat, because the taxonomy cannot tell a
    freshwater species from a marine one."""
    anc = set(t.get("ancestor_ids") or [])
    ic = t.get("iconic_taxon_name") or ""
    cats = set()
    marine = bool(anc & SEA_CLADES)

    if ic == "Mammalia":   cats.add("mammals")
    elif ic == "Aves":     cats.add("birds")
    elif ic == "Reptilia": cats.add("reptiles")
    elif ic == "Amphibia": cats.add("amphibians")
    elif ic in ("Insecta", "Arachnida"): cats.add("bugs")
    if ic == "Actinopterygii" or (anc & FISH_CLADES):
        cats.add("fish")
    if marine:
        cats.add("sea")

    if ic == "Mollusca" and not marine:
        # land snails and slugs; every other mollusc lives in the water
        if LAND_SNAILS in anc:
            cats.update(["bugs", "land"])
        else:
            cats.add("sea")

    if ic in LAND_CLASSES and not marine:
        cats.add("land")
    if not cats:
        # centipedes, millipedes, springtails, land flatworms
        cats.update(["bugs", "land"])
    return sorted(cats)


def aliases_for(common):
    """Accept the full common name, and also its last word -- the curated core
    already accepts "eagle" for a Bald Eagle, so the expansion should behave the
    same way rather than demanding the exact full name."""
    c = common.lower().strip()
    out = {c}
    last = re.sub(r"[^a-z0-9-]", "", c.split()[-1]) if c.split() else ""
    if len(last) >= 3 and last.isalpha():
        out.add(last)
    return sorted(out)


def tier_for(count):
    if count >= 20000: return "easy"
    if count >= 5000:  return "medium"
    if count >= 1200:  return "hard"
    return "death"


def main():
    target = int(sys.argv[1]) if len(sys.argv) > 1 else 30000
    d = json.load(open(DATA))
    if d.get("v") == 2:
        sys.exit("data/animals.json is packed; run: python3 scripts/pack.py --unpack")
    existing = {a["id"] for a in d["animals"]}
    curated = len(d["animals"])
    added, skipped, page = [], 0, 1

    print(f"Curated core: {curated} animals (kept as-is)")
    print(f"Fetching up to {target:,} most-observed animals...\n")
    t0 = time.time()
    seen = 0
    while seen < target:
        try:
            res = get(page).get("results", [])
        except Exception as e:
            print(f"  stopped at page {page}: {e}")
            break
        if not res:
            break
        for r in res:
            seen += 1
            t, n = r["taxon"], r["count"]
            if t["id"] in existing:
                continue
            common = t.get("preferred_common_name")
            photo = t.get("default_photo") or {}
            url = big(photo.get("medium_url") or photo.get("url"))
            # must be nameable and photographed, and not extinct
            if not common or not url or t.get("extinct"):
                skipped += 1
                continue
            if t.get("rank") not in ("species", "subspecies"):
                skipped += 1
                continue
            added.append({
                "id": t["id"], "tier": tier_for(n), "name": common,
                "sci": t["name"], "aliases": aliases_for(common),
                "group": t.get("iconic_taxon_name") or "",
                "obs": n,
                "cats": categorise(t),
                "photos": [{"url": url,
                            "credit": re.sub(r"\s+", " ", photo.get("attribution") or "").strip()}],
            })
            existing.add(t["id"])
        if page % 10 == 0:
            print(f"  page {page:3d}  scanned {seen:6,}  kept {len(added):6,}  "
                  f"({time.time()-t0:.0f}s)")
        page += 1
        time.sleep(1.1)

    d["animals"].extend(added)
    d["counts"] = {t: sum(1 for a in d["animals"] if a["tier"] == t)
                   for t in ("easy", "medium", "hard", "death")}
    d["expanded"] = time.strftime("%Y-%m-%d")
    with open(DATA, "w") as f:
        json.dump(d, f, separators=(",", ":"))

    print(f"\n{'='*60}")
    print(f"  scanned  {seen:,}   added {len(added):,}   skipped {skipped:,} "
          f"(no common name / not a species / extinct)")
    print(f"  TOTAL    {len(d['animals']):,} animals")
    print(f"  tiers    {d['counts']}")
    print(f"  file     {os.path.getsize(DATA)/1e6:.1f} MB")


if __name__ == "__main__":
    main()
