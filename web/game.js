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
  hintwrap:$("hintwrap"), playrow:$("playrow"), hangmanToggle:$("hangman-toggle"),
  keys:$("keys"), critter:$("critter"), crittercount:$("crittercount"),
  hintsci:$("hintsci"), hintscirow:$("hintscirow"), giveup:$("giveup"),
  badphoto:$("badphoto"), fullscreen:$("fullscreen"),
  catwarn:$("catwarn"), allcats:$("allcats"), nocats:$("nocats"), buddy:$("buddy"), restart:$("restart"),
  title:$("title"), teamsetup:$("teamsetup"), game:$("game"), teambar:$("teambar"),
  playsolo:$("playsolo"), playteams:$("playteams"), teamback:$("teamback"),
  titlebuddy:$("titlebuddy"), titlehangman:$("titlehangman"),
  teamplay:$("teamplay"), teampick:$("teampick"), soloscore:$("soloscore"),
  tagline:$("tagline"),
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
let catLists = new Map();// category -> every animal of it in the pool
let catBags = new Map(); // category -> its shuffled queue, drained then refilled
let recent = [];         // ids drawn lately, so nothing comes round twice quickly
let onTiers = new Set(["easy"]);   // difficulties currently ticked
let onCats = new Set(ALL_CATS);   // categories currently toggled on
let current = null;      // {animal, photo} on screen now
let upcoming = null;     // {animal, photo} chosen + preloaded ahead of time
let locked = false;      // true while a flash is on screen
let score = 0, asked = 0, correct = 0;

// Every animal starts at BASE_POINTS. Each hint you take -- or each wrong
// guess, which spends one -- knocks a point off, down to a floor of 1.
const BASE_POINTS = 5;
const MAX_HINTS = 8;               // most hints any one animal will ever give
// Hangman opens with the blanks -- hint one of the eight. After that the
// letters are free: a right one costs nothing, and only a wrong one costs a
// point and a body part. Seven wrong finishes the animal and the round.
const CRITTER_PARTS = 7;
// Who you are drawing is a surprise each round.
const CRITTERS = ["polarbear", "browncat", "blackcat", "sawfish",
                  "blobfish", "dino", "slug"];
function worthNow() {
  return Math.max(1, BASE_POINTS - hintsUsed);
}
let gen = 0;                       // bumped whenever what's on screen changes,
                                   // so a slow image load can't resurrect itself
let hintsUsed = 0;                 // resets with every new photo
let solvedWords = new Set();       // indices of name words already guessed
let countsShown = false;           // hint 1: how many letters per word
let lettersShown = new Set();      // word indices whose first letter a hint paid for
let latinShown = false;            // the last of the ordered hints
let randomShown = new Set();       // letter positions filled in at random
let revealAll = false;             // round over: show the whole name and Latin
let buddyMode = false;             // Buddy Mode: animal noises, not verdicts
let hangmanMode = false;           // Hangman: the hints are spent on letters
let guessedLetters = new Set();    // keys played this round, hit or miss
let partsShown = 0;                // wrong guesses, one body part each
let critter = "polarbear";         // which animal this round is drawing
let started = false;               // false while a title screen is up
let mode = "solo";                 // "solo" or "teams"
let teamCount = 2;                 // how many teams the setup screen has picked
let teams = [];                    // [{name, score}] in teams mode

/* ---------- persistence (may be unavailable; never let it break the game) --- */
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

/* ---------- what the flash says -------------------------------------------- */
// Buddy Mode is a settings toggle; off, the game says what it always said.
function sayRight() { return buddyMode ? "RAWR!" : "CORRECT!"; }
function sayWrong() { return buddyMode ? "A Hee Hoo" : "WRONG ANSWER!"; }

function applyBuddy(save) {
  buddyMode = el.buddy.checked;
  el.titlebuddy.checked = buddyMode;      // the title screen shows the same switch
  if (save !== false) store.set("buddy", buddyMode ? "1" : "0");
}

function restoreBuddy() {
  // "rawr" was this setting's name before it was called Buddy Mode
  el.buddy.checked = (store.get("buddy", null) ?? store.get("rawr", "0")) === "1";
  applyBuddy(false);
}

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

/* ---------- hangman letters ------------------------------------------------ */
// A letter as the grid sees it: accents stripped, lower case.
const KEYS = "abcdefghijklmnopqrstuvwxyz";
function baseLetter(ch) {
  return ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Not every letter has a key to play it with -- the okina in "\u02bbApapane" and
// the Greek upsilon in "Silver \u03a5" are letters no a-z grid can reach. Hangman
// shows those from the start rather than leave a blank nobody could ever fill.
function guessable(ch) {
  const b = baseLetter(ch);
  return b.length === 1 && KEYS.includes(b);
}

// Which keys would hit, for the name on screen now.
function nameLetters() {
  const out = new Set();
  for (const ch of hintName())
    if (IS_LETTER.test(ch) && guessable(ch)) out.add(baseLetter(ch));
  return out;
}

// True once nothing guessable is still hidden: every letter is either inside a
// word you named outright or on a key you have already played. Walks the name
// the same way letterSlots and renderHint do, so all three agree on the blanks.
function allLettersOut() {
  let word = -1, inWord = false, any = false;
  for (const ch of hintName()) {
    if (WORD_BREAK.test(ch)) { inWord = false; continue; }
    if (!IS_LETTER.test(ch)) continue;
    if (!inWord) { inWord = true; word++; }
    any = true;
    if (solvedWords.has(word) || !guessable(ch)) continue;
    if (!guessedLetters.has(baseLetter(ch))) return false;
  }
  return any;
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
   revealing that word's first letter in turn, then the Latin name. After
   those, every further hint fills in one more letter picked at random from
   whatever is still hidden, until the whole name is on the board.
   "Scarlet Macaw" is 4 ordered hints -- the blanks, S, M, Ara macao -- and
   then 10 random ones, one per remaining letter. */
function hintName() {
  return (current && current.animal && current.animal.name) || "";
}
function hintSci() {
  return (current && current.animal && current.animal.sci) || "";
}

function hintWords() {
  return splitName(hintName());
}

// Every letter of the name as {pos, word, first}, where pos counts letters
// only -- punctuation and the gaps between words do not take a slot.
function letterSlots() {
  const out = [];
  let word = -1, inWord = false, pos = -1;
  for (const ch of hintName()) {
    if (WORD_BREAK.test(ch)) { inWord = false; continue; }
    if (!IS_LETTER.test(ch)) continue;              // apostrophes, dots
    if (!inWord) { inWord = true; word++; }
    out.push({pos: ++pos, word, first: out.length === 0 || out[out.length - 1].word !== word});
  }
  return out;
}

// Letters a random hint is still allowed to fill in. First letters are left
// out: an ordered hint either has revealed one already or is about to, so
// counting it here would charge for the same letter twice.
function randomPool() {
  return letterSlots().filter(sl =>
    !sl.first && !solvedWords.has(sl.word) && !randomShown.has(sl.pos));
}

// What the next hint would buy. A word you have already guessed is skipped --
// paying to reveal a letter you can see would be wasted.
function nextHint() {
  if (hintsUsed >= MAX_HINTS) return null;      // eight to an animal, no more
  if (!countsShown) return {type: "counts"};
  const words = hintWords();
  for (let i = 0; i < words.length; i++)
    if (!solvedWords.has(i) && !lettersShown.has(i)) return {type: "letter", i};
  if (hintSci() && !latinShown) return {type: "latin"};
  const pool = randomPool();
  if (pool.length) return {type: "random", pool};
  return null;
}

function hintsLeft() {
  if (!hintName()) return 0;
  // Hangman has no hint queue to walk. Right letters are free and unlimited,
  // so what is left to lose is the wrong ones: the pieces of bear still to go.
  if (hangmanMode) return Math.max(0, CRITTER_PARTS - partsShown);
  let n = countsShown ? 0 : 1;
  const words = hintWords();
  for (let i = 0; i < words.length; i++)
    if (!solvedWords.has(i) && !lettersShown.has(i)) n++;
  if (hintSci() && !latinShown) n++;
  return Math.min(n + randomPool().length, Math.max(0, MAX_HINTS - hintsUsed));
}

function applyHint(t) {
  if (t.type === "counts") countsShown = true;
  else if (t.type === "letter") lettersShown.add(t.i);
  else if (t.type === "latin") latinShown = true;
  else randomShown.add(t.pool[Math.floor(Math.random() * t.pool.length)].pos);
}

// Spend one hint. Returns false if there was nothing left to buy.
//
// A hint you pay for always has to put something new on the board. Some hints
// reveal what is already up there -- the "counts" blanks after you have named
// a word, say -- so take those for free and move on to the next one instead of
// charging for a hint that changes nothing.
function spendHint() {
  const before = hintSignature();
  for (let guard = 0; guard <= MAX_HINTS; guard++) {
    const t = nextHint();
    if (!t) return false;
    applyHint(t);
    if (hintSignature() !== before) {
      hintsUsed++;                   // scoring counts every hint charged for
      return true;
    }
  }
  return false;
}

// Is the name board on screen at all? Guessing any word of the name puts it
// there, which is why buying the "counts" hint afterwards used to change
// nothing -- the blanks it pays for were already up.
function hintShowing() {
  return !!hintName() && (countsShown || solvedWords.size > 0 || revealAll);
}

// The name as the board draws it: revealed letters, underscores for the rest.
function hintDisplay() {
  const name = hintName();
  let wordIndex = -1, inWord = false, firstDone = false, pos = -1, out = "";
  const SEP = "\u00A0";     // letters of one word must not wrap apart from each other
  for (const ch of name) {
    if (/\s/.test(ch)) { out += "  "; inWord = false; continue; } // words may wrap here
    let piece;
    if (WORD_BREAK.test(ch)) { piece = ch; inWord = false; }       // hyphen
    else if (!IS_LETTER.test(ch)) piece = ch;                      // apostrophes etc.
    else {
      if (!inWord) { inWord = true; wordIndex++; firstDone = false; }
      pos++;
      const whole = solvedWords.has(wordIndex);
      // guessedLetters is empty outside hangman, so these two cost nothing there
      const reveal = revealAll || whole ||
                     (!firstDone && lettersShown.has(wordIndex)) ||
                     randomShown.has(pos) ||
                     guessedLetters.has(baseLetter(ch)) ||
                     (hangmanMode && !guessable(ch));
      piece = reveal ? ch.toUpperCase() : "_";
      firstDone = true;
    }
    out += (out === "" || out.endsWith("  ")) ? piece : SEP + piece;
  }
  return out;
}

// Everything a hint could possibly change, as one string. Two of these being
// equal means the board looks exactly the same as it did before.
function hintSignature() {
  if (!hintShowing()) return "";
  const sci = hintSci();
  return hintDisplay() + "|" + (sci && (latinShown || revealAll) ? sci : "");
}

function renderHint() {
  if (!hintShowing()) {
    el.hintbox.classList.remove("show");
    el.hintscirow.classList.remove("show");
    el.hintword.textContent = "";      // no stale shape from the last animal
    el.hintsci.textContent = "";
    return;
  }
  el.hintword.textContent = hintDisplay();
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
  renderKeys();
}

/* ---------- the hangman board ---------------------------------------------- */
function buildKeys() {
  el.keys.textContent = "";
  for (const ch of KEYS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "key";
    b.dataset.letter = ch;
    b.textContent = ch.toUpperCase();
    b.addEventListener("click", () => guessLetter(ch));
    el.keys.appendChild(b);
  }
}

function renderKeys() {
  if (!el.keys.firstChild) return;
  const inName = nameLetters();
  const spent = hintsLeft() === 0;
  for (const b of el.keys.querySelectorAll(".key")) {
    const ch = b.dataset.letter, played = guessedLetters.has(ch);
    b.classList.toggle("hit", played && inName.has(ch));
    b.classList.toggle("miss", played && !inName.has(ch));
    b.disabled = played || spent || locked || revealAll;
  }
}

// Deal a new animal to draw. Only the chosen one is ever on screen.
function pickCritter() {
  critter = CRITTERS[Math.floor(Math.random() * CRITTERS.length)];
  for (const g of el.critter.querySelectorAll(".critter"))
    g.classList.toggle("on", g.dataset.critter === critter);
}

function renderCritter() {
  for (const g of el.critter.querySelectorAll(".critterpart"))
    g.classList.remove("on");
  for (const g of el.critter.querySelectorAll(".critter")) {
    if (g.dataset.critter !== critter) continue;
    for (const part of g.querySelectorAll(".critterpart"))
      part.classList.toggle("on", Number(part.dataset.part) <= partsShown);
  }
  const left = CRITTER_PARTS - partsShown;
  el.crittercount.textContent = left === 0 ? "That's the whole animal."
    : left === 1 ? "1 wrong letter left" : left + " wrong letters left";
  el.crittercount.classList.toggle("done", left === 0);
}

// Play a key. A hit fills that letter in everywhere it appears and costs
// nothing -- you earned it, and with no text box there is no other way in.
// A miss costs a point and hands the bear another body part.
//
// Charging for hits would make the mode unplayable: the median name has 11
// distinct letters, so seven paid guesses would lose 93% of animals outright.
function guessLetter(ch) {
  if (!hangmanMode || locked || revealAll || !current) return;
  if (guessedLetters.has(ch) || partsShown >= CRITTER_PARTS) return;
  guessedLetters.add(ch);
  const hit = nameLetters().has(ch);
  if (!hit) { hintsUsed++; partsShown++; }
  renderHint();
  renderCritter();
  updateScore();
  if (hit && allLettersOut()) { finishRound(true); return; }
  if (partsShown >= CRITTER_PARTS) { finishRound(false); return; }
  updateHintButton();
  refocusGuess();
}

function syncHangmanUI() {
  // one class carries the whole difference: the grid and the bear appear, and
  // the Hint button, the text box and Guess go away. You play by clicking.
  el.game.classList.toggle("hangmanon", hangmanMode);
}

function applyHangman(save) {
  hangmanMode = el.hangmanToggle.checked;
  el.titlehangman.checked = hangmanMode;  // the title screen shows the same switch
  if (save !== false) store.set("hangman", hangmanMode ? "1" : "0");
  syncHangmanUI();
  // the two open a round differently, so deal a fresh one rather than convert
  if (started) { if (pool.length) newRound(); else showEmpty(); }
}

function restoreHangman() {
  el.hangmanToggle.checked = store.get("hangman", "0") === "1";
  applyHangman(false);
}

function useHint() {
  if (locked) return;
  if (!spendHint()) return;
  renderHint();
  updateHintButton();
  updateScore();
  refocusGuess();
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

// How many draws back an animal is still considered "just seen".
const RECENT = 25;

// One queue per category that has anything in it.
function rebuildBags() {
  catLists = new Map();
  catBags = new Map();
  recent = [];
  for (const a of pool)
    for (const c of (a.cats || []))
      if (onCats.has(c)) {
        if (!catLists.has(c)) catLists.set(c, []);
        catLists.get(c).push(a);
      }
}

// A category's queue, reshuffled from scratch once it has been worked through.
function bagFor(cat) {
  let bag = catBags.get(cat);
  if (!bag || !bag.length) {
    bag = shuffle(catLists.get(cat) || []);
    catBags.set(cat, bag);
  }
  return bag;
}

// Pick the next animal AND which of its photos we'll show, so the preloader
// can warm the exact image the next round will use.
//
// The category is picked first and the animal second, so that how often a
// category comes up does not depend on how big it is -- 84 cat breeds get the
// same share of the turns as 12,902 bugs. Inside a category the queue is
// shuffled and drained, so it works through before anything repeats.
function draw() {
  if (!pool.length) return null;
  if (!catLists.size) rebuildBags();
  const cats = [...catLists.keys()];
  if (!cats.length) return null;

  let animal = null;
  for (let tries = 0; tries < 4 && !animal; tries++) {
    const bag = bagFor(cats[Math.floor(Math.random() * cats.length)]);
    if (!bag.length) continue;
    const a = bag.pop();
    // An animal filed under several categories, or one from a small category,
    // can come round again fast. Put it back at the bottom and draw again.
    if (tries < 3 && recent.includes(a.id)) { bag.unshift(a); continue; }
    animal = a;
  }
  if (!animal) return null;

  recent.push(animal.id);
  if (recent.length > RECENT) recent.shift();
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
  rebuildBags();
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
  if (!started) return;            // nothing plays behind the title screen
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
  randomShown = new Set();
  revealAll = false;
  guessedLetters = new Set();
  partsShown = 0;
  pickCritter();
  renderCritter();
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
  // Hangman opens with the blanks already on the board. That is hint one of
  // the eight; the seven left are letters, so the animal starts out worth 4.
  if (hangmanMode) {
    countsShown = true;
    hintsUsed = 1;
    renderHint();
  }
  updateScore();
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
    refocusGuess();
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

// Put the cursor back in the guess box -- unless someone is in the middle of
// typing a team name, in which case leave them alone.
function refocusGuess() {
  if (hangmanMode) return;            // no text box to put a cursor back into
  const a = document.activeElement;
  if (a && a.classList && a.classList.contains("teamname")) return;
  if (!isTouch()) el.guess.focus();
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
    // naming a word puts the whole board on screen, blanks and all, so the
    // "counts" hint has now been given -- it must not be sold again later
    countsShown = true;
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
        refocusGuess();
      }, FLASH_MS);
      return;
    }
  }

  // A wrong guess spends a hint rather than ending the round. Only when the
  // hints run out does the answer come up.
  if (!right && hintsLeft() > 0) {
    // In hangman a wrong name costs exactly what a wrong letter costs: one of
    // your guesses, and one more piece of the bear.
    if (hangmanMode) { hintsUsed++; partsShown++; renderCritter(); }
    else spendHint();
    renderHint();
    updateScore();
    if (partsShown >= CRITTER_PARTS) { finishRound(false); return; }
    el.flash.textContent = sayWrong();
    el.flash.className = "wrong";
    setTimeout(() => {
      el.flash.className = "hidden";
      el.guess.value = "";
      el.guess.disabled = false;
      el.submit.disabled = false;
      el.giveup.disabled = false;
      locked = false;
      updateHintButton();
      refocusGuess();
    }, FLASH_MS);
    return;
  }

  finishRound(right);
}

// Score the round, flash the verdict for a second, then show the answer.
// Both a typed guess and a played letter finish here.
function finishRound(right) {
  locked = true;
  el.guess.disabled = true;
  el.submit.disabled = true;
  el.hint.disabled = true;
  renderKeys();
  asked++;
  if (right) { correct++; score += worthNow(); }
  updateScore();

  // 1. bold flash message for exactly one second
  el.flash.textContent = right ? sayRight() : sayWrong();
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
  renderKeys();          // revealAll keeps them out of play, not `locked`
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

/* ---------- title screen, solo and teams ----------------------------------- */
// Restart, and every fresh load, comes back here.
function showTitle() {
  started = false;
  score = 0; asked = 0; correct = 0;
  catBags = new Map();               // reshuffle rather than resume the queues
  recent = [];
  upcoming = null;
  current = null;
  teams = [];
  updateScore();
  el.photo.classList.remove("ready");
  el.fullscreen.classList.remove("show");
  el.teambar.classList.add("hidden");
  el.teambar.textContent = "";
  el.game.classList.add("hidden");
  el.teamsetup.classList.add("hidden");
  el.title.classList.remove("hidden");
}

function showTeamSetup() {
  el.title.classList.add("hidden");
  el.teamsetup.classList.remove("hidden");
  markTeamCount();
}

function markTeamCount() {
  for (const b of el.teampick.querySelectorAll(".numbtn"))
    b.classList.toggle("on", Number(b.dataset.n) === teamCount);
}

// Leave the title screens and actually play.
function startGame(which) {
  mode = which;
  started = true;
  score = 0; asked = 0; correct = 0;
  catBags = new Map();
  recent = [];
  upcoming = null;
  el.title.classList.add("hidden");
  el.teamsetup.classList.add("hidden");
  el.game.classList.remove("hidden");
  // in teams mode the points are yours to award, so the solo tally goes away
  el.soloscore.classList.toggle("hidden", mode === "teams");
  if (mode === "teams") buildTeams(teamCount); else el.teambar.classList.add("hidden");
  updateScore();
  if (pool.length) newRound(); else showEmpty();
}

// One card per team: a name you can type over, and a score with -- and +.
function buildTeams(n) {
  teams = Array.from({length: n}, () => ({name: "Unnamed", score: 0}));
  el.teambar.textContent = "";
  teams.forEach((t, i) => {
    const card = document.createElement("div");
    card.className = "team";

    const name = document.createElement("input");
    name.className = "teamname";
    name.value = t.name;
    name.maxLength = 20;
    name.setAttribute("aria-label", "Team " + (i + 1) + " name");
    // click the default and type: no need to clear it first
    name.addEventListener("focus", () => { if (name.value === "Unnamed") name.select(); });
    name.addEventListener("input", () => { t.name = name.value; });
    name.addEventListener("blur", () => {
      if (!name.value.trim()) { name.value = "Unnamed"; t.name = "Unnamed"; }
    });

    const row = document.createElement("div");
    row.className = "teamscore";
    const minus = document.createElement("button");
    minus.type = "button"; minus.textContent = "\u2212";
    minus.setAttribute("aria-label", "Take a point off " + (t.name || "this team"));
    const num = document.createElement("span");
    num.className = "scorenum";
    const plus = document.createElement("button");
    plus.type = "button"; plus.textContent = "+";
    plus.setAttribute("aria-label", "Give a point to " + (t.name || "this team"));

    const paint = () => {
      num.textContent = t.score;
      num.classList.toggle("neg", t.score < 0);   // scores may go negative
    };
    minus.addEventListener("click", () => { t.score--; paint(); });
    plus.addEventListener("click", () => { t.score++; paint(); });
    paint();

    row.append(minus, num, plus);
    card.append(name, row);
    el.teambar.appendChild(card);
  });
  el.teambar.classList.remove("hidden");
}

// The settings button: back to the title screen, everything reset.
function restartGame() {
  closeSettings();
  showTitle();
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
el.buddy.addEventListener("change", () => applyBuddy());
el.hangmanToggle.addEventListener("change", () => applyHangman());
// flipping one on the title screen is flipping the one in the panel
el.titlebuddy.addEventListener("change", () => {
  el.buddy.checked = el.titlebuddy.checked;
  applyBuddy();
});
el.titlehangman.addEventListener("change", () => {
  el.hangmanToggle.checked = el.titlehangman.checked;
  applyHangman();
});
buildKeys();
el.restart.addEventListener("click", restartGame);
el.playsolo.addEventListener("click", () => startGame("solo"));
el.playteams.addEventListener("click", showTeamSetup);
el.teamback.addEventListener("click", showTitle);
el.teamplay.addEventListener("click", () => startGame("teams"));
for (const b of el.teampick.querySelectorAll(".numbtn"))
  b.addEventListener("click", () => { teamCount = Number(b.dataset.n); markTeamCount(); });
el.gear.addEventListener("click", openSettings);
el.close.addEventListener("click", closeSettings);
el.overlay.addEventListener("click", closeSettings);
for (const b of document.querySelectorAll(".difftoggle"))
  b.addEventListener("change", () => setTiers());
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeSettings(); return; }
  playTypedLetter(e);
});

// In hangman the keyboard plays the grid. There is no text box to type into,
// so a letter key does exactly what clicking that key does.
function playTypedLetter(e) {
  if (!hangmanMode || !started) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  // a team is being named, or the settings panel is open -- not our keystroke
  const a = document.activeElement;
  if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA")) return;
  if (!el.settings.classList.contains("hidden")) return;
  const ch = baseLetter(e.key || "");
  if (ch.length !== 1 || !KEYS.includes(ch)) return;
  e.preventDefault();
  guessLetter(ch);
}

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
    restoreBuddy();
    restoreHangman();
    restoreCats();
    const saved = (store.get("tiers", "easy") || "").split(",").filter(Boolean);
    const want = new Set(saved.length ? saved : ["easy"]);
    for (const b of document.querySelectorAll(".difftoggle"))
      b.checked = want.has(b.dataset.tier);
    setTiers(false);
    markTeamCount();
    showTitle();
    el.tagline.textContent = "A real photograph of a real animal. Name it.";
    el.playsolo.disabled = false;
    el.playteams.disabled = false;
  })
  .catch(err => {
    // the title screen is what is on screen at this point, so say it there
    const msg = "Could not load data/animals.json (" + err.message + "). " +
      "Run the game through ./serve.sh rather than opening the file directly.";
    el.tagline.textContent = msg;
    el.spinner.textContent = msg;
    el.guessbar.classList.add("hidden");
  });
})();
