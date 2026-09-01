#!/usr/bin/env python3
"""Build data/animals.json -- a static lookup table of REAL animal photos.

Source: iNaturalist. Every photo is a research-grade observation uploaded by a
human naturalist and community-verified. Nothing here is AI-generated.

The game reads the resulting JSON and loads image URLs directly, so it never
needs to hit an API at play time.
"""
import json, os, re, sys, threading, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from species import TIERS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "animals.json")
PHOTOS_PER_ANIMAL = 8
UA = "AnimalGuesser/1.0 (hobby game; +https://github.com/mattschwartz691/AnimalGuesser)"

# Names where iNaturalist's accepted taxonomy differs from the one in species.py.
# Each target was checked by hand to be the same animal (see README).
SCI_SYNONYMS = {
    "Bison bison": "Bos bison",
    "Vicugna pacos": "Lama pacos",
    "Vicugna vicugna": "Lama vicugna",
    "Herpestes edwardsii": "Urva edwardsii",
    "Manta birostris": "Mobula birostris",
    "Cephalophus zebra": "Cephalophula zebra",
    "Echinosorex gymnura": "Echinosorex gymnurus",
    "Strigops habroptila": "Strigops habroptilus",
    "Bettongia penicillata": "Bettongia ogilbyi",
    "Giraffa camelopardalis reticulata": "Giraffa reticulata",
}

# --- polite rate limiter: ~90 requests/minute across all threads -------------
class Limiter:
    def __init__(self, per_min):
        self.interval = 60.0 / per_min
        self.lock = threading.Lock()
        self.next_at = time.monotonic()

    def wait(self):
        with self.lock:
            now = time.monotonic()
            if self.next_at < now:
                self.next_at = now
            delay = self.next_at - now
            self.next_at += self.interval
        if delay > 0:
            time.sleep(delay)

LIM = Limiter(90)
_print_lock = threading.Lock()


def get(url, params):
    LIM.wait()
    full = url + "?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            req = urllib.request.Request(full, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.load(r)
        except Exception as e:
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))
    return None


def big(url):
    """iNat photo URLs end in square.jpg / medium.jpg -- ask for the large one."""
    return re.sub(r"/(square|small|medium|large|original)\.", "/large.", url)


def wiki_photo(sciname, wiki_url):
    """Fallback: Wikipedia lead image. Restricted to .jpg/.jpeg so we keep
    real photographs and skip diagrams / line drawings / range maps."""
    title = None
    if wiki_url:
        title = urllib.parse.unquote(wiki_url.rstrip("/").rsplit("/", 1)[-1])
    for t in filter(None, [title, sciname.replace(" ", "_")]):
        try:
            LIM.wait()
            req = urllib.request.Request(
                "https://en.wikipedia.org/api/rest_v1/page/summary/"
                + urllib.parse.quote(t, safe=""),
                headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.load(r)
        except Exception:
            continue
        img = ((d.get("originalimage") or {}).get("source") or "").split("?")[0]
        if img.lower().endswith((".jpg", ".jpeg")):
            return [{"url": img,
                     "credit": "Wikimedia Commons",
                     "obs": d.get("content_urls", {}).get("desktop", {}).get("page", "")}]
    return []


def lookup(name):
    """Exact scientific-name lookup. Tries autocomplete first: the plain search
    endpoint silently fails on tautonyms ("Lynx lynx", "Mola mola")."""
    want = name.lower()
    for url, params in (
        ("https://api.inaturalist.org/v1/taxa/autocomplete",
         {"q": name, "per_page": 10}),
        ("https://api.inaturalist.org/v1/taxa",
         {"q": name, "per_page": 20, "is_active": "true"}),
    ):
        try:
            d = get(url, params)
        except Exception:
            continue
        for t in d.get("results", []):
            if t.get("name", "").lower() == want:
                return t
    return None


def resolve(sciname):
    """scientific name -> taxon record, or (None, reason)."""
    t = lookup(sciname)
    # A name can resolve to a taxon iNat marks extinct while the living animal
    # sits under a different accepted name -- so retry the synonym in that case
    # too, not only when the first lookup finds nothing at all.
    if (t is None or t.get("extinct")) and sciname in SCI_SYNONYMS:
        t = lookup(SCI_SYNONYMS[sciname]) or t
    if t is None:
        return None, "no exact name match"
    if t.get("extinct"):
        return None, "extinct"
    if t.get("iconic_taxon_name") in ("Plantae", "Fungi", "Protozoa", "Chromista"):
        return None, "not-an-animal: " + str(t.get("iconic_taxon_name"))
    return t, None


def photos_for(taxon_id):
    """Distinct research-grade observation photos, most-faved first."""
    out, seen = [], set()
    for page in (1, 2):
        try:
            d = get("https://api.inaturalist.org/v1/observations", {
                "taxon_id": taxon_id, "photos": "true", "quality_grade": "research",
                "per_page": 30, "page": page, "order_by": "votes", "order": "desc",
            })
        except Exception:
            break
        for o in d.get("results", []):
            ph = (o.get("photos") or [])
            if not ph:
                continue
            p = ph[0]
            url = big(p.get("url", ""))
            if not url or url in seen:
                continue
            seen.add(url)
            out.append({
                "url": url,
                "credit": re.sub(r"\s+", " ", (p.get("attribution") or "")).strip(),
                "obs": f"https://www.inaturalist.org/observations/{o.get('id')}",
            })
            if len(out) >= PHOTOS_PER_ANIMAL:
                return out
        if d.get("total_results", 0) <= 30:
            break
    return out


def work(job):
    tier, sciname, aliases = job
    try:
        taxon, why = resolve(sciname)
        if taxon is None:
            return {"sci": sciname, "tier": tier, "skip": why}
        pics = photos_for(taxon["id"])
        if len(pics) < 2:
            have = {p["url"] for p in pics}
            pics += [p for p in wiki_photo(sciname, taxon.get("wikipedia_url"))
                     if p["url"] not in have]
        if not pics:
            return {"sci": sciname, "tier": tier, "skip": "no photos found"}
        common = taxon.get("preferred_common_name")
        if not common:
            # iNat has no common name -- use the best curated alias, title-cased.
            common = max(aliases, key=len).title() if aliases else sciname
        rec = {
            "id": taxon["id"], "tier": tier, "name": common, "sci": taxon["name"],
            "aliases": sorted({a.lower() for a in aliases}),
            "group": taxon.get("iconic_taxon_name") or "",
            "wiki": taxon.get("wikipedia_url") or "",
            "photos": pics,
        }
        with _print_lock:
            print(f"  ok   {tier:6s} {common[:34]:34s} {len(pics)} photos", flush=True)
        return rec
    except Exception as e:
        return {"sci": sciname, "tier": tier, "skip": f"error: {e}"}


def main():
    jobs = [(tier, sci, al) for tier, lst in TIERS.items() for sci, al in lst]
    only = set(sys.argv[1:])
    if only:
        jobs = [j for j in jobs if j[1] in only]
        print(f"--only mode: rebuilding {len(jobs)} species and merging\n")
    print(f"Resolving {len(jobs)} species from iNaturalist (~90 req/min, 4 threads)\n")
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=4) as ex:
        results = list(ex.map(work, jobs))

    good = [r for r in results if "skip" not in r]
    bad = [r for r in results if "skip" in r]

    if only and os.path.exists(OUT):
        good = json.load(open(OUT))["animals"] + good

    # Stable, de-duplicated by taxon id
    byid, ordered = set(), []
    for r in good:
        if r["id"] in byid:
            continue
        byid.add(r["id"])
        ordered.append(r)
    ordered.sort(key=lambda r: (["easy", "medium", "hard", "death"].index(r["tier"]), r["name"]))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump({
            "source": "iNaturalist research-grade observations (real photographs, "
                      "community-verified, CC-licensed). No AI-generated imagery.",
            "built": time.strftime("%Y-%m-%d"),
            "counts": {t: sum(1 for r in ordered if r["tier"] == t)
                       for t in ("easy", "medium", "hard", "death")},
            "animals": ordered,
        }, f, indent=1)

    print(f"\n{'='*60}\nWrote {OUT}")
    print(f"  kept    {len(ordered)}   ({time.time()-t0:.0f}s)")
    for t in ("easy", "medium", "hard", "death"):
        print(f"    {t:6s} {sum(1 for r in ordered if r['tier']==t)}")
    print(f"  photos  {sum(len(r['photos']) for r in ordered)}")
    if bad:
        print(f"\n  DROPPED {len(bad)}:")
        for r in bad:
            print(f"    {r['tier']:6s} {r['sci']:38s} {r['skip']}")


if __name__ == "__main__":
    main()
