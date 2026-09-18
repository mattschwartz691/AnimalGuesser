#!/usr/bin/env python3
"""Flags and country outlines for Things Guesser.

Neither is a photograph, so neither comes from iNaturalist:

  flags     linked from flagcdn.com, one per ISO country code
  outlines  drawn here from Natural Earth 10m (public domain)

Both are tiered by population, on one shared rule, so they agree with each
other about which countries are the easy ones.

The outlines are written as small SVG files under data/things/, so the game
can point an <img> at them exactly as it points one at a photograph.

    python3 scripts/things/build_world_sky.py <source-dir>
"""
import io, json, math, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import countries

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUTDIR = os.path.join(ROOT, "data", "things")
INK, EDGE = "#eef2f7", "#243044"
# Douglas-Peucker tolerance, in pixels of the 400x300 board an outline is drawn
# on. The photo frame is about 1.6x that and full screen perhaps 4x, so 0.08
# here is a third of a pixel at the largest anyone will see it: everything
# visible is kept, and the files stay a third of the size of keeping it all.
TOLERANCE = 0.08


def _area(r):
    return abs(sum(r[i][0] * r[i-1][1] - r[i-1][0] * r[i][1] for i in range(len(r)))) / 2

def _centroid(r):
    return (sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r))

def drop_far_territories(rings, margin=4.5):
    """Keep the homeland and anything chained to it; drop isolated outliers.

    A plain distance-from-the-centre test cannot serve both Indonesia and
    Norway: Indonesia's islands run 45 degrees east from Java and all belong,
    while Svalbard sits 5 degrees off Norway with open sea between and wrecks
    the bounding box if kept. So this grows outward instead -- start at the
    largest landmass and repeatedly take in any ring within `margin` of what
    has been taken already. Chains come along; islands with a gap do not.

    Drops France's Guiana and Reunion, Spain's Canaries, Ecuador's Galapagos,
    Chile's Easter Island and Alaska, and keeps Sicily, Shetland, the Greek
    islands, the Ryukyus and every island of Indonesia.
    """
    if len(rings) < 2:
        return rings
    boxes = [(min(p[0] for p in r), min(p[1] for p in r),
              max(p[0] for p in r), max(p[1] for p in r)) for r in rings]
    main = max(range(len(rings)), key=lambda i: _area(rings[i]))
    taken = {main}
    x0, y0, x1, y1 = boxes[main]
    # Only a substantial landmass may push the frontier outward. Otherwise a
    # speck becomes a stepping stone: Norway reaches Bjornoya, 178 square
    # kilometres of rock, and from there Svalbard comes along and flattens the
    # mainland. Small islands still get included when they are already close.
    big = _area(rings[main]) * 0.02
    grew = True
    while grew:
        grew = False
        for i, (bx0, by0, bx1, by1) in enumerate(boxes):
            if i in taken:
                continue
            gap_x = max(bx0 - x1, x0 - bx1, 0)
            gap_y = max(by0 - y1, y0 - by1, 0)
            if gap_x <= margin and gap_y <= margin:
                taken.add(i)
                if _area(rings[i]) >= big:          # big enough to build from
                    grew = True
                    x0, y0 = min(x0, bx0), min(y0, by0)
                    x1, y1 = max(x1, bx1), max(y1, by1)
    return [r for i, r in enumerate(rings) if i in taken]


# ---------- fitting a set of rings into a viewBox ---------------------------
def fit(rings, w, h, pad, flip_x=False):
    lats = [p[1] for r in rings for p in r]
    mean = math.radians(sum(lats) / len(lats))
    k = max(0.25, math.cos(mean))              # stop high latitudes stretching
    proj = [[((-p[0] if flip_x else p[0]) * k, -p[1]) for p in r] for r in rings]
    xs = [p[0] for r in proj for p in r]; ys = [p[1] for r in proj for p in r]
    dx, dy = max(xs) - min(xs) or 1e-6, max(ys) - min(ys) or 1e-6
    s = min((w - 2 * pad) / dx, (h - 2 * pad) / dy)
    ox = (w - dx * s) / 2 - min(xs) * s
    oy = (h - dy * s) / 2 - min(ys) * s
    return [[(round(p[0] * s + ox, 2), round(p[1] * s + oy, 2)) for p in r] for r in proj]


def simplify(pts, tol):
    """Douglas-Peucker, run on already-projected points so the tolerance is in
    screen pixels: everything a viewer could see is kept and the rest goes.
    Iterative rather than recursive -- a 10m coastline is tens of thousands of
    points deep."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        ax, ay = pts[i]; bx, by = pts[j]
        dx, dy = bx - ax, by - ay
        den = dx * dx + dy * dy
        worst, wi = -1.0, -1
        for k in range(i + 1, j):
            px, py = pts[k]
            if den == 0:
                d = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / den
                t = 0.0 if t < 0 else 1.0 if t > 1 else t
                qx, qy = ax + t * dx, ay + t * dy
                d = (px - qx) ** 2 + (py - qy) ** 2
            if d > worst:
                worst, wi = d, k
        if wi > 0 and worst > tol * tol:
            keep[wi] = True
            stack.append((i, wi)); stack.append((wi, j))
    return [p for p, k in zip(pts, keep) if k]


def ring_area(r):
    return abs(sum(r[i][0] * r[i-1][1] - r[i-1][0] * r[i][1] for i in range(len(r)))) / 2


def outline_svg(rings):
    d = " ".join("M" + " L".join(f"{x} {y}" for x, y in r) + " Z" for r in rings)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">'
            f'<path d="{d}" fill="{INK}" stroke="{EDGE}" stroke-width="1.6" '
            f'stroke-linejoin="round" fill-rule="evenodd"/></svg>')


def where_in(bbox, lon, lat):
    """Whereabouts in a country a point is, in words."""
    x0, y0, x1, y1 = bbox
    fx = (lon - x0) / (x1 - x0) if x1 > x0 else .5
    fy = (lat - y0) / (y1 - y0) if y1 > y0 else .5
    ns = "south" if fy < .34 else "north" if fy > .66 else ""
    ew = "west" if fx < .34 else "east" if fx > .66 else ""
    if ns and ew: return f"in the {ns}-{ew}"
    if ns or ew:  return f"in the {ns or ew}"
    return "in the middle"


def facts_for(continent, capital, bbox):
    """The hints a country gives before it starts giving away letters:
    the continent, roughly where its capital sits, then the capital's name."""
    out = []
    if continent:
        out.append({"lab": "continent", "txt": continent})
    if capital:
        name, lon, lat = capital
        if bbox:
            out.append({"lab": "capital", "txt": where_in(bbox, lon, lat) + " of the country"})
        out.append({"lab": "capital", "txt": name})
    return out


def pop_tier(pop):
    """One rule for both flags and outlines, so the two agree with each other."""
    if pop >= 50_000_000: return "easy"
    if pop >= 10_000_000: return "medium"
    if pop >=  1_000_000: return "hard"
    return "death"


def hires_rings(src, iso3_to_iso2, wanted):
    """Screen-ready outlines from geoBoundaries CGAZ, if it has been downloaded.

    Natural Earth 10m is the finest Natural Earth publishes and it is not very
    fine: France is 3,672 points there, which is why the coastline reads as a
    polygon. CGAZ is built from national sources and carries far more, but the
    file is 383 MB, so it is streamed a feature at a time -- each line of it is
    one country -- and reduced to screen-space rings immediately. Only the
    reduced rings are kept, never the whole world at full detail.
    """
    path = os.path.join(src, "cgaz.geojson")
    if not os.path.exists(path):
        print("outlines       (no cgaz.geojson -- falling back to Natural Earth)")
        return {}
    out, raw_total, kept_total = {}, 0, 0
    with io.open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip().rstrip(",")
            if not line.startswith('{ "type": "Feature"') and not line.startswith('{"type":"Feature"'):
                continue
            try:
                f = json.loads(line)
            except ValueError:
                continue
            iso2 = iso3_to_iso2.get((f["properties"].get("shapeGroup") or "").upper())
            if not iso2 or iso2 not in wanted:
                continue
            g = f["geometry"]
            polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
            rings = [[tuple(p[:2]) for p in r] for poly in polys for r in poly if len(r) > 3]
            if not rings:
                continue
            raw_total += sum(len(r) for r in rings)
            rings = drop_far_territories(rings)
            span = max(p[0] for r in rings for p in r) - min(p[0] for r in rings for p in r)
            if span > 180:
                rings = [[(p[0] % 360, p[1]) for p in r] for r in rings]
            placed = fit(rings, 400, 300, 18)
            placed = [r for r in placed if ring_area(r) >= 0.6] or [max(placed, key=ring_area)]
            placed = [r for r in (simplify(r, TOLERANCE) for r in placed) if len(r) >= 3]
            kept_total += sum(len(r) for r in placed)
            out[iso2] = placed
    print(f"outlines       geoBoundaries gave {len(out)} countries "
          f"({raw_total:,} source points -> {kept_total:,} drawn)")
    return out


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def main():
    src = sys.argv[1]
    os.makedirs(os.path.join(OUTDIR, "outlines"), exist_ok=True)
    recs = []
    nid = 900000

    # ---- flags -------------------------------------------------------------
    # Difficulty is population: the countries most people have heard of are the
    # populous ones. The 10m geometry carries an estimate, joined on ISO code.
    geo0 = json.load(open(os.path.join(src, "ne10m.geojson")))
    # An ISO code can appear on more than one row -- France carries Clipperton
    # Island, whose continent is "Seven seas (open ocean)" and which would
    # overwrite the real entry. Keep the biggest row for each code, and take
    # the bounding box from the homeland rather than from distant islands,
    # so "where the capital is" is measured against the country people picture.
    pop_by_iso, cont_by_iso, bbox_by_iso, best_pts = {}, {}, {}, {}
    for f in geo0["features"]:
        pr = f["properties"]
        iso = (pr.get("ISO_A2_EH") or pr.get("ISO_A2") or "").lower()
        if not iso or iso == "-99":
            continue
        pop_by_iso[iso] = max(pop_by_iso.get(iso, 0), pr.get("POP_EST") or 0)
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        rings = [[tuple(p[:2]) for p in r] for poly in polys for r in poly if len(r) > 3]
        n = sum(len(r) for r in rings)
        if not rings or n <= best_pts.get(iso, 0):
            continue
        best_pts[iso] = n
        if pr.get("CONTINENT"):
            cont_by_iso[iso] = pr["CONTINENT"]
        home = drop_far_territories(rings)
        xs = [p[0] for r in home for p in r]; ys = [p[1] for r in home for p in r]
        bbox_by_iso[iso] = (min(xs), min(ys), max(xs), max(ys))

    # capitals, for the hints
    caps = {}
    places = json.load(open(os.path.join(src, "places.json")))
    for f in places["features"]:
        pr = f["properties"]
        # exactly "Admin-0 capital" -- "Admin-0 capital alt" is Kyoto for
        # Japan and Cape Town for South Africa, which are not the answer
        if (pr.get("featurecla") or "") != "Admin-0 capital":
            continue
        iso = (pr.get("iso_a2") or "").lower()
        lon, lat = f["geometry"]["coordinates"][:2]
        if iso and iso != "-99" and iso not in caps:
            caps[iso] = (pr.get("name"), lon, lat)
    over = 0
    for iso in set(list(caps) + list(countries.CAPITAL)):
        fixed = countries.capital(iso, caps.get(iso))
        if fixed and fixed != caps.get(iso):
            caps[iso] = fixed; over += 1
    print(f"capitals       {len(caps)} matched to a country ({over} corrected by hand)")

    codes = json.load(open(os.path.join(src, "codes.json")))
    flags = {k: v for k, v in codes.items()
             if len(k) == 2 and k not in countries.NOT_A_COUNTRY}
    unknown = dropped = 0
    flag_name = {}
    for code, raw in sorted(flags.items()):
        name = countries.display(code, raw)
        # flagcdn parenthesises some names; the bracketed half is an alias
        name = re.sub(r"\s*\(.*\)$", "", name)
        pop = pop_by_iso.get(code)
        if pop is None:
            unknown += 1
        flag_name[code] = name
        nid += 1
        recs.append({"id": nid, "tier": pop_tier(pop or 0), "group": "Flag",
                     "name": name, "sci": "",
                     "facts": facts_for(countries.continent(code, cont_by_iso.get(code)), caps.get(code),
                                        bbox_by_iso.get(code)),
                     "aliases": countries.accepted(code, name), "cats": ["flags"],
                     "photos": [{"url": f"https://flagcdn.com/w320/{code}.png",
                                 "credit": "flagcdn.com", "obs": ""}]})
    print(f"flags          {len(flags)}  ({unknown} with no population figure -> hardest, "
          f"{len(countries.NOT_A_COUNTRY)} non-countries dropped)")

    # ---- country outlines -------------------------------------------------
    # Natural Earth 10m rather than 110m: 66 times the detail, so coastlines
    # read as coastlines instead of polygons. Each is then simplified in
    # SCREEN space, which keeps every vertex a viewer could see at the size it
    # is drawn and throws away the rest -- detail without enormous files.
    geo = json.load(open(os.path.join(src, "ne10m.geojson")))
    iso3_to_iso2 = {}
    for f in geo["features"]:
        pr = f["properties"]
        a3 = (pr.get("ISO_A3_EH") or pr.get("ISO_A3") or "").upper()
        a2 = (pr.get("ISO_A2_EH") or "").lower()
        if a3 and a3 != "-99" and a2 and a2 != "-99":
            iso3_to_iso2.setdefault(a3, a2)
    hires = hires_rings(src, iso3_to_iso2, set(flags))
    sized, seen_iso = [], {}
    for f in geo["features"]:
        pr = f["properties"]
        # Having an ISO 3166-1 code is the whole test. Natural Earth's own TYPE
        # field cannot carry it: Kazakhstan is filed as "Sovereignty" rather
        # than "Sovereign country", so testing TYPE silently lost it. ISO_A2_EH
        # rather than plain ISO_A2, whose field is blank for France and Norway.
        # No code at all is what drops Somaliland and Northern Cyprus, without
        # the game having to take a political view.
        iso = (pr.get("ISO_A2_EH") or "").lower()
        if not iso or iso == "-99" or iso in countries.NOT_A_COUNTRY:
            continue
        # and it must be one of the flags, which keeps the two categories in
        # step and keeps out the leases and uninhabited rocks Natural Earth
        # carries -- Baikonur, Coral Sea Islands, Clipperton Island
        if iso not in flags:
            continue
        # the flag already settled what this country is called
        name = flag_name.get(iso) or countries.display(iso, pr.get("NAME_EN") or pr.get("NAME"))
        if not name:
            continue
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        rings = [[tuple(pt[:2]) for pt in ring] for poly in polys for ring in poly if len(ring) > 3]
        if not rings:
            continue
        rings = drop_far_territories(rings)
        span = max(p[0] for r in rings for p in r) - min(p[0] for r in rings for p in r)
        if span > 180:                    # crosses the date line
            rings = [[(p[0] % 360, p[1]) for p in r] for r in rings]
        # one outline per country: France also carries Clipperton Island, and
        # the bigger row is the one people would recognise
        prev = seen_iso.get(iso)
        n = sum(len(r) for r in rings)
        if prev is not None and n <= prev[0]:
            continue
        seen_iso[iso] = (n, len(sized))
        row = (pr.get("POP_EST") or 0, name, rings, iso)
        if prev is not None:
            sized[prev[1]] = row
        else:
            seen_iso[iso] = (n, len(sized)); sized.append(row)

    kept_pts = raw_pts = 0
    for pop, name, rings, iso in sized:
        raw_pts += sum(len(r) for r in rings)
        if iso in hires:
            placed = hires[iso]                     # the finer geometry
        else:
            placed = fit(rings, 400, 300, 18)
            # an island smaller than a pixel is speckle, not coastline
            placed = [r for r in placed if ring_area(r) >= 0.6] or [max(placed, key=ring_area)]
            placed = [r for r in (simplify(r, TOLERANCE) for r in placed) if len(r) >= 3]
        kept_pts += sum(len(r) for r in placed)
        nid += 1
        tier = pop_tier(pop)
        fn = slug(name) + ".svg"
        open(os.path.join(OUTDIR, "outlines", fn), "w").write(outline_svg(placed))
        recs.append({"id": nid, "tier": tier, "group": "Outline", "name": name, "sci": "",
                     "facts": facts_for(countries.continent(iso, cont_by_iso.get(iso)), caps.get(iso),
                                        bbox_by_iso.get(iso)),
                     "aliases": countries.accepted(iso, name), "cats": ["outlines"],
                     "photos": [{"url": f"../data/things/outlines/{fn}",
                                 "credit": "Outline drawn from Natural Earth (public domain)",
                                 "obs": ""}]})
    print(f"outlines       {len(sized)}  ({raw_pts:,} source points -> {kept_pts:,} drawn)")

    json.dump(recs, open(os.path.join(OUTDIR, "world_sky.json"), "w"), indent=1)
    print(f"\nwrote {len(recs)} records -> data/things/world_sky.json")

if __name__ == "__main__":
    main()
