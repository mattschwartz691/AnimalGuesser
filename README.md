# Animal Guesser

Guess the animal from a photo. Four difficulty tiers, from *everyone knows this*
to *almost nobody knows this*.

## Play

```bash
./serve.sh
```

Opens <http://localhost:8765/web/>. Ctrl-C to stop.

(It needs to be served over HTTP rather than opened as a `file://` path, because
the game fetches its data file. The photos themselves stream from the internet.)

## How it works

- **Gear icon, top left** — pick the difficulty.
- Type your guess in the bar and hit Enter.
- **Wrong** → a bold red `WRONG ANSWER!` for one second, and the guess spends a
  hint. The round keeps going. Only when the hints run out does the answer come
  up in red with a **Next →** button beside it.
- **Right** → a bold green `CORRECT!` for one second, then the same reveal in
  green.
- **Bad photo** swaps in a different picture of the same animal, keeping
  whatever you have already worked out. If that animal only has one photo it
  moves on to another animal instead. Either way it costs nothing — no hint, no
  point, no attempt.
- **Give up** sits at the right of the row. It shows the name straight away —
  no hints, no flash — and scores nothing for that animal.
- When the round ends the name is filled in completely at the top, in blue,
  with the Latin name under it, and the answer appears below the photo.
- Click **Next →** for a new animal. Plays as long as you like.

### Guessing a word at a time

Any word of the name that you say gets filled in, and the round continues.
For a Green Tree Frog:

```
guess "tree"    ->   _ _ _ _ _   T R E E   _ _ _ _
guess "frog"    ->   _ _ _ _ _   T R E E   F R O G
guess "green"   ->   correct
```

Name every word and you have given the answer, so `green tree frog` in one go
works too, as does the Latin name. Part-guesses are free — they cost no hint,
no point and no attempt.

A hyphen counts as a space, so `Western Diamond-backed Rattlesnake` is four
words. You can take a hyphenated word in halves or whole, spelled any way:
`diamond`, `backed`, `diamond-backed`, `diamond backed` and `diamondbacked`
all land.

Because words accumulate, you only ever have to supply what is missing — with
`salamander` already up, `long-toed` finishes a Long-toed Salamander for full
credit.

### Scoring

Every animal starts out worth **5 points**. Each hint you take costs one, down
to a floor of 1 — and since a wrong guess spends a hint, wrong guesses cost you
too. Naming the noun is free. The header shows your points, how many you have
got right, and what the animal in front of you is currently worth.

### Hints

The **Hint** button sits to the right of the guess bar, with a badge showing how
many are left. Hints still work while you are part-way there.

1. how many letters are in each word
2. the first letter of the first word
3. the first letter of the next word — and so on, one hint per word
4. the Latin name

Hints skip anything you have already worked out: guess `tree` on a Green Tree
Frog and no hint will be spent revealing a letter of TREE.

`Scarlet Macaw` therefore has 4 hints, `Lion` has 3, and
`Western Diamond-backed Rattlesnake` has 5. The budget resets with every new
photo, and the Latin name is an accepted answer, so the last hint always
scores.

Answers are checked leniently but not carelessly. Common alternative names work
(`hippo` or `hippopotamus`, `puma` or `cougar` or `mountain lion`), and spelling
is forgiven — `hipopotamus`, `elefant`, `orangutang`, `crocodil`, `sea lilly`.

Typos are matched word by word rather than across the whole phrase, because
whole-phrase matching quietly accepts the wrong animal: *domestic goat* is two
edits from *domestic cat*, and *sea lily* two from *sea lion*. Short words need
to be exact, a typo may not change a word's first letter, and scientific names
must be exact (at two edits `bubo bubo`, the eagle-owl, becomes `bufo bufo`, the
toad). The rules are checked by sweeping every accepted answer against all 421
animals: **zero** answers win against an animal they don't belong to.

### Categories

The settings panel also has a toggle per category, each showing how many animals
it holds in the current difficulty. Only the categories you leave on appear —
switch everything off but **Mammals** and you will only be shown mammals.

| | |
|---|---|
| Mammals | Reptiles |
| Birds | Sea Animals |
| Fish | Amphibians |
| Land Animals | Bugs/Insects |
| North American Birds | Felines |
| Cat Breeds | |

**Felines** is every cat in the game — 26 of them, from the lion to Geoffroy's
Cat. Membership comes from the taxonomy (family Felidae), not from names, which
is what keeps tiger *moths*, leopard *frogs*, lynx *spiders* and sea *lions*
out of it.

**Cat Breeds** is 84 domestic breeds, from the Maine Coon to the Ukrainian
Levkoy. These cannot come from iNaturalist at all — a breed is not a rank of
taxonomy, so `Felis catus` has no children there and searching it for "Maine
Coon" returns nothing. They come from Wikipedia's Category:Cat breeds instead,
using each article's lead photograph (a real photograph, credited to the
photographer) and its readership for difficulty, ranked against the other
breeds so every level is playable. Breeds carry no Latin name, since every one
of them is *Felis catus* — that also means they have one hint fewer.

**North American Birds** is not a taxonomic group, so it does not come from
taxonomy: it is every bird with a research-grade *native* observation in
iNaturalist's North America. The native filter is what keeps it honest — an
emu, an ostrich and a kookaburra all have North American records from escapees
and farms, and none of them belong in the category.

The categories overlap on purpose, and an animal appears if *any* of its
categories is on. A dolphin is a mammal **and** a sea animal; a sea turtle is a
reptile **and** a sea animal; a penguin is a bird, a sea animal and a land
animal. Fully aquatic animals are not land animals, and freshwater species
(the electric eel, the axolotl) are not sea animals.

**Select all** and **Unselect all** sit below the toggles; whichever would do
nothing is greyed out.

Some combinations are empty — there are no Hard bugs — and the panel says so
rather than leaving you on a blank screen.

## Difficulty

The four levels are checkboxes, not a single choice — tick as many as you like
and the game draws from all of them together. The header shows which are on
("Easy + Medium"), and each row shows how many animals it holds under your
current categories.

| Tier | Meaning |
|---|---|
| Easy | Everyone knows this animal |
| Medium | Most people know this animal |
| Hard | Few people know this animal |
| Death Mode | Almost nobody knows this animal |


## How many animals

**24,616.** That is not every animal in the world and no such game could be:
about 2.1 million animal species have been described, roughly a million of them
insects, and only ~297,000 have a verified photograph anywhere. This is the
most-photographed slice of the animal kingdom that has a common name at all.

It is still mostly small things — around 11,000 of the 24,616 are insects, which
is what the animal kingdom actually looks like. **Turn Bugs/Insects off in the
settings** if you would rather not spend Death Mode naming moths.

Two tiers of data quality live in the file:

- **421 hand-curated animals** — 8 photos each, hand-written accepted answers,
  hand-assigned difficulty, hand-checked categories.
- **24,195 expanded animals** — one photo each, answers derived from the common
  name, difficulty derived from how often the species is photographed, and
  categories derived from taxonomy. Sea-versus-land is inferred from
  wholly-marine clades, so a freshwater fish is simply not marked as a sea
  animal rather than being guessed at.

### A note on the photos

Some photos have more than one animal in them, or the animal half-hidden.
There is no way to filter those automatically: iNaturalist records nothing
about how many animals are in a frame — no observation field, no annotation —
so telling would need image recognition over 27,000 photos. **Bad photo** is
the answer instead: one click and you get another.

## The photos are real

Every image is a **real photograph taken by a real person**. Nothing is
AI-generated.

They come from [iNaturalist](https://www.inaturalist.org) research-grade
observations — field photos uploaded by naturalists and confirmed by community
identification — under Creative Commons licences, with the photographer credited
under each image. A handful of rarely-photographed deep-sea species fall back to
a Wikimedia Commons photograph. No extinct species and no mythological
creatures are included.

## No photographs are stored here

The repository contains **no image files** — only links. Every photo is fetched
from iNaturalist's servers by your browser when it is shown.

`data/animals.json` is a lookup table of those links, packed against a legend:
the same host prefix appeared 27,000 times, the same licence sentence 13,000
times, and every record repeated its JSON key names. Packing it took the file
from 9.3 MB to 2.8 MB (1.2 MB gzipped) with no loss — unpack and repack is
byte-for-byte identical, and photographer attribution is preserved in full.

The game unpacks it on load in about 18 ms.

```bash
python3 scripts/pack.py            # verbose -> packed (what gets committed)
python3 scripts/pack.py --unpack   # packed -> verbose, for the build scripts
```

The build scripts refuse to run against a packed file and tell you to unpack.

## Rebuilding the photo lookup table

`data/animals.json` is a static lookup table: species, accepted names, and
direct photo URLs. The game reads it and loads images straight from those URLs,
so it never calls an API while you play.

```bash
python3 scripts/build_lookup.py   # ~10 min, rate-limited to be polite to iNaturalist
```

Pass one or more scientific names to rebuild just those and merge them in.

- `scripts/species.py` — the curated species list and accepted answers per tier
- `scripts/build_lookup.py` — resolves each name, drops anything extinct or
  without a usable photo, writes `data/animals.json`
- `scripts/add_types.py` — assigns each animal the category word the Hint button
  spells out, and adds it to that animal's accepted answers.
- `scripts/expand.py` — pulls the most-photographed animals that have a common
  name; pass a target count.
- `scripts/pack.py` — packs/unpacks the data file.
- `scripts/add_categories.py` — assigns the settings categories. Taxonomy comes
  from iNaturalist; sea-versus-land is a habitat question the taxonomy doesn't
  answer, so it is listed explicitly in that file.

`build_lookup.py` runs both automatically; run either alone after editing its
rules.

Some names in `species.py` differ from iNaturalist's accepted taxonomy (it files
the American bison under `Bos bison`). Those are mapped in `SCI_SYNONYMS`, and
each mapping was checked by hand to be the same animal.

## Layout

```
scripts/   list curation + lookup-table builder
data/      animals.json (the generated lookup table)
web/       index.html, style.css, game.js
serve.sh   local launcher
```
