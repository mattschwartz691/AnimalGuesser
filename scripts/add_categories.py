#!/usr/bin/env python3
"""Add a `cats` list to each animal: the settings categories it belongs to.

Categories deliberately OVERLAP -- a dolphin is both a mammal and a sea animal,
a sea turtle both a reptile and a sea animal. The game shows an animal if ANY
of its categories is toggled on.

Taxonomic categories come from iNaturalist's group. Sea vs land is a habitat
question that the taxonomy doesn't answer, so it is stated explicitly below.
"""
import json, sys, os, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "animals.json")

CATS = ["mammals","reptiles","birds","sea","fish","amphibians","land","bugs",
        "usbirds","felines","catbreeds","dogbreeds"]

# --- fish that iNaturalist files under the generic "Animalia" -----------------
FISH_SCI = {
  "Carcharodon carcharias","Sphyrna mokarran","Rhincodon typus",
  "Chlamydoselachus anguineus","Mitsukurina owstoni","Mobula birostris",
  "Pristis pristis","Petromyzon marinus","Eptatretus stoutii",
  "Latimeria chalumnae","Protopterus annectens",
}

# --- animals of the open water ----------------------------------------------
# Marine mammals, seabirds, sea turtles, and the marine invertebrates.
SEA_NAMES = {
  # mammals
  "Humpback Whale","Orca","Narwhal","Common Bottlenose Dolphin",
  "West Indian Manatee","California Sea Lion","Walrus","Sea Otter","Polar Bear",
  # birds
  # (the anhinga and the great white pelican are freshwater birds, not seabirds)
  "African Penguin","Atlantic Puffin","Black Skimmer","Crab-Plover",
  # reptiles
  "Green Sea Turtle",
}
# Whole groups that live in the sea
SEA_SCI_PREFIX = ()
LAND_MOLLUSCS = {"Cornu aspersum"}              # garden snail
LAND_INVERTS  = {"Peripatus juliformis",        # velvet worm -- forest floor
                 "Milnesium tardigradum"}       # tardigrade -- moss and lichen

# Freshwater-only animals: not "sea", and not "land" either when fully aquatic.
FRESHWATER_ONLY = {
  "Electric Eel","Giant arapaima","Senegal Bichir","American Paddlefish",
  "Alligator Gar","Banded Archerfish","Elephantnose Fish","West African Lungfish",
  "Axolotl","Olm","Hellbender","Common Mudpuppy","Greater Siren",
  "Two-toed Amphiuma","Japanese Giant Salamander","Amazonian Mata Mata",
  "Titicaca Water Frog","Rubber Eel",
}

def categorise(a):
    g, sci, name = a.get("group",""), a.get("sci",""), a["name"]
    cats = set()

    if g == "Mammalia":   cats.add("mammals")
    elif g == "Aves":     cats.add("birds")
    elif g == "Reptilia": cats.add("reptiles")
    elif g == "Amphibia": cats.add("amphibians")
    elif g == "Actinopterygii": cats.add("fish")
    elif g in ("Insecta","Arachnida"): cats.add("bugs")

    if sci in FISH_SCI:
        cats.add("fish")

    marine_invert = (
        g in ("Mollusca","Animalia")
        and sci not in FISH_SCI
        and sci not in LAND_MOLLUSCS
        and sci not in LAND_INVERTS
    )
    if marine_invert:
        cats.add("sea")
    if sci in LAND_MOLLUSCS or sci in LAND_INVERTS:
        cats.update(["bugs","land"])

    if name in SEA_NAMES or ("fish" in cats and name not in FRESHWATER_ONLY):
        cats.add("sea")

    # Everything not tied to the water lives on land.
    aquatic = ("fish" in cats) or marine_invert
    # Never comes ashore. (Penguins, seals, walruses, polar bears and sea
    # otters all haul out, so they count as land animals too.)
    fully_aquatic_mammal = name in {
        "Humpback Whale","Orca","Narwhal","Common Bottlenose Dolphin",
        "West Indian Manatee","Green Sea Turtle"}
    if not aquatic and not fully_aquatic_mammal and name not in FRESHWATER_ONLY:
        cats.add("land")

    return sorted(cats)

def main():
    d = json.load(open(DATA))
    if d.get("v") == 2:
        sys.exit("data/animals.json is packed; run: python3 scripts/pack.py --unpack")
    for a in d["animals"]:
        # These come from iNaturalist's place index and taxonomy rather than
        # from the rules below, so they are preserved, not recomputed.
        EXTERNAL = {"usbirds", "felines", "catbreeds", "dogbreeds"}
        keep = [c for c in (a.get("cats") or []) if c in EXTERNAL]
        a["cats"] = sorted(set(categorise(a) + keep))
    json.dump(d, open(DATA, "w"), indent=1)
    n = collections.Counter(c for a in d["animals"] for c in a["cats"])
    print(f"categorised {len(d['animals'])} animals\n")
    for c in CATS:
        print(f"  {c:12s} {n[c]:4d}")
    orphan = [a["name"] for a in d["animals"] if not a["cats"]]
    print("\nanimals with NO category:", orphan or "none")

if __name__ == "__main__":
    main()
