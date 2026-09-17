#!/usr/bin/env python3
"""Flowers and trees for Things Guesser, from iNaturalist.

Real photographs by real people, credited, same as the animals.

Difficulty is by how familiar the plant is, which no dataset knows, so it
comes from a curated band per genus -- household, garden, wild, exotic for
flowers; and for trees, the ones everyone can name through to the obscure.
Within a genus the most-observed species keeps its band and the rarer ones
drop a tier or two, so an ordinary garden rose is easy while a rare wild rose
is not.

Trees get two photographs. iNaturalist has no annotation for "this photo is
the leaves" -- nothing does -- but it does record whether an observation had
green leaves, so the second photo is drawn from one of those. That biases it
towards foliage; it does not guarantee it.

    python3 scripts/things/build_plants.py [species-per-genus]
"""
import json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "data", "things_plants.json")
UA = "AnimalGuesser/1.0 (hobby game; +https://github.com/mattschwartz691/AnimalGuesser)"
LEAVES, GREEN_LEAVES = 36, 38
TIERS = ["easy", "medium", "hard", "death"]

# --- flowers: household -> garden -> wild -> exotic -------------------------
FLOWERS = {
 "easy": ["Rosa", "Tulipa", "Helianthus", "Narcissus", "Lilium", "Chrysanthemum",
          "Gerbera", "Hyacinthus", "Dianthus", "Paeonia", "Dahlia", "Iris",
          "Papaver", "Viola", "Taraxacum", "Hydrangea", "Begonia", "Petunia",
          "Hibiscus", "Lavandula", "Phalaenopsis"],
 "medium": ["Delphinium", "Digitalis", "Echinacea", "Rudbeckia", "Crocus",
            "Gladiolus", "Fuchsia", "Camellia", "Wisteria", "Clematis", "Zinnia",
            "Cosmos", "Antirrhinum", "Calendula", "Campanula", "Geranium",
            "Salvia", "Aster", "Anemone", "Primula", "Freesia", "Ranunculus"],
 "hard": ["Trifolium", "Nymphaea", "Orchis", "Passiflora", "Achillea",
          "Lupinus", "Verbascum", "Silene", "Centaurea", "Linaria"],
 "death": ["Protea", "Strelitzia", "Heliconia", "Plumeria", "Anthurium",
           "Nepenthes", "Rafflesia", "Stapelia", "Puya", "Welwitschia"],
}
# --- trees: the ones anyone can name -> the obscure -------------------------
TREES = {
 "easy": ["Quercus", "Acer", "Pinus", "Betula", "Salix", "Fagus", "Populus",
          "Picea", "Malus", "Prunus", "Ficus", "Cocos", "Citrus", "Ginkgo",
          "Sequoia", "Olea", "Aesculus", "Ilex"],
 "medium": ["Fraxinus", "Tilia", "Ulmus", "Abies", "Cedrus", "Eucalyptus",
            "Juglans", "Platanus", "Carpinus", "Alnus", "Castanea", "Juniperus",
            "Cupressus", "Thuja", "Larix", "Tsuga", "Sorbus", "Cornus",
            "Catalpa", "Phoenix", "Magnolia"],
 "hard": ["Carya", "Liquidambar", "Araucaria", "Taxus", "Nothofagus",
          "Metasequoia", "Zelkova", "Celtis", "Ostrya", "Pterocarya"],
 "death": ["Adansonia", "Dracaena", "Pandanus", "Casuarina", "Diospyros",
           "Terminalia", "Bombax", "Delonix", "Ceiba", "Brachychiton"],
}


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
                return {}
            time.sleep(2 + 2 * attempt)
    return {}


def big(url):
    return re.sub(r"/(square|small|medium|large|original)\.", "/large.", url or "")


def photo_of(ph, obs_id=None):
    u = big(ph.get("url") or ph.get("medium_url"))
    if not u:
        return None
    return {"url": u,
            "credit": re.sub(r"\s+", " ", ph.get("attribution") or "").strip(),
            "obs": f"https://www.inaturalist.org/observations/{obs_id}" if obs_id else ""}


def leafy_photo(taxon_id, avoid_url):
    """A photo from an observation recorded as having green leaves."""
    d = api("observations", {"taxon_id": taxon_id, "quality_grade": "research",
                            "photos": "true", "term_id": LEAVES,
                            "term_value_id": GREEN_LEAVES,
                            "order_by": "votes", "per_page": 6})
    for o in d.get("results", []):
        for ph in o.get("photos", []):
            p = photo_of(ph, o["id"])
            if p and p["url"] != avoid_url:
                return p
    return None


def genus_id(name):
    d = api("taxa", {"q": name, "rank": "genus", "per_page": 5})
    for t in d.get("results", []):
        if (t.get("name") or "").lower() == name.lower():
            return t["id"]
    return None


def step(tier, by):
    return TIERS[min(len(TIERS) - 1, TIERS.index(tier) + by)]


def collect(bands, cat, per_genus, want_leaf):
    out, seen = [], set()
    total = sum(len(v) for v in bands.values())
    n = 0
    for band, genera in bands.items():
        for g in genera:
            n += 1
            gid = genus_id(g)
            time.sleep(1.1)
            if not gid:
                print(f"   [{n}/{total}] {g:16s} -- not found"); continue
            d = api("observations/species_counts",
                    {"taxon_id": gid, "quality_grade": "research", "per_page": per_genus})
            time.sleep(1.1)
            kept = 0
            for rank, r in enumerate(d.get("results", [])):
                t = r.get("taxon") or {}
                common = (t.get("preferred_common_name") or "").strip()
                sci = t.get("name") or ""
                first = photo_of(t.get("default_photo") or {})
                if not common or not first or t.get("extinct") or sci in seen:
                    continue
                seen.add(sci)
                # the best-known species of a genus keeps its band; rarer ones drop
                tier = step(band, 0 if rank == 0 else 1 if rank < 3 else 2)
                photos = [first]
                if want_leaf:
                    leaf = leafy_photo(t["id"], first["url"])
                    time.sleep(1.1)
                    if leaf:
                        photos.append(leaf)
                out.append({"id": t["id"], "tier": tier, "group": "Plantae",
                            "name": common.title(), "sci": sci,
                            "aliases": [common.lower()], "cats": [cat],
                            "photos": photos})
                kept += 1
            got2 = sum(1 for x in out[-kept:] if len(x["photos"]) > 1) if kept else 0
            print(f"   [{n}/{total}] {g:16s} {kept:2d} species"
                  + (f", {got2} with a leaf photo" if want_leaf else "")
                  + f"  ({band})")
    return out


def main():
    per = int(sys.argv[1]) if len(sys.argv) > 1 else 6
    print(f"Flowers ({sum(len(v) for v in FLOWERS.values())} genera, {per} species each)")
    flowers = collect(FLOWERS, "flowers", per, want_leaf=False)
    print(f"\nTrees ({sum(len(v) for v in TREES.values())} genera, {per} species each)")
    trees = collect(TREES, "trees", per, want_leaf=True)
    json.dump({"flowers": flowers, "trees": trees}, open(OUT, "w"), indent=1)
    two = sum(1 for t in trees if len(t["photos"]) > 1)
    print(f"\nwrote {len(flowers)} flowers + {len(trees)} trees "
          f"({two} trees have a second, leaf-biased photo) -> {OUT}")


if __name__ == "__main__":
    main()
