const ROOT = require("path").join(__dirname, "..");
/* data/things.json: the categories, the names and the photo coverage. */
const fs = require("fs");
const d = JSON.parse(fs.readFileSync(ROOT + "/data/things.json","utf8")).animals;
let fails = 0;
const ok = (c,m,x) => { if(!c){fails++;console.log("  FAIL "+m, x??"");} else console.log("  ok   "+m); };
const by = {};
for (const r of d) (by[r.cats[0]] = by[r.cats[0]] || []).push(r);

console.log("-- categories --");
ok(Object.keys(by).sort().join(",") === "breakfast,desserts,dishes,flags,flowers,outlines,trees",
   "seven categories", Object.keys(by).sort().join(","));
ok(!by.constellations, "constellations are gone");
for (const [k,v] of Object.entries(by)) console.log(`     ${k.padEnd(9)} ${v.length}`);

console.log("\n-- every record is usable --");
ok(d.every(r => r.name && r.photos.length && r.photos[0].url), "all have a name and a photo");
ok(d.every(r => r.cats.length === 1), "all in exactly one category");
ok(d.every(r => ["easy","medium","hard","death"].includes(r.tier)), "all have a real tier");

console.log("\n-- country names are current --");
const names = new Set(d.map(r => r.name));
for (const stale of ["Cape Verde","Czech Republic","East Timor","Ivory Coast","Turkey",
                     "Swaziland","Macedonia","Burma","Somaliland","The Bahamas",
                     "People's Republic of China","United States of America",
                     "European Union","United Nations","Antarctica"]) {
  if (names.has(stale)) { fails++; console.log("  FAIL stale name present: " + stale); }
}
ok(true, "no stale or non-country names");
for (const cur of ["Cabo Verde","Czechia","Timor-Leste","Côte d'Ivoire","Türkiye",
                   "Eswatini","North Macedonia","Myanmar","United States","China"]) {
  if (!names.has(cur)) { fails++; console.log("  FAIL current name missing: " + cur); }
}
ok(true, "the current names are all there");

console.log("\n-- old names still answer --");
const alias = (n) => { const r = d.find(x => x.name === n); return r ? r.aliases : []; };
ok(alias("Myanmar").includes("burma"), "Burma answers Myanmar");
ok(alias("Eswatini").includes("swaziland"), "Swaziland answers Eswatini");
ok(alias("Netherlands").includes("holland"), "Holland answers Netherlands");
ok(alias("Czechia").includes("czech republic"), "Czech Republic answers Czechia");

console.log("\n-- flags and outlines agree --");
const fl = new Set(by.flags.map(r => r.name)), ol = new Set(by.outlines.map(r => r.name));
const orphan = [...ol].filter(n => !fl.has(n));
ok(orphan.length === 0, "every outline has a matching flag", orphan.slice(0,5).join(","));

console.log("\n-- tiers --");
ok(by.flags.filter(r=>r.tier==="easy").length > 15, "flags have a real easy tier",
   by.flags.filter(r=>r.tier==="easy").length);
const easyFlowers = by.flowers.filter(r=>r.tier==="easy").map(r=>r.name);
for (const want of ["Common Sunflower","Common Dandelion","Garden Tulip","Lawn Daisy"]) {
  if (!easyFlowers.includes(want)) { fails++; console.log("  FAIL not easy: " + want); }
}
ok(true, "household flowers are easy");
const evday = (n) => { const r = d.find(x => x.name === n); return r ? r.aliases : []; };
ok(evday("Common Sunflower").includes("sunflower"), '"sunflower" answers the sunflower');
ok(evday("English Oak").includes("oak"), '"oak" answers the English oak');

console.log("\n-- trees have two views --");
const two = by.trees.filter(r => r.photos.length > 1).length;
ok(two / by.trees.length > 0.85, `${two} of ${by.trees.length} trees have two photos`,
   Math.round(two/by.trees.length*100) + "%");

console.log("\n-- nothing is in two categories twice over --");
{
  const seen = new Map();
  const clash = [];
  for (const r of d) {
    const prev = seen.get(r.name);
    const pair = new Set([prev, r.cats[0]]);
    // a country legitimately appears as both a flag and an outline
    if (prev && !(pair.has("flags") && pair.has("outlines"))) clash.push(r.name + " in " + [...pair].join("+"));
    seen.set(r.name, r.cats[0]);
  }
  ok(clash.length === 0, "no accidental duplicates across categories", clash.slice(0,6).join(", "));
}

console.log("\n-- food --");
for (const c of ["dishes","desserts","breakfast"]) {
  const rows = by[c] || [];
  ok(rows.length > 80, `${c}: ${rows.length} of them`, rows.length);
  ok(rows.every(r => r.photos[0].url.includes("wikimedia") || r.photos[0].url.includes("wikipedia")),
     `${c}: every photo comes from Wikimedia`);
  ok(rows.every(r => /CC |Public domain|CC0|Wikimedia/i.test(r.photos[0].credit)),
     `${c}: every photo names a free licence`);
  ok(!rows.some(r => /machine-readable/i.test(r.photos[0].credit)),
     `${c}: no Commons boilerplate in the credits`);
  ok(rows.filter(r => (r.facts||[]).length).length / rows.length > 0.9,
     `${c}: nearly all say where they are from`);
  const tiers = new Set(rows.map(r => r.tier));
  ok(tiers.size === 4, `${c}: all four tiers used`, [...tiers].join(","));
}
const pizza = (by.dishes||[]).find(r => r.name === "Pizza");
ok(pizza && pizza.tier === "easy", "pizza is easy", pizza && pizza.tier);
ok(pizza && pizza.facts[0].txt === "Italy", "and comes from Italy");

console.log(fails === 0 ? "\nPASS: things data" : `\nFAIL: ${fails}`);
process.exitCode = fails ? 1 : 0;
