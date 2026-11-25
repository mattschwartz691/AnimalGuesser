// Buzzboard competitive mode: phones are buzzers, the big screen is the master.
// Loaded after the main Buzzboard script (it uses G, VALUES, openClue, renderClue, … from there).
// Same approach as Gecko: phones talk through a free public MQTT relay over a secure web connection,
// so the site stays static. The master keeps the real game; phones get a small public state.
(function () {
  const BROKERS = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt"];
  const TOPIC_ROOT = "buzzboard-q8w3/v1/";
  const VERSION = "2026-11-25a";
  // ~300 common, family-friendly English words (no names, nothing rude or scary)
  const CODE_WORDS = [
    "ABLE", "ACRE", "AIRY", "ALOE", "APEX", "ARCH", "AXLE", "BAKE", "BALL", "BAND", "BARK", "BARN", "BATH", "BEAD", "BEAK", "BEAM", "BEAN", "BEAR", "BELL", "BELT",
    "BIKE", "BIRD", "BLUE", "BOAR", "BOAT", "BOLT", "BONE", "BOOK", "BOOM", "BOOT", "BOWL", "BULB", "BUNK", "BUOY", "BURP", "BUSH", "BUZZ", "CAFE", "CAKE", "CALF",
    "CALM", "CAMP", "CANE", "CAPE", "CARD", "CART", "CAVE", "CHEF", "CHIP", "CITY", "CLAM", "CLAP", "CLAY", "CLUB", "CLUE", "COAT", "CODE", "COIN", "COLT", "COMB",
    "CONE", "COOK", "COOL", "CORD", "CORN", "COVE", "COZY", "CRAB", "CROW", "CUBE", "CURL", "CUTE", "DART", "DASH", "DAWN", "DEER", "DESK", "DICE", "DIME", "DISH",
    "DIVE", "DOCK", "DOLL", "DOME", "DOOR", "DOVE", "DRUM", "DUCK", "DUET", "DUNE", "DUSK", "ECHO", "EDGE", "EPIC", "FARM", "FAWN", "FERN", "FIGS", "FISH", "FIVE",
    "FLAG", "FLAP", "FLEA", "FLIP", "FOAM", "FOIL", "FOLK", "FOOD", "FORK", "FORT", "FOUR", "FROG", "FUEL", "FUZZ", "GAME", "GATE", "GEAR", "GEMS", "GIFT", "GLOW",
    "GLUE", "GOAT", "GOLD", "GOLF", "GONG", "GOWN", "GRAM", "GRIN", "GULL", "HAIL", "HALO", "HAND", "HARP", "HAWK", "HAZE", "HEAT", "HERB", "HERO", "HIKE", "HILL",
    "HIVE", "HOOK", "HOOP", "HOOT", "HOPE", "HORN", "HULA", "HUSH", "ICON", "IDEA", "INCH", "INKY", "IRIS", "IRON", "ISLE", "JADE", "JAMS", "JAZZ", "JEEP", "JEST",
    "JOKE", "JUMP", "KALE", "KELP", "KIND", "KING", "KITE", "KIWI", "KNOT", "LACE", "LAKE", "LAMB", "LAMP", "LANE", "LAVA", "LAWN", "LEAF", "LIME", "LION", "LOAF",
    "LOFT", "LOGS", "LOOP", "LUAU", "LUCK", "MANE", "MAPS", "MASK", "MAZE", "MEAL", "MELT", "MENU", "MESA", "MICE", "MILK", "MINK", "MINT", "MIST", "MOAT", "MOLE",
    "MOON", "MOSS", "MOTH", "MULE", "MUSE", "NAPS", "NEST", "NOON", "NOVA", "NUTS", "OAKS", "OARS", "OATS", "OBOE", "OPAL", "OVAL", "OWLS", "PAGE", "PALM", "PARK",
    "PATH", "PAWS", "PEAK", "PEAR", "PEAS", "PIER", "PINE", "PINK", "PIPE", "PITA", "PLAY", "PLUM", "POEM", "POET", "POLO", "POND", "PONY", "POOL", "PORT", "PUFF",
    "PUMA", "QUIZ", "RACE", "RAFT", "RAIN", "RAKE", "RAMP", "REED", "REEF", "RICE", "RING", "ROAD", "ROBE", "ROCK", "ROLL", "ROOF", "ROPE", "ROSE", "RUBY", "SAGE",
    "SAIL", "SALT", "SAND", "SEAL", "SEAS", "SEED", "SHED", "SHIP", "SHOE", "SILK", "SING", "SKIS", "SLED", "SNAP", "SNOW", "SOAP", "SOCK", "SODA", "SOFA", "SOUP",
    "SPUD", "STAR", "STEM", "STEW", "SUMO", "SWAN", "SWIM", "TACO", "TAIL", "TAPE", "TEAL", "TEAM", "TENT", "TIDE", "TILE", "TOAD", "TOFU", "TOGA", "TOTE", "TOWN",
    "TOYS", "TRAM", "TRAY", "TREE", "TRIO", "TUBA", "TUBE", "TUNA", "TUNE", "TWIG", "TWIN", "VASE", "VEST", "VINE", "WAND", "WASP", "WAVE", "WHEY", "WICK", "WIND",
    "WING", "WISH", "WOLF", "WOOD", "WOOL", "WORM", "YAKS", "YARD", "YARN", "YAWN", "YELP", "YETI", "YOGA", "YOLK", "YOYO", "ZANY", "ZEST", "ZINC", "ZONE", "ZOOM",
  ];
  const ANSWER_SECS = 5;        // after buzzing in, this long to start answering
  const GATHER_MS = 300;        // after the first buzz arrives, wait this long for faster reactions on slower connections
  const ONLINE_MS = 15000;

  const rid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  const topic = (code, rest) => TOPIC_ROOT + code + "/" + rest;
  const parse = buf => { try { return JSON.parse(buf.toString()); } catch (e) { return null; } };
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // One MQTT client that moves to the next relay if the first can't be reached (copied from Gecko).
  function connectBroker() {
    const subs = new Map(), handlers = { connect: [], message: [], offline: [], down: [] };
    const emit = (ev, ...args) => handlers[ev].forEach(f => f(...args));
    let c = null, idx = 0, tries = 0, timer = null, wasUp = false;
    const drop = () => { if (c) { c.removeAllListeners(); c.on("error", () => {}); c.end(true); c = null; } };
    const open = i => {
      drop(); clearTimeout(timer);
      idx = i; wasUp = false;
      c = mqtt.connect(BROKERS[i], { clientId: "bb-" + rid(), reconnectPeriod: 3000, connectTimeout: 6000, clean: true });
      timer = setTimeout(next, 7000);
      c.on("connect", () => { clearTimeout(timer); tries = 0; wasUp = true; for (const [t, o] of subs) c.subscribe(t, o); emit("connect"); });
      c.on("message", (t, m) => emit("message", t, m));
      c.on("offline", () => { emit("offline"); if (wasUp) { wasUp = false; clearTimeout(timer); timer = setTimeout(next, 15000); } });
      c.on("error", () => {});
    };
    const next = () => {
      if (++tries >= BROKERS.length) { tries = 0; drop(); emit("down"); return; }
      open((idx + 1) % BROKERS.length);
    };
    open(0);
    return {
      get connected() { return !!c && c.connected; },
      on(ev, f) { handlers[ev].push(f); },
      off(f) { for (const k in handlers) handlers[k] = handlers[k].filter(h => h !== f); },
      subscribe(t, opts) { subs.set(t, opts); if (c && c.connected) c.subscribe(t, opts); },
      unsubscribe(t) { subs.delete(t); if (c && c.connected) c.unsubscribe(t); },
      publish(t, msg, opts, cb) { if (c && c.connected) c.publish(t, msg, opts, cb); else if (cb) cb(); },
      end() { drop(); clearTimeout(timer); },
    };
  }

  /* ================================================================ master (the big screen) */
  let client = null, status = "", tick = 0, beatTimer = 0, syncQueued = false, gatherTimer = 0;
  const seen = {};              // player id → last message time
  const joinLink = code => location.origin + location.pathname + "#" + code;
  const teamIdx = id => G.teams.findIndex(t => t.id === id);
  const Q = () => G.live && G.live.q;

  function hosting() { return G.mode === "live" && !!G.live && role !== "phone"; }
  const hid = rid();            // this big screen, so it can tell its own room announcements from another's
  const pickWord = () => CODE_WORDS[Math.floor(Math.random() * CODE_WORDS.length)];
  // Announce the room (kept by the relay) so a new room never reuses a code that's in use.
  function beat() { if (client && G.live && G.live.code) client.publish(topic(G.live.code, "host"), JSON.stringify({ t: Date.now(), hid }), { qos: 0, retain: true }); }
  // Is another big screen using this code? Listen briefly for its recent announcement.
  function isTaken(code, cb) {
    const t = topic(code, "host");
    let taken = false;
    const onMsg = (tp, m) => { if (tp === t) { const d = parse(m); if (d && d.hid !== hid && Date.now() - d.t < 60000) taken = true; } };
    client.on("message", onMsg);
    client.subscribe(t, { qos: 1 });
    setTimeout(() => { client.unsubscribe(t); client.off(onMsg); cb(taken); }, 1500);
  }
  function pickCode(done, tries = 0) {
    const code = pickWord();
    isTaken(code, taken => (taken && tries < 20 ? pickCode(done, tries + 1) : done(code)));
  }

  function connectMaster() {
    if (client) client.end();
    status = "Connecting…";
    client = connectBroker();
    const listen = () => {
      status = "";
      client.subscribe(topic(G.live.code, "up"), { qos: 1 });
      beat(); sync(true);
      if (G.view === "lobby") renderLobby();
    };
    client.on("connect", () => {
      if (G.live.code) return listen();
      status = "Finding a free room code…"; refreshLobby();
      pickCode(code => { G.live.code = code; save(); listen(); });
    });
    client.on("message", (t, m) => { if (G.live && G.live.code && t === topic(G.live.code, "up")) { const msg = parse(m); if (msg && typeof msg.from === "string") receive(msg); } });
    client.on("offline", () => { status = "Can't reach the relay. Retrying…"; refreshLobby(); });
    client.on("down", () => { status = "The relay server is down. Try again later."; refreshLobby(); });
    clearInterval(beatTimer);
    beatTimer = setInterval(() => { beat(); sync(true); if (G.view === "lobby") refreshLobby(); else renderTeamsOnline(); }, 3000);
  }

  function openRoom() {
    G.mode = "live";
    G.live = { code: null, seq: 0, q: null };        // the code is picked once the relay answers
    G.teams = []; G.picker = 0; G.board = null; G.open = null; G.final = null; G.dd = null;
    G.view = "lobby";
    connectMaster();
    renderAll();
  }
  function resume() { if (G.live) { connectMaster(); if (G.view === "clue" && G.live.q) startTick(); } }
  function closeRoom() {
    clearInterval(beatTimer); clearInterval(tick);
    const old = client;
    if (old && G.live && G.live.code) {
      old.publish(topic(G.live.code, "all"), JSON.stringify({ v: VERSION, view: "closed" }), { qos: 1 });
      // free the code, then hang up once the relay has it (or after a second either way)
      let done = false;
      const hangUp = () => { if (!done) { done = true; old.end(); } };
      old.publish(topic(G.live.code, "host"), "", { qos: 1, retain: true }, hangUp);
      setTimeout(hangUp, 1500);
    } else if (old) old.end();
    client = null;
    G.mode = "live"; G.live = null;
  }

  function renderLobby() {
    G.view = "lobby";
    $("title").hidden = true; $("play-view").hidden = false; $("teambar").hidden = false;
    $("finalbtn").hidden = true;
    $("left").textContent = G.live.code ? `Room ${G.live.code}` : "Opening a room…";
    const stage = $("stage");
    stage.textContent = "";
    const box = el("div", "final lobby");
    box.append(el("div", "eyebrow", "Competitive · join on your phone"));
    if (!G.live.code) {
      box.append(el("p", "roomcode", "····"));
      const st = el("p", "note", status || "Connecting…"); st.id = "lobbystatus";
      box.append(st);
      stage.append(box); renderTeams();
      return;
    }
    const row = el("div", "lobbyrow");
    const qr = el("div", "qr"); qr.id = "lobbyqr";
    const info = el("div", "joininfo");
    info.append(el("p", "note", "Open this on each phone:"), el("p", "joinurl", joinLink(G.live.code)),
      el("p", "note", "or open Buzzboard, tap “Join a game on this phone”, and type the code"), el("p", "roomcode", G.live.code));
    row.append(qr, info);
    box.append(row);
    const list = el("div", "players"); list.id = "lobbyplayers";
    box.append(list);
    const st = el("p", "note"); st.id = "lobbystatus";
    box.append(st);
    const go = el("button", "btn go keybtn", "Start the game"); go.type = "button"; go.id = "lobbygo";
    go.onclick = startLive;
    box.append(go);
    stage.append(box);
    if (window.QRCode) { try { new QRCode(qr, { text: joinLink(G.live.code), width: 168, height: 168, colorDark: "#11151c", colorLight: "#ffffff" }); } catch (e) {} }
    else qr.hidden = true;
    refreshLobby();
    renderTeams();
  }
  function refreshLobby() {
    if (G.view !== "lobby") return;
    const list = $("lobbyplayers"), st = $("lobbystatus"), go = $("lobbygo");
    if (!list) { if (st) st.textContent = status || "Connecting…"; return; }
    list.textContent = "";
    if (!G.teams.length) list.append(el("p", "note", "No one has joined yet."));
    G.teams.forEach((t, i) => {
      const chip = el("span", "chip" + (online(t.id) ? "" : " off"));
      chip.append(t.name);
      const x = el("button", "", "✕"); x.type = "button"; x.title = `Remove ${t.name}`; x.setAttribute("aria-label", `Remove ${t.name}`);
      x.onclick = () => { send(t.id, { t: "err", msg: "The host removed you from the room." }); G.teams.splice(i, 1); save(); renderLobby(); };
      chip.append(x);
      list.append(chip);
    });
    st.textContent = status || `${G.teams.length} player${G.teams.length === 1 ? "" : "s"} in. Categories: ${G.picked.map(s => (CATEGORIES.find(c => c.slug === s) || { name: s }).name).join(", ")}.`;
    go.disabled = !G.teams.length;
  }
  const online = id => Date.now() - (seen[id] || 0) < ONLINE_MS;
  function renderTeamsOnline() {
    document.querySelectorAll("#teambar .team").forEach((card, i) => { const t = G.teams[i]; if (t) card.classList.toggle("offline", !online(t.id)); });
  }

  async function startLive() {
    if (!G.teams.length) return;
    G.picker = Math.floor(Math.random() * G.teams.length);
    await startGame(true);
    sync(true);
  }

  // ---- messages from phones
  function send(id, msg) { if (client && G.live.code) client.publish(topic(G.live.code, "down/" + id), JSON.stringify({ ...msg, v: VERSION }), { qos: 1 }); }
  function receive(msg) {
    const id = msg.from;
    seen[id] = Date.now();
    if (msg.t === "join") {
      if (msg.v !== VERSION) { send(id, { t: "err", msg: "This phone has an older copy of Buzzboard. Reload the page.", reload: true }); return; }
      let i = teamIdx(id);
      if (i < 0) {
        let name = String(msg.name || "").trim().slice(0, 16) || "Player";
        const taken = n => G.teams.some(t => t.name.toLowerCase() === n.toLowerCase());
        for (let k = 2; taken(name); k++) name = String(msg.name).trim().slice(0, 13) + " " + k;
        G.teams.push({ id, name, score: 0 });
        i = G.teams.length - 1;
        save();
        if (G.view === "lobby") renderLobby(); else renderTeams();
      }
      send(id, { t: "welcome", id, name: G.teams[i].name });
      sync(true);
      return;
    }
    const i = teamIdx(id);
    if (i < 0) { if (msg.t !== "ping") send(id, { t: "rejoin" }); return; }
    if (msg.t === "pick" && G.view === "board" && i === G.picker) {
      const c = msg.c | 0, r = msg.r | 0;
      if (c >= 0 && c < 5 && r >= 0 && r < 5 && !G.used[`${c}-${r}`]) openClue(c, r);
    } else if (msg.t === "buzz") buzz(i, msg);
    else if (msg.t === "ddbet" && G.view === "dd" && G.dd && G.dd.team === i) {
      G.dd.bet = Math.max(0, Math.min(ddMax(i), Math.round(+msg.bet || 0)));
      ddGo();
    } else if (msg.t === "fbet" && G.view === "final" && G.final && G.final.phase === "bet") {
      const F = G.final;
      F.bets[i] = Math.max(0, Math.min(maxBet(i), Math.round(+msg.bet || 0)));
      (F.betIn = F.betIn || [])[i] = true;
      renderFinal();
    } else if (msg.t === "fans" && G.view === "final" && G.final && G.final.phase === "clue" && G.final.answers && !G.final.shown) {
      G.final.answers[i] = String(msg.text || "").slice(0, 80);
      renderFinal();
    }
  }

  // ---- a clue on the master
  function clueOpened() {
    const now = Date.now(), dd = G.open.dd;
    G.live.seq = (G.live.seq || 0) + 1;
    G.live.q = {
      seq: G.live.seq, state: dd ? "answering" : "open",
      deadline: !dd && G.timerOn ? now + clueSecs(openClueObj()) * 1000 : 0,
      remaining: 0, locked: [], answering: dd ? dd.team : null,
      answerDeadline: dd ? now + Math.max(clueSecs(openClueObj()), ANSWER_SECS) * 1000 : 0,
      results: [], pending: [],
    };
    startTick();
  }
  function startTick() {
    clearInterval(tick);
    tick = setInterval(() => {
      const q = Q();
      if (!q || G.view !== "clue") { clearInterval(tick); return; }
      if (q.state === "open" && q.deadline && Date.now() >= q.deadline) {
        q.state = "done"; G.open.shown = true; G.open.stopped = true; beep();
        renderClue(); return;
      }
      if (q.state === "answering" && q.answerDeadline && Date.now() >= q.answerDeadline && !q.answerBuzzed) { q.answerBuzzed = true; beep(); save(); }
      drawClock();
    }, 100);
  }
  function buzz(i, msg) {
    const q = Q();
    if (!q || G.view !== "clue" || q.state !== "open" || msg.seq !== q.seq || q.locked.includes(i) || G.open.dd) return;
    if (q.pending.some(p => p.i === i)) return;
    q.pending.push({ i, react: Math.max(0, +msg.react || 0) });
    if (!gatherTimer) gatherTimer = setTimeout(settleBuzz, GATHER_MS);
  }
  function settleBuzz() {
    gatherTimer = 0;
    const q = Q();
    if (!q || q.state !== "open" || !q.pending.length) return;
    // fastest reaction wins: each phone timed itself from when it saw the buzzers open
    q.pending.sort((a, b) => a.react - b.react);
    const win = q.pending[0];
    q.pending = [];
    q.remaining = q.deadline ? Math.max(0, q.deadline - Date.now()) : 0;
    q.state = "answering"; q.answering = win.i; q.answerBuzzed = false;
    q.answerDeadline = Date.now() + ANSWER_SECS * 1000;
    q.react = win.react;
    beepUp();
    renderClue();
  }
  function judge(right) {
    const q = Q();
    if (!q || G.view !== "clue" || q.state !== "answering" || q.answering == null) return;
    const i = q.answering, amount = G.open.dd ? G.open.dd.bet : VALUES[G.open.r];
    G.teams[i].score += right ? amount : -amount;
    G.lastValue = amount;
    q.results.push({ i, right, amount });
    q.answering = null;
    if (right) {
      G.picker = i;
      q.state = "done"; G.open.shown = true; G.open.stopped = true;
    } else {
      q.locked.push(i);
      const stillIn = G.teams.some((t, k) => !q.locked.includes(k) && online(t.id));
      const timeLeft = !G.timerOn || q.remaining > 400;
      if (!G.open.dd && stillIn && timeLeft) {
        G.live.seq += 1; q.seq = G.live.seq;                 // new round of buzzing; old presses don't count
        q.state = "open"; q.pending = [];
        q.deadline = G.timerOn ? Date.now() + q.remaining : 0;
      } else { q.state = "done"; G.open.shown = true; G.open.stopped = true; }
    }
    renderClue(); renderTeams();
  }
  function answerShown() {
    const q = Q();
    if (q && q.state !== "done") { q.state = "done"; q.answering = null; }
  }
  function clueClosed() { if (G.live) G.live.q = null; clearInterval(tick); clearTimeout(gatherTimer); gatherTimer = 0; }

  function renderPanel(box) {
    const q = Q();
    if (!q || !box) return;
    box.className = "livepanel";
    box.textContent = "";
    const status = el("div", "livestatus"); status.id = "livestatus";
    const clock = el("div", "timer"); clock.id = "liveclock";
    clock.innerHTML = `<div class="tbar"><div></div></div><span class="tnum"></span>`;
    if (q.state === "open") {
      status.append(el("span", "lsopen", q.locked.length ? "Buzzers open again" : "Buzzers open"));
      if (q.locked.length) status.append(el("span", "lsmuted", ` · out: ${q.locked.map(k => G.teams[k].name).join(", ")}`));
    } else if (q.state === "answering") {
      const who = G.teams[q.answering];
      status.append(el("span", "lswho", who ? who.name : "?"), el("span", "lsmuted", G.open.dd ? " · Double Down" : " buzzed in"));
      const judgeRow = el("div", "judgebtns");
      const r = el("button", "jr", "✓ Right"); r.type = "button"; r.onclick = () => judge(true);
      const w = el("button", "jw", "✗ Wrong"); w.type = "button"; w.onclick = () => judge(false);
      r.append(el("kbd", "", "R")); w.append(el("kbd", "", "W"));
      judgeRow.append(r, w);
      box.append(status, clock, judgeRow);
      drawClock();
      return;
    } else {
      if (!q.results.length) status.append(el("span", "lsmuted", G.timerOn ? "Time's up. Nobody buzzed in." : "Nobody got it."));
    }
    box.append(status);
    if (q.results.length) {
      const marks = el("div", "marks");
      q.results.forEach(res => marks.append(el("span", res.right ? "mark ok" : "mark no", `${res.right ? "✓" : "✗"} ${G.teams[res.i] ? G.teams[res.i].name : "?"} ${res.right ? "+" : "−"}${res.amount.toLocaleString()}`)));
      box.append(marks);
    }
    if (q.state === "open" && q.deadline) { box.append(clock); drawClock(); }
  }
  function drawClock() {
    const q = Q(), clock = $("liveclock");
    if (!q || !clock) return;
    const answering = q.state === "answering";
    const end = answering ? q.answerDeadline : q.deadline;
    if (!end) { clock.hidden = true; return; }
    const total = answering ? (G.open.dd ? Math.max(clueSecs(openClueObj()), ANSWER_SECS) : ANSWER_SECS) : clueSecs(openClueObj());
    const left = Math.max(0, (end - Date.now()) / 1000);
    clock.querySelector(".tbar > div").style.transform = `scaleX(${Math.min(1, left / total)})`;
    clock.querySelector(".tnum").textContent = left > 0 ? Math.ceil(left) : "Time!";
    clock.classList.toggle("low", left > 0 && left <= 2);
    clock.classList.toggle("over", left <= 0);
  }

  // ---- the state every phone sees
  function publicState() {
    const now = Date.now(), q = Q(), F = G.final;
    const name = i => (G.teams[i] ? G.teams[i].name : "");
    const s = {
      v: VERSION, view: G.view, code: G.live.code,
      players: G.teams.map(t => ({ id: t.id, name: t.name, score: t.score })),
      picker: G.teams[G.picker] ? G.teams[G.picker].id : null,
      cats: G.board ? G.board.map(c => c.name) : [], used: Object.keys(G.used || {}),
    };
    if (G.view === "clue" && G.open && q) {
      s.q = {
        seq: q.seq, state: q.state, value: G.open.dd ? G.open.dd.bet : VALUES[G.open.r], cat: G.board[G.open.c].name,
        left: q.state === "open" && q.deadline ? Math.max(0, q.deadline - now) : null,
        answering: q.answering != null && G.teams[q.answering] ? G.teams[q.answering].id : null,
        answeringName: q.answering != null ? name(q.answering) : "",
        aleft: q.state === "answering" && q.answerDeadline ? Math.max(0, q.answerDeadline - now) : null,
        locked: q.locked.map(k => G.teams[k] && G.teams[k].id),
        results: q.results.map(r => ({ id: G.teams[r.i] && G.teams[r.i].id, name: name(r.i), right: r.right, amount: r.amount })),
        dd: G.open.dd ? { id: G.teams[G.open.dd.team] && G.teams[G.open.dd.team].id, bet: G.open.dd.bet } : null,
        shown: !!G.open.shown,
      };
    }
    if (G.view === "dd" && G.dd) s.dd = { id: G.teams[G.dd.team] && G.teams[G.dd.team].id, name: name(G.dd.team), max: ddMax(G.dd.team), cat: G.board[G.dd.c].name };
    if (G.view === "final" && F) {
      s.final = {
        phase: F.phase, cat: G.board[F.c].name,
        max: Object.fromEntries(G.teams.map((t, i) => [t.id, maxBet(i)])),
        betIn: Object.fromEntries(G.teams.map((t, i) => [t.id, !!(F.betIn && F.betIn[i])])),
        ansIn: Object.fromEntries(G.teams.map((t, i) => [t.id, !!(F.answers && F.answers[i] != null)])),
        left: F.phase === "clue" && F.deadline && !F.shown ? Math.max(0, F.deadline - now) : null,
        shown: !!F.shown,
        judged: Object.fromEntries(G.teams.map((t, i) => [t.id, F.judged[i]])),
        bets: Object.fromEntries(G.teams.map((t, i) => [t.id, F.bets[i]])),
      };
    }
    if (G.view === "done") s.done = { final: !!(G.final && G.final.phase === "over") };
    return s;
  }
  function sync(now) {
    if (!client || !G.live || !G.live.code) return;
    if (now) { syncQueued = false; client.publish(topic(G.live.code, "all"), JSON.stringify(publicState()), { qos: 0 }); return; }
    if (syncQueued) return;
    syncQueued = true;
    setTimeout(() => { if (syncQueued) sync(true); }, 30);
  }

  /* ================================================================ phone (a buzzer) */
  let role = null, P = { code: "", name: "", cid: "", id: null, st: null, status: "", err: "", openSeen: {}, pressed: {}, sent: {}, ansDraft: "" }, phoneClient = null, joinTimer = 0, pingTimer = 0, phoneTick = 0;
  const seat = (new URLSearchParams(location.search).get("seat") || "");   // lets several test tabs share one browser

  function phoneEntry(code) {
    role = "phone";
    P.code = (code || lsGet("bb-last-code") || "").toUpperCase();
    P.name = lsGet("bb-name") || "";
    document.querySelector(".app").hidden = true;
    let root = $("phone");
    if (!root) { root = el("div", "phone"); root.id = "phone"; document.body.append(root); }
    renderPhone();
  }
  function phoneJoin(code, name) {
    P.code = code; P.name = name; P.err = ""; P.status = "Connecting…";
    lsSet("bb-name", name); lsSet("bb-last-code", code);
    P.cid = lsGet(`bb-cid-${code}${seat}`) || rid();
    lsSet(`bb-cid-${code}${seat}`, P.cid);
    if (phoneClient) phoneClient.end();
    phoneClient = connectBroker();
    phoneClient.on("connect", () => {
      phoneClient.subscribe(topic(code, "down/" + P.cid), { qos: 1 });
      phoneClient.subscribe(topic(code, "all"), { qos: 0 });
      askJoin();
    });
    phoneClient.on("message", (t, m) => {
      const msg = parse(m);
      if (!msg) return;
      if (t === topic(code, "all")) onState(msg); else onDirect(msg);
    });
    phoneClient.on("offline", () => { P.status = "Reconnecting…"; renderPhone(); });
    phoneClient.on("down", () => { P.status = ""; P.err = "Can't reach the relay server. Check the connection and try again."; renderPhone(); });
    clearInterval(pingTimer);
    pingTimer = setInterval(() => up({ t: "ping" }), 5000);
    renderPhone();
  }
  function askJoin() {
    up({ t: "join", name: P.name, v: VERSION });
    clearTimeout(joinTimer);
    joinTimer = setTimeout(() => { if (!P.id) { P.status = `Looking for room ${P.code}… (is the big screen open?)`; renderPhone(); askJoin(); } }, 5000);
  }
  function up(msg) { if (phoneClient && phoneClient.connected) phoneClient.publish(topic(P.code, "up"), JSON.stringify({ ...msg, from: P.cid }), { qos: msg.t === "buzz" ? 0 : 1 }); }
  function onDirect(msg) {
    if (msg.t === "welcome") { P.id = msg.id; P.name = msg.name; P.status = ""; clearTimeout(joinTimer); renderPhone(); }
    else if (msg.t === "err") { P.err = msg.msg; P.id = null; clearTimeout(joinTimer); if (phoneClient) phoneClient.end(); phoneClient = null; renderPhone(); }
    else if (msg.t === "rejoin") askJoin();
  }
  function onState(st) {
    if (st.v !== VERSION) { P.err = "The big screen is running a different version. Reload both pages."; renderPhone(); return; }
    if (st.view === "closed") { P.err = "The host closed the room."; P.st = null; renderPhone(); return; }
    if (!P.id) return;
    if (!st.players.some(p => p.id === P.id)) { P.id = null; askJoin(); return; }
    const t = performance.now();
    st.at = t;
    if (st.q && st.q.state === "open" && P.openSeen[st.q.seq] == null) P.openSeen[st.q.seq] = t;   // buzzers just opened for us
    const prev = JSON.stringify(P.st && { ...P.st, at: 0 }), next = JSON.stringify({ ...st, at: 0 });
    P.st = st;
    if (prev !== next) renderPhone();
  }

  function renderPhone() {
    const root = $("phone");
    if (!root) return;
    clearInterval(phoneTick);
    root.textContent = "";
    const st = P.st, me = st && st.players.find(p => p.id === P.id);
    const head = el("div", "phead");
    head.append(el("span", "plogo", "BUZZBOARD"));
    if (me) head.append(el("span", "pme", `${me.name} · ${me.score.toLocaleString()}`));
    root.append(head);
    const body = el("div", "pbody");
    root.append(body);

    if (P.err) { body.append(el("p", "pmsg", P.err)); body.append(btn("Try again", () => { P.err = ""; P.id = null; P.st = null; renderPhone(); })); return; }
    if (!phoneClient) return renderJoin(body);
    if (!P.id) {
      body.append(el("p", "pbig", `Joining ${P.code}…`), el("p", "pmsg", P.status || "Connecting…"));
      body.append(btn("Cancel", () => { phoneClient.end(); phoneClient = null; clearTimeout(joinTimer); P.status = ""; renderPhone(); }, "pbtn ghost"));
      return;
    }
    if (!st) { body.append(el("p", "pmsg", P.status || "Waiting for the big screen…")); return; }
    if (P.status) body.append(el("p", "pnote", P.status));

    if (st.view === "lobby") { body.append(el("p", "pbig", "You're in!"), el("p", "pmsg", "Waiting for the host to start the game.")); return; }
    if (st.view === "board") {
      if (st.picker === P.id) {
        body.append(el("p", "pbig", "Your pick!"));
        const grid = el("div", "pgrid");
        st.cats.forEach(c => grid.append(el("div", "phead2", c)));
        VALUES.forEach((v, r) => st.cats.forEach((c, ci) => {
          const b = el("button", "pcell", String(v)); b.type = "button";
          b.disabled = st.used.includes(`${ci}-${r}`);
          b.onclick = () => { up({ t: "pick", c: ci, r }); b.classList.add("sent"); };
          grid.append(b);
        }));
        body.append(grid);
      } else {
        const who = st.players.find(p => p.id === st.picker);
        body.append(el("p", "pmsg", `${who ? who.name : "Someone"} is picking a square…`));
      }
      return;
    }
    if (st.view === "dd" && st.dd) {
      if (st.dd.id === P.id) {
        body.append(el("p", "pbig gold", "DOUBLE DOWN!"), el("p", "pmsg", `${st.dd.cat}. Bet 0 to ${st.dd.max.toLocaleString()}.`));
        betForm(body, st.dd.max, bet => up({ t: "ddbet", bet }), "Bet");
      } else body.append(el("p", "pbig gold", "Double Down!"), el("p", "pmsg", `${st.dd.name} is placing a bet.`));
      return;
    }
    if (st.view === "clue" && st.q) return renderBuzzer(body, st.q, st);
    if (st.view === "final" && st.final) return renderPhoneFinal(body, st.final, st);
    if (st.view === "done") {
      const order = st.players.slice().sort((a, b) => b.score - a.score);
      const place = order.findIndex(p => p.id === P.id) + 1;
      body.append(el("p", "pbig", place === 1 ? "You win!" : `You finished #${place}`));
      const list = el("div", "plist");
      order.forEach((p, k) => list.append(el("div", p.id === P.id ? "prow mine" : "prow", `${k + 1}. ${p.name} — ${p.score.toLocaleString()}`)));
      body.append(list);
      return;
    }
    body.append(el("p", "pmsg", "Watch the big screen."));
  }
  function btn(text, fn, cls) { const b = el("button", cls || "pbtn", text); b.type = "button"; b.onclick = fn; return b; }
  function renderJoin(body) {
    body.append(el("p", "pbig", "Join a game"));
    const form = el("form", "pform");
    const code = el("input"); code.id = "pcode"; code.placeholder = "Room code"; code.maxLength = 4; code.autocapitalize = "characters"; code.value = P.code || "";
    code.setAttribute("aria-label", "Room code");
    code.addEventListener("input", () => { code.value = code.value.toUpperCase().replace(/[^A-Z]/g, ""); });
    const name = el("input"); name.id = "pname"; name.placeholder = "Your name"; name.maxLength = 16; name.value = P.name || "";
    name.setAttribute("aria-label", "Your name");
    const go = el("button", "pbtn", "Join"); go.type = "submit";
    form.append(code, name, go);
    form.addEventListener("submit", e => {
      e.preventDefault();
      const c = code.value.trim().toUpperCase(), n = name.value.trim();
      if (!/^[A-Z]{4}$/.test(c)) { code.focus(); return; }
      if (!n) { name.focus(); return; }
      phoneJoin(c, n);
    });
    body.append(form);
    if (P.status) body.append(el("p", "pnote", P.status));
    (P.code ? name : code).focus();
  }
  function renderBuzzer(body, q, st) {
    body.append(el("p", "pcat", `${q.cat} · ${q.dd ? "Double Down " : ""}${q.value.toLocaleString()}`));
    const big = el("button", "buzz"); big.type = "button";
    const sub = el("p", "pmsg");
    const mine = q.results.filter(r => r.id === P.id).pop();
    if (q.dd) {
      big.disabled = true;
      big.textContent = q.dd.id === P.id ? "Your Double Down" : "Double Down";
      sub.textContent = q.dd.id === P.id ? (q.state === "answering" ? "Say your answer out loud!" : "") : `${q.answeringName || "They"} answer this one.`;
    } else if (q.state === "open" && !q.locked.includes(P.id)) {
      const pressed = P.pressed[q.seq];
      big.textContent = pressed ? "Buzzed!" : "BUZZ";
      big.classList.toggle("live", !pressed);
      big.disabled = !!pressed;
      sub.textContent = pressed ? "Waiting to see who was first…" : "Tap as soon as you know it!";
      const press = e => {
        e.preventDefault();
        if (P.pressed[q.seq]) return;
        const openedAt = P.openSeen[q.seq] != null ? P.openSeen[q.seq] : performance.now();
        P.pressed[q.seq] = true;
        up({ t: "buzz", seq: q.seq, react: Math.round(performance.now() - openedAt) });
        try { navigator.vibrate && navigator.vibrate(60); } catch (err) {}
        renderPhone();
      };
      big.addEventListener("pointerdown", press);
      big.addEventListener("click", press);
    } else if (q.state === "open") {
      big.disabled = true; big.textContent = "Locked out"; sub.textContent = "Your answer was wrong; the others can still buzz.";
    } else if (q.state === "answering") {
      big.disabled = true;
      if (q.answering === P.id) { big.textContent = "You're up!"; big.classList.add("me"); sub.textContent = "Say your answer out loud!"; }
      else { big.textContent = q.answeringName; sub.textContent = "buzzed in first"; }
    } else {
      big.disabled = true;
      big.textContent = mine ? (mine.right ? `+${mine.amount.toLocaleString()}` : `−${mine.amount.toLocaleString()}`) : "—";
      if (mine) big.classList.add(mine.right ? "ok" : "no");
      sub.textContent = mine ? (mine.right ? "Correct! You pick next." : "Not quite.") : "The answer is on the big screen.";
    }
    body.append(big, sub);
    const clock = el("p", "pclock");
    body.append(clock);
    const left = q.state === "open" ? q.left : q.state === "answering" ? q.aleft : null;
    if (left != null) {
      const end = st.at + left;
      const draw = () => { const s = Math.max(0, (end - performance.now()) / 1000); clock.textContent = s > 0 ? `${Math.ceil(s)}s` : "Time!"; };
      draw(); phoneTick = setInterval(draw, 200);
    }
  }
  function betForm(body, max, onSend, label) {
    const form = el("form", "pform");
    const inp = el("input"); inp.type = "number"; inp.inputMode = "numeric"; inp.min = 0; inp.max = max; inp.step = 100; inp.placeholder = `0 to ${max.toLocaleString()}`;
    inp.setAttribute("aria-label", label);
    const go = el("button", "pbtn", `Lock in ${label.toLowerCase()}`); go.type = "submit";
    form.append(inp, go);
    form.addEventListener("submit", e => {
      e.preventDefault();
      const v = Math.max(0, Math.min(max, Math.round(+inp.value || 0)));
      onSend(v);
      form.replaceWith(el("p", "pmsg", `${label} sent: ${v.toLocaleString()}`));
    });
    body.append(form);
    inp.focus();
  }
  function renderPhoneFinal(body, F, st) {
    body.append(el("p", "pcat", "Final round"), el("p", "pbig", F.cat));
    if (F.phase === "bet") {
      if (F.betIn[P.id]) body.append(el("p", "pmsg", `Bet locked in: ${F.bets[P.id].toLocaleString()}. Waiting for the others.`));
      else betForm(body, F.max[P.id] || 0, bet => up({ t: "fbet", bet }), "Bet");
      return;
    }
    if (F.phase === "clue") {
      if (F.judged[P.id] != null) {
        const r = F.judged[P.id];
        body.append(el("p", "pbig " + (r ? "ok" : "no"), r ? `Right! +${F.bets[P.id].toLocaleString()}` : `Wrong. −${F.bets[P.id].toLocaleString()}`));
        return;
      }
      if (F.shown) { body.append(el("p", "pmsg", "Answers are up on the big screen.")); return; }
      body.append(el("p", "pmsg", "Read the question on the big screen and type your answer."));
      const form = el("form", "pform");
      const inp = el("input"); inp.maxLength = 80; inp.placeholder = "What is…"; inp.value = P.ansDraft || "";
      inp.setAttribute("aria-label", "Your answer");
      inp.addEventListener("input", () => { P.ansDraft = inp.value; });
      const go = el("button", "pbtn", F.ansIn[P.id] ? "Change answer" : "Send answer"); go.type = "submit";
      form.append(inp, go);
      form.addEventListener("submit", e => { e.preventDefault(); up({ t: "fans", text: inp.value.trim() }); go.textContent = "Sent ✓"; });
      body.append(form);
      if (F.ansIn[P.id]) body.append(el("p", "pnote", "Answer received. You can change it until time's up."));
      const clock = el("p", "pclock"); body.append(clock);
      if (F.left != null) { const end = st.at + F.left; const draw = () => { const s = Math.max(0, (end - performance.now()) / 1000); clock.textContent = s > 0 ? `${Math.ceil(s)}s` : "Time!"; }; draw(); phoneTick = setInterval(draw, 200); }
    }
  }

  /* ================================================================ styles */
  const css = `
  .lobby { align-items: center; text-align: center; }
  .lobbyrow { display: flex; gap: 28px; align-items: center; justify-content: center; flex-wrap: wrap; }
  .qr { background: #fff; padding: 10px; border-radius: 12px; line-height: 0; }
  .joininfo { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .joinurl { margin: 0; font-weight: 700; color: var(--accent); overflow-wrap: anywhere; }
  .roomcode { margin: 0; font-size: clamp(3rem, 10vw, 5.5rem); font-weight: 900; letter-spacing: .18em; color: var(--gold); line-height: 1; }
  .players { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
  .chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 6px 6px 14px; background: #151a22; border: 1px solid var(--line); border-radius: 999px; font-weight: 700; }
  .chip.off { opacity: .45; }
  .chip button { width: 26px; height: 26px; border-radius: 50%; border: 0; background: var(--panel-2); color: var(--dim); }
  .team.offline { opacity: .5; }
  .livepanel { display: flex; flex-direction: column; gap: 10px; align-items: stretch; }
  .livestatus { text-align: center; font-size: clamp(1.1rem, 2.4vw, 1.7rem); font-weight: 800; }
  .lsopen { color: var(--green); } .lsmuted { color: var(--dim); font-weight: 600; }
  .lswho { color: var(--gold); font-size: 1.4em; }
  .judgebtns { display: flex; gap: 12px; justify-content: center; }
  .judgebtns button { padding: 12px 26px; font-size: 1.1rem; font-weight: 800; border-radius: 11px; border: 1px solid var(--line); }
  .judgebtns kbd { margin: 0 0 0 10px; }
  .jr { background: var(--green); color: #06101f; } .jw { background: var(--red); color: #fff; }
  .marks { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
  .mark { padding: 6px 12px; border-radius: 999px; font-weight: 800; }
  .mark.ok { background: rgba(46,204,113,.15); color: var(--green); } .mark.no { background: rgba(255,59,48,.15); color: var(--red); }
  /* phone */
  .phone { min-height: 100%; display: flex; flex-direction: column; padding-inline: 16px; padding-block: 12px 24px; gap: 12px; max-width: 520px; margin: 0 auto; }
  .phead { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .plogo { font-weight: 900; letter-spacing: .04em; color: var(--accent); }
  .pme { font-weight: 800; font-variant-numeric: tabular-nums; }
  .pbody { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; text-align: center; }
  .pbig { margin: 0; font-size: clamp(1.8rem, 8vw, 2.6rem); font-weight: 900; text-wrap: balance; }
  .pbig.gold { color: var(--gold); } .pbig.ok { color: var(--green); } .pbig.no { color: var(--red); }
  .pmsg { margin: 0; color: var(--dim); font-size: 1.05rem; }
  .pnote { margin: 0; color: var(--dim); font-size: .85rem; }
  .pcat { margin: 0; color: var(--gold); font-weight: 800; text-transform: uppercase; letter-spacing: .06em; font-size: .85rem; }
  .pform { display: flex; flex-direction: column; gap: 10px; width: 100%; }
  .pform input { padding: 14px; font: 700 1.2rem var(--ui); text-align: center; background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 12px; }
  .pform input:focus { border-color: var(--accent); outline: none; }
  .pbtn.ghost { background: transparent; color: var(--dim); border: 1px solid var(--line); }
  .pbtn { padding: 14px; font-size: 1.1rem; font-weight: 800; background: var(--accent); color: #06101f; border: 0; border-radius: 12px; }
  .pgrid { width: 100%; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 5px; }
  .phead2 { font-size: .62rem; font-weight: 800; text-transform: uppercase; background: var(--accent); color: #06101f; border-radius: 6px; padding: 4px 2px; display: flex; align-items: center; justify-content: center; min-height: 44px; overflow-wrap: anywhere; line-height: 1.1; }
  .pcell { height: 48px; font-weight: 900; font-size: .95rem; background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 7px; }
  .pcell:disabled { color: transparent; background: #141921; }
  .pcell.sent { border-color: var(--gold); }
  .buzz { width: min(78vw, 320px); aspect-ratio: 1; max-width: 100%; border-radius: 50%; border: 0; font-size: clamp(1.6rem, 9vw, 2.6rem); font-weight: 900; background: var(--panel-2); color: var(--dim); touch-action: manipulation; user-select: none; -webkit-user-select: none; overflow-wrap: anywhere; padding: 10px; }
  .buzz.live { background: var(--red); color: #fff; box-shadow: 0 10px 0 #a3241c; }
  .buzz.live:active { transform: translateY(6px); box-shadow: 0 4px 0 #a3241c; }
  .buzz.me { background: var(--gold); color: #06101f; }
  .buzz.ok { background: var(--green); color: #06101f; } .buzz.no { background: var(--red); color: #fff; }
  .pclock { margin: 0; font-size: 1.6rem; font-weight: 900; font-variant-numeric: tabular-nums; color: var(--gold); min-height: 1.2em; }
  .plist { width: 100%; display: flex; flex-direction: column; gap: 6px; }
  .prow { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px; font-weight: 700; text-align: left; }
  .prow.mine { border-color: var(--gold); }
  `;
  document.head.append(Object.assign(document.createElement("style"), { textContent: css }));

  window.LIVE = {
    available: () => !!window.mqtt,
    hosting, openRoom, resume, closeRoom, renderLobby, sync,
    clueOpened, clueClosed, renderPanel, judge, answerShown,
    phoneEntry,
    isTaken: (code, cb) => (client ? isTaken(code, cb) : cb(false)),   // used by the tests
  };
})();
