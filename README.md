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
| Food Dishes | 265 | Wikipedia and Wikimedia Commons |
| Desserts | 208 | Wikipedia and Wikimedia Commons |
| Flowers | 318 | iNaturalist photographs |
| Trees | 315 | iNaturalist photographs, two views each |
| Flags | 249 | flagcdn |
| Country Outlines | 238 | drawn here from geoBoundaries |

**Dishes and desserts are curated, not scraped.** Wikidata knows about 1,292
desserts with photographs, but a database's idea of a dessert is not a
player's: the list is mostly regional variants nobody outside one country has
met. So both categories are named here in four tiers — pizza and chocolate chip
cookies through pad thai and tiramisu, out to surströmming and kransekake — and
Wikipedia is asked only for the picture. Each one says where it is from, given
as its first hint the way a country gives its continent.

Wikipedia's default image filter hides the lead photograph on some articles,
pizza and sushi among them, so it is switched off and each file's licence is
checked on Commons instead. Anything not freely licensed is dropped rather than
used: twenty were, out of 493 curated — Clafoutis, żurek and corn dog among
them. The photographer and the
licence go in the credit line, as everywhere else here.

**Difficulty is how familiar the thing is**, which no dataset knows, so it is
stated rather than derived. Flowers run household → garden → wild → exotic, and
the household tier is a named list: the sunflower, the dandelion, the garden
tulip, the lawn daisy. Ranking a genus by how often it is photographed does not
find them — the most-photographed rose is the invasive multiflora and the most
photographed chrysanthemum is a Korean mountain species — so the easy tier is
curated and the rest falls back to that ranking. Trees work the same way, from
the ones anyone can name to the obscure. **Flags and outlines go by
population**, on one shared rule, so the two agree about which countries are
the easy ones. Easy plants also accept the everyday word: *sunflower* answers
the Common Sunflower, *oak* the English Oak, *maple* the Sugar Maple.

**A tree is shown as a pair** — both of its photographs on screen at once,
side by side, stacked on a narrow screen, each photographer credited. 327 of
the 343 trees have two. If the second fails to load the round carries on with
one rather than breaking.

What the pair *cannot* promise is one whole tree and one close-up of the
leaves. Nothing labels a photograph that way. iNaturalist has no annotation for
it — the closest, "Leaves: Green Leaves", records that the plant had leaves
when it was seen, not what the picture is of. Wikimedia Commons has a leaf
category for roughly one species in six, and a text search for them returns
microscope slides of leaf epidermis. The second photo is drawn from a
green-leaves observation, which biases it towards foliage, and often that is
what you get — but a sequoia can come out as two distant shots of the whole
tree, and a beech as two close-ups. Hand-picking is the only way to guarantee
it.

**Tree difficulty is by range and familiarity**, and none of it is derivable:
"American" is a range question the photographs cannot answer and "familiar" is
not a fact about a plant at all, so all three tiers are named species lists and
anything unnamed falls to death.

| Tier | What is in it |
|---|---|
| Easy | 28 common American trees — sugar maple, white oak, eastern white pine, dogwood, redbud, coast redwood |
| Medium | 31 less common American trees — shagbark hickory, bur oak, tulip tree, sassafras, osage-orange, Joshua tree |
| Hard | 32 of the wider world that should still ring a bell — English oak, olive, ginkgo, baobab, coconut palm, cork oak, teak |
| Death | the other 252 |

**Countries give their own hints.** A flag or an outline hands over its
**continent**, then its **capital**, and only then starts on the letters. The
blanks stay hidden until that hint is bought, so the continent does not give
away the length of the answer.

Natural Earth's capital list covers sovereign states and little else, so the
territories are filled in by hand — Nuuk, Yaren, Pristina, San Juan, Tórshavn,
Mariehamn and forty-odd others. Six places are left without one on purpose
rather than inventing something: Bouvet Island, Heard and McDonald and the US
Minor Outlying Islands are uninhabited, Tokelau's three atolls take the job in
turns, and Hong Kong and Macau are cities in their own right.

Natural Earth's capitals also needed correcting in nine places. It still gives Dar
es Salaam for Tanzania, which stopped being the capital in 1996, and Bujumbura
for Burundi, which stopped in 2019; for countries with more than one capital it
picks the least expected, offering Bloemfontein for South Africa. It also files
Kyoto as an "Admin-0 capital alt" for Japan, which a careless match reads as the
capital. Those are listed in `scripts/things/countries.py`.

**Country names are current, and the old ones still answer.** Flags and
outlines used to take their names from different places and disagreed: Czechia
against Czech Republic, Timor-Leste against East Timor, Côte d'Ivoire against
Ivory Coast. Both now read from one table in `scripts/things/countries.py`,
joined on ISO 3166-1 code, so they cannot drift apart. Cabo Verde, Türkiye,
Eswatini, North Macedonia and Myanmar are the names the game asks for; Cape
Verde, Turkey, Swaziland, Macedonia, Burma, Zaire, Ceylon, Siam, Persia,
Rhodesia and Holland are among the 63 former names it accepts.

Somaliland, Northern Cyprus, the European Union, the United Nations and
Antarctica are not asked about. The rule is ISO 3166-1 rather than a judgement
of ours: no country code, not a country. That needed care — the obvious
`ISO_A2` field is blank for France and Norway in the Natural Earth data, so
using it would have deleted them; `ISO_A2_EH` is the corrected one and keeps
France, Norway and Taiwan.

**Every country's flag is there**, checked rather than assumed: all countries
carrying an ISO code have one, and all 249 flag images return 200. Outlines and
flags are joined on that code, so all 238 outlines have a matching flag and
take their name from it.

Having an ISO code is the whole test for being a country here. Natural Earth's
own `TYPE` field cannot carry that job: Kazakhstan is filed as "Sovereignty"
rather than "Sovereign country", and testing `TYPE` silently lost it along with
41 others — Israel, Cuba and Serbia among them.

Flowers and trees are real photographs by real people, credited, exactly as
the animals are. "Flower" and "tree" are not ranks of taxonomy, so membership
comes from a curated list of genera — the same approach the animal game takes
for cat breeds and United States birds.

Flags and outlines are not photographs, and the game says *Source* rather than
*Photo* for them. The outlines are **drawn by the build scripts** into small SVG
files under `data/things/`, from public data. Nothing is AI-generated, here or
in the animal game.

The outlines come from **geoBoundaries CGAZ**, which is built from national
sources: 9.9 million points against Natural Earth 10m's 493,000, about twenty
times the detail. Natural Earth was the ceiling before — France is only 3,672
points there, and at *no* simplification at all it is 3,667, so the coastline
read as a polygon no matter what was done to it. The CGAZ file is 383 MB, so
the build streams it a country at a time (each line of it is one country) and
reduces each to screen-ready rings immediately, never holding the world at
full detail.

Each country is then simplified **in screen space**: the tolerance is in pixels
of the 400×300 board an outline is drawn on, and the photo frame is about 1.6×
that with full screen perhaps 4×. At 0.08 that is a third of a pixel at the
largest anyone will see, so everything visible survives and the files stay a
third of the size of keeping it all — 539,000 points drawn, about three times
what Natural Earth could give.

Where CGAZ has no entry, 41 countries fall back to Natural Earth.

**Distant territories.** France carries French Guiana and Réunion, and left in,
the bounding box spans the planet and France itself is a speck. But a plain
distance test cannot serve both France and Indonesia, whose islands run 45
degrees east of Java and all belong. So the rule grows outward from the largest
landmass, taking in anything within a few degrees of what it already holds —
chains come along, isolated outliers do not. One more catch: only a
*substantial* landmass may push that frontier. Without it Norway reaches
Bjørnøya, 178 square kilometres of rock, and from there Svalbard comes along
and flattens the mainland. Alaska, the Canaries, the Galápagos and Easter
Island all drop out; Sicily, Shetland, the Ryukyus and every island of
Indonesia stay.

**Flags** go by population: you have probably seen a populous country's flag.
**Outlines do not**, because recognising a shape has nothing to do with how
many people live inside it. Going by population put Niger, Malawi and Burkina
Faso in the middle tier while Italy and Norway — two of the most recognisable
shapes on earth — sat below them. So the first two outline tiers are named:
27 shapes most people could place, then 45 they could work out. The rest falls
back to population, which at least keeps the microstates and the uninhabited
rocks at the bottom.

The two games keep their settings apart — Things Guesser stores its own
difficulty, categories and toggles — so changing one does not disturb the
other.

### Tests

```bash
./test/run.sh
```

Plain node scripts that run `web/game.js` against a stub DOM, so they exercise
the shipped code rather than a copy of it. They have earned their place: they
caught a hint that charged a point and revealed nothing, a null element that
would have crashed every round, and a continent hint that gave away the letter
count for free.

### Rebuilding it

```bash
python3 scripts/things/build_plants.py 8     # flowers and trees, from iNaturalist
python3 scripts/things/build_world_sky.py <source-dir>   # flags and outlines
python3 scripts/things/retier_plants.py      # curated easy tiers + everyday aliases
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
- Click **Next →** for a new animal.

**Nothing is asked twice in a session.** Everything you have been shown is
remembered until you Restart, so a session never repeats itself. The header
counts how many are **left** in whatever you have switched on, and each
category in the settings panel shows how many of *it* are left rather than how
many exist. When everything switched on has been asked, the game says *"No more
questions in these categories."* rather than starting over — turn on another
category or another difficulty and it carries on.

**The win streak** sits in the header with your best alongside, and turns gold
from three up. A clean answer extends it; a wrong answer, giving up, or needing
more guesses than the category allows ends it. One guess is the rule. Flags get
two, because a flag is hard to name on the nose and nearly right should not
cost you the run. Naming one word of a multi-word answer is not a guess.

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
