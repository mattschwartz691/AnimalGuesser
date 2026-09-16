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

## Things Guesser

A second game at `web/things.html`, linked from the top right of the animal
page and back again. Same engine, same settings, same hangman board — only the
data differs, so both pages load the same `game.js` and the page says which
game it is.

| Category | Holds | Where it comes from |
|---|---|---|
| Trees | 297 | iNaturalist photographs |
| Flowers | 293 | iNaturalist photographs |
| Flags | 252 | flagcdn |
| Country Outlines | 177 | drawn here from Natural Earth |
| Constellations | 88 | drawn here from the d3-celestial star catalogue |

Flowers and trees are real photographs by real people, credited, exactly as
the animals are. "Flower" and "tree" are not ranks of taxonomy, so membership
comes from a curated list of genera — the same approach the animal game takes
for cat breeds and United States birds.

The other three are not photographs, and the game says *Source* rather than
*Photo* for them. Outlines and constellations are **drawn by the build
scripts** into small SVG files under `data/things/`, from public data. Nothing
is AI-generated, here or in the animal game.

Two things the drawing had to get right. Countries with distant overseas
territories — France with French Guiana, the United States with Guam — would
otherwise have a bounding box spanning the planet and the country itself
reduced to a speck, so far-flung parts are dropped by a rule relative to the
homeland's own size, which leaves genuinely spread-out countries like Indonesia
and Japan intact. And seven constellations straddle 0h right ascension,
Ursa Major and Draco among them; those are shifted whole so the figure stays
in one piece instead of being torn across the seam.

The two games keep their settings apart — Things Guesser stores its own
difficulty, categories and toggles — so changing one does not disturb the
other.

### Rebuilding it

```bash
python3 scripts/things/build_plants.py 8     # flowers and trees, from iNaturalist
python3 scripts/things/build_world_sky.py <source-dir>   # flags, outlines, constellations
python3 scripts/things/assemble.py           # -> data/things.json
python3 scripts/things/make_page.py          # regenerate web/things.html from index.html
```

`make_page.py` derives the page from `web/index.html`, so a layout change to
the animal game carries across rather than needing to be made twice.

## Solo and Teams

The game opens on a title screen with two ways to play. Reloading the page, or
**Restart** in the settings panel, brings you back to it.

Under the two mode cards are the two switches that change how a round plays,
**Hangman** and **Buddy Mode**, so a game can be set up in one place before it
starts. They are the same two switches as the ones in the settings panel, not
copies of them: flip one in either place and the other follows, and what you
pick is remembered between visits. Difficulty and categories stay behind the
gear, which is on screen from the title too.

**Solo** is the game as it always was: the header keeps your points, your
got-it tally, and what the animal in front of you is worth.

**Teams** asks how many teams first — anything from 1 to 10 — and then puts a
scoreboard along the bottom, one card per team. Each card has a name that reads
*Unnamed* until you click it and type your own, and a score with a **−** and a
**+**: one point off, one point on, and scores are free to go negative (they
turn red when they do). Nobody's points are awarded automatically in this mode,
so the header drops the solo tally and keeps *this one's worth 5*, which is
what the hints have cost so far.

Names and scores stay put from round to round, and typing a team name will not
be interrupted by the guess box stealing focus mid-word.

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

**Which animal comes next** is decided category first, animal second: the game
picks one of your switched-on categories at random and then an animal from
inside it. Drawing straight from the pool would let the big categories crowd
everything else out — 12,902 bugs against 84 cat breeds means a bag-of-all-animals
shuffle shows you a cat breed roughly once in three hundred turns. Picking the
category first gives each of them the same share of the turns, and because the
categories are exclusive that share is exact: measured over 60,000 draws every
category lands within a third of a percent of its 9.09% ideal. Inside a
category the order is shuffled and worked through before anything repeats.

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
5. from here on, one more letter at random out of whatever is still hidden

**Eight hints an animal, whatever its name.** Long names run out of hints long
before the blanks run out; short ones can offer fewer than eight, because there
is nothing left to give — `Manx` has five, one of them missing since breeds
carry no Latin name.

Hints skip anything you have already worked out: guess `tree` on a Green Tree
Frog and no hint will be spent revealing a letter of TREE — not the T, and not
a random letter of it either. Random hints never land on a first letter, since
an ordered hint already covers those.

`Scarlet Macaw` therefore opens with 4 ordered hints and then 4 random letters.
The budget resets with every new photo, and the Latin name is an accepted
answer, so that hint always scores — the only names that never reach it are the
four seven-word monsters in the data, whose first letters alone eat the budget.
Since a wrong guess spends a hint, the answer comes up on the ninth wrong one.

**A hint you are charged for always puts something new on the board.** Naming a
word of the name is what makes this tricky: it brings the whole board up, blanks
and all, which is exactly what hint 1 sells. Guessing a word therefore hands you
that first hint for free, and a hint that would reveal only what is already
showing is skipped rather than billed. The same goes for the hints that wrong
guesses spend.

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

**The categories are exclusive: every animal is in exactly one.** An animal
goes to the most specific category that claims it, so a Maine Coon is a Cat
Breed rather than a feline, a mammal and a land animal all at once. The counts
therefore add up: 25,090 animals across eleven categories, no animal counted
twice.

| Category | Holds |
|---|---|
| Bugs/Insects | 12,902 |
| World Birds | 3,741 |
| Fish | 2,108 |
| Sea Animals | 1,791 |
| Reptiles | 1,507 |
| Mammals | 972 |
| United States Birds | 808 |
| Amphibians | 761 |
| Dog Breeds | 390 |
| Cat Breeds | 84 |
| Felines | 26 |

The order of precedence, most specific first, is Cat Breeds, Dog Breeds,
Felines, United States Birds, World Birds, Mammals, Reptiles, Amphibians,
Fish, Bugs.

**Felines** is every extant wild cat, once each — all 45 of them, from the lion
to the bay cat. Membership comes from the taxonomy (family Felidae), not from
names, which is what keeps tiger *moths*, leopard *frogs*, lynx *spiders* and
sea *lions* out of it. The list is taken from iNaturalist's Felidae, extinct
species excluded.

The **domestic cat is not in it** — a house cat is not a wild cat, so *Felis
catus* is filed under Mammals. The 84 Cat Breeds keep their own category.

**Dog Breeds** is 390 breeds, built the same way as the cats from the FCI
(international kennel federation) list plus the German, British and American
origin categories, which is where a few household breeds like the dachshund
sit. Extinct breeds are excluded, as everywhere else in the game.

**Cat Breeds** is 84 domestic breeds, from the Maine Coon to the Ukrainian
Levkoy. These cannot come from iNaturalist at all — a breed is not a rank of
taxonomy, so `Felis catus` has no children there and searching it for "Maine
Coon" returns nothing. They come from Wikipedia's Category:Cat breeds instead,
using each article's lead photograph (a real photograph, credited to the
photographer) and its readership for difficulty, ranked against the other
breeds so every level is playable. Breeds carry no Latin name, since every one
of them is *Felis catus* — that also means they have one hint fewer.

**United States Birds** is not a taxonomic group, so it does not come from
taxonomy: it is every bird with a research-grade *native* observation in
iNaturalist's United States — 808 of them. The native filter is what keeps it honest — an
emu, an ostrich and a kookaburra all have North American records from escapees
and farms, and none of them belong in the category.

**World Birds and United States Birds do not overlap.** World Birds is the
3,741 birds from everywhere *else*; United States Birds is the other 808. Tick
both and you get all 4,549 birds in the game, tick either and you get exactly
that half.

**Sea Animals means the sea life that no taxonomic group already claims** — the
octopus, the lobster, the jellyfish, the sea star, the squid. A whale is under
Mammals, a shark under Fish and a sea turtle under Reptiles, because those are
more specific than "lives in the sea". That leaves 1,791 marine invertebrates
in the category.

**There is no Land Animals category any more.** Once the categories were made
exclusive it had nothing left in it: every land animal in the data is already a
mammal, a bird, a reptile, an amphibian or a bug, so "on land and nothing else"
matched zero animals. Sea Animals survives the same rule only because a great
deal of sea life is invertebrate; land has no equivalent here.

**Select all** and **Unselect all** sit below the toggles; whichever would do
nothing is greyed out.

Some combinations are empty — there are no Hard bugs — and the panel says so
rather than leaving you on a blank screen.

### Extras

**Restart** takes you back to the title screen, so you can switch between Solo
and Teams. Points, the got-it tally, the team scoreboard and the shuffle all go
back to nothing. Difficulty, categories and Buddy Mode are settings rather than
game state, so they survive a restart.

**Buddy Mode**, at the bottom of the settings panel, swaps the verdicts: the
game says **RAWR!** when you get one and **A Hee Hoo** when you don't, instead
of CORRECT! and WRONG ANSWER!. It applies to the wrong guesses that spend a
hint too, and the setting is remembered between visits.

**Hangman** is the toggle under it, and is described below. Like the others it
is a setting rather than game state, so it survives a restart and is remembered
between visits. It works in Solo and in Teams, and it hides the text box — in
hangman you play the letters directly.

Both of these also sit on the title screen, under the mode cards, so you do not
have to open the panel to set up a game.

### Hangman

Hangman puts the letters in your hands instead of the **Hint** button. Switch it
on and the round opens with the blanks already on the board — that is hint one
of the eight — the A–Z grid down the left of the photo, and an animal on the
right waiting to be drawn. Under the photo there is no text box and no **Guess**
button. **Bad photo** and **Give up** stay where they were. On a screen too
narrow to flank the photo, the photo takes the full width and the letters and
the animal tuck in underneath it, still one on each side.

**Click a letter or just type it.** With the text box gone there is nothing for
a keystroke to collide with, so the keyboard plays the grid directly: press `k`
and you have played K, no Enter needed. Accented keys play their plain letter,
and the keyboard stands down where it should — while you are typing a team's
name, while the settings panel is open, and for anything held with ctrl, cmd or
alt.

- a **hit** fills that letter in everywhere it appears in the name, turns the
  key green, and **costs you nothing**
- a **miss** costs a point, draws another body part, and strikes the key through

**Only wrong letters cost anything, so every animal is winnable.** That is not
a soft touch, it is the only workable rule once the text box is gone: the median
name in the game has 11 distinct letters, and a third of them have 12 or more.
Charging for right letters as well would cap you at seven guesses and make
93.5% of the animals impossible. Right letters being free means the only thing
that can beat you is seven wrong ones, which is hangman as everyone plays it.

Reveal every letter and you win the round there and then. A letter with no key
on the grid — the okina in *ʻApapane*, the Greek upsilon in *Silver Υ* — is
shown from the start rather than left as a blank nothing could ever fill.

#### Who you get

The animal being drawn is picked fresh every round, and you never know which it
will be:

| | |
|---|---|
| Polar bear | Brown cat |
| Black cat, white belly and face | Sawfish |
| Blobfish | Pink dinosaur |
| Banana slug | |

Each is drawn in seven pieces and finishing one ends the round. Nothing is
hanging from anything — they are simply being drawn. Each carries three
colours: its body, a shaded far side, and a second colour for its markings —
the cat's white belly, the sawfish's teeth, the blobfish's frown. The far-side
legs are shaded rather than outlined, and legs and necks are painted behind the
body, so each one has depth without a seam drawn anywhere inside its outline.

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

### No photographs of dead animals

Every photo whose iNaturalist observation is annotated **Dead** is removed:
roadkill, specimens and the like. 165 photographs came out that way.

The limit is worth stating plainly. iNaturalist records alive-or-dead as an
annotation on the *observation*, so a photo can only be checked when the game
stored which observation it came from — and only about 13% of them did. The
sweep removes every one it can see; it cannot certify the rest. Closing that
gap means re-fetching a photo for all 25,110 animals with an alive-only filter,
which is a few hours of crawling rather than a few minutes.

If an animal's only photo turns out to be of a dead one, the photo is kept
rather than leaving that animal with a blank frame. Three animals are in that
position.

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
