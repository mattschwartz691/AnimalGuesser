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

Spelling is forgiven on longer words, and common alternative names are accepted
(`hippo` or `hippopotamus`, `puma` or `cougar` or `mountain lion`). Short words
are matched strictly on purpose — at one edit apart, *mouse* and *moose* are
different animals, not a typo.

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

- `scripts/species.py` — the curated species list and accepted answers per tier
- `scripts/build_lookup.py` — resolves each name, drops anything extinct or
  without a usable photo, writes `data/animals.json`

## Layout

```
scripts/   list curation + lookup-table builder
data/      animals.json (the generated lookup table)
web/       index.html, style.css, game.js
serve.sh   local launcher
```
