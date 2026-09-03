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
  hintsci:$("hintsci"), hintscirow:$("hintscirow"), giveup:$("giveup"),
  badphoto:$("badphoto"), fullscreen:$("fullscreen"),
  catwarn:$("catwarn"), allcats:$("allcats"), nocats:$("nocats"),
  score:$("score"), asked:$("asked"), tierbadge:$("tierbadge"),
  correct:$("correct"), worth:$("worth"), tierwarn:$("tierwarn"),
};
const TIER_LABEL = {easy:"Easy", medium:"Medium", hard:"Hard", death:"Death Mode"};
const FLASH_MS = 1000;
// Unicode-aware so accented letters count as letters, not punctuation.
const IS_LETTER = /[\p{L}\p{N}]/u;
const ALL_CATS = ["mammals","reptiles","birds","sea","fish","amphibians","land",
                  "bugs","usbirds","felines","catbreeds","dogbreeds"];

let ALL = [];            // every animal record
let pool = [];           // animals in the current tier
let bag = [];            // shuffled queue, so nothing repeats until exhausted
let onTiers = new Set(["easy"]);   // difficulties currently ticked
let onCats = new Set(ALL_CATS);   // categories currently toggled on
let current = null;      // {animal, photo} on screen now
let upcoming = null;     // {animal, photo} chosen + preloaded ahead of time
let locked = false;      // true while a flash is on screen
let score = 0, asked = 0, correct = 0;

// Every animal starts at BASE_POINTS. Each hint you take -- or each wrong
// guess, which spends one -- knocks a point off, down to a floor of 1.
const BASE_POINTS = 5;
function worthNow() {
  return Math.max(1, BASE_POINTS - hintsUsed);
}
let gen = 0;                       // bumped whenever what's on screen changes,
                                   // so a slow image load can't resurrect itself
let hintsUsed = 0;                 // resets with every new photo
let solvedWords = new Set();       // indices of name words already guessed
let countsShown = false;           // hint 1: how many letters per word
let lettersShown = new Set();      // word indices whose first letter a hint paid for
let latinShown = false;            // the final hint
let revealAll = false;             // round over: show the whole name and Latin

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

function matchesAny(guesses, forms) {
  const flat = new Set();
  for (const f of forms) for (const v of variants(f)) flat.add(v);
  for (const g of guesses) if (flat.has(g)) return true;
  const g0 = guesses[0];
  for (const f of forms) {
    const n = normalize(f);
    if (n && closeEnough(g0, n)) return true;
  }
  return false;
}

// The whole animal: its full name, or its scientific name.
function fullForms(animal) {
  return [animal.name, animal.sci].filter(Boolean);
}

// Just the noun: the last word of the name, plus any shorter nickname.
// "crab" for a Land Crab -- right kind of animal, not yet the answer.
function nounForms(animal) {
  const words = (animal.name || "").split(/\s+/).filter(Boolean);
  const out = [];
  if (words.length > 1) out.push(words[words.length - 1]);
  const full = normalize(animal.name);
  for (const a of (animal.aliases || [])) if (normalize(a) !== full) out.push(a);
  return out;
}

// The name split into normalised words: "Green Tree Frog" -> green, tree, frog
// A hyphen is a word break like a space, so "Diamond-backed" is two words and
// guessing either half counts. Tokens without a letter (a stray "&") are
// dropped so word numbering matches what the display walks over.
const WORD_BREAK = /[\s\u2010-\u2015-]+/;
function splitName(name) {
  return (name || "").split(WORD_BREAK).filter(w => IS_LETTER.test(w));
}

function nameWords(animal) {
  return splitName(animal.name).map(normalize);
}

function wordMatches(guessWord, nameWord) {
  if (guessWord === nameWord) return true;
  for (const v of variants(nameWord)) if (v === guessWord) return true;
  return closeEnough(guessWord, nameWord);
}

// -> {kind:"full"} | {kind:"words", words:Set<index>} | {kind:"no"}
function judge(input, animal) {
  const guesses = variants(input);
  if (!guesses.length) return {kind: "no"};
  if (matchesAny(guesses, fullForms(animal))) return {kind: "full"};

  // any word of the name that the guess names
  const words = nameWords(animal);
  const said = normalize(input).split(" ").filter(Boolean);
  const hit = new Set();
  words.forEach((w, i) => { if (said.some(g => wordMatches(g, w))) hit.add(i); });

  // "longtoed" -- a hyphenated word typed with nothing between its halves.
  // Match a guess against consecutive words run together and credit them all.
  for (let i = 0; i < words.length; i++) {
    let joined = "";
    for (let j = i; j < words.length; j++) {
      joined += words[j];
      if (j > i && said.some(g => wordMatches(g, joined)))
        for (let k = i; k <= j; k++) hit.add(k);
    }
  }
  if (hit.size) return {kind: "words", words: hit};

  // a nickname that is not literally in the name ("hippo") stands for the noun
  if (matchesAny(guesses, nounForms(animal)))
    return {kind: "words", words: new Set([words.length - 1])};

  return {kind: "no"};
}

/* ---------- hints ----------------------------------------------------------
   Hint 1 shows how many letters are in each word. Then one hint per word,
   revealing that word's first letter in turn. The last hint gives the Latin
   name. "Scarlet Macaw" is 4 hints: the blanks, S, M, then Ara macao. */
function hintName() {
  return (current && current.animal && current.animal.name) || "";
}
function hintSci() {
  return (current && current.animal && current.animal.sci) || "";
}

function hintWords() {
  return splitName(hintName());
}

// What the next hint would buy. A word you have already guessed is skipped --
// paying to reveal a letter you can see would be wasted.
function nextHint() {
  if (!countsShown) return {type: "counts"};
  const words = hintWords();
  for (let i = 0; i < words.length; i++)
    if (!solvedWords.has(i) && !lettersShown.has(i)) return {type: "letter", i};
  if (hintSci() && !latinShown) return {type: "latin"};
  return null;
}

function hintsLeft() {
  if (!hintName()) return 0;
  let n = countsShown ? 0 : 1;
  const words = hintWords();
  for (let i = 0; i < words.length; i++)
    if (!solvedWords.has(i) && !lettersShown.has(i)) n++;
  if (hintSci() && !latinShown) n++;
  return n;
}

// Spend one hint. Returns false if there was nothing left to buy.
function spendHint() {
  const t = nextHint();
  if (!t) return false;
  hintsUsed++;                       // scoring counts every hint spent
  if (t.type === "counts") countsShown = true;
  else if (t.type === "letter") lettersShown.add(t.i);
  else latinShown = true;
  return true;
}

function renderHint() {
  const name = hintName();
  if (!name || (!countsShown && solvedWords.size === 0 && !revealAll)) {
    el.hintbox.classList.remove("show");
    el.hintscirow.classList.remove("show");
    el.hintword.textContent = "";      // no stale shape from the last animal
    el.hintsci.textContent = "";
    return;
  }
  const words = hintWords();
  // hint 1 only shows the blanks, so first letters start with hint 2
  const wordsShown = Math.min(Math.max(0, hintsUsed - 1), words.length);
  let wordIndex = -1, inWord = false, firstDone = false, out = [];
  for (const ch of name) {
    if (WORD_BREAK.test(ch)) {                 // space or hyphen ends a word
      out.push(/\s/.test(ch) ? "  " : ch);
      inWord = false;
      continue;
    }
    if (!IS_LETTER.test(ch)) { out.push(ch); continue; }   // apostrophes etc.
    if (!inWord) { inWord = true; wordIndex++; firstDone = false; }
    const whole = solvedWords.has(wordIndex);
    const reveal = revealAll || whole ||
                   (!firstDone && lettersShown.has(wordIndex));
    out.push(reveal ? ch.toUpperCase() : "_");
    firstDone = true;
  }
  el.hintword.textContent = out.join(" ");
  el.hintbox.classList.add("show");

  const sci = hintSci();
  const showSci = sci && (latinShown || revealAll);
  el.hintsci.textContent = showSci ? sci : "";
  el.hintscirow.classList.toggle("show", !!showSci);
}

function updateHintButton() {
  const left = hintsLeft();
  el.hintcount.textContent = left;
  el.hintcount.classList.toggle("spent", left === 0);
  el.hint.disabled = locked || left === 0;
  el.giveup.disabled = locked;
  el.badphoto.disabled = locked;
}

function useHint() {
  if (locked) return;
  if (!spendHint()) return;
  renderHint();
  updateHintButton();
  updateScore();
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
  pool = ALL.filter(a => onTiers.has(a.tier) && inCats(a));
  bag = [];
  upcoming = null;
}

function tierLabel() {
  const on = ["easy","medium","hard","death"].filter(t => onTiers.has(t));
  if (!on.length) return "none";
  if (on.length === 4) return "All levels";
  return on.map(t => TIER_LABEL[t]).join(" + ");
}

function setTiers(save) {
  onTiers = new Set([...document.querySelectorAll(".difftoggle")]
    .filter(b => b.checked).map(b => b.dataset.tier));
  if (save !== false) store.set("tiers", [...onTiers].join(","));
  rebuildPool();
  score = 0; asked = 0; correct = 0;
  el.tierbadge.textContent = tierLabel();
  el.tierwarn.classList.toggle("hidden", onTiers.size > 0);
  updateScore();
  updateCounts();
  syncCatButtons();
  if (pool.length) { el.catwarn.classList.add("hidden"); newRound(); }
  else showEmpty();
}

function updateScore() {
  el.score.textContent = score;
  el.correct.textContent = correct;
  el.asked.textContent = asked;
  el.worth.textContent = worthNow();
}

function newRound(triesLeft = 6) {
  locked = false;
  el.flash.classList.add("hidden");
  el.flash.className = "hidden";
  el.reveal.classList.add("hidden");
  el.guessbar.classList.remove("hidden");
  el.guess.value = "";
  el.guess.disabled = false;
  el.submit.disabled = false;
  el.giveup.disabled = false;
  el.badphoto.disabled = false;
  hintsUsed = 0;
  solvedWords = new Set();
  countsShown = false;
  lettersShown = new Set();
  latinShown = false;
  revealAll = false;
  if (el.worth) el.worth.textContent = BASE_POINTS;
  el.hintbox.classList.remove("show");
  el.hintscirow.classList.remove("show");

  if (!pool.length) {
    el.spinner.textContent = "No animals available for this difficulty.";
    el.guessbar.classList.add("hidden");
    el.photo.classList.remove("ready");
    return;
  }

  current = upcoming || draw();
  upcoming = null;
  if (!current) { el.spinner.textContent = "No animals available."; return; }
  updateHintButton();
  loadPhoto(triesLeft);
}

// Load whatever photo `current` points at. Kept separate from newRound so the
// bad-photo button can swap the image without resetting the round.
function loadPhoto(triesLeft = 6) {
  const mine = ++gen;
  const photo = current.photo;
  el.photo.classList.remove("ready");
  el.fullscreen.classList.remove("show");
  el.spinner.classList.remove("hidden");
  el.spinner.textContent = "Loading photo\u2026";
  el.credit.textContent = "";

  el.photo.onload = () => {
    if (mine !== gen) return;              // superseded while loading
    el.photo.classList.add("ready");
    el.spinner.classList.add("hidden");
    el.fullscreen.classList.add("show");
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

// "Bad photo": show a different picture of the same animal if there is one,
// keeping whatever you have already worked out. If this animal only has the
// one photo, move on to another animal. Either way it costs nothing.
function badPhoto() {
  if (locked || !current) return;
  const others = (current.animal.photos || [])
    .filter(p => p.url !== current.photo.url);
  if (!others.length) { newRound(); return; }
  current = {animal: current.animal,
             photo: others[Math.floor(Math.random() * others.length)]};
  loadPhoto();
}

// Blow the photo up to the whole screen. Guessing pauses while you are in
// there -- Escape or the button brings you back to the game.
function toggleFullscreen() {
  const on = document.fullscreenElement || document.webkitFullscreenElement;
  if (on) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else {
    const req = el.stage.requestFullscreen || el.stage.webkitRequestFullscreen;
    if (req) req.call(el.stage);
  }
}

function syncFullscreen() {
  const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
  el.fullscreen.textContent = on ? "\u2715" : "\u26F6";
  el.fullscreen.title = on ? "Exit full screen" : "Full screen";
  el.fullscreen.setAttribute("aria-label", el.fullscreen.title);
  if (!on && !isTouch() && !locked) el.guess.focus();
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

  const v = judge(text, current.animal);
  let right = v.kind === "full";

  // Naming any word of the name fills that word in and the round continues.
  // Name every word and you have given the answer.
  if (v.kind === "words") {
    for (const i of v.words) solvedWords.add(i);
    const total = hintWords().length;
    if (solvedWords.size >= total) {
      right = true;
    } else {
      renderHint();
      const togo = total - solvedWords.size;
      el.flash.textContent = togo === 1 ? "1 WORD TO GO" : togo + " WORDS TO GO";
      el.flash.className = "part";
      setTimeout(() => {
        el.flash.className = "hidden";
        el.guess.value = "";
        el.guess.disabled = false;
        el.submit.disabled = false;
        el.giveup.disabled = false;
        locked = false;
        updateHintButton();
        if (!isTouch()) el.guess.focus();
      }, FLASH_MS);
      return;
    }
  }

  // A wrong guess spends a hint rather than ending the round. Only when the
  // hints run out does the answer come up.
  if (!right && hintsLeft() > 0) {
    spendHint();
    renderHint();
    updateScore();
    el.flash.textContent = "WRONG ANSWER!";
    el.flash.className = "wrong";
    setTimeout(() => {
      el.flash.className = "hidden";
      el.guess.value = "";
      el.guess.disabled = false;
      el.submit.disabled = false;
      el.giveup.disabled = false;
      locked = false;
      updateHintButton();
      if (!isTouch()) el.guess.focus();
    }, FLASH_MS);
    return;
  }

  asked++;
  if (right) { correct++; score += worthNow(); }
  updateScore();

  // 1. bold flash message for exactly one second
  el.flash.textContent = right ? "CORRECT!" : "WRONG ANSWER!";
  el.flash.className = right ? "right" : "wrong";

  setTimeout(() => {
    // 2. flash goes away, 3. guess bar goes away, 4. the answer is revealed
    el.flash.className = "hidden";
    revealAnswer(right);
  }, FLASH_MS);
}

// Show the animal's name with Next beside it, and end the round.
function revealAnswer(right) {
  if (!current) return;
  // fill the name in completely at the top, Latin name included
  revealAll = true;
  renderHint();
  el.guessbar.classList.add("hidden");
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
}

// Straight to the answer: no flash, no hints, no points.
function giveUp() {
  if (locked || !current) return;
  locked = true;
  el.guess.disabled = true;
  el.submit.disabled = true;
  el.hint.disabled = true;
  el.flash.className = "hidden";
  asked++;
  updateScore();
  revealAnswer(false);
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

// Category counts respect the ticked difficulties, and difficulty counts
// respect the ticked categories, so each number says what you would get.
function updateCounts() {
  const byCat = {}, byTier = {};
  for (const a of ALL) {
    if (onTiers.has(a.tier))
      for (const c of (a.cats || [])) byCat[c] = (byCat[c] || 0) + 1;
    if (inCats(a)) byTier[a.tier] = (byTier[a.tier] || 0) + 1;
  }
  const put = (nodes, key, src) => {
    for (const node of nodes) {
      const v = src[node.dataset[key]] || 0;
      node.textContent = v;
      node.style.opacity = v ? "" : ".4";
    }
  };
  put(document.querySelectorAll(".catnum[data-count]"), "count", byCat);
  put(document.querySelectorAll(".catnum[data-tiercount]"), "tiercount", byTier);
}

function showEmpty() {
  gen++;
  current = null;
  el.spinner.textContent = onTiers.size === 0
    ? "Pick at least one difficulty."
    : (onCats.size === 0 ? "Nothing is selected — turn a category on."
                         : "Nothing matches these difficulties and categories.");
  el.spinner.classList.remove("hidden");
  el.photo.classList.remove("ready");
  el.photo.removeAttribute("src");
  el.credit.textContent = "";
  el.guessbar.classList.add("hidden");
  el.reveal.classList.add("hidden");
  el.hintbox.classList.remove("show");
}

// grey out whichever of the two would do nothing
function syncCatButtons() {
  el.allcats.disabled = onCats.size === ALL_CATS.length;
  el.nocats.disabled = onCats.size === 0;
}

function setAllCats(on) {
  for (const b of catBoxes()) b.checked = on;
  applyCats();
}

function applyCats(save) {
  onCats = new Set(catBoxes().filter(b => b.checked).map(b => b.dataset.cat));
  if (save !== false) store.set("cats", [...onCats].join(","));
  rebuildPool();
  updateCounts();
  syncCatButtons();
  const empty = pool.length === 0;
  el.catwarn.classList.toggle("hidden", !empty || onTiers.size === 0);
  el.catwarn.textContent = onCats.size === 0
    ? "Nothing is selected — turn a category on."
    : "No animals match these categories.";
  if (!empty) newRound();
  else showEmpty();
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
el.giveup.addEventListener("click", giveUp);
el.badphoto.addEventListener("click", badPhoto);
el.fullscreen.addEventListener("click", toggleFullscreen);
for (const ev of ["fullscreenchange", "webkitfullscreenchange"])
  document.addEventListener(ev, syncFullscreen);
for (const b of document.querySelectorAll(".cattoggle"))
  b.addEventListener("change", () => applyCats());
el.allcats.addEventListener("click", () => setAllCats(true));
el.nocats.addEventListener("click", () => setAllCats(false));
el.gear.addEventListener("click", openSettings);
el.close.addEventListener("click", closeSettings);
el.overlay.addEventListener("click", closeSettings);
for (const b of document.querySelectorAll(".difftoggle"))
  b.addEventListener("change", () => setTiers());
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
    const saved = (store.get("tiers", "easy") || "").split(",").filter(Boolean);
    const want = new Set(saved.length ? saved : ["easy"]);
    for (const b of document.querySelectorAll(".difftoggle"))
      b.checked = want.has(b.dataset.tier);
    setTiers(false);
  })
  .catch(err => {
    el.spinner.textContent =
      "Could not load data/animals.json (" + err.message + "). " +
      "Run the game through ./serve.sh rather than opening the file directly.";
    el.guessbar.classList.add("hidden");
  });
})();
