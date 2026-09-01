#!/usr/bin/env python3
"""Pack data/animals.json into a compact form for the browser.

The repository has never stored photographs -- only links to them -- but the
metadata around those links was repetitive enough to dominate the file: the
same host prefix 27,000 times, the same licence sentence 13,000 times, and a
JSON key name repeated on every single record.

This rewrites the file as positional arrays against a legend, which the game
unpacks on load. No information the game uses is lost, and photographer
attribution is preserved in full.
"""
import json, os, re, sys, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "animals.json")
CATS = ["mammals","reptiles","birds","sea","fish","amphibians","land","bugs",
        "nabirds"]
TIERS = ["easy","medium","hard","death"]

URL_RE = re.compile(r"^(https://\S+?/photos/)(\d+)/large(\.?[A-Za-z]*)$")
OBS_RE = re.compile(r"^https://www\.inaturalist\.org/observations/(\d+)$")
LIC_RE = re.compile(r",\s*(some rights reserved \([^)]*\)|all rights reserved|"
                    r"no rights reserved[^,]*)\s*$")


def split_credit(c):
    """-> (photographer, licence phrase). Handles names containing commas."""
    c = (c or "").strip()
    if not c:
        return "", ""
    stripped = re.sub(r",\s*uploaded by.*$", "", c)
    m = LIC_RE.search(stripped)
    if not m:
        # Non-English licence wording (French, Spanish, Thai, ...). Keep the
        # attribution exactly as given rather than taking it apart wrongly.
        return c, ""
    lic = m.group(1)
    who = re.sub(r"^\(c\)\s*", "", stripped[:m.start()]).strip().rstrip(",")
    return who, lic


class Legend:
    def __init__(self): self.items, self.index = [], {}
    def id(self, v):
        if v not in self.index:
            self.index[v] = len(self.items); self.items.append(v)
        return self.index[v]


def unpack():
    """Restore the verbose form so the build scripts can run against it."""
    d = json.load(open(DATA))
    if d.get("v") != 2:
        print("already unpacked"); return
    L = d["L"]
    animals = []
    for (i, t, g, name, sci, extra, mask, photos) in d["a"]:
        ph = []
        for (h, pid, e, cred, li, obs) in photos:
            lic = L["l"][li]
            ph.append({
                "url": pid if h < 0 else L["h"][h] + str(pid) + "/large" + L["e"][e],
                "credit": (f"(c) {cred}, {lic}" if (cred and lic) else cred),
                "obs": (f"https://www.inaturalist.org/observations/{obs}"
                        if isinstance(obs, int) and obs else (obs or "")),
            })
        animals.append({"id": i, "tier": L["t"][t], "name": name, "sci": sci,
                        "aliases": sorted({name.lower(), *extra}),
                        "group": L["g"][g],
                        "cats": [c for k, c in enumerate(L["c"]) if mask & (1 << k)],
                        "photos": ph})
    json.dump({"source": d.get("source",""), "counts": d.get("counts",{}),
               "animals": animals}, open(DATA, "w"), indent=1)
    print(f"unpacked {len(animals):,} animals -> verbose form")


def main():
    if "--unpack" in sys.argv:
        unpack(); return
    d = json.load(open(DATA))
    if d.get("v") == 2:
        print("already packed"); return
    groups, hosts, exts, lics = Legend(), Legend(), Legend(), Legend()
    out = []
    for a in d["animals"]:
        mask = 0
        for c in a.get("cats", []):
            if c in CATS: mask |= 1 << CATS.index(c)
        low = a["name"].lower()
        extra = [x for x in a.get("aliases", []) if x != low]
        photos = []
        for p in a["photos"]:
            cred, lic = split_credit(p.get("credit"))
            li = lics.id(lic)
            o = p.get("obs") or ""
            m = OBS_RE.match(o)
            obs = int(m.group(1)) if m else (o or 0)
            u = URL_RE.match(p["url"])
            if u:
                # group(3) keeps the dot, so ".../large." round-trips exactly
                photos.append([hosts.id(u.group(1)), int(u.group(2)),
                               exts.id(u.group(3)), cred, li, obs])
            else:                                    # keep the full URL as-is
                photos.append([-1, p["url"], 0, cred, li, obs])
        out.append([a["id"], TIERS.index(a["tier"]), groups.id(a.get("group","")),
                    a["name"], a["sci"], extra, mask, photos])

    packed = {
        "v": 2,
        "source": d.get("source",""),
        "note": "Photographs are not stored here -- only links to them, plus "
                "the photographer credit each licence requires.",
        "counts": d.get("counts", {}),
        "L": {"t": TIERS, "c": CATS, "g": groups.items,
              "h": hosts.items, "e": exts.items, "l": lics.items},
        "a": out,
    }
    before = os.path.getsize(DATA)
    with open(DATA, "w") as f:
        json.dump(packed, f, separators=(",", ":"))
    after = os.path.getsize(DATA)
    print(f"  {len(out):,} animals, {sum(len(x[7]) for x in out):,} photo links")
    print(f"  legend: {len(groups.items)} groups, {len(hosts.items)} hosts, "
          f"{len(exts.items)} extensions, {len(lics.items)} licences")
    print(f"  {before/1e6:.1f} MB -> {after/1e6:.1f} MB  "
          f"({100*(before-after)/before:.0f}% smaller)")


if __name__ == "__main__":
    main()
