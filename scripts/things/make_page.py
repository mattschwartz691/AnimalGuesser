#!/usr/bin/env python3
"""Generate web/things.html from web/index.html.

The two games are the same page over different data, so Things Guesser is
derived from Animal Guesser rather than written a second time: same layout,
same settings panel, same hangman board. Only the wording, the category
toggles and the data file differ. Re-run this after changing index.html.

    python3 scripts/things/make_page.py
"""
import io, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "web", "index.html")
DST = os.path.join(ROOT, "web", "things.html")

CATS = [("dishes", "Food Dishes", "Pizza through to surströmming"),
        ("breakfast", "Breakfast", "Pancakes through to congee and natto"),
        ("desserts", "Desserts", "Cookies through to kransekake"),
        ("flowers", "Flowers", "Houseplants through to the exotic"),
        ("trees", "Trees", "The whole tree, and its leaves"),
        ("flags", "Flags", "Every country's flag"),
        ("outlines", "Country Outlines", "The shape, with nothing else to go on")]

def main():
    s = io.open(SRC, encoding="utf-8").read()

    s = s.replace("<title>Animal Guesser</title>", "<title>Things Guesser</title>")
    s = s.replace('<h1 class="bigtitle">Animal Guesser</h1>', '<h1 class="bigtitle">Things Guesser</h1>')
    s = s.replace("<h1>Animal Guesser</h1>", "<h1>Things Guesser</h1>")
    s = s.replace('placeholder="What animal is this?"', 'placeholder="What is this?"')
    s = s.replace('alt="Photo of an animal to identify"', 'alt="A thing to identify"')
    s = s.replace("A real photograph of a real animal. Name it.",
                  "A dish, a dessert, a flower, a tree, a flag or a country. Name it.")
    s = s.replace("Loading the animals\\u2026", "Loading the things\\u2026")

    # the link across to the other game -- REPLACING the one index.html
    # carries, rather than adding a second one beside it
    s = re.sub(r'<a id="swap"[^>]*>.*?</a>',
               '<a id="swap" href="index.html" title="Animal Guesser">&larr; Animals</a>',
               s, count=1, flags=re.S)
    assert s.count('id="swap"') == 1, "things.html should have exactly one swap link"

    # swap the category toggles wholesale
    block = re.search(r'(  <h2 class="cathead">Categories</h2>\n)(.*?)(  <div id="catwarn")', s, re.S)
    rows = "".join(
        f'    <label class="cat"><input type="checkbox" class="cattoggle" data-cat="{c}" checked>'
        f'<span class="switch"></span><span class="catname">{label}'
        f'<span class="catsub">{sub}</span></span>'
        f'<span class="catnum" data-count="{c}"></span></label>\n'
        for c, label, sub in CATS)
    s = s[:block.start(2)] + rows + s[block.end(2):]

    # the note under the settings is about photographs; these are not all photos
    s = re.sub(r'  <p class="note">.*?</p>',
               '  <p class="note">Flowers and trees are real photographs taken by real\n'
               '     people, from iNaturalist. Flags come from flagcdn. Country outlines and\n'
               '     outlines are drawn here from Natural Earth, public domain. Nothing here\n'
               '     is AI-generated.</p>',
               s, flags=re.S)

    s = s.replace("Difficulty and categories are behind the gear, top left.",
                  "Difficulty and categories are behind the gear, top left.")

    # tell game.js which game this is
    s = s.replace('<script src="game.js"></script>',
                  '<script>\n'
                  '  // same engine, different data -- see the top of game.js\n'
                  '  window.GUESSER = {data: "../data/things.json", key: "things.",\n'
                  '                    one: "thing", many: "things", credit: "Source",\n'
                  '                    streakTries: {flags: 2},\n'
                  '                    tagline: "A dish, a breakfast, a dessert, a flower, "\n'
                  '                             + "a tree, a flag or a country. Name it."};\n'
                  '</script>\n<script src="game.js"></script>')
    io.open(DST, "w", encoding="utf-8").write(s)
    print("wrote web/things.html")

if __name__ == "__main__":
    main()
