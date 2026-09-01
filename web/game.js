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
  score:$("score"), asked:$("asked"), tierbadge:$("tierbadge"),
};
const TIER_LABEL = {easy:"Easy", medium:"Medium", hard:"Hard", death:"Death Mode"};
const FLASH_MS = 1000;
const HINTS_PER_ANIMAL = 3;

let ALL = [];            // every animal record
let pool = [];           // animals in the current tier
let bag = [];            // shuffled queue, so nothing repeats until exhausted
let tier = "easy";
let current = null;      // {animal, photo} on screen now
let upcoming = null;     // {animal, photo} chosen + preloaded ahead of time
let locked = false;      // true while a flash is on screen
let score = 0, asked = 0;
let hintsLeft = HINTS_PER_ANIMAL;  // resets with every new photo
let revealed = 0;                  // letters of the type word shown so far

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
    .replace(/[^a-z0-9]+/g, " ")                        // punctuation -> space
    .trim()
    .replace(/^(a|an|the) /, "")
    .replace(/\s+/g, " ");
}

// A few spellings of the same word should all count.
function variants(s) {
  const n = normalize(s);
  if (!n) return [];
  const out = new Set([n, n.replace(/ /g, "")]);
  const sing = n.endsWith("ies") ? n.slice(0, -3) + "y"
             : /(ses|xes|zes|ches|shes)$/.test(n) ? n.slice(0, -2)
             : n.endsWith("s") && !n.endsWith("ss") ? n.slice(0, -1)
             : null;
  if (sing) { out.add(sing); out.add(sing.replace(/ /g, "")); }
  return [...out];
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

function isCorrect(input, animal) {
  const guesses = variants(input);
  if (!guesses.length) return false;
  const ok = accepted(animal);
  for (const g of guesses) {
    if (ok.includes(g)) return true;
    // forgive a typo or two on longer words
    for (const a of ok) {
      // Deliberately strict on short words: at distance 1, "mouse"/"moose"
      // and "boar"/"bear" are different animals, not typos.
      const tol = a.length >= 9 ? 2 : a.length >= 7 ? 1 : 0;
      if (tol && levenshtein(g, a) <= tol) return true;
    }
  }
  return false;
}

/* ---------- hints ----------------------------------------------------------
   The hint spells out the KIND of animal, not its full name: a Western
   Diamond-backed Rattlesnake spells "snake". Every type word is also an
   accepted answer, so a hint can never spell something the checker rejects. */
function hintWord() {
  return (current && current.animal && current.animal.type) || "";
}

// "snake" with 2 revealed -> "S N _ _ _"
function renderHint() {
  const w = hintWord();
  if (!w || revealed === 0) { el.hintbox.classList.remove("show"); return; }
  let seen = 0, out = [];
  for (const ch of w) {
    if (ch === " ") { out.push("  "); continue; }
    if (!/[a-z0-9]/i.test(ch)) { out.push(ch); continue; }  // keep hyphens
    out.push(seen < revealed ? ch.toUpperCase() : "_");
    seen++;
  }
  el.hintword.textContent = out.join(" ");
  el.hintbox.classList.add("show");
}

function updateHintButton() {
  el.hintcount.textContent = hintsLeft;
  el.hintcount.classList.toggle("spent", hintsLeft === 0);
  const w = hintWord();
  // nothing left to give once every letter is showing
  const lettersLeft = w.replace(/[^a-z0-9]/gi, "").length > revealed;
  el.hint.disabled = locked || hintsLeft === 0 || !lettersLeft;
}

function useHint() {
  if (locked || hintsLeft === 0) return;
  const total = hintWord().replace(/[^a-z0-9]/gi, "").length;
  if (revealed >= total) return;
  hintsLeft--;
  revealed++;
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

function setTier(t) {
  tier = t;
  store.set("tier", t);
  pool = ALL.filter(a => a.tier === t);
  bag = [];
  upcoming = null;
  score = 0; asked = 0;
  el.tierbadge.textContent = TIER_LABEL[t];
  document.querySelectorAll(".diff").forEach(b =>
    b.classList.toggle("active", b.dataset.tier === t));
  updateScore();
  newRound();
}

function updateScore() {
  el.score.textContent = score;
  el.asked.textContent = asked;
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
  el.photo.classList.remove("ready");
  el.spinner.classList.remove("hidden");
  el.credit.textContent = "";
  hintsLeft = HINTS_PER_ANIMAL;
  revealed = 0;
  el.hintbox.classList.remove("show");

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
    el.photo.classList.add("ready");
    el.spinner.classList.add("hidden");
    el.credit.textContent = "Photo: " + (photo.credit || "iNaturalist");
    if (!isTouch()) el.guess.focus();
    preloadNext();
  };
  el.photo.onerror = () => {
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
el.gear.addEventListener("click", openSettings);
el.close.addEventListener("click", closeSettings);
el.overlay.addEventListener("click", closeSettings);
document.querySelectorAll(".diff").forEach(b =>
  b.addEventListener("click", () => { setTier(b.dataset.tier); closeSettings(); }));
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeSettings();
});

fetch("../data/animals.json")
  .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
  .then(d => {
    ALL = d.animals || [];
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
