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
