#!/usr/bin/env python3
"""Flags, country outlines and constellations for Things Guesser.

None of these are photographs, so none of them come from iNaturalist:

  flags          linked from flagcdn.com, one per ISO country code
  outlines       drawn here from Natural Earth 10m (public domain)
  constellations drawn here from the d3-celestial star and figure data

The two drawn sets are written as small SVG files under data/things/, so the
game can point an <img> at them exactly as it points one at a photograph.

    python3 scripts/things/build_world_sky.py <source-dir>
"""
import json, math, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUTDIR = os.path.join(ROOT, "data", "things")
INK, EDGE, STAR, LINE = "#eef2f7", "#243044", "#f4f8fc", "#4a9eff"

# Countries most people could place or name on sight. Everything else is
# tiered by how much of the map it takes up, which is a decent proxy and an
# honest one -- it is not a claim about importance.
FAMOUS = {
 "United States of America","Canada","Mexico","Brazil","Argentina","Chile","Peru",
 "Colombia","Cuba","Jamaica","United Kingdom","Ireland","France","Germany","Italy",
 "Spain","Portugal","Netherlands","Belgium","Switzerland","Austria","Sweden",
 "Norway","Denmark","Finland","Iceland","Poland","Greece","Russia","Ukraine",
 "Turkey","Egypt","Morocco","South Africa","Nigeria","Kenya","Ethiopia","Israel",
 "Saudi Arabia","Iran","Iraq","India","Pakistan","China","Japan","South Korea",
 "North Korea","Thailand","Vietnam","Indonesia","Philippines","Malaysia",
 "Australia","New Zealand","Czechia","Hungary","Romania","Cambodia","Nepal",
}
CONSTELLATIONS = {
 "And":"Andromeda","Ant":"Antlia","Aps":"Apus","Aqr":"Aquarius","Aql":"Aquila",
 "Ara":"Ara","Ari":"Aries","Aur":"Auriga","Boo":"Bootes","Cae":"Caelum",
 "Cam":"Camelopardalis","Cnc":"Cancer","CVn":"Canes Venatici","CMa":"Canis Major",
 "CMi":"Canis Minor","Cap":"Capricornus","Car":"Carina","Cas":"Cassiopeia",
 "Cen":"Centaurus","Cep":"Cepheus","Cet":"Cetus","Cha":"Chamaeleon","Cir":"Circinus",
 "Col":"Columba","Com":"Coma Berenices","CrA":"Corona Australis","CrB":"Corona Borealis",
 "Crv":"Corvus","Crt":"Crater","Cru":"Crux","Cyg":"Cygnus","Del":"Delphinus",
 "Dor":"Dorado","Dra":"Draco","Equ":"Equuleus","Eri":"Eridanus","For":"Fornax",
 "Gem":"Gemini","Gru":"Grus","Her":"Hercules","Hor":"Horologium","Hya":"Hydra",
 "Hyi":"Hydrus","Ind":"Indus","Lac":"Lacerta","Leo":"Leo","LMi":"Leo Minor",
 "Lep":"Lepus","Lib":"Libra","Lup":"Lupus","Lyn":"Lynx","Lyr":"Lyra","Men":"Mensa",
 "Mic":"Microscopium","Mon":"Monoceros","Mus":"Musca","Nor":"Norma","Oct":"Octans",
 "Oph":"Ophiuchus","Ori":"Orion","Pav":"Pavo","Peg":"Pegasus","Per":"Perseus",
 "Phe":"Phoenix","Pic":"Pictor","Psc":"Pisces","PsA":"Piscis Austrinus","Pup":"Puppis",
 "Pyx":"Pyxis","Ret":"Reticulum","Sge":"Sagitta","Sgr":"Sagittarius","Sco":"Scorpius",
 "Scl":"Sculptor","Sct":"Scutum","Ser":"Serpens","Sex":"Sextans","Tau":"Taurus",
 "Tel":"Telescopium","Tri":"Triangulum","TrA":"Triangulum Australe","Tuc":"Tucana",
 "UMa":"Ursa Major","UMi":"Ursa Minor","Vel":"Vela","Vir":"Virgo","Vol":"Volans","Vul":"Vulpecula",
}
SKY_EASY = {"Orion","Ursa Major","Ursa Minor","Cassiopeia","Leo","Scorpius","Taurus",
            "Gemini","Cancer","Virgo","Libra","Aries","Pisces","Aquarius","Sagittarius",
            "Capricornus","Cygnus","Crux"}
SKY_MEDIUM = {"Lyra","Draco","Pegasus","Andromeda","Perseus","Canis Major","Bootes",
              "Auriga","Hercules","Cepheus","Hydra","Aquila","Canis Minor","Centaurus",
              "Corona Borealis","Delphinus","Ophiuchus","Eridanus"}


# ---------- TopoJSON -> rings of (lon, lat) ---------------------------------
def decode_arcs(topo):
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    out = []
    for arc in topo["arcs"]:
        x = y = 0; pts = []
        for dx, dy in arc:
            x += dx; y += dy
            pts.append((x * sx + tx, y * sy + ty))
        out.append(pts)
    return out

def ring_points(arcs, idxs):
    pts = []
    for i in idxs:
        a = arcs[~i][::-1] if i < 0 else arcs[i]
        pts.extend(a if not pts else a[1:])
    return pts

def country_rings(geom, arcs):
    polys = geom["arcs"] if geom["type"] == "MultiPolygon" else [geom["arcs"]]
    rings = []
    for poly in polys:
        for ring in poly:
            p = ring_points(arcs, ring)
            if len(p) > 3:
                rings.append(p)
    return drop_far_territories(rings)


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


def sky_svg(lines, stars):
    parts = []
    for ln in lines:
        parts.append('<polyline points="' + " ".join(f"{x},{y}" for x, y in ln) +
                     f'" fill="none" stroke="{LINE}" stroke-width="1.6" stroke-opacity=".55" '
                     'stroke-linecap="round" stroke-linejoin="round"/>')
    for x, y, mag in stars:
        r = max(1.3, 4.6 - 0.55 * mag)
        parts.append(f'<circle cx="{x}" cy="{y}" r="{r:.1f}" fill="{STAR}"/>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">'
            + "".join(parts) + "</svg>")


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def main():
    src = sys.argv[1]
    os.makedirs(os.path.join(OUTDIR, "outlines"), exist_ok=True)
    os.makedirs(os.path.join(OUTDIR, "constellations"), exist_ok=True)
    recs = []
    nid = 900000

    # ---- flags -------------------------------------------------------------
    codes = json.load(open(os.path.join(src, "codes.json")))
    flags = {k: v for k, v in codes.items() if len(k) == 2}
    for code, name in sorted(flags.items()):
        nid += 1
        tier = "easy" if name in FAMOUS else "hard"
        recs.append({"id": nid, "tier": tier, "group": "Flag", "name": name, "sci": "",
                     "aliases": [name.lower()], "cats": ["flags"],
                     "photos": [{"url": f"https://flagcdn.com/w320/{code}.png",
                                 "credit": "flagcdn.com", "obs": ""}]})
    print(f"flags          {len(flags)}")

    # ---- country outlines -------------------------------------------------
    # Natural Earth 10m rather than 110m: 66 times the detail, so coastlines
    # read as coastlines instead of polygons. Each is then simplified in
    # SCREEN space, which keeps every vertex a viewer could see at the size it
    # is drawn and throws away the rest -- detail without enormous files.
    geo = json.load(open(os.path.join(src, "ne10m.geojson")))
    sized = []
    for f in geo["features"]:
        pr = f["properties"]
        if pr.get("TYPE") not in ("Sovereign country", "Country"):
            continue
        name = pr.get("NAME_EN") or pr.get("NAME")
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
        sized.append((pr.get("POP_EST") or 0, name, rings))

    kept_pts = raw_pts = 0
    for pop, name, rings in sized:
        raw_pts += sum(len(r) for r in rings)
        placed = fit(rings, 400, 300, 18)
        # an island smaller than a pixel is speckle, not coastline
        placed = [r for r in placed if ring_area(r) >= 0.6] or [max(placed, key=ring_area)]
        placed = [simplify(r, 0.12) for r in placed]
        placed = [r for r in placed if len(r) >= 3]
        kept_pts += sum(len(r) for r in placed)
        nid += 1
        tier = ("easy" if name in FAMOUS else
                "medium" if pop >= 20_000_000 else
                "hard" if pop >= 2_000_000 else "death")
        fn = slug(name) + ".svg"
        open(os.path.join(OUTDIR, "outlines", fn), "w").write(outline_svg(placed))
        recs.append({"id": nid, "tier": tier, "group": "Outline", "name": name, "sci": "",
                     "aliases": [name.lower()], "cats": ["outlines"],
                     "photos": [{"url": f"../data/things/outlines/{fn}",
                                 "credit": "Outline drawn from Natural Earth (public domain)",
                                 "obs": ""}]})
    print(f"outlines       {len(sized)}  ({raw_pts:,} source points -> {kept_pts:,} drawn)")

    # ---- constellations ----------------------------------------------------
    cl = json.load(open(os.path.join(src, "conlines.json")))
    st = json.load(open(os.path.join(src, "stars.json")))
    starpts = [(f["geometry"]["coordinates"][0], f["geometry"]["coordinates"][1],
                f["properties"].get("mag", 6)) for f in st["features"]]
    made = 0
    for f in cl["features"]:
        abbr = f.get("id")
        name = CONSTELLATIONS.get(abbr)
        if not name:
            continue
        lines = [list(map(tuple, ln)) for ln in f["geometry"]["coordinates"] if len(ln) > 1]
        if not lines:
            continue
        # seven figures straddle RA 0h; shift them whole so they stay in one piece
        ras = [p[0] for ln in lines for p in ln]
        wrap = (max(ras) - min(ras)) > 180
        unwrap = lambda ra: (ra + 360 if wrap and ra < 0 else ra)
        lines = [[(unwrap(a), b) for a, b in ln] for ln in lines]
        lo = min(unwrap(p[0]) for ln in lines for p in ln); hi = max(p[0] for ln in lines for p in ln)
        dlo = min(p[1] for ln in lines for p in ln); dhi = max(p[1] for ln in lines for p in ln)
        inside = [(unwrap(a), b, m) for a, b, m in starpts
                  if lo - 2 <= unwrap(a) <= hi + 2 and dlo - 2 <= b <= dhi + 2 and m <= 5.2]
        rings = lines + [[(a, b)] for a, b, _ in inside]
        placed = fit(rings, 400, 300, 26, flip_x=True)   # the sky runs east to the left
        drawn_lines = placed[:len(lines)]
        drawn_stars = [(placed[len(lines)+i][0][0], placed[len(lines)+i][0][1], inside[i][2])
                       for i in range(len(inside))]
        fn = slug(name) + ".svg"
        open(os.path.join(OUTDIR, "constellations", fn), "w").write(sky_svg(drawn_lines, drawn_stars))
        nid += 1
        tier = ("easy" if name in SKY_EASY else "medium" if name in SKY_MEDIUM else
                "hard" if len(lines) >= 4 else "death")
        recs.append({"id": nid, "tier": tier, "group": "Constellation", "name": name,
                     "sci": abbr, "aliases": [name.lower()], "cats": ["constellations"],
                     "photos": [{"url": f"../data/things/constellations/{fn}",
                                 "credit": "Star positions and figures from the d3-celestial dataset",
                                 "obs": ""}]})
        made += 1
    print(f"constellations {made}")

    json.dump(recs, open(os.path.join(OUTDIR, "world_sky.json"), "w"), indent=1)
    print(f"\nwrote {len(recs)} records -> data/things/world_sky.json")

if __name__ == "__main__":
    main()
