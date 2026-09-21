const ROOT = require("path").join(__dirname, "..");
/* A tree shows both of its pictures at once. */
const {build, load} = require("./dom.js");
const fs = require("fs");
const things = JSON.parse(fs.readFileSync(ROOT + "/data/things.json","utf8"));
const h = build(null, {credit:"Source"}, ["flowers","trees","flags","outlines"]);
global.fetch = () => Promise.resolve({ok:true, json:()=>Promise.resolve(things)});
load();
const b = h.byId;
let fails = 0;
const ok = (c,m,x) => { if(!c){fails++;console.log("  FAIL "+m, x??"");} else console.log("  ok   "+m); };

setImmediate(() => {
  h.cats.forEach(c => { c.checked = c.dataset.cat === "trees"; });
  for (const t of h.tiers) t.checked = true;
  h.tiers[0].fire("change"); h.cats[0].fire("change");
  b.playsolo.fire("click");

  // find a round whose tree carries the pair flag
  let n = 0;
  while (n++ < 50 && !(__t.current && __t.current.animal.pair)) {
    b.giveup.fire("click"); h.flush(); b.next.fire("click");
  }
  const a = __t.current.animal;
  ok(!!a.pair, "playing a tree marked as a pair", a.name);
  ok(a.photos.length > 1, "it has two photographs", a.photos.length);

  console.log("\n-- both go on screen --");
  ok(b.stage.classList.contains("pair"), "the stage is in pair mode");
  ok(b.photo.src === a.photos[0].url, "first image is photo one");
  ok(b.photo2.src === a.photos[1].url, "second image is photo two");
  ok(b.photo.src !== b.photo2.src, "and they are different pictures");

  console.log("\n-- both are credited --");
  b.photo.fire && null;
  b.photo.onload();           // the primary settles first
  ok(/^Source: /.test(b.credit.textContent), "one credit while the second loads",
     b.credit.textContent.slice(0,40));
  b.photo2.onload();
  ok(b.credit.textContent.split("Source:").length === 3, "both credited once it does",
     b.credit.textContent.slice(0,70));

  console.log("\n-- a flower is still a single picture --");
  h.cats.forEach(c => { c.checked = c.dataset.cat === "flowers"; });
  h.cats[0].fire("change");
  ok(!__t.current.animal.pair, "flowers are not pairs");
  ok(!b.stage.classList.contains("pair"), "the stage leaves pair mode");
  ok(!b.photo2.src, "the second image is cleared", JSON.stringify(b.photo2.src));

  console.log("\n-- a broken second picture does not spoil the round --");
  h.cats.forEach(c => { c.checked = c.dataset.cat === "trees"; });
  h.cats[0].fire("change");
  while (!(__t.current && __t.current.animal.pair)) { b.giveup.fire("click"); h.flush(); b.next.fire("click"); }
  ok(b.stage.classList.contains("pair"), "back in pair mode");
  b.photo2.onerror();
  ok(!b.stage.classList.contains("pair"), "falls back to one picture if the second fails");

  console.log(fails === 0 ? "\nPASS: pairs" : `\nFAIL: ${fails}`);
  process.exitCode = fails ? 1 : 0;
});
