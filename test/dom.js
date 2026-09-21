const ROOT = require("path").join(__dirname, "..");
/* A stub DOM just rich enough to run web/game.js unmodified in node. */
const fs = require("fs"), path = require("path");

class El {
  constructor(id, cls, tag) {
    this.id = id; this.children = []; this.dataset = {}; this.style = {};
    this.tagName = (tag || "DIV").toUpperCase();
    this._cls = new Set((cls || "").split(" ").filter(Boolean));
    this._on = {};
    this.textContent = ""; this.value = ""; this.checked = false;
    this.disabled = false; this.src = ""; this.innerHTML = "";
    this.classList = {
      add: (...c) => c.forEach(x => this._cls.add(x)),
      remove: (...c) => c.forEach(x => this._cls.delete(x)),
      contains: (c) => this._cls.has(c),
      toggle: (c, on) => { const v = on === undefined ? !this._cls.has(c) : !!on;
                           v ? this._cls.add(c) : this._cls.delete(c); return v; },
    };
  }
  get className() { return [...this._cls].join(" "); }
  set className(v) { this._cls = new Set(String(v).split(" ").filter(Boolean)); }
  get firstChild() { return this.children[0] || null; }
  addEventListener(t, fn) { (this._on[t] = this._on[t] || []).push(fn); }
  fire(t, ev) { for (const fn of (this._on[t] || [])) fn(ev || {preventDefault(){}}); }
  appendChild(c) { this.children.push(c); return c; }
  append(...cs) { cs.forEach(c => this.children.push(c)); }
  querySelectorAll(sel) {
    const cls = sel.replace(/^\./, "").replace(/\[.*\]$/, "");
    const attr = (sel.match(/\[data-([\w-]+)\]/) || [])[1];
    const out = [];
    const walk = (n) => n.children.forEach(c => {
      if (c._cls.has(cls) && (!attr || c.dataset[attr.replace(/-(\w)/g, (m,x)=>x.toUpperCase())] !== undefined)) out.push(c);
      walk(c);
    });
    walk(this);
    return out;
  }
  focus() { global.document.activeElement = this; }
  select() {}
  setAttribute() {}
  removeAttribute(a) { if (a === "src") this.src = ""; }
  requestFullscreen() {}
}

// Every id the real page has. Read from web/index.html rather than kept by
// hand: twice now a new element has been added to the game and the harness
// has gone on returning null for it, which fails every DOM test at once.
const IDS = (() => {
  const html = fs.readFileSync(ROOT + "/web/index.html", "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  return [...new Set(ids)];
})();

function build(prevStore, guesser, catList) {
  const byId = {};
  for (const id of IDS) byId[id] = new El(id);
  // the real markup ships these hidden, and game.js reads that back
  for (const id of ["settings","overlay","game","teamsetup","reveal","flash","teambar"])
    byId[id].classList.add("hidden");
  byId.guess.tagName = "INPUT";
  byId["hangman-toggle"].tagName = "INPUT";
  byId.buddy.tagName = "INPUT";
  byId.titlebuddy.tagName = "INPUT";
  byId.titlehangman.tagName = "INPUT";

  const root = new El("root");
  // difficulty + category checkboxes, and the little count badges beside them
  const tiers = ["easy","medium","hard","death"].map(t => {
    const e = new El(null, "difftoggle"); e.dataset.tier = t; root.appendChild(e); return e; });
  // the animal page's categories by default; pass a list to test the other game
  const CATS = catList || ["mammals","reptiles","birds","sea","fish","amphibians",
                        "bugs","usbirds","felines","catbreeds","dogbreeds"];
  const cats = CATS.map(c => {
    const e = new El(null, "cattoggle"); e.dataset.cat = c; e.checked = true;
    root.appendChild(e); return e; });
  for (const c of CATS) { const e = new El(null, "catnum"); e.dataset.count = c; root.appendChild(e); }
  for (const t of ["easy","medium","hard","death"]) {
    const e = new El(null, "catnum"); e.dataset.tiercount = t; root.appendChild(e); }
  // the animals and their pieces live in the HTML, not in game.js
  for (const name of ["polarbear","browncat","blackcat","sawfish","blobfish","dino","slug"]) {
    const c = new El(null, "critter"); c.dataset.critter = name;
    for (let i = 1; i <= 7; i++) {
      const g = new El(null, "critterpart"); g.dataset.part = String(i); c.appendChild(g); }
    byId.critter.appendChild(c); }
  for (let i = 1; i <= 10; i++) {
    const b = new El(null, "numbtn"); b.dataset.n = String(i); byId.teampick.appendChild(b); }

  const store = prevStore || {};   // pass one in to model a repeat visit
  const timers = [];
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
  const docOn = {};
  global.document = {
    getElementById: (id) => byId[id] || null,
    createElement: (tag) => new El(null, null, tag),
    querySelectorAll: (sel) => root.querySelectorAll(sel),
    addEventListener: (t, fn) => { (docOn[t] = docOn[t] || []).push(fn); },
    activeElement: null,
    fullscreenElement: null,
  };
  global.__fireDoc = (t, ev) => {
    const e = Object.assign({preventDefault(){}, key: "", ctrlKey: false,
                             metaKey: false, altKey: false}, ev);
    for (const fn of (docOn[t] || [])) fn(e);
  };
  // behave like a desktop; `guesser` stands in for the page's window.GUESSER
  global.window = { matchMedia: () => ({matches: false}) };
  if (guesser) global.window.GUESSER = guesser;
  global.Image = class { set src(v) {} };
  global.setTimeout = (fn) => { timers.push(fn); return timers.length; };
  global.fetch = (url) => {
    const p = path.join(__dirname, "..", "..", "..", "..", "..",
                        "Users/alec/Claude/AnimalGuesser", "data/animals.json");
    const raw = fs.readFileSync(path.resolve(ROOT + "/data/animals.json"), "utf8");
    return Promise.resolve({ok: true, json: () => Promise.resolve(JSON.parse(raw))});
  };
  return {byId, tiers, cats, root, timers, store,
          flush: () => { while (timers.length) timers.shift()(); }};
}

function load() {
  let src = fs.readFileSync(process.env.GAME_JS || ROOT + "/web/game.js", "utf8");
  // Expose the internals for assertions. The shipped file is not changed --
  // this is spliced in only for the test run.
  const hook = `
globalThis.__t = {
  get current(){return current}, get hintsUsed(){return hintsUsed},
  get pool(){return pool},
  get partsShown(){return typeof partsShown === "undefined" ? null : partsShown},
  get hangmanMode(){return typeof hangmanMode === "undefined" ? false : hangmanMode},
  get critter(){return typeof critter === "undefined" ? null : critter},
  get guessedLetters(){return typeof guessedLetters === "undefined" ? null : guessedLetters},
  get used(){return typeof used === "undefined" ? null : used},
  get streak(){return typeof streak === "undefined" ? null : streak},
  get best(){return typeof best === "undefined" ? null : best},
  hintsLeft, draw, judge, hintWords, newRound,
  guessLetter: typeof guessLetter === "function" ? guessLetter : null,
  nameLetters: typeof nameLetters === "function" ? nameLetters : null,
};
})();`;
  const tail = src.lastIndexOf("})();");
  if (tail < 0) throw new Error("could not find the IIFE tail");
  src = src.slice(0, tail) + hook;
  (0, eval)(src);
}
module.exports = {build, load, El};
