#!/usr/bin/env python3
"""Add a `type` field to each animal in data/animals.json.

`type` is the everyday category word the Hint button spells out -- "snake" for
a Western Diamondback Rattlesnake. It is always added to the animal's accepted
answers, so a hint can never spell a word the guess checker would reject.
"""
import json, os, re, sys, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "animals.json")

# Everyday category words, checked as whole words in the name/aliases.
GENERIC = """
snake lizard gecko skink iguana chameleon monitor tortoise turtle crocodile
alligator caiman frog toad salamander newt shark ray eel crab shrimp
lobster squid octopus jellyfish snail slug spider scorpion beetle
butterfly moth bee wasp ant mantis dragonfly grasshopper centipede millipede
owl eagle hawk falcon vulture condor duck goose swan penguin parrot macaw
cockatoo pigeon dove crow raven magpie stork heron egret crane ibis spoonbill
pelican gull tern puffin albatross woodpecker hummingbird kingfisher pheasant
quail grouse partridge finch sparrow warbler wren thrush swallow starling
flamingo ostrich emu cassowary kiwi
bat cat dog fox wolf jackal coyote bear deer elk moose antelope gazelle
sheep goat ibex cattle bison buffalo pig boar hog peccary horse donkey zebra
monkey baboon macaque lemur ape gibbon seal walrus whale dolphin porpoise
otter badger weasel marten mongoose civet squirrel chipmunk marmot mouse rat
vole shrew mole hare rabbit kangaroo wallaby possum opossum wombat sloth
armadillo pangolin hedgehog porcupine beaver elephant rhinoceros
hippopotamus giraffe camel llama tapir shrew
""".split()

# Compound words whose ending names the real category: rattleSNAKE -> snake.
SUFFIXABLE = {"snake","frog","toad","cat","dog","bat","owl","hawk",
              "crab","squirrel","mouse","deer","bear","monkey",
              "beetle","moth","wolf","goat","sheep","whale"}
# Words that merely END in a category word without being one: a peaFOWL is not
# an owl, a numBAT is not a bat, a poleCAT is not a cat.
SUFFIX_BLOCK_WORDS = {"peafowl","junglefowl","rockfowl","wildfowl","waterfowl",
    "numbat","wombat","polecat","bobcat","meerkat","muskrat","woodrat","moonrat",
    "molerat","aardwolf","aardvark","platypus","koala","seahorse","crabeater"}
# ...but these compounds are NOT that category.
SUFFIX_BLOCK = {"seahorse","sea horse","jellyfish","crayfish","cuttlefish",
                "starfish","silverfish","shellfish","kingfisher","catfish",
                "sea lion","mountain lion","antlion","flying fox","sea cow",
                "prairie dog","dogfish","hogfish","batfish","ratfish","wolffish",
                "catbird","ladybird","bearcat","polecat","muskrat","woodrat",
                "sea cucumber","sea urchin","sea spider","sea slug","sea star"}

OVERRIDES = {
  # Hand-corrected after reviewing the generated table. Each key was checked
  # against the actual iNaturalist display name in data/animals.json.
  "Koala":"koala", "Numbat":"numbat", "Platypus":"platypus",
  "Western Polecat":"polecat", "Fisher":"fisher", "Zorilla":"zorilla",
  "Southern Aardwolf":"aardwolf", "Short-beaked Echidna":"echidna",
  "Moonrat":"moonrat", "Banded Duiker":"duiker", "Sunda Colugo":"colugo",
  "Crab-Plover":"plover", "Alligator Gar":"gar",
  "Naked Sea Butterfly":"sea butterfly", "Sea Swallow":"sea slug",
  "Moose":"moose", "Tuatara":"tuatara", "Littoral Sea Spider":"sea spider",
  "Two-toed Amphiuma":"amphiuma", "Rubber Eel":"caecilian",
  "Penis Snake":"caecilian", "Common Raccoon":"raccoon",
  "Naked Molerat":"mole-rat", "Indian Peafowl":"peafowl",
  "Red Junglefowl":"junglefowl", "White-necked Rockfowl":"rockfowl",
  "Giant Ottershrew":"otter shrew", "Elephantnose Fish":"elephantnose fish",
  "Common Mola":"sunfish", "Fangtooth":"fangtooth",
  "Whale Shark":"shark", "Oceanic Manta Ray":"ray",
  "Sea Otter":"otter", "California Sea Lion":"sea lion",
  "Axolotl":"salamander", "Olm":"salamander", "Hellbender":"salamander",
  "Japanese Giant Salamander":"salamander", "Common Mudpuppy":"salamander",
  "Greater Siren":"salamander", "Komodo Dragon":"lizard",
  "Gharial":"crocodile",
}

def words(s):
    return re.sub(r"[^a-z0-9 ]+", " ", (s or "").lower()).split()

def pick_type(animal):
    if animal["name"] in OVERRIDES:
        return OVERRIDES[animal["name"]]
    cands = [animal["name"]] + list(animal.get("aliases") or [])
    lowers = [c.lower().strip() for c in cands]
    # 1. a whole generic word, taking the LAST one (English head noun goes last)
    for c in sorted(lowers, key=len):
        if c in SUFFIX_BLOCK:
            continue
        ws = words(c)
        hits = [w for w in ws if w in GENERIC and w not in SUFFIX_BLOCK_WORDS]
        if hits:
            return hits[-1]
    # 2. compound suffix: rattlesnake -> snake, bullfrog -> frog
    best = None
    for c in lowers:
        if c in SUFFIX_BLOCK:
            continue
        for w in words(c):
            if w in GENERIC:
                return w
            if w in SUFFIX_BLOCK_WORDS:
                continue
            for g in SUFFIXABLE:
                if w != g and w.endswith(g) and len(w) > len(g) + 1:
                    if best is None or len(g) > len(best):
                        best = g
    if best:
        return best
    # 3. no broader everyday word exists (Fossa, Pika, Okapi) -- use the
    #    shortest accepted answer, which is the animal's own plain name.
    return min(lowers, key=len)

def main():
    d = json.load(open(DATA))
    for a in d["animals"]:
        # keep a pristine copy so re-running never compounds earlier additions
        a.setdefault("_base_aliases", list(a["aliases"]))
        a["aliases"] = list(a["_base_aliases"])
        t = pick_type(a)
        a["type"] = t
        # the hint word must always be a winning answer
        if t not in a["aliases"]:
            a["aliases"] = sorted(set(a["aliases"] + [t]))
    json.dump(d, open(DATA, "w"), indent=1)
    counts = collections.Counter(a["type"] for a in d["animals"])
    print(f"typed {len(d['animals'])} animals into {len(counts)} categories\n")
    for t, n in counts.most_common():
        print(f"  {n:3d}  {t}")

if __name__ == "__main__":
    main()
