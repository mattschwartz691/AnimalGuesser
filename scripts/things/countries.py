"""One canonical name per country, with its former names as accepted answers.

Flags and country outlines used to take their names from different places --
flagcdn for one, Natural Earth for the other -- and disagreed: Czechia against
Czech Republic, Timor-Leste against East Timor, Côte d'Ivoire against Ivory
Coast. Both now read from here and are joined on ISO 3166-1 code, so they
cannot drift apart again.

NAME holds the name the game asks for, current as of 2026. ALIASES holds what
else it will accept, which is where the former names live -- typing Burma still
answers Myanmar, and Swaziland still answers Eswatini.
"""

# Where flagcdn or Natural Earth is out of date, awkward, or parenthesised.
NAME = {
    "cv": "Cabo Verde",
    "cz": "Czechia",
    "ci": "Côte d'Ivoire",
    "sz": "Eswatini",
    "mk": "North Macedonia",
    "mm": "Myanmar",
    "tl": "Timor-Leste",
    "tr": "Türkiye",
    "va": "Vatican City",
    "cd": "Democratic Republic of the Congo",
    "cg": "Republic of the Congo",
    "us": "United States",
    "gb": "United Kingdom",
    "cn": "China",
    "bs": "Bahamas",
    "gm": "Gambia",
    "fm": "Micronesia",
    "kp": "North Korea",
    "kr": "South Korea",
    "ru": "Russia",
    "sy": "Syria",
    "la": "Laos",
    "ir": "Iran",
    "bo": "Bolivia",
    "tz": "Tanzania",
    "ve": "Venezuela",
    "md": "Moldova",
    "ax": "Åland Islands",
}

# Former names, official long forms and the usual shorthands. All are accepted
# as answers; none is what the game asks for.
ALIASES = {
    "mm": ["burma"],
    "sz": ["swaziland"],
    "mk": ["macedonia", "fyrom"],
    "tl": ["east timor"],
    "cz": ["czech republic"],
    "cv": ["cape verde"],
    "ci": ["ivory coast"],
    "tr": ["turkey", "turkiye"],
    "va": ["holy see", "vatican"],
    "cd": ["dr congo", "drc", "congo kinshasa", "zaire"],
    "cg": ["congo", "congo brazzaville"],
    "nl": ["holland"],
    "us": ["usa", "united states of america", "america", "us"],
    "gb": ["uk", "great britain", "britain", "england"],
    "ae": ["uae"],
    "cn": ["peoples republic of china", "prc"],
    "kr": ["republic of korea"],
    "kp": ["dprk", "democratic peoples republic of korea"],
    "ru": ["russian federation"],
    "la": ["lao", "lao pdr"],
    "sy": ["syrian arab republic"],
    "fm": ["federated states of micronesia"],
    "bs": ["the bahamas"],
    "gm": ["the gambia"],
    "ir": ["persia"],
    "lk": ["ceylon"],
    "kh": ["kampuchea"],
    "bf": ["upper volta"],
    "zw": ["rhodesia"],
    "bj": ["dahomey"],
    "bw": ["bechuanaland"],
    "ls": ["basutoland"],
    "mw": ["nyasaland"],
    "zm": ["northern rhodesia"],
    "dj": ["french somaliland"],
    "vu": ["new hebrides"],
    "ws": ["western samoa"],
    "gq": ["spanish guinea"],
    "sr": ["dutch guiana"],
    "gy": ["british guiana"],
    "bz": ["british honduras"],
    "th": ["siam"],
    "et": ["abyssinia"],
    "ml": ["french sudan"],
    "ne": ["niger republic"],
    "td": ["chad republic"],
    "ug": ["uganda protectorate"],
}

# Not countries. Flagcdn carries flags for these; the game should not ask them.
NOT_A_COUNTRY = {"eu", "un", "aq"}


def display(iso, fallback):
    """The name to ask for."""
    return NAME.get(iso, fallback)


def accepted(iso, name):
    """Everything that counts as naming it."""
    out = {name.lower()}
    out.update(ALIASES.get(iso, []))
    # "St Lucia" for "Saint Lucia", and the same the other way
    low = name.lower()
    if low.startswith("saint "):
        out.add("st " + low[6:]); out.add("st. " + low[6:])
    return sorted(out)


# Natural Earth's capital for a country is sometimes out of date, and for the
# countries with more than one it picks the least expected. Name and position,
# where the game should say something else.
CAPITAL = {
    "tz": ("Dodoma", 35.74, -6.18),          # not Dar es Salaam since 1996
    "bi": ("Gitega", 29.92, -3.43),          # not Bujumbura since 2019
    "bj": ("Porto-Novo", 2.63, 6.50),        # Cotonou is the seat of government
    "za": ("Pretoria", 28.19, -25.75),       # of its three, the one people name
    "bo": ("La Paz", -68.15, -16.50),        # Sucre is constitutional, La Paz governs
    "kz": ("Astana", 71.43, 51.13),          # missing from the places data
    "pw": ("Ngerulmud", 134.62, 7.50),       # Melekeok was renamed
    "mm": ("Naypyidaw", 96.13, 19.75),
    "ci": ("Yamoussoukro", -5.28, 6.82),

    # Natural Earth's capital list covers sovereign states and little else, so
    # the territories are filled in here. A few genuinely have no capital and
    # are left out rather than invented: Bouvet Island, Heard and McDonald and
    # the US Minor Outlying Islands are uninhabited, Tokelau's three atolls
    # take it in turns, and Hong Kong and Macau are cities in their own right.
    "as": ("Pago Pago", -170.70, -14.28),
    "ai": ("The Valley", -63.06, 18.22),
    "aw": ("Oranjestad", -70.03, 12.52),
    "bm": ("Hamilton", -64.78, 32.29),
    "io": ("Diego Garcia", 72.42, -7.31),
    "vg": ("Road Town", -64.62, 18.42),
    "bq": ("Kralendijk", -68.28, 12.14),
    "ky": ("George Town", -81.38, 19.29),
    "cx": ("Flying Fish Cove", 105.72, -10.42),
    "cc": ("West Island", 96.83, -12.19),
    "ck": ("Avarua", -159.78, -21.21),
    "cw": ("Willemstad", -68.93, 12.11),
    "fk": ("Stanley", -57.85, -51.70),
    "fo": ("Tórshavn", -6.77, 62.01),
    "gf": ("Cayenne", -52.33, 4.94),
    "pf": ("Papeete", -149.57, -17.54),
    "tf": ("Port-aux-Français", 70.22, -49.35),
    "gi": ("Gibraltar", -5.35, 36.14),
    "gl": ("Nuuk", -51.72, 64.18),
    "gp": ("Basse-Terre", -61.73, 16.00),
    "gu": ("Hagåtña", 144.75, 13.47),
    "gg": ("St Peter Port", -2.54, 49.46),
    "im": ("Douglas", -4.48, 54.15),
    "je": ("Saint Helier", -2.10, 49.19),
    "xk": ("Pristina", 21.17, 42.67),
    "mq": ("Fort-de-France", -61.07, 14.60),
    "yt": ("Mamoudzou", 45.23, -12.78),
    "ms": ("Brades", -62.21, 16.79),        # Plymouth was buried by the volcano
    "nr": ("Yaren", 166.92, -0.55),         # no official capital; Yaren governs
    "nc": ("Nouméa", 166.46, -22.28),
    "nu": ("Alofi", -169.92, -19.06),
    "nf": ("Kingston", 167.96, -29.06),
    "mp": ("Saipan", 145.75, 15.19),
    "ps": ("Ramallah", 35.21, 31.90),       # where it governs from in practice
    "pn": ("Adamstown", -130.10, -25.07),
    "pr": ("San Juan", -66.11, 18.47),
    "re": ("Saint-Denis", 55.45, -20.88),
    "bl": ("Gustavia", -62.85, 17.90),
    "sh": ("Jamestown", -5.72, -15.93),
    "mf": ("Marigot", -63.08, 18.07),
    "pm": ("Saint-Pierre", -56.17, 46.78),
    "sx": ("Philipsburg", -63.05, 18.03),
    "gs": ("King Edward Point", -36.49, -54.28),
    "sj": ("Longyearbyen", 15.63, 78.22),
    "tc": ("Cockburn Town", -71.14, 21.46),
    "vi": ("Charlotte Amalie", -64.93, 18.34),
    "wf": ("Mata-Utu", -176.17, -13.28),
    "eh": ("Laayoune", -13.20, 27.15),
    "ax": ("Mariehamn", 19.94, 60.10),
}

# Natural Earth has no row for some overseas territories, so no continent
# either. These are the ones the game would otherwise say nothing about.
CONTINENT = {
    "bv": "Antarctica",   "bq": "North America", "cx": "Asia",
    "cc": "Asia",         "gf": "South America", "gp": "North America",
    "mq": "North America", "yt": "Africa",       "re": "Africa",
    "sj": "Europe",       "tk": "Oceania",       "hm": "Antarctica",
    "um": "Oceania",
}


def continent(iso, found):
    return found or CONTINENT.get(iso)


def capital(iso, found):
    """The capital to hint at: ours if we have one, otherwise what was found."""
    return CAPITAL.get(iso, found)


# Recognising an outline is nothing to do with how many people live there.
# Population suits flags -- you have probably seen a populous country's flag --
# but it put Niger and Malawi in the middle tier while Italy and Norway, two of
# the most recognisable shapes on earth, sat further down. So the first two
# tiers are named: shapes most people could place, then shapes they could work
# out. The rest falls back to population, which at least keeps microstates and
# uninhabited rocks at the bottom.
OUTLINE_EASY = {
    "it",  # the boot
    "us", "gb", "fr", "jp", "au", "in", "br", "cl", "ca", "ru", "cn", "mx",
    "es", "de", "no", "se", "gr", "eg", "za", "nz", "cu", "is", "ie", "pt",
    "kr", "tr",
}
OUTLINE_MEDIUM = {
    "pl", "ua", "fi", "dk", "nl", "be", "at", "ch", "cz", "il", "ir", "iq",
    "sa", "pk", "bd", "th", "vn", "id", "ph", "my", "ng", "ke", "et", "ma",
    "dz", "ly", "ar", "pe", "co", "ve", "bo", "mg", "np", "lk", "kh", "mm",
    "kp", "tw", "pa", "mn", "hu", "ro", "rs", "hr", "bg",
}


def outline_tier(iso, pop_tier_of):
    """Easy and medium are named; hard and death fall back to population."""
    if iso in OUTLINE_EASY:
        return "easy"
    if iso in OUTLINE_MEDIUM:
        return "medium"
    # everything else is at best hard, however many people live there
    return "hard" if pop_tier_of in ("easy", "medium", "hard") else "death"
