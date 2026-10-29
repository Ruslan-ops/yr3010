(function () {
  "use strict";

  const S = window.SCENARIO, C = window.CONFIG || {};
  const UI = S.ui, N = S.questions.length;
  const TOTAL = N + 2;                       // route segments: intro, N questions, final -> destination
  const KEY = "yr3010_progress_v1";
  const params = new URLSearchParams(location.search);
  const DEBUG = !!params.get("debug"), DSTATE = DEBUG ? params.get("state") : null;
  const RM = (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) || DSTATE === "pass";
  const $ = (s) => document.querySelector(s);
  const wait = (ms) => new Promise((r) => setTimeout(r, RM ? 0 : ms));
  const t = (s) => String(s == null ? "" : s).replace(/\{name\}/g, C.PASSENGER || "");

  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = t(text);
    return e;
  }

  /* ---------- storage ---------- */
  // Progress is not persisted: every launch starts from the intro. Clear any leftovers from older builds.
  try { localStorage.removeItem(KEY); } catch (e) {}
  function load() { return {}; }
  function save() {}
  let state = Object.assign({ step: 0 }, load());   // step: 0 intro, 1..N questions, N+1 final, N+2 reveal
  const setStep = (s) => { state.step = s; save(state); };

  /* ---------- Telegram ---------- */
  const tg = window.Telegram && window.Telegram.WebApp;
  const BG = "#f4efe6";
  const vOK = (v) => { try { return !!(tg && tg.isVersionAtLeast && tg.isVersionAtLeast(v)); } catch (e) { return false; } };
  function applySafe() {
    // Telegram publishes --tg-safe-area-inset-* / --tg-content-safe-area-inset-* itself (Bot API 8.0+);
    // mirror from JS as well in case the CSS vars are missing.
    try {
      const r = document.documentElement.style;
      const a = tg.safeAreaInset || {}, c = tg.contentSafeAreaInset || {};
      ["top", "bottom", "left", "right"].forEach((k) => {
        if (a[k] != null) r.setProperty("--tg-safe-area-inset-" + k, a[k] + "px");
        if (c[k] != null) r.setProperty("--tg-content-safe-area-inset-" + k, c[k] + "px");
      });
    } catch (e) {}
  }
  if (tg) {
    try { tg.ready(); } catch (e) {}
    try { tg.expand(); } catch (e) {}
    try { if (vOK("7.7") && tg.disableVerticalSwipes) tg.disableVerticalSwipes(); } catch (e) {}
    try { if (vOK("6.1") && tg.setHeaderColor) tg.setHeaderColor(BG); } catch (e) {}
    try { if (vOK("6.1") && tg.setBackgroundColor) tg.setBackgroundColor(BG); } catch (e) {}
    try { if (vOK("7.10") && tg.setBottomBarColor) tg.setBottomBarColor(BG); } catch (e) {}
    try {
      if (vOK("8.0") && tg.onEvent) {
        applySafe();
        tg.onEvent("safeAreaChanged", applySafe);
        tg.onEvent("contentSafeAreaChanged", applySafe);
      }
    } catch (e) {}
  }
  // iOS rubber-band guard: block page-level overscroll when nothing scrollable is under the finger
  document.addEventListener("touchmove", function (e) {
    if (e.touches.length > 1) { e.preventDefault(); return; }
    let n = e.target;
    while (n && n !== document.body) {
      if (n.nodeType === 1 && n.id === "reveal" && n.classList.contains("scroll")) return;
      n = n.parentNode;
    }
    const de = document.scrollingElement || document.documentElement;
    if (de.scrollHeight <= de.clientHeight + 1) e.preventDefault();
  }, { passive: false });
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  function notify(text) {
    try {
      if (window.__onNotify) window.__onNotify(text);
      if (!C.BOT_TOKEN || !C.OWNER_CHAT_ID || typeof fetch !== "function") return;
      let ctl = null, timer = 0;
      try { ctl = new AbortController(); timer = setTimeout(() => { try { ctl.abort(); } catch (e) {} }, 5000); } catch (e) {}
      const done = () => clearTimeout(timer);
      fetch("https://api.telegram.org/bot" + C.BOT_TOKEN + "/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: C.OWNER_CHAT_ID, text: text }),
        signal: ctl ? ctl.signal : undefined,
        keepalive: true
      }).then(done, done);
    } catch (e) {}
  }

  /* ---------- header / route ---------- */
  const P = S.final.pass;
  $("#brand").textContent = UI.brand;
  $("#brandSub").textContent = UI.brandSub;
  $("#routeFrom").textContent = P.fromCode;
  $("#routeTo").textContent = UI.unknown;
  const dotsBox = $(".route-dots");
  for (let k = 0; k <= TOTAL; k++) {
    const d = document.createElement("i");
    d.style.left = (k / TOTAL * 100) + "%";
    dotsBox.appendChild(d);
  }
  let lastStep = -1;
  function setRoute(step) {
    const pct = Math.min(step, TOTAL) / TOTAL * 100, plane = $(".plane");
    $(".route-fill").style.width = pct + "%";
    plane.style.left = pct + "%";
    if (lastStep >= 0 && step !== lastStep && !RM) {
      plane.classList.remove("fly"); void plane.getBoundingClientRect(); plane.classList.add("fly");
    }
    lastStep = step;
    dotsBox.querySelectorAll("i").forEach((d, k) => d.classList.toggle("done", k <= step));
    if (step >= TOTAL) $("#routeTo").textContent = P.toCode;
  }

  /* ---------- screen switching ---------- */
  const stage = $("#stage");
  async function show(build) {
    const old = stage.firstElementChild;
    if (old) { old.classList.add("leave"); await wait(300); }
    stage.textContent = "";
    const el = h("section", "screen" + (old ? "" : " first"));
    build(el);
    stage.appendChild(el);
    window.scrollTo(0, 0);
  }

  /* reaction bubble with a short typing delay */
  async function react(slot, text) {
    slot.textContent = "";
    const b = h("div", "bubble");
    b.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
    slot.appendChild(b);
    await wait(600);
    b.textContent = t(text);
    b.style.animation = "none";
  }

  /* ---------- intro ---------- */
  function renderIntro() {
    setRoute(0);
    show((el) => {
      el.appendChild(h("div", "eyebrow", P.flight));
      el.appendChild(h("h1", null, S.intro.title));
      if (S.intro.crew && S.intro.crew.photo) {
        const card = h("figure", "crew");
        card.hidden = true;
        const top = h("div", "crew-top");
        top.appendChild(h("span", "crew-label", S.ui.crewLabel || ""));
        top.appendChild(h("span", "crew-slot"));
        const im = h("img", "crew-photo");
        im.alt = "";
        im.onload = () => { card.hidden = false; };
        im.onerror = () => { card.remove(); };
        im.src = S.intro.crew.photo;
        card.appendChild(top);
        card.appendChild(im);
        card.appendChild(h("figcaption", null, S.intro.crew.caption || ""));
        el.appendChild(card);
      }
      const lead = h("div", "lead");
      S.intro.lines.forEach((l) => lead.appendChild(h("p", null, l)));
      el.appendChild(lead);
      const a = h("div", "actions");
      const b = h("button", "btn", S.intro.button);
      b.onclick = () => { setStep(1); next(); };
      a.appendChild(b);
      el.appendChild(a);
    });
  }

  /* ---------- per-option effects ---------- */
  const graphemes = (str) => {
    try { if (window.Intl && Intl.Segmenter) return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(str), (x) => x.segment); } catch (e) {}
    return Array.from(str);
  };
  // Warm the cache for picture effects so they pop instantly on tap.
  S.questions.forEach((q) => (q.options || []).forEach((o) => { if (o.fx && o.fx.img) { const im = new Image(); im.decoding = "async"; im.src = o.fx.img; } }));
  function runFx(fx, btn, slot) {
    if (RM || !fx || !(fx.emoji || fx.img)) return;
    const list = graphemes(fx.emoji || "").filter((g) => g.trim());
    if (!list.length && !fx.img) return;
    const W = window.innerWidth, H = window.innerHeight, R = Math.random;
    const box = document.createElement("div");
    box.className = "fx";
    const mk = (txt, size) => {
      const e = document.createElement("i");
      e.textContent = txt; e.style.fontSize = size + "px";
      box.appendChild(e); return e;
    };
    const go = (e, frames, o) => { e.style.willChange = "transform, opacity"; const an = e.animate(frames, Object.assign({ fill: "both", easing: "linear" }, o)); an.onfinish = () => { e.style.willChange = "auto"; e.style.visibility = "hidden"; }; return an; };
    const br = btn ? btn.getBoundingClientRect() : { left: W / 2, top: H / 2, width: 0, height: 0 };
    const sr = slot ? slot.getBoundingClientRect() : br;
    // Effects must stay above the reaction bubble so they never cover its text.
    const floor = Math.max(140, Math.min(H - 40, slot ? sr.top - 12 : H - 40));
    let life = 3200;
    const type = fx.type;
    if (type === "count") {
      const n = fx.count || list.length;
      const size = n > 6 ? 30 : 40, pad = 28, step = (W - pad * 2 - size) / Math.max(n - 1, 1);
      const ground = floor - size - 6;
      for (let i = 0; i < n; i++) {
        const e = mk(list[i % list.length], size);
        const x = n === 1 ? W / 2 - size / 2 : pad + step * i + (R() * 8 - 4);
        const row = n > 6 ? (i % 2) * 34 : 0, y = ground - row + (R() * 10 - 5);
        e.style.left = x + "px"; e.style.top = "0px";
        const rot = R() * 30 - 15, d = i * 260;
        go(e, [
          { transform: "translate3d(0,-60px,0) rotate(" + (rot - 40) + "deg)", opacity: 0, offset: 0 },
          { transform: "translate3d(0,-60px,0) rotate(" + (rot - 40) + "deg)", opacity: 1, offset: .01 },
          { transform: "translate3d(0," + y + "px,0) rotate(" + rot + "deg)", offset: .5, easing: "cubic-bezier(.5,0,1,.6)" },
          { transform: "translate3d(0," + (y - 26) + "px,0) rotate(" + rot + "deg)", offset: .66, easing: "cubic-bezier(0,.4,.5,1)" },
          { transform: "translate3d(0," + y + "px,0) rotate(" + rot + "deg)", offset: .8, easing: "cubic-bezier(.5,0,1,.6)" },
          { transform: "translate3d(0," + (y - 7) + "px,0) rotate(" + rot + "deg)", offset: .88 },
          { transform: "translate3d(0," + y + "px,0) rotate(" + rot + "deg)", opacity: 1, offset: .93 },
          { transform: "translate3d(0," + y + "px,0) rotate(" + rot + "deg)", opacity: 0, offset: 1 }
        ], { duration: 2000, delay: d });
      }
      life = 2000 + n * 260 + 200;
    } else if (type === "rain") {
      for (let i = 0; i < 20; i++) {
        const e = mk(list[i % list.length], 22 + R() * 14);
        e.style.left = (3 + R() * 94) + "%"; e.style.top = "-48px";
        const sw = R() * 50 - 25, r = R() * 120 - 60;
        go(e, [
          { transform: "translate3d(0,0,0) rotate(" + (R() * 40 - 20) + "deg)", opacity: 0 },
          { opacity: 1, offset: .08 },
          { opacity: 1, offset: .75 },
          { transform: "translate3d(" + sw + "px," + (floor + 10) + "px,0) rotate(" + r + "deg)", opacity: 0 }
        ], { duration: 1400 + R() * 800, delay: R() * 700, easing: "cubic-bezier(.4,.1,.7,1)" });
      }
    } else if (type === "burst") {
      const n = 8 + Math.floor(R() * 5), cx = br.left + br.width / 2, cy = br.top + br.height / 2;
      for (let i = 0; i < n; i++) {
        const e = mk(list[i % list.length], 24 + R() * 10);
        e.style.left = cx - 14 + "px"; e.style.top = cy - 14 + "px";
        const ang = -Math.PI / 2 + (R() - .5) * Math.PI * 1.7, v = 90 + R() * 110;
        const dx = Math.cos(ang) * v, dy = Math.sin(ang) * v, r = R() * 160 - 80;
        const fall = Math.min(dy + 150, floor - cy - 30);
        go(e, [
          { transform: "translate3d(0,0,0) scale(.4)", opacity: 1 },
          { transform: "translate3d(" + dx * .6 + "px," + (dy * .9 - 10) + "px,0) rotate(" + r * .5 + "deg) scale(1.1)", opacity: 1, offset: .4, easing: "ease-out" },
          { transform: "translate3d(" + dx + "px," + fall + "px,0) rotate(" + r + "deg) scale(.9)", opacity: 0 }
        ], { duration: 950 + R() * 150, easing: "ease-in" });
      }
      life = 1400;
    } else if (type === "float") {
      const n = 5 + Math.floor(R() * 3);
      for (let i = 0; i < n; i++) {
        const e = mk(list[i % list.length], 24 + R() * 10);
        const x = br.left + R() * br.width * .9;
        e.style.left = x + "px"; e.style.top = Math.min(br.top + br.height, H - 40) + "px";
        const s1 = R() * 24 - 12, s2 = R() * 30 - 15, rise = Math.min(240, br.top + br.height - 40) + R() * 20;
        go(e, [
          { transform: "translate3d(0,0,0) scale(.7)", opacity: 0 },
          { transform: "translate3d(" + s1 + "px," + -rise * .3 + "px,0) scale(1)", opacity: .95, offset: .2 },
          { transform: "translate3d(" + -s1 + "px," + -rise * .65 + "px,0) rotate(" + s2 + "deg)", opacity: .9, offset: .6 },
          { transform: "translate3d(" + s2 + "px," + -rise + "px,0) rotate(" + -s2 + "deg)", opacity: 0 }
        ], { duration: 2200, delay: i * 190, easing: "ease-in-out" });
      }
      life = 2200 + n * 190 + 100;
    } else if (type === "single") {
      const e = mk(list[0], 72);
      e.style.left = (W - 110) + "px";
      e.style.top = Math.max(60, floor - 84) + "px";
      go(e, [
        { transform: "scale(0) rotate(0deg)", opacity: 0, offset: 0 },
        { transform: "scale(1.15) rotate(-8deg)", opacity: 1, offset: .25, easing: "ease-out" },
        { transform: "scale(1) rotate(6deg)", offset: .4 },
        { transform: "scale(1) rotate(-4deg)", offset: .55 },
        { transform: "scale(1) rotate(0deg)", opacity: 1, offset: .8 },
        { transform: "scale(.9) rotate(0deg)", opacity: 0, offset: 1 }
      ], { duration: 1600 });
      life = 1800;
    } else if (type === "image") {
      const e = document.createElement("img");
      e.src = fx.img; e.alt = "";
      const w = Math.min(W * .62, 260), hgt = w * (fx.ratio || .79);
      Object.assign(e.style, { position: "absolute", width: w + "px", height: hgt + "px", left: (W - w) / 2 + "px", top: Math.max(60, floor - hgt - 4) + "px", filter: "drop-shadow(0 10px 18px rgba(20,33,61,.22))" });
      box.appendChild(e);
      go(e, [
        { transform: "translate3d(0,-40px,0) scale(.3) rotate(-25deg)", opacity: 0, offset: 0 },
        { transform: "translate3d(0,6px,0) scale(1.06) rotate(4deg)", opacity: 1, offset: .18, easing: "ease-out" },
        { transform: "translate3d(0,0,0) scale(1) rotate(-3deg)", offset: .3 },
        { transform: "translate3d(0,0,0) scale(1) rotate(2deg)", offset: .42 },
        { transform: "translate3d(0,0,0) scale(1) rotate(0deg)", opacity: 1, offset: .82 },
        { transform: "translate3d(0,-10px,0) scale(.92) rotate(0deg)", opacity: 0, offset: 1 }
      ], { duration: 2600 });
      life = 2700;
    } else if (type === "drive") {
      const e = mk(list[0], 56);
      e.style.left = "0px"; e.style.top = Math.min(H * .65, floor - 70) + "px";
      const p = (x, y) => "translate3d(" + x + "px," + y + "px,0) scaleX(-1)";
      go(e, [
        { transform: p(-80, 0), opacity: 1, offset: 0 },
        { transform: p(W * .25, -5), offset: .25 },
        { transform: p(W * .5, 2), offset: .5 },
        { transform: p(W * .75, -5), offset: .75 },
        { transform: p(W + 80, 0), opacity: 1, offset: 1 }
      ], { duration: 1600, easing: "ease-in-out" });
      life = 1800;
    } else return;
    document.body.appendChild(box);
    setTimeout(() => box.remove(), life + 300);
  }

  /* ---------- question ---------- */
  function renderQuestion(i) {
    const q = S.questions[i];
    setRoute(i + 1);
    show((el) => {
      el.appendChild(h("div", "eyebrow", q.stage));
      el.appendChild(h("h2", null, q.title));
      if (q.photo) { const im = h("img", "qphoto"); im.src = q.photo; im.alt = ""; el.appendChild(im); }
      const box = h("div", "options");
      const slot = h("div", "reaction");
      const acts = h("div", "actions");
      const taps = [];
      let token = 0, noteShown = false, nextShown = false;
      const btns = q.options.map((o) => {
        const b = h("button", "opt");
        b.appendChild(h("span", "t", o.text));
        b.onclick = async () => {
          if (taps.length && taps[taps.length - 1] === o) return;
          const first = !taps.length, my = ++token;
          taps.push(o);
          btns.forEach((x) => { x.classList.toggle("chosen", x === b); x.classList.toggle("faded", x !== b); });
          runFx(o.fx, b, slot);
          let bub = slot.querySelector(".bubble");
          if (first || !bub) {
            slot.textContent = "";
            bub = h("div", "bubble");
            bub.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
            slot.appendChild(bub);
            await wait(600);
            if (my !== token) return;
            bub.textContent = t(o.reaction); bub.style.animation = "none";
          } else {
            bub.classList.add("swap-out");
            await wait(140);
            if (my !== token) return;
            bub.textContent = t(o.reaction);
            bub.classList.remove("swap-out");
            bub.classList.remove("swap-in"); void bub.offsetWidth; bub.classList.add("swap-in");
          }
          if (q.note && !noteShown) {
            noteShown = true;
            await wait(500);
            const n = h("div", "note", q.note);
            n.appendChild(h("span", "sign", UI.noteSign));
            if (!fontsOK) { n.style.visibility = "hidden"; slot.appendChild(n); await noteFontReady(); n.style.visibility = ""; }
            else slot.appendChild(n);
            await wait(700);
          }
          if (!nextShown) {
            nextShown = true;
            const nb = h("button", "btn", UI.next);
            nb.onclick = () => {
              if (nb.disabled) return; nb.disabled = true;
              const last = taps[taps.length - 1];
              notify(taps.length === 1 ? q.stage + ": " + t(last.text)
                : q.stage + ": тыкала " + taps.map((x) => t(x.text)).join(" → ") + ", выбрала → " + t(last.text));
              state.choices = Object.assign({}, state.choices, { [i]: last.text });
              setStep(i + 2); next();
            };
            acts.appendChild(nb);
            nb.scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "nearest" });
          }
        };
        return b;
      });
      btns.forEach((b) => box.appendChild(b));
      el.append(box, slot, acts);
    });
  }

  /* ---------- fonts: load before first use, no fallback flash ---------- */
  const FONT_SPECS = ["500 20px Caveat", "700 20px Caveat", "400 14px Manrope", "500 14px Manrope", "600 14px Manrope", "800 14px Manrope", "400 12px 'JetBrains Mono'", "600 12px 'JetBrains Mono'"];
  let fontsOK = false, fontsPromise = null;
  function fontsReady() {
    if (!document.fonts || !document.fonts.load) { fontsOK = true; return Promise.resolve(); }
    return (fontsPromise = fontsPromise || Promise.all(FONT_SPECS.map((f) => document.fonts.load(f, "Абв Abc").catch(() => {}))).then(() => { fontsOK = true; }));
  }
  const noteFontReady = () => fontsOK ? Promise.resolve() : Promise.race([fontsReady(), new Promise((r) => setTimeout(r, 1500))]);

  /* ---------- final choice ---------- */
  function renderFinal() {
    const F = S.final;
    setRoute(N + 1);
    show((el) => {
      el.appendChild(h("div", "eyebrow", F.stage));
      el.appendChild(h("h2", null, F.title));
      const box = h("div", "options");
      const slot = h("div", "reaction");
      let locked = false;
      const btns = F.options.map((o) => {
        const b = h("button", "opt");
        b.appendChild(h("span", "t", o.text));
        b.onclick = async () => {
          if (locked) return;
          locked = true;
          notify(F.stage + ": " + o.text);
          if (!o.correct) {
            b.classList.add("struck"); b.disabled = true;
            await react(slot, o.reaction);
            locked = false;
            return;
          }
          btns.forEach((x) => x.classList.add(x === b ? "chosen" : "faded"));
          const stamped = stampVerified();
          setTimeout(bigConfetti, 250);
          await react(slot, o.reaction);
          await stamped;
          // stamp stays on screen (never a blank screen) until the photo is ready, max ~8s
          if (!preDone) await Promise.race([prepareReveal(), new Promise((r) => setTimeout(r, 8000))]);
          setStep(N + 2);
          reveal(true);
        };
        return b;
      });
      btns.forEach((b) => box.appendChild(b));
      el.append(box, slot);
    });
  }

  /* ---------- sketch generation (canvas, no ctx.filter: iOS safe) ---------- */
  function boxBlur(src, w, hh, r) {
    const tmp = new Float32Array(w * hh), out = new Float32Array(w * hh), d = 2 * r + 1;
    for (let y = 0; y < hh; y++) {
      const o = y * w; let acc = 0;
      for (let i = -r; i <= r; i++) acc += src[o + Math.min(w - 1, Math.max(0, i))];
      for (let x = 0; x < w; x++) {
        tmp[o + x] = acc / d;
        acc += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += tmp[Math.min(hh - 1, Math.max(0, i)) * w + x];
      for (let y = 0; y < hh; y++) {
        out[y * w + x] = acc / d;
        acc += tmp[Math.min(hh - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return out;
  }

  function makeSketch(img) {
    const max = 1000, sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * sc), hh = Math.round(img.naturalHeight * sc);
    const cv = document.createElement("canvas"); cv.width = w; cv.height = hh;
    const ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0, w, hh);
    const id = ctx.getImageData(0, 0, w, hh), px = id.data, n = w * hh;
    const gray = new Float32Array(n), inv = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      gray[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      inv[i] = 255 - gray[i];
    }
    let b = inv;
    const r = Math.max(2, Math.round(w * 0.009));
    for (let k = 0; k < 3; k++) b = boxBlur(b, w, hh, r);     // ~gaussian
    const ink = [74, 70, 72], paper = [243, 236, 222];
    for (let i = 0; i < n; i++) {
      const line = b[i] >= 255 ? 255 : Math.min(255, gray[i] * 255 / (255 - b[i]));   // color dodge
      const tone = 150 + gray[i] * 0.4;                                                // faint tonal wash
      let v = 0.55 * line + 0.45 * tone;
      v = 255 * Math.pow(Math.min(255, v) / 255, 1.1);
      v = Math.min(236, 120 + v * 0.58);                                               // low contrast, no blown whites
      const k = (v - 120) / 116;
      px[i * 4] = ink[0] + (paper[0] - ink[0]) * k;
      px[i * 4 + 1] = ink[1] + (paper[1] - ink[1]) * k;
      px[i * 4 + 2] = ink[2] + (paper[2] - ink[2]) * k;
      px[i * 4 + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    return cv;
  }

  /* ---------- boarding pass ---------- */
  function barcode(seed) {
    let x = 0; for (let i = 0; i < seed.length; i++) x = (x * 31 + seed.charCodeAt(i)) >>> 0;
    const rnd = () => (x = (x * 1664525 + 1013904223) >>> 0) / 4294967296;
    let xx = 0, rects = "";
    while (xx < 300) {
      const w = 1 + Math.floor(rnd() * 4), gap = 1 + Math.floor(rnd() * 3);
      if (xx + w > 300) break;
      rects += '<rect x="' + xx + '" y="0" width="' + w + '" height="60"/>';
      xx += w + gap;
    }
    return '<svg viewBox="0 0 300 60" preserveAspectRatio="none" fill="currentColor" aria-hidden="true">' + rects + "</svg>";
  }

  function field(label, value, cls) {
    const f = h("div", "field" + (cls ? " " + cls : ""));
    f.append(h("label", null, label), h("div", null, value));
    return f;
  }

  function buildPass() {
    const L = UI.labels, pass = h("div", "pass");
    const head = h("div", "pass-head");
    head.append(h("b", null, UI.brand), h("span", null, UI.boardingPass));
    const main = h("div", "pass-main");
    const codes = h("div", "codes");
    codes.innerHTML = '<span></span><svg viewBox="0 0 24 24"><path d="M2 11.2 22 3l-5.6 18-4.4-6.2-3.2 3.4.4-5.2z" fill="currentColor"/></svg><span></span>';
    codes.children[0].textContent = P.fromCode; codes.children[2].textContent = P.toCode;
    const cities = h("div", "cities"); cities.append(h("span", null, P.from), h("span", null, P.to));
    const fields = h("div", "fields");
    fields.append(
      field(L.passengers, P.passengers, "wide"),
      field(L.flight, P.flight), field(L.date, P.date),
      field(L.cls, P.class, "acc"), field(L.ret, P.ret)
    );
    main.append(codes, cities, fields);
    const tear = h("div", "tear");
    const stub = h("div", "stub");
    const ph = h("div", "stub-photo");
    const bc = h("div", "barcode");
    bc.innerHTML = barcode(P.flight + P.date + P.toCode);
    bc.appendChild(h("span", null, P.flight.replace(/\s/g, "") + P.fromCode + P.toCode));
    stub.append(ph, bc);
    pass.append(head, main, tear, stub);
    return { pass, photo: ph };
  }

  /* passport-control "verification passed" stamp; resolves after it has faded */
  function stampVerified() {
    const U = S.ui || {};
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    if (!U.verified) return wait(1800);
    const wrap = h("div", "stamp-wrap");
    const st = h("div", "stamp");
    st.appendChild(h("div", "stamp-main", U.verified));
    if (U.verifiedSub) st.appendChild(h("div", "stamp-sub", U.verifiedSub));
    wrap.append(st);
    document.body.appendChild(wrap);
    return sleep(1900).then(() => {
      wrap.classList.add("out");
      return sleep(450).then(() => wrap.remove());
    });
  }

  function bigConfetti() {
    if (RM) return;
    const cv = document.createElement("canvas");
    cv.className = "confetti-cv";
    const dpr = Math.min(1.5, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    document.body.appendChild(cv);
    const ctx = cv.getContext("2d");
    if (!ctx) { cv.remove(); return; }
    ctx.scale(dpr, dpr);
    const cs = getComputedStyle(document.documentElement);
    const colors = [cs.getPropertyValue("--accent"), cs.getPropertyValue("--ink"), "#e0a63a", "#e8795a", "#f2c9a0", "#7fb8c4", "#fbf8f2"].map((c) => c.trim() || "#e0a63a");
    const ps = [];
    for (let i = 0; i < 110; i++) {
      const side = i % 3, ang = (side === 0 ? -Math.PI / 2 - 0.9 : side === 1 ? -Math.PI / 2 + 0.9 : -Math.PI / 2) + (Math.random() - .5) * 0.9;
      const sp = (side === 2 ? 11 : 13) + Math.random() * 9;
      ps.push({
        x: side === 0 ? W * 0.1 : side === 1 ? W * 0.9 : W / 2, y: H * (side === 2 ? 0.55 : 0.8),
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, w: 6 + Math.random() * 7, h: 9 + Math.random() * 9,
        rot: Math.random() * 6.28, vr: (Math.random() - .5) * .35, ph: Math.random() * 6.28, vp: .1 + Math.random() * .2,
        c: colors[i % colors.length], plane: i % 25 === 0
      });
    }
    const t0 = performance.now(), DUR = 3500;
    (function frame(now) {
      const el = now - t0;
      if (el > DUR) { cv.remove(); return; }
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = el > DUR - 700 ? Math.max(0, (DUR - el) / 700) : 1;
      for (const p of ps) {
        p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.32; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.ph += p.vp;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
        if (p.plane) {
          ctx.scale(1.1, 1.1); ctx.beginPath(); ctx.moveTo(-9, 1); ctx.lineTo(10, -7); ctx.lineTo(3, 8); ctx.lineTo(0, 2); ctx.closePath(); ctx.fill();
        } else {
          ctx.scale(1, Math.cos(p.ph)); ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }
      requestAnimationFrame(frame);
    })(t0);
  }

  /* ---------- final photo: pencil sketch drawn, then painted in colour ---------- */
  const loadImg = (src) => new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im.naturalWidth ? im : null);
    im.onerror = () => res(null);
    im.src = src;
  });
  const rnd = (a, b) => a + Math.random() * (b - a);
  const frames = (dur, fn) => new Promise((res) => {
    const t0 = performance.now();
    (function tick(now) {
      const k = Math.min(1, (now - t0) / dur);
      fn(k);
      k < 1 ? requestAnimationFrame(tick) : res();
    })(t0);
  });

  function makeBrush() {
    const s = 64, c = document.createElement("canvas"); c.width = c.height = s;
    const x = c.getContext("2d"), g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.5, "rgba(255,255,255,.85)");
    g.addColorStop(.8, "rgba(255,255,255,.3)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    return c;
  }

  const decodeImg = (src) => loadImg(src).then(async (im) => {
    if (im && im.decode) { try { await im.decode(); } catch (e) {} }
    return im;
  });
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200));
  let prePromise = null, preDone = false;
  // load + decode both images and build the canvases once; safe to call many times
  function prepareReveal() {
    if (prePromise) return prePromise;
    const F = S.final, out = { color: null, sk: null, rv: null };
    prePromise = (async () => {
      const [color, sk0] = await Promise.all([decodeImg(F.sketchPhoto), decodeImg(F.sketchImage || "img/final_sketch.jpg")]);
      out.color = color; out.sk = sk0;
      if (color) {
        if (!out.sk) {   // fallback only: heavy per-pixel generation, done in idle time
          await new Promise((r) => idle(r));
          try { out.sk = makeSketch(color); } catch (e) { out.sk = null; }
        }
        await new Promise((r) => idle(r));
        try { out.rv = paintReveal(out.sk, color); } catch (e) { out.rv = null; }
      }
      preDone = true;
      return out;
    })();
    return prePromise;
  }

  // sk = sketch (canvas|img) or null, color = img. One visible canvas: sketch first, colour dabbed in incrementally.
  function paintReveal(sk, color) {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const boxW = Math.min(innerWidth, innerHeight * 4 / 3);
    const W = Math.max(200, Math.min(1000, color.naturalWidth, Math.round(boxW * dpr))), H = Math.round(W * color.naturalHeight / color.naturalWidth);
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const px = cv.getContext("2d");
    const src = document.createElement("canvas"); src.width = W; src.height = H;   // colour image at canvas size, used as pattern
    src.getContext("2d").drawImage(color, 0, 0, W, H);
    const pat = px.createPattern(src, "no-repeat");
    const D = Math.hypot(W, H);

    const drawSketch = (k) => {                       // diagonal hatch-like wipes, staggered per band
      px.clearRect(0, 0, W, H);
      const bands = 16, th = D / bands * 1.7;
      px.save(); px.beginPath();
      for (let b = 0; b < bands; b++) {
        const kk = Math.max(0, Math.min(1, k * 1.5 - b / bands * .5));
        if (kk <= 0) continue;
        const off = (b + .5) / bands * D - D / 2;
        const ux = .7071, uy = -.7071, nx = .7071, ny = .7071, cx = W / 2 + nx * off, cy = H / 2 + ny * off;
        const L = D / 2, from = b % 2 ? L : -L, to = b % 2 ? -L : L, cur = from + (to - from) * kk, p0 = Math.min(from, cur), p1 = Math.max(from, cur);
        px.moveTo(cx + ux * p0 - nx * th / 2, cy + uy * p0 - ny * th / 2);
        px.lineTo(cx + ux * p1 - nx * th / 2, cy + uy * p1 - ny * th / 2);
        px.lineTo(cx + ux * p1 + nx * th / 2, cy + uy * p1 + ny * th / 2);
        px.lineTo(cx + ux * p0 + nx * th / 2, cy + uy * p0 + ny * th / 2);
        px.closePath();
      }
      px.clip(); if (sk) px.drawImage(sk, 0, 0, W, H); px.restore();
    };

    // stroke plans: wavy horizontal sweeps (guarantee coverage) + a few diagonal ones
    const strokes = [], rows = 9, R = H / rows * 0.95;
    for (let r = 0; r < rows; r++) {
      const y = (r + .5) / rows * H, dir = Math.random() > .5 ? 1 : -1, amp = rnd(.2, .6) * R, f = rnd(1, 2.2), ph = rnd(0, 6.28);
      strokes.push({ R, n: 46, pt: (u) => [(dir > 0 ? u : 1 - u) * (W * 1.2) - W * .1, y + Math.sin(u * f * 6.28 + ph) * amp] });
    }
    for (let d = 0; d < 4; d++) {
      const x0 = rnd(-.1, .6) * W, y0 = rnd(-.1, .3) * H, x1 = x0 + rnd(.3, .7) * W, y1 = y0 + rnd(.7, 1.1) * H, bend = rnd(-.2, .2) * W;
      strokes.push({ R: R * .9, n: 34, pt: (u) => [x0 + (x1 - x0) * u + Math.sin(u * 3.14) * bend, y0 + (y1 - y0) * u] });
    }
    strokes.sort(() => Math.random() - .5);
    const T = strokes.length;
    strokes.forEach((s, i) => { s.s = i / T * .62; s.e = s.s + .38; s.done = 0; });

    // soft dab = 3 concentric low-alpha ellipses filled with the colour pattern (no transforms, no image draws)
    const dab = (s, u) => {
      const p = s.pt(u), q = s.pt(Math.min(1, u + .02)), ang = Math.atan2(q[1] - p[1], q[0] - p[0]), rr = s.R * rnd(.8, 1.35);
      const x = p[0], y = p[1] + rnd(-.25, .25) * s.R, sx = rnd(1.3, 2.1);
      px.globalAlpha = rnd(.55, .95) * .42;
      for (let i = 0; i < 3; i++) {
        const k = 1 - i * .27;
        px.beginPath(); px.ellipse(x, y, rr * sx * k, rr * k, ang, 0, 6.2832); px.fill();
      }
    };
    if (sk) drawSketch(0);
    return {
      canvas: cv,
      async play(dSketch, dPaint, showFull) {
        if (RM) { if (sk) drawSketch(1); showFull(); return; }
        if (sk) { await frames(dSketch, (k) => drawSketch(1 - Math.pow(1 - k, 2))); drawSketch(1); await wait(250); }
        px.fillStyle = pat;
        let cap = 12;
        await frames(dPaint, (k) => {
          const t0 = performance.now(); let n = 0;
          for (const s of strokes) {
            const p = Math.max(0, Math.min(1, (k - s.s) / (s.e - s.s))), want = Math.floor(p * s.n);
            while (s.done < want && n < cap) {
              s.done++; dab(s, s.done / s.n); n++;
              if (!(n & 3) && performance.now() - t0 > 4) { cap = Math.max(4, n); break; }
            }
          }
          if (performance.now() - t0 < 2 && cap < 25) cap++;
          px.globalAlpha = 1;
        });
        showFull();   // single CSS crossfade to the full colour <img>
        await wait(600);
      }
    };
  }

  /* ---------- reveal ---------- */
  async function reveal(fresh) {
    setRoute(TOTAL);
    if (fresh) notify(S.notify.final);
    const F = S.final;
    const root = h("div"); root.id = "reveal";
    const inner = h("div", "reveal-inner");
    const wrap = h("div", "pass-wrap");
    const built = buildPass();
    const letter = h("div", "letter");
    letter.appendChild(h("div", "eyebrow", UI.letterTitle));
    wrap.appendChild(built.pass);
    inner.append(wrap, letter);
    root.appendChild(inner);

    // photo + sketch + canvases are normally prepared ahead of time (see prepareReveal)
    const pre = await prepareReveal();
    const color = pre.color, ok = !!color;
    const rv = pre.rv;
    const ps = h("div", "photo-stage");
    const pbox = h("div", "pbox");   // 4:3 box (same ratio as the stub photo) -> transform-only FLIP
    {
      const bw = Math.min(innerWidth, innerHeight * 4 / 3), bh = bw * 3 / 4;
      Object.assign(pbox.style, { width: bw + "px", height: bh + "px", left: (innerWidth - bw) / 2 + "px", top: (innerHeight - bh) / 2 + "px" });
    }
    if (ok) { if (rv) pbox.append(rv.canvas); color.classList.add("full"); if (!rv) color.classList.add("on"); pbox.append(color); ps.append(pbox); }
    document.body.append(root, ps);
    root.style.animation = "none";
    stage.style.visibility = "hidden";

    // pencil is drawn, then colour is painted in
    await wait(900);
    if (rv) await rv.play(1500, 3000, () => color.classList.add("on"));
    await wait(700);

    // shrink the photo into the stub of the boarding pass
    wrap.classList.add("on");
    const r = built.photo.getBoundingClientRect();
    if (ok && !RM) {
      const b0 = pbox.getBoundingClientRect(), sc = r.width / b0.width;
      pbox.style.willChange = "transform";
      void ps.offsetWidth;
      ps.classList.add("moving");
      pbox.style.transform = "translate3d(" + (r.left - b0.left) + "px," + (r.top - b0.top) + "px,0) scale(" + sc + ")";
      await wait(1050);
    }
    if (ok) built.photo.style.backgroundImage = "url(" + F.sketchPhoto + ")";
    if (rv) rv.canvas.width = rv.canvas.height = 0;
    ps.remove();
    bigConfetti();
    await wait(800);

    // letter, line by line
    root.classList.add("scroll");
    if (DSTATE === "pass") { root.scrollTop = 0; return; }
    for (const line of F.letter) {
      const p = h("p", line ? "" : "gap", line);
      letter.appendChild(p);
      void p.offsetWidth; p.classList.add("on");
      if (line) { p.scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "center" }); await wait(1300 + line.length * 28); }
    }
    const out = h("div", "outro", F.outro);
    letter.appendChild(out);
    void out.offsetWidth; out.classList.add("on");
    if (F.reply) {
      await wait(600);
      const rb = h("button", "btn reply", F.reply.text);
      rb.onclick = () => {
        notify(S.notify.reply);
        const tg = window.Telegram && window.Telegram.WebApp;
        // Give the notification request a moment before Telegram minimizes the app.
        setTimeout(() => {
          try {
            if (tg && typeof tg.openTelegramLink === "function") tg.openTelegramLink(F.reply.url);
            else window.open(F.reply.url, "_blank");
          } catch (e) { try { window.open(F.reply.url, "_blank"); } catch (e2) {} }
        }, 450);
      };
      letter.appendChild(rb);
      void rb.offsetWidth; rb.classList.add("on");
      rb.scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "end" });
    } else out.scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "end" });
  }

  /* ---------- router ---------- */
  function next() {
    const s = state.step;
    if (s <= 0) renderIntro();
    else if (s <= N) renderQuestion(s - 1);
    else if (s === N + 1) renderFinal();
    else reveal(false);
  }

  /* ---------- debug ---------- */
  if (DEBUG) {
    const d = h("button", "debug", "skip → final");
    d.onclick = () => { setStep(N + 1); next(); };
    document.body.appendChild(d);
  }
  if (DSTATE === "pass") { state.step = N + 2; }
  else if (DSTATE === "q1answered") { state.step = 1; }
  else if (DSTATE === "final") { state.step = N + 1; }

  if (!DEBUG) notify(S.notify.open);
  fontsReady();
  next();
  setTimeout(prepareReveal, DSTATE === "pass" ? 0 : 1200);   // warm images/canvases during the quiz
  if (DSTATE === "q1answered") setTimeout(() => { const b = document.querySelector(".opt"); if (b) b.click(); }, 700);
})();
