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
- **Wrong** → a bold red `WRONG ANSWER!` for one second; then the guess bar
  disappears, the animal's name is revealed in red, and a **Next →** button
  appears beside it.
- **Right** → a bold green `CORRECT!` for one second, then the same reveal in
  green.
- Click **Next →** for a new animal. Plays as long as you like.

### Hints

The **Hint** button sits to the right of the guess bar with a badge showing how
many hints are left. Each press reveals one more letter above the photo:

```
KIND OF ANIMAL   S _ _ _ _      ->   S N _ _ _   ->   S N A _ _
```

You get **three hints per photo**, and the counter resets with each new animal.

The hint spells the *kind* of animal rather than its full name — a Western
Diamond-backed Rattlesnake spells `snake`, not the whole species name. Every
type word is also an accepted answer, so a hint can never spell something the
guess checker would then reject.

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

The categories overlap on purpose, and an animal appears if *any* of its
categories is on. A dolphin is a mammal **and** a sea animal; a sea turtle is a
reptile **and** a sea animal; a penguin is a bird, a sea animal and a land
animal. Fully aquatic animals are not land animals, and freshwater species
(the electric eel, the axolotl) are not sea animals.

Some combinations are empty — there are no Hard bugs — and the panel says so
rather than leaving you on a blank screen.

## Difficulty tiers

| Tier | Meaning |
|---|---|
| Easy | Everyone knows this animal |
| Medium | Most people know this animal |
| Hard | Few people know this animal |
| Death Mode | Almost nobody knows this animal |

## The photos are real

Every image is a **real photograph taken by a real person**. Nothing is
AI-generated.

They come from [iNaturalist](https://www.inaturalist.org) research-grade
observations — field photos uploaded by naturalists and confirmed by community
identification — under Creative Commons licences, with the photographer credited
under each image. A handful of rarely-photographed deep-sea species fall back to
a Wikimedia Commons photograph. No extinct species and no mythological
creatures are included.

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
