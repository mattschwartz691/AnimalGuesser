const ROOT = require("path").join(__dirname, "..");
const {build, load} = require("./dom.js");
const h = build(); load();
const b = h.byId;
let fails = 0;
const ok = (c,m,x) => { if(!c){fails++;console.log("  FAIL "+m, x??"");} else console.log("  ok   "+m); };

setImmediate(() => {
  console.log("-- solo, ordinary play --");
  b.playsolo.fire("click");
  ok(!b.game.classList.contains("hangmanon"), "no letter grid when hangman is off");
  ok(!b.hintwrap.classList.contains("hidden"), "Hint button is present");
  ok(String(b.worth.textContent) === "5", "animal opens worth 5", b.worth.textContent);
  ok(!b.hintbox.classList.contains("show"), "board hidden until a hint or a word");

  // a correct answer scores
  let name = __t.current.animal.name;
  b.guess.value = name; b.guessbar.fire("submit"); h.flush();
  ok(b.answer.className === "right", "typing the name wins", b.answer.className);
  ok(Number(b.score.textContent) === 5, "5 points banked", b.score.textContent);

  console.log("\n-- hints, give up, bad photo, next --");
  b.next.fire("click");
  b.hint.fire("click");
  ok(b.hintbox.classList.contains("show"), "first hint puts the board up");
  ok(String(b.worth.textContent) === "4", "and costs a point", b.worth.textContent);
  const manyPhotos = (__t.current.animal.photos || []).length > 1;
  b.badphoto.fire("click");
  if (manyPhotos) ok(String(b.worth.textContent) === "4",
                     "bad photo keeps your progress when another photo exists", b.worth.textContent);
  else ok(String(b.worth.textContent) === "5",
          "bad photo moves to a new animal when this was its only photo", b.worth.textContent);
  b.giveup.fire("click"); h.flush();
  ok(b.answer.className === "wrong", "give up scores nothing", b.answer.className);

  console.log("\n-- a run of rounds, mixing everything, must not throw --");
  b.next.fire("click");
  let played = 0;
  for (let r = 0; r < 500; r++) {
    if (!__t.current) break;
    played++;
    const w = __t.hintWords();
    const roll = r % 5;
    if (roll === 0) { b.guess.value = __t.current.animal.name; b.guessbar.fire("submit"); h.flush(); }
    else if (roll === 1) { b.guess.value = "zzqq"; b.guessbar.fire("submit"); h.flush(); }
    else if (roll === 2) { b.hint.fire("click"); b.hint.fire("click"); }
    else if (roll === 3 && w.length > 1) { b.guess.value = w[0]; b.guessbar.fire("submit"); h.flush(); }
    else b.badphoto.fire("click");
    if (b.reveal.classList.contains("hidden")) { b.giveup.fire("click"); h.flush(); }
    b.next.fire("click");
  }
  ok(played === 500, "500 rounds played clean", played);

  console.log("\n-- toggling hangman mid-game deals a fresh round --");
  b["hangman-toggle"].checked = true; b["hangman-toggle"].fire("change");
  ok(b.game.classList.contains("hangmanon"), "grid appears");
  ok(b.hintbox.classList.contains("show"), "blanks up straight away");
  ok(__t.partsShown === 0, "bear reset", __t.partsShown);
  b["hangman-toggle"].checked = false; b["hangman-toggle"].fire("change");
  ok(!b.game.classList.contains("hangmanon"), "grid goes away again");
  ok(String(b.worth.textContent) === "5", "back to 5 points in solo", b.worth.textContent);

  console.log("\n-- teams mode --");
  b.restart.fire("click");
  b.playteams.fire("click");
  b.teampick.children[2].fire("click");   // 3 teams
  b.teamplay.fire("click");
  ok(b.teambar.children.length === 3, "three team cards", b.teambar.children.length);
  ok(b.soloscore.classList.contains("hidden"), "solo tally hidden in teams");

  console.log("\n-- category toggles --");
  b.restart.fire("click"); b.playsolo.fire("click");
  const before = __t.pool.length;
  h.cats.forEach(c => { if (c.dataset.cat !== "felines") c.checked = false; });
  h.cats[0].fire("change");
  ok(__t.pool.length < before && __t.pool.length > 0, "pool narrows to felines", __t.pool.length);
  // nothing repeats in a session, so this pool can legitimately run out --
  // what matters is that whatever it does deal is a feline
  let drew = 0, stray = 0;
  for (let i = 0; i < 40; i++) {
    const d = __t.draw();
    if (!d) break;                       // used up, which is correct behaviour
    drew++;
    if (!(d.animal.cats||[]).includes("felines")) stray++;
  }
  ok(drew > 0 && stray === 0, `${drew} draws, all of them felines`, stray + " strays");
  h.cats.forEach(c => c.checked = true); h.cats[0].fire("change");

  console.log("\n-- the two bird categories no longer overlap --");
  for (const t of h.tiers) t.checked = true; h.tiers[0].fire("change");   // all difficulties
  const world = __t.pool.filter(a => (a.cats||[]).includes("birds")).length;
  const us    = __t.pool.filter(a => (a.cats||[]).includes("usbirds")).length;
  const both  = __t.pool.filter(a => (a.cats||[]).includes("birds") && (a.cats||[]).includes("usbirds")).length;
  console.log(`     world ${world}, us ${us}, overlap ${both}, together ${world+us}`);
  ok(both === 0, "no animal is in both");
  ok(world + us === 4549, "together they are still every bird", world+us);

  console.log(fails === 0 ? "\nPASS: regression" : `\nFAIL: ${fails}`);
  process.exitCode = fails ? 1 : 0;
});
