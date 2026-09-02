#!/usr/bin/env python3
"""Add domestic breeds as their own category.

iNaturalist cannot supply these: a breed is not a taxonomic rank, so
`Felis catus` has no children there and searching it for "Maine Coon"
returns nothing. The source is Wikipedia -- each breed article's lead
photograph, which is a real photograph of a real animal.

Difficulty comes from how widely the article is read, ranked against the
other breeds so every level stays playable.

    python3 scripts/add_breeds.py cats
    python3 scripts/add_breeds.py dogs
"""
import json, os, re, sys, time, urllib.parse, urllib.request
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "animals.json")
UA = "AnimalGuesser/1.0 (hobby game; +https://github.com/mattschwartz691/AnimalGuesser)"
# Each breed set gets its own id range, far above any iNaturalist taxon id,
# so re-running one never disturbs the other.
BREEDS = {
    "cats": {
        "key": "catbreeds", "id_base": 900000000,
        "include": ["Category:Cat breeds"], "exclude": [],
        "cats": ["catbreeds", "felines", "land", "mammals"],
    },
    "dogs": {
        "key": "dogbreeds", "id_base": 910000000,
        # FCI is the international kennel federation's recognised list; the
        # plain "Category:Dog breeds" holds only meta articles.
        # FCI is the international federation's recognised list; a few
        # household breeds (the dachshund) sit outside it, so the German and
        # British origin categories fill those gaps.
        "include": ["Category:FCI breeds",
                    "Category:Dog breeds originating in Germany",
                    "Category:Dog breeds originating in the United Kingdom",
                    "Category:Dog breeds originating in the United States"],
        "exclude": ["Category:Extinct dog breeds"],
        "cats": ["dogbreeds", "land", "mammals"],
    },
}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.load(r)


def members(category):
    out, cont = [], None
    while True:
        q = {"action": "query", "list": "categorymembers",
             "cmtitle": category, "cmlimit": "500",
             "cmtype": "page", "format": "json"}
        if cont:
            q["cmcontinue"] = cont
        d = get("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(q))
        out += [m["title"] for m in d["query"]["categorymembers"]]
        cont = d.get("continue", {}).get("cmcontinue")
        if not cont:
            break
        time.sleep(0.4)
    return out


def breed_titles(cfg):
    keep = []
    for c in cfg["include"]:
        keep += members(c)
    drop = set()
    for c in cfg["exclude"]:
        drop |= set(members(c))          # no extinct breeds, as everywhere else
    seen, out = set(), []
    for t in keep:
        if t in drop or t in seen:
            continue
        # Drop index articles, but keep breeds whose title merely carries a
        # "(dog breed)" disambiguator -- that filter had been throwing away
        # Boxer, Chihuahua, Akita, Pointer and ten others.
        low = t.lower()
        if low.startswith(("list of", "category:")) or low.endswith(" dog breeds"):
            continue
        seen.add(t)
        out.append(t)
    return out


def views(title):
    """Average monthly article views over the past year."""
    end = date.today().replace(day=1)
    start = end - timedelta(days=365)
    url = ("https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/"
           "en.wikipedia/all-access/user/" + urllib.parse.quote(title, safe="") +
           "/monthly/" + start.strftime("%Y%m01") + "/" + end.strftime("%Y%m01"))
    try:
        items = get(url).get("items", [])
        return sum(i["views"] for i in items) // max(1, len(items))
    except Exception:
        return 0


def credit_for(img_url):
    """Photographer and licence from the Commons file page."""
    fname = urllib.parse.unquote(img_url.rsplit("/", 1)[-1])
    q = {"action": "query", "titles": "File:" + fname, "prop": "imageinfo",
         "iiprop": "extmetadata", "format": "json"}
    try:
        d = get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(q))
        page = next(iter(d["query"]["pages"].values()))
        meta = page["imageinfo"][0]["extmetadata"]
        who = re.sub(r"<[^>]+>", "", meta.get("Artist", {}).get("value", "")).strip()
        lic = meta.get("LicenseShortName", {}).get("value", "").strip()
        who = re.sub(r"\[[^\]]*\]", "", who)          # strip "[ dead link ]" etc
        who = re.sub(r"\s+", " ", who).strip()[:70]
        if who and lic:
            return f"(c) {who}, {lic} via Wikimedia Commons"
        return (who or lic or "Wikimedia Commons") + " via Wikimedia Commons"
    except Exception:
        return "Wikimedia Commons"


def tiers_by_rank(views_list):
    """Split the breeds into four equal bands by how widely read they are.

    Absolute thresholds put 61 of 84 breeds in Death Mode, which made
    "Cat Breeds + Easy" a one-animal category. Ranking them against each
    other keeps every difficulty playable: the famous breeds are easy, the
    obscure ones are not."""
    s = sorted(views_list, reverse=True)
    n = len(s)
    cut = [s[min(n - 1, n * k // 4)] for k in (1, 2, 3)]
    def pick(v):
        if v >= cut[0]: return "easy"
        if v >= cut[1]: return "medium"
        if v >= cut[2]: return "hard"
        return "death"
    return pick


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else ""
    if which not in BREEDS:
        sys.exit(__doc__)
    cfg = BREEDS[which]
    lo, hi = cfg["id_base"], cfg["id_base"] + 9999999
    d = json.load(open(DATA))
    if d.get("v") == 2:
        sys.exit("data/animals.json is packed; run: python3 scripts/pack.py --unpack")
    d["animals"] = [a for a in d["animals"] if not (lo <= a["id"] <= hi)]  # idempotent

    titles = breed_titles(cfg)
    print(f"{which}: {len(titles)} breed articles\n")
    added, skipped, seen = [], [], set()
    for n, t in enumerate(titles, 1):
        try:
            s = get("https://en.wikipedia.org/api/rest_v1/page/summary/" +
                    urllib.parse.quote(t.replace(" ", "_"), safe=""))
        except Exception as e:
            skipped.append((t, str(e)[:40])); continue
        # Category members include redirects ("Manx cat", "Manx (cat)") that all
        # resolve to one article. Deduplicate on the canonical page.
        canon = (s.get("titles") or {}).get("canonical") or s.get("title") or t
        if canon in seen:
            continue
        seen.add(canon)
        img = ((s.get("originalimage") or {}).get("source") or "").split("?")[0]
        if not img.lower().endswith((".jpg", ".jpeg")):
            skipped.append((t, "no photograph")); continue
        # "Abyssinian cat" -> "Abyssinian", but "Bernese Mountain Dog" keeps its
        # Dog: only a lower-case trailing word is a disambiguator, not a name.
        name = re.sub(r"\s*\((?:cat|dog)(?: breed)?\)$", "", s.get("title") or t)
        name = re.sub(r"\s+(?:cat|dog)$", "", name).strip()
        v = views(canon)          # views must be read off the real article
        added.append({
            "id": cfg["id_base"] + n, "tier": "death", "name": name, "sci": "",
            "obs": v,
            "aliases": sorted({name.lower(), name.lower() + " cat"}),
            "group": "Mammalia",
            "cats": list(cfg["cats"]),
            "photos": [{"url": img, "credit": credit_for(img),
                        "obs": s.get("content_urls", {}).get("desktop", {}).get("page", "")}],
        })
        print(f"  {name[:28]:28s} {v:7,} views/mo")
        time.sleep(0.5)

    pick = tiers_by_rank([a["obs"] for a in added])
    for a in added:
        a["tier"] = pick(a["obs"])
    d["animals"].extend(added)
    json.dump(d, open(DATA, "w"), indent=1)
    import collections
    print(f"\nadded {len(added)} breeds; skipped {len(skipped)}")
    print("  tiers:", dict(collections.Counter(a["tier"] for a in added)))
    for t in ("easy", "medium", "hard", "death"):
        names = [a["name"] for a in added if a["tier"] == t]
        print(f"    {t:6s} {', '.join(sorted(names)[:8])}"
              + (" ..." if len(names) > 8 else ""))
    for t, why in skipped:
        print(f"    {t[:40]:40s} {why}")


if __name__ == "__main__":
    main()
