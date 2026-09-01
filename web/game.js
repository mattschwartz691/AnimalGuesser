/* Animal Guesser -- all photos are real, taken by real people. No AI imagery. */
(() => {
"use strict";

const $ = (id) => document.getElementById(id);
const el = {
  stage:$("stage"), photo:$("photo"), spinner:$("spinner"), credit:$("credit"),
  flash:$("flash"), guessbar:$("guessbar"), guess:$("guess"), submit:$("submit"),
  reveal:$("reveal"), answer:$("answer"), next:$("next"),
  gear:$("gear"), settings:$("settings"), overlay:$("overlay"), close:$("close"),
  hint:$("hint"), hintcount:$("hintcount"), hintbox:$("hintbox"), hintword:$("hintword"),
  hintsci:$("hintsci"), hintscirow:$("hintscirow"),
  catwarn:$("catwarn"), allcats:$("allcats"),
  score:$("score"), asked:$("asked"), tierbadge:$("tierbadge"),
};
const TIER_LABEL = {easy:"Easy", medium:"Medium", hard:"Hard", death:"Death Mode"};
const FLASH_MS = 1000;
const ALL_CATS = ["mammals","reptiles","birds","sea","fish","amphibians","land","bugs"];

let ALL = [];            // every animal record
let pool = [];           // animals in the current tier
let bag = [];            // shuffled queue, so nothing repeats until exhausted
let tier = "easy";
let onCats = new Set(ALL_CATS);   // categories currently toggled on
let current = null;      // {animal, photo} on screen now
let upcoming = null;     // {animal, photo} chosen + preloaded ahead of time
let locked = false;      // true while a flash is on screen
let score = 0, asked = 0;
let gen = 0;                       // bumped whenever what's on screen changes,
                                   // so a slow image load can't resurrect itself
let hintsUsed = 0;                 // resets with every new photo

/* ---------- persistence (may be unavailable; never let it break the game) --- */
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

/* ---------- answer matching ------------------------------------------------ */
function normalize(s) {
  return (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // strip accents
    .toLowerCase()
    .replace(/ph/g, "f")                                // elephant / elefant
    .replace(/[^a-z0-9]+/g, " ")                        // punctuation -> space
    .trim()
    .replace(/^(a|an|the) /, "")
    .replace(/\s+/g, " ");
}

// A few spellings of the same word should all count.
function variants(s) {
  const n = normalize(s);
  if (!n) return [];
  const out = [n];
  const add = (v) => { if (v && !out.includes(v)) out.push(v); };
  add(n.replace(/ /g, ""));
  const sing = n.endsWith("ies") ? n.slice(0, -3) + "y"
             : /(ses|xes|zes|ches|shes)$/.test(n) ? n.slice(0, -2)
             : n.endsWith("s") && !n.endsWith("ss") ? n.slice(0, -1)
             : null;
  if (sing) { add(sing); add(sing.replace(/ /g, "")); }
  return out;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 99;
  let prev = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
                        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function accepted(animal) {
  const set = new Set();
  for (const s of [animal.name, animal.sci, ...(animal.aliases || [])])
    for (const v of variants(s)) set.add(v);
  return [...set].filter(Boolean);
}

// How many typos to forgive in one word. Deliberately strict on short words:
// at distance 1, "mouse"/"moose" and "boar"/"bear" are different animals.
function tolerance(word) {
  // Two edits only on genuinely long words: at two edits "frogfish" and
  // "frostfish" are different fish.
  return word.length >= 11 ? 2 : word.length >= 7 ? 1 : 0;
}

// Compare word by word rather than across the whole phrase. Whole-string
// distance would call "domestic goat" a typo of "domestic cat", and
// "sea lily" a typo of "sea lion" -- different animals, not misspellings.
function closeEnough(guess, answer) {
  if (guess === answer) return true;
  const g = guess.split(" "), a = answer.split(" ");
  if (g.length !== a.length) return false;
  let spent = 0;
  for (let i = 0; i < a.length; i++) {
    if (g[i] === a[i]) continue;
    // In a multi-word name the other words pin down which animal is meant, so
    // one slip in a short word is safe there ("sea lilly") even though the
    // same slip alone would not be ("mouse" is not a typo of "moose").
    const tol = Math.max(tolerance(a[i]), a.length > 1 ? 1 : 0);
    // A typo rarely changes the first letter -- but "gorilla"/"zorilla" and
    // "boar"/"bear" are different animals that differ by one.
    if (g[i][0] !== a[i][0]) return false;
    const d = levenshtein(g[i], a[i]);
    if (d > tol) return false;
    spent += d;
  }
  return spent > 0 && spent <= 2;   // don't let small slips compound
}

// canonical spaced form of each accepted answer -- the only forms we fuzz
function acceptedSpaced(animal) {
  const set = new Set();
  // Scientific names are excluded: they are precise Latin, and at two edits
  // "bubo bubo" (eagle-owl) becomes "bufo bufo" (toad). They still match exactly.
  for (const s of [animal.name, ...(animal.aliases || [])]) {
    const n = normalize(s);
    if (n) set.add(n);
  }
  return [...set];
}

function isCorrect(input, animal) {
  const guesses = variants(input);
  if (!guesses.length) return false;
  const ok = accepted(animal);
  // exact match against every spelling variant, including space-stripped
  for (const g of guesses) if (ok.includes(g)) return true;
  // Fuzzy match only the canonical spaced forms. Comparing space-stripped
  // phrases would make "domesticcat" a typo of "domesticgoat".
  const g0 = guesses[0];
  for (const a of acceptedSpaced(animal)) if (closeEnough(g0, a)) return true;
  return false;
}

/* ---------- hints ----------------------------------------------------------
   One hint per word, revealing that word's first letter in turn, and then a
   final hint that gives the Latin name. "Scarlet Macaw" is 3 hints: S, then
   M, then Ara macao. A one-word animal is 2; a three-word animal is 4. */
const IS_LETTER = /[\p{L}\p{N}]/u;

function hintName() {
  return (current && current.animal && current.animal.name) || "";
}
function hintSci() {
  return (current && current.animal && current.animal.sci) || "";
}

function hintWords() {
  return hintName().split(/\s+/).filter(Boolean);
}

function maxHints() {
  const w = hintWords();
  if (!w.length) return 0;
  return w.length + (hintSci() ? 1 : 0);   // one per word, then the Latin name
}

function hintsLeft() {
  return Math.max(0, maxHints() - hintsUsed);
}

function renderHint() {
  const name = hintName();
  if (!name || hintsUsed === 0) {
    el.hintbox.classList.remove("show");
    el.hintscirow.classList.remove("show");
    return;
  }
  const wordsShown = Math.min(hintsUsed, hintWords().length);
  let wordIndex = 0, atStart = true, shownFirst = false, out = [];
  for (const ch of name) {
    if (/\s/.test(ch)) { out.push("  "); atStart = true; wordIndex++; shownFirst = false; continue; }
    if (!IS_LETTER.test(ch)) { out.push(ch); continue; }
    // only the first letter of each revealed word
    const reveal = atStart && !shownFirst && wordIndex < wordsShown;
    out.push(reveal ? ch.toUpperCase() : "_");
    if (reveal) shownFirst = true;
    atStart = false;
  }
  el.hintword.textContent = out.join(" ");
  el.hintbox.classList.add("show");

  const sci = hintSci();
  const showSci = sci && hintsUsed > hintWords().length;
  el.hintsci.textContent = showSci ? sci : "";
  el.hintscirow.classList.toggle("show", !!showSci);
}

function updateHintButton() {
  const left = hintsLeft();
  el.hintcount.textContent = left;
  el.hintcount.classList.toggle("spent", left === 0);
  el.hint.disabled = locked || left === 0;
}

function useHint() {
  if (locked || hintsLeft() === 0) return;
  hintsUsed++;
  renderHint();
  updateHintButton();
  if (!isTouch()) el.guess.focus();
}

/* ---------- round flow ----------------------------------------------------- */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pick the next animal AND which of its photos we'll show, so the preloader
// can warm the exact image the next round will use.
function draw() {
  if (!pool.length) return null;
  if (!bag.length) bag = shuffle(pool);
  const animal = bag.pop();
  const photo = animal.photos[Math.floor(Math.random() * animal.photos.length)];
  return {animal, photo};
}

// An animal shows if ANY of its categories is on -- they overlap by design
// (a dolphin is a mammal and a sea animal).
function inCats(a) {
  return (a.cats || []).some(c => onCats.has(c));
}

function rebuildPool() {
  pool = ALL.filter(a => a.tier === tier && inCats(a));
  bag = [];
  upcoming = null;
}

function setTier(t) {
  tier = t;
  store.set("tier", t);
  rebuildPool();
  score = 0; asked = 0;
  el.tierbadge.textContent = TIER_LABEL[t];
  document.querySelectorAll(".diff").forEach(b =>
    b.classList.toggle("active", b.dataset.tier === t));
  updateScore();
  updateCatCounts();
  if (pool.length) { el.catwarn.classList.add("hidden"); newRound(); }
  else applyCats(false);
}

function updateScore() {
  el.score.textContent = score;
  el.asked.textContent = asked;
}

function newRound(triesLeft = 6) {
  const mine = ++gen;
  locked = false;
  el.flash.classList.add("hidden");
  el.flash.className = "hidden";
  el.reveal.classList.add("hidden");
  el.guessbar.classList.remove("hidden");
  el.guess.value = "";
  el.guess.disabled = false;
  el.submit.disabled = false;
  el.photo.classList.remove("ready");
  el.spinner.classList.remove("hidden");
  el.credit.textContent = "";
  hintsUsed = 0;
  el.hintbox.classList.remove("show");
  el.hintscirow.classList.remove("show");

  if (!pool.length) {
    el.spinner.textContent = "No animals available for this difficulty.";
    el.guessbar.classList.add("hidden");
    return;
  }

  current = upcoming || draw();
  upcoming = null;
  if (!current) { el.spinner.textContent = "No animals available."; return; }
  const photo = current.photo;
  updateHintButton();

  el.spinner.textContent = "Loading photo…";
  el.photo.onload = () => {
    if (mine !== gen) return;              // superseded while loading
    el.photo.classList.add("ready");
    el.spinner.classList.add("hidden");
    el.credit.textContent = "Photo: " + (photo.credit || "iNaturalist");
    if (!isTouch()) el.guess.focus();
    preloadNext();
  };
  el.photo.onerror = () => {
    if (mine !== gen) return;              // superseded while loading
    // dead link -- quietly move on to a different animal
    if (triesLeft > 0) newRound(triesLeft - 1);
    else el.spinner.textContent = "Could not load a photo. Check your connection.";
  };
  el.photo.src = photo.url;
}

function preloadNext() {
  if (upcoming) return;
  upcoming = draw();
  if (upcoming) { const im = new Image(); im.src = upcoming.photo.url; }
}

function isTouch() {
  return window.matchMedia && window.matchMedia("(hover: none)").matches;
}

function submitGuess(ev) {
  if (ev) ev.preventDefault();
  if (locked || !current) return;
  const text = el.guess.value.trim();
  if (!text) return;

  locked = true;
  el.guess.disabled = true;
  el.submit.disabled = true;
  el.hint.disabled = true;

  const right = isCorrect(text, current.animal);
  asked++;
  if (right) score++;
  updateScore();

  // 1. bold flash message for exactly one second
  el.flash.textContent = right ? "CORRECT!" : "WRONG ANSWER!";
  el.flash.className = right ? "right" : "wrong";

  setTimeout(() => {
    // 2. flash goes away, 3. guess bar goes away
    el.flash.className = "hidden";
    el.guessbar.classList.add("hidden");

    // 4. the answer is revealed, with Next beside it
    const a = current.animal;
    el.answer.textContent = a.name;
    el.answer.className = right ? "right" : "wrong";
    el.credit.innerHTML =
      "Photo: " + escapeHtml(current.photo.credit || "iNaturalist") +
      (current.photo.obs
        ? ' · <a href="' + escapeAttr(current.photo.obs) +
          '" target="_blank" rel="noopener">source</a>' : "") +
      (a.sci ? " · <i>" + escapeHtml(a.sci) + "</i>" : "");
    el.reveal.classList.remove("hidden");
    el.next.focus();
    locked = false;
  }, FLASH_MS);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
}
const escapeAttr = escapeHtml;

/* ---------- categories -----------------------------------------------------*/
function catBoxes() {
  return [...document.querySelectorAll(".cattoggle")];
}

function updateCatCounts() {
  const n = {};
  for (const a of ALL) if (a.tier === tier)
    for (const c of (a.cats || [])) n[c] = (n[c] || 0) + 1;
  for (const el2 of document.querySelectorAll(".catnum")) {
    const c = el2.dataset.count;
    el2.textContent = n[c] ? n[c] : "0";
    el2.style.opacity = n[c] ? "" : ".4";
  }
}

function applyCats(save) {
  onCats = new Set(catBoxes().filter(b => b.checked).map(b => b.dataset.cat));
  if (save !== false) store.set("cats", [...onCats].join(","));
  rebuildPool();
  updateCatCounts();
  const empty = pool.length === 0;
  el.catwarn.classList.toggle("hidden", !empty);
  el.catwarn.textContent = onCats.size === 0
    ? "Nothing is selected — turn a category on."
    : "No " + TIER_LABEL[tier] + " animals match these categories.";
  if (!empty) newRound();
  else {
    gen++;                                 // cancel any pending photo load
    current = null;
    el.spinner.textContent = el.catwarn.textContent;
    el.spinner.classList.remove("hidden");
    el.photo.classList.remove("ready");
    el.photo.removeAttribute("src");
    el.credit.textContent = "";
    el.guessbar.classList.add("hidden");
    el.reveal.classList.add("hidden");
    el.hintbox.classList.remove("show");
  }
}

function restoreCats() {
  const saved = store.get("cats", null);
  if (saved !== null) {
    const want = new Set(saved.split(",").filter(Boolean));
    for (const b of catBoxes()) b.checked = want.has(b.dataset.cat);
  }
  onCats = new Set(catBoxes().filter(b => b.checked).map(b => b.dataset.cat));
}

/* ---------- settings ------------------------------------------------------- */
function openSettings() {
  el.settings.classList.remove("hidden");
  el.overlay.classList.remove("hidden");
}
function closeSettings() {
  el.settings.classList.add("hidden");
  el.overlay.classList.add("hidden");
}

/* ---------- wire up -------------------------------------------------------- */
el.guessbar.addEventListener("submit", submitGuess);
el.next.addEventListener("click", () => newRound());
el.hint.addEventListener("click", useHint);
for (const b of document.querySelectorAll(".cattoggle"))
  b.addEventListener("change", () => applyCats());
el.allcats.addEventListener("click", () => {
  for (const b of catBoxes()) b.checked = true;
  applyCats();
});
el.gear.addEventListener("click", openSettings);
el.close.addEventListener("click", closeSettings);
el.overlay.addEventListener("click", closeSettings);
document.querySelectorAll(".diff").forEach(b =>
  b.addEventListener("click", () => { setTier(b.dataset.tier); closeSettings(); }));
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeSettings();
});

// data/animals.json stores links to photographs, never the photographs
// themselves, packed against a legend to keep the file small. Rebuild the
// records the game works with.
function unpack(d) {
  if (d.v !== 2) return d.animals || [];
  const L = d.L;
  return d.a.map(([id, t, g, name, sci, extra, mask, photos]) => ({
    id, tier: L.t[t], group: L.g[g], name, sci,
    aliases: [name.toLowerCase(), ...extra],
    cats: L.c.filter((_, i) => mask & (1 << i)).sort(),
    photos: photos.map(([h, pid, e, cred, li, obs]) => {
      const lic = L.l[li];
      return {
        url: h < 0 ? pid : L.h[h] + pid + "/large" + L.e[e],
        credit: cred ? (lic ? "(c) " + cred + ", " + lic : cred) : "",
        obs: typeof obs === "number"
          ? (obs ? "https://www.inaturalist.org/observations/" + obs : "")
          : (obs || ""),
      };
    }),
  }));
}

fetch("../data/animals.json")
  .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
  .then(d => {
    ALL = unpack(d);
    restoreCats();
    const saved = store.get("tier", "easy");
    setTier(TIER_LABEL[saved] ? saved : "easy");
  })
  .catch(err => {
    el.spinner.textContent =
      "Could not load data/animals.json (" + err.message + "). " +
      "Run the game through ./serve.sh rather than opening the file directly.";
    el.guessbar.classList.add("hidden");
  });
})();
