const ROOT = require("path").join(__dirname, "..");
/* A country's hints come in order: continent, capital, then the letters,
   then the first letter. */
const {build, load} = require("./dom.js");
const fs = require("fs");
const things = JSON.parse(fs.readFileSync(ROOT + "/data/things.json","utf8"));
const h = build(null, {streakTries:{flags:2}}, ["flowers","trees","flags","outlines"]);
// stand the Things data in for the animal data, so the real engine runs on it
global.fetch = () => Promise.resolve({ok:true, json:()=>Promise.resolve(things)});
load();
const b = h.byId;
let fails = 0;
const ok = (c,m,x) => { if(!c){fails++;console.log("  FAIL "+m, x??"");} else console.log("  ok   "+m); };

setImmediate(() => {
  // flags only, so every round is a country with facts
  h.cats.forEach(c => { c.checked = c.dataset.cat === "flags"; });
  for (const t of h.tiers) t.checked = true;
  h.tiers[0].fire("change"); h.cats[0].fire("change");
  b.playsolo.fire("click");
  ok(__t.current && __t.current.animal.cats[0] === "flags", "playing flags",
     __t.current && __t.current.animal.name);

  // not every country has a capital in the data (Nauru does not), so find one
  // that carries all three before checking the order
  let facts = __t.current.animal.facts || [];
  for (let i = 0; i < 400 && facts.length < 2; i++) {
    b.giveup.fire("click"); h.flush(); b.next.fire("click");
    facts = (__t.current && __t.current.animal.facts) || [];
  }
  ok(facts.length === 2, "found a country with both facts");
  console.log(`  ${__t.current.animal.name}: ${facts.map(f=>f.lab+"="+f.txt).join(" | ")}`);
  ok(facts[0].lab === "continent", "first is the continent", facts[0].lab);
  ok(facts[1].lab === "capital", "second is the capital", facts[1].txt);
  ok(!facts.some(f => /^in the /.test(f.txt)), "no vague where-the-capital-is hint");

  console.log("\n-- and that is the order the hints arrive in --");
  const shown = [];
  for (let i = 0; i < 2; i++) {
    b.hint.fire("click");
    shown.push(b.hintfacts.children.map(r => r.children[1].textContent).join(" / "));
  }
  ok(shown[0] === facts[0].txt, "hint 1 gives the continent", shown[0]);
  ok(shown[1].endsWith(facts[1].txt), "hint 2 adds the capital", shown[1]);
  ok(!b.hintword.textContent.includes("_") || b.hintword.textContent === "",
     "no letters given away yet", JSON.stringify(b.hintword.textContent));

  b.hint.fire("click");
  ok(b.hintword.textContent.includes("_"), "hint 3 is the letters",
     JSON.stringify(b.hintword.textContent.slice(0,24)));
  const before = b.hintword.textContent;
  b.hint.fire("click");
  ok(b.hintword.textContent !== before, "hint 4 reveals a first letter");

  console.log("\n-- a flower has no facts, so it starts with the letters --");
  h.cats.forEach(c => { c.checked = c.dataset.cat === "flowers"; });
  h.cats[0].fire("change");
  ok((__t.current.animal.facts || []).length === 0, "flowers carry no facts");
  b.hint.fire("click");
  ok(b.hintword.textContent.includes("_"), "its first hint is the letters");

  console.log(fails === 0 ? "\nPASS: country facts" : `\nFAIL: ${fails}`);
  process.exitCode = fails ? 1 : 0;
});
