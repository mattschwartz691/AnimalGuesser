#!/usr/bin/env python3
"""Desserts and dishes for Things Guesser, from Wikipedia and Wikimedia Commons.

Wikidata knows about 1,292 desserts, but a database's idea of a dessert is not
a player's: the list is mostly regional variants nobody outside one country has
heard of. So both categories are curated here, in four tiers, and Wikipedia is
asked only for the photograph.

Each dish carries where it comes from, which the game gives as its first hint
the way a country gives its continent.

    python3 scripts/things/build_food.py
"""
import json, os, re, sys, time, html, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "data", "things_food.json")
UA = "AnimalGuesser/1.0 (hobby game; +https://github.com/mattschwartz691/AnimalGuesser)"
FREE = ("cc", "public domain", "cc0", "no restrictions")

# (Wikipedia title, where it is from). The title is what the game asks for,
# tidied of underscores and disambiguation.
DESSERTS = {
 "easy": [
  ("Chocolate chip cookie","United States"),("Chocolate brownie","United States"),
  ("Cheesecake","Greece"),("Apple pie","England"),("Doughnut","United States"),
  ("Cupcake","United States"),("Ice cream","Italy"),("Waffle","Belgium"),
  ("Chocolate cake","United States"),("Banana split","United States"),
  ("S'more","United States"),("Ice pop","United States"),("Fudge","United States"),
  ("Candy apple","United States"),("Pumpkin pie","United States"),
  ("Cotton candy","United States"),("Marshmallow","France"),("Milkshake","United States"),
  ("Sundae","United States"),("Gingerbread","Europe"),("Rice pudding","Europe"),
  ("Custard","France"),("Jelly bean","United States"),("Popcorn ball","United States"),
 ],
 "medium": [
  ("Tiramisu","Italy"),("Crème brûlée","France"),("Éclair","France"),
  ("Macaron","France"),("Baklava","Turkey"),("Cannoli","Italy"),("Churro","Spain"),
  ("Panna cotta","Italy"),("Chocolate mousse","France"),("Trifle","England"),
  ("Key lime pie","United States"),("Pecan pie","United States"),
  ("Carrot cake","England"),("Red velvet cake","United States"),
  ("Shortbread","Scotland"),("Crème caramel","France"),("Profiterole","France"),
  ("Lemon meringue pie","United States"),("Banoffee pie","England"),
  ("Bread pudding","England"),("Tres leches cake","Mexico"),
  ("Angel food cake","United States"),("Pound cake","England"),("Scone","Scotland"),
  ("Crêpe","France"),("Strudel","Austria"),("Meringue","France"),("Tarte Tatin","France"),
 ],
 "hard": [
  ("Pavlova (food)","New Zealand"),("Kouign-amann","France"),("Sachertorte","Austria"),
  ("Stollen","Germany"),("Panettone","Italy"),("Mochi","Japan"),("Dorayaki","Japan"),
  ("Gulab jamun","India"),("Halva","Middle East"),("Kanafeh","Palestine"),
  ("Alfajor","Argentina"),("Brigadeiro","Brazil"),("Sticky toffee pudding","England"),
  ("Bakewell tart","England"),("Clafoutis","France"),("Croquembouche","France"),
  ("Mille-feuille","France"),("Pastel de nata","Portugal"),("Semla","Sweden"),
  ("Canelé","France"),("Paris–Brest","France"),("Opera cake","France"),
  ("Zabaione","Italy"),("Lamington","Australia"),("Malasada","Portugal"),
  ("Sfogliatella","Italy"),("Baba au rhum","France"),("Blancmange","France"),
  ("Eton mess","England"),("Affogato","Italy"),
 ],
 "death": [
  ("Kransekake","Norway"),("Speculaas","Netherlands"),("Basbousa","Egypt"),
  ("Kulfi","India"),("Rasgulla","India"),("Jalebi","India"),("Baumkuchen","Germany"),
  ("Spekkoek","Indonesia"),("Maamoul","Levant"),("Qatayef","Levant"),
  ("Tangyuan","China"),("Tteok","Korea"),("Patbingsu","Korea"),("Halo-halo","Philippines"),
  ("Leche flan","Philippines"),("Buchteln","Austria"),("Kaiserschmarrn","Austria"),
  ("Palatschinke","Austria"),("Medovik","Russia"),("Dobos torte","Hungary"),
  ("Cremeschnitte","Austria"),("Gâteau Basque","France"),("Far Breton","France"),
  ("Quindim","Brazil"),("Knickerbocker glory","England"),("Spotted dick","England"),
  ("Melomakarono","Greece"),("Loukoumades","Greece"),
 ],
}

DISHES = {
 "easy": [
  ("Pizza","Italy"),("Hamburger","Germany"),("Hot dog","Germany"),
  ("Spaghetti","Italy"),("Taco","Mexico"),("Sushi","Japan"),
  ("Fried chicken","United States"),("French fries","Belgium"),
  ("Cheese sandwich","United States"),("Macaroni and cheese","Italy"),
  ("Burrito","Mexico"),("Ramen","Japan"),("Fried rice","China"),
  ("Caesar salad","Mexico"),("BLT","United States"),("Meatball","Italy"),
  ("Lasagne","Italy"),("Chicken nugget","United States"),
  ("Peanut butter and jelly sandwich","United States"),("Omelette","France"),
  ("Pancake","Europe"),("Mashed potato","Europe"),("Scrambled eggs","Europe"),
  ("Club sandwich","United States"),("Nachos","Mexico"),("Chicken soup","Europe"),
 ],
 "medium": [
  ("Pad thai","Thailand"),("Pho","Vietnam"),("Paella","Spain"),("Risotto","Italy"),
  ("Gyros","Greece"),("Falafel","Egypt"),("Hummus","Middle East"),
  ("Dumpling","China"),("Chicken curry","India"),("Shepherd's pie","England"),
  ("Fish and chips","England"),("Chicken tikka masala","United Kingdom"),
  ("Beef Stroganoff","Russia"),("Goulash","Hungary"),("Jambalaya","United States"),
  ("Clam chowder","United States"),("Gumbo","United States"),("Empanada","Spain"),
  ("Quiche","France"),("Kebab","Turkey"),("Enchilada","Mexico"),
  ("Quesadilla","Mexico"),("Tempura","Japan"),("Teriyaki","Japan"),
  ("Chow mein","China"),("Spring roll","China"),("Samosa","India"),
  ("Biryani","India"),("Pierogi","Poland"),("Schnitzel","Austria"),
 ],
 "hard": [
  ("Bibimbap","Korea"),("Okonomiyaki","Japan"),("Moussaka","Greece"),
  ("Ratatouille","France"),("Coq au vin","France"),("Bouillabaisse","France"),
  ("Ceviche","Peru"),("Arepa","Venezuela"),("Doro wat","Ethiopia"),
  ("Tajine","Morocco"),("Borscht","Ukraine"),("Bánh mì","Vietnam"),
  ("Laksa","Malaysia"),("Satay","Indonesia"),("Rendang","Indonesia"),
  ("Feijoada","Brazil"),("Poutine","Canada"),("Shakshouka","Tunisia"),
  ("Pastitsio","Greece"),("Souvlaki","Greece"),("Pelmeni","Russia"),
  ("Khachapuri","Georgia"),("Jollof rice","West Africa"),("Injera","Ethiopia"),
  ("Bulgogi","Korea"),("Tteokbokki","Korea"),("Congee","China"),
  ("Massaman curry","Thailand"),("Cassoulet","France"),("Rösti","Switzerland"),
  ("Colcannon","Ireland"),("Katsu curry","Japan"),
 ],
 "death": [
  ("Khinkali","Georgia"),("Lahmacun","Turkey"),("Bigos","Poland"),("Fufu","West Africa"),
  ("Nasi lemak","Malaysia"),("Mole (sauce)","Mexico"),("Choucroute garnie","France"),
  ("Sinigang","Philippines"),("Ackee and saltfish","Jamaica"),("Cullen skink","Scotland"),
  ("Haggis","Scotland"),("Żurek","Poland"),("Kimchi-jjigae","Korea"),("Nihari","Pakistan"),
  ("Haleem","Middle East"),("Kibbeh","Levant"),("Koshary","Egypt"),("Larb","Laos"),
  ("Bún bò Huế","Vietnam"),("Mofongo","Puerto Rico"),("Pupusa","El Salvador"),
  ("Sancocho","Colombia"),("Bobotie","South Africa"),("Lutefisk","Norway"),
  ("Surströmming","Sweden"),("Kjötsúpa","Iceland"),("Waterzooi","Belgium"),
  ("Rogan josh","India"),("Pierogi ruskie","Poland"),("Tourtière","Canada"),
 ],
}

# --- second pass: a great deal more of both ---------------------------------
DESSERTS["easy"] += [
  ("Chocolate pudding","United States"),("Ice cream sandwich","United States"),
  ("Sugar cookie","Netherlands"),("Oatmeal raisin cookie","United States"),
  ("Peanut butter cookie","United States"),("Snickerdoodle","United States"),
  ("Blondie (confection)","United States"),("Whoopie pie","United States"),
  ("Cinnamon roll","Sweden"),("Funnel cake","Germany"),
  ("Root beer float","United States"),("Banana bread","United States"),
  ("Rice Krispies Treats","United States"),("Chocolate truffle","France"),
  ("Toffee","England"),("Caramel","France"),("Lollipop","United States"),
  ("Cookie dough","United States"),("Chocolate milk","Jamaica"),
]
DESSERTS["medium"] += [
  ("Cobbler (food)","United States"),("Crumble","England"),
  ("Cherry pie","United States"),("Blueberry pie","United States"),
  ("Boston cream pie","United States"),("Black Forest gateau","Germany"),
  ("Swiss roll","Central Europe"),("Battenberg cake","England"),
  ("Victoria sponge","England"),("Madeleine (cake)","France"),
  ("Financier (cake)","France"),("Palmier","France"),
  ("Danish pastry","Denmark"),("Croissant","Austria"),
  ("Apple turnover","England"),("Baked Alaska","United States"),
  ("Peach Melba","Australia"),("Millionaire's shortbread","Scotland"),
  ("Rocky road (dessert)","Australia"),("Nanaimo bar","Canada"),
  ("Butter tart","Canada"),("Doughnut hole","United States"),
  ("Fruit salad","Europe"),("Banana pudding","United States"),
  ("Whipped cream","France"),("Chocolate fondue","Switzerland"),
]
DESSERTS["hard"] += [
  ("Cassata","Italy"),("Zeppole","Italy"),("Struffoli","Italy"),
  ("Panforte","Italy"),("Torrone","Italy"),("Amaretti di Saronno","Italy"),
  ("Biscotti","Italy"),("Pizzelle","Italy"),("Babka","Poland"),
  ("Rugelach","Poland"),("Hamantash","Israel"),("Turkish delight","Turkey"),
  ("Revani","Turkey"),("Tulumba","Turkey"),("Syrniki","Russia"),
  ("Pastila","Russia"),("Trdelník","Slovakia"),("Linzer torte","Austria"),
  ("Apple strudel","Austria"),("Germknödel","Austria"),
  ("Salzburger Nockerl","Austria"),("Bienenstich","Germany"),
  ("Berliner (doughnut)","Germany"),("Lebkuchen","Germany"),
  ("Marzipan","Germany"),("Mont Blanc (dessert)","France"),
  ("Financier","France"),("Galette des Rois","France"),
  ("Tiramisù al limone","Italy"),("Bubble tea","Taiwan"),
]
DESSERTS["death"] += [
  ("Krumkake","Norway"),("Prinsesstårta","Sweden"),("Dammsugare","Sweden"),
  ("Chokladboll","Sweden"),("Kladdkaka","Sweden"),("Æbleskiver","Denmark"),
  ("Kringle","Denmark"),("Lussekatt","Sweden"),("Pepparkaka","Sweden"),
  ("Mämmi","Finland"),("Vínarterta","Iceland"),("Chak-chak (food)","Tatarstan"),
  ("Churchkhela","Georgia"),("Koliva","Greece"),("Galaktoboureko","Greece"),
  ("Kourabiedes","Greece"),("Ekmek kadayıfı","Turkey"),("Güllaç","Turkey"),
  ("Sutlac","Turkey"),("Ashure","Turkey"),("Ma'amoul","Levant"),
  ("Sfenj","Morocco"),("Chebakia","Morocco"),("Koeksister","South Africa"),
  ("Melktert","South Africa"),("Malva pudding","South Africa"),
  ("Pastafrola","Argentina"),("Chimbo","Colombia"),("Arroz con leche","Spain"),
  ("Turrón","Spain"),
]
DISHES["easy"] += [
  ("Buffalo wing","United States"),("Corn dog","United States"),
  ("Meatloaf","Germany"),("Chili con carne","United States"),
  ("Sloppy joe","United States"),("Pot pie","England"),
  ("Coleslaw","Netherlands"),("Potato salad","Germany"),
  ("Deviled egg","Rome"),("Onion ring","United States"),
  ("Pretzel","Germany"),("Garlic bread","Italy"),
  ("Sausage roll","England"),("Cornbread","United States"),
  ("Toasted sandwich","Europe"),("Spaghetti with meatballs","United States"),
  ("Steak","Europe"),("Roast chicken","Europe"),("Bacon and eggs","England"),
  ("Baked beans","United States"),("Chicken salad","United States"),
]
DISHES["medium"] += [
  ("Carbonara","Italy"),("Gnocchi","Italy"),("Ravioli","Italy"),
  ("Minestrone","Italy"),("Caprese salad","Italy"),("Arancini","Italy"),
  ("Ossobuco","Italy"),("Calzone","Italy"),("Focaccia","Italy"),
  ("Bruschetta","Italy"),("Bratwurst","Germany"),("Currywurst","Germany"),
  ("Sauerbraten","Germany"),("Doner kebab","Turkey"),("Shawarma","Levant"),
  ("Tabbouleh","Lebanon"),("Baba ghanoush","Levant"),
  ("Croque monsieur","France"),("French onion soup","France"),
  ("Salade niçoise","France"),("Beef Wellington","England"),
  ("Cornish pasty","England"),("Bangers and mash","England"),
  ("Scotch egg","England"),("Full breakfast","England"),
  ("Cottage pie","England"),("Gazpacho","Spain"),
  ("Spanish omelette","Spain"),("Patatas bravas","Spain"),
  ("Tamale","Mexico"),("Pozole","Mexico"),("Chilaquiles","Mexico"),
  ("Huevos rancheros","Mexico"),("Fajita","Mexico"),
  ("Jerk (cooking)","Jamaica"),("Tandoori chicken","India"),
  ("Naan","India"),("Dal","India"),("Miso soup","Japan"),
  ("Udon","Japan"),("Soba","Japan"),("Jiaozi","China"),
  ("Kimchi","Korea"),("Sashimi","Japan"),("Onigiri","Japan"),
  ("Yakitori","Japan"),("Peking duck","China"),("Wonton","China"),
]
DISHES["hard"] += [
  ("Cacio e pepe","Italy"),("Vitello tonnato","Italy"),("Panzanella","Italy"),
  ("Saltimbocca","Italy"),("Polenta","Italy"),("Tartiflette","France"),
  ("Pissaladière","France"),("Steak tartare","France"),
  ("Escargot","France"),("Vichyssoise","France"),
  ("Toad in the hole","England"),("Welsh rarebit","Wales"),
  ("Ropa vieja","Cuba"),("Arroz con pollo","Spain"),("Roti","India"),
  ("Doubles (food)","Trinidad"),("Callaloo","Caribbean"),
  ("Churrasco","Brazil"),("Asado","Argentina"),("Milanesa","Argentina"),
  ("Choripán","Argentina"),("Chana masala","India"),
  ("Palak paneer","India"),("Vindaloo","India"),("Dosa","India"),
  ("Idli","India"),("Pav bhaji","India"),("Butter chicken","India"),
  ("Momo (food)","Nepal"),("Khao soi","Thailand"),("Som tam","Thailand"),
  ("Tom yum","Thailand"),("Nasi goreng","Indonesia"),("Gado-gado","Indonesia"),
  ("Chicken adobo","Philippines"),("Lumpia","Philippines"),
  ("Kare-kare","Philippines"),("Japchae","Korea"),("Jajangmyeon","Korea"),
  ("Mapo doufu","China"),("Xiaolongbao","China"),("Hot pot","China"),
  ("Char siu","China"),("Dim sum","China"),("Falooda","India"),
]
DISHES["death"] += [
  ("Khash (dish)","Armenia"),("Dolma","Turkey"),("Manti (food)","Turkey"),
  ("Plov","Uzbekistan"),("Lagman","Central Asia"),("Shashlik","Caucasus"),
  ("Okroshka","Russia"),("Solyanka","Russia"),("Blini","Russia"),
  ("Draniki","Belarus"),("Cepelinai","Lithuania"),("Hákarl","Iceland"),
  ("Rakfisk","Norway"),("Pinnekjøtt","Norway"),("Ärtsoppa","Sweden"),
  ("Janssons frestelse","Sweden"),("Stamppot","Netherlands"),
  ("Bitterballen","Netherlands"),("Carbonade flamande","Belgium"),
  ("Flammekueche","France"),("Baeckeoffe","France"),("Aligot","France"),
  ("Piperade","France"),("Fabada asturiana","Spain"),("Cocido","Spain"),
  ("Escalivada","Spain"),("Bacalhau à Brás","Portugal"),
  ("Francesinha","Portugal"),("Caldo verde","Portugal"),("Migas","Spain"),
  ("Vatapá","Brazil"),("Acarajé","Brazil"),("Moqueca","Brazil"),
  ("Pabellón criollo","Venezuela"),("Bandeja paisa","Colombia"),
  ("Ajiaco","Colombia"),("Lomo saltado","Peru"),("Causa (food)","Peru"),
  ("Anticucho","Peru"),("Locro","Argentina"),("Chivito (sandwich)","Uruguay"),
  ("Kushari","Egypt"),("Mulukhiyah","Egypt"),("Waakye","Ghana"),
  ("Egusi","Nigeria"),("Muamba de galinha","Angola"),
]


def api(host, params):
    q = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"https://{host}/w/api.php?{q}", headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.load(r)
        except Exception:
            time.sleep(1 + attempt)
    return {}


def clean(s):
    s = re.sub(r"\s*\((food|sauce|dish)\)$", "", s)
    return s.replace("_", " ")


def photo_for(title):
    """The article's lead image, with the credit its licence requires."""
    d = api("en.wikipedia.org", {"action": "query", "format": "json", "titles": title,
                                 "prop": "pageimages", "piprop": "name",
                                 "redirects": 1, "pilicense": "any"})
    name = ""
    for v in (d.get("query", {}).get("pages", {}) or {}).values():
        name = v.get("pageimage") or ""
    if not name:
        return None
    d = api("commons.wikimedia.org", {"action": "query", "format": "json",
                                      "titles": "File:" + name, "prop": "imageinfo",
                                      "iiprop": "url|extmetadata", "iiurlwidth": 900})
    for v in (d.get("query", {}).get("pages", {}) or {}).values():
        ii = (v.get("imageinfo") or [{}])[0]
        em = ii.get("extmetadata", {})
        lic = (em.get("LicenseShortName", {}).get("value") or "").strip()
        if not any(f in lic.lower() for f in FREE):
            return None                       # not free to use, so not used
        who = re.sub(r"<[^>]+>", "", html.unescape(em.get("Artist", {}).get("value") or "")).strip()
        # Commons fills the author field with boilerplate when nobody named one
        if re.search(r"no machine.readable author|commonswiki", who, re.I):
            who = ""
        who = re.sub(r"\s+", " ", who).strip(" ,")
        url = ii.get("thumburl") or ii.get("url")
        if not url:
            return None
        credit = ", ".join(x for x in (who, lic) if x) or "Wikimedia Commons"
        return {"url": url, "credit": credit,
                "obs": "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(name)}
    return None


def build(table, cat, nid, have):
    """`have` is what a previous run already fetched, keyed by name."""
    out, skipped, reused = [], [], 0
    for tier, rows in table.items():
        for title, origin in rows:
            name = clean(title)
            old = have.get(name)
            if old:                                   # already have its photo
                old["tier"] = tier                    # but the tier may have moved
                old["facts"] = [{"lab": "from", "txt": origin}] if origin else []
                out.append(old); reused += 1
                continue
            ph = photo_for(title)
            time.sleep(0.25)
            if not ph:
                skipped.append(title); continue
            nid += 1
            out.append({"id": nid, "tier": tier, "group": cat.title(), "name": name,
                        "sci": "", "aliases": sorted({name.lower()}),
                        "facts": [{"lab": "from", "txt": origin}] if origin else [],
                        "cats": [cat], "photos": [ph]})
        print(f"   {tier:7s} {sum(1 for r in out if r['tier']==tier):3d} of {len(rows)}")
    print(f"   {reused} already had a photo, {len(out) - reused} newly fetched")
    if skipped:
        print(f"   no free photo for {len(skipped)}: {', '.join(skipped[:10])}"
              + (" ..." if len(skipped) > 10 else ""))
    return out, nid


def main():
    prev = json.load(open(OUT)) if os.path.exists(OUT) else {}
    have_d = {r["name"]: r for r in prev.get("desserts", [])}
    have_s = {r["name"]: r for r in prev.get("dishes", [])}
    nid = max([700000] + [r["id"] for v in prev.values() for r in v]) + 1
    print(f"Desserts ({sum(len(v) for v in DESSERTS.values())} curated)")
    desserts, nid = build(DESSERTS, "desserts", nid, have_d)
    print(f"\nDishes ({sum(len(v) for v in DISHES.values())} curated)")
    dishes, nid = build(DISHES, "dishes", nid, have_s)
    json.dump({"desserts": desserts, "dishes": dishes}, open(OUT, "w"), indent=1)
    print(f"\nwrote {len(desserts)} desserts + {len(dishes)} dishes -> {OUT}")


if __name__ == "__main__":
    main()
