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
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  if (params.get("reset")) { try { localStorage.removeItem(KEY); } catch (e) {} }
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
  function haptic(kind) {
    try {
      const hf = tg && tg.HapticFeedback;
      if (!hf) return;
      if (kind === "success") hf.notificationOccurred("success"); else hf.impactOccurred("light");
    } catch (e) {}
  }
  function notify(text) {
    try {
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
  function setRoute(step) {
    const pct = Math.min(step, TOTAL) / TOTAL * 100;
    $(".route-fill").style.width = pct + "%";
    $(".plane").style.left = pct + "%";
    dotsBox.querySelectorAll("i").forEach((d, k) => d.classList.toggle("done", k <= step));
    if (step >= TOTAL) $("#routeTo").textContent = P.toCode;
  }

  /* ---------- screen switching ---------- */
  const stage = $("#stage");
  async function show(build) {
    const old = stage.firstElementChild;
    if (old) { old.classList.add("leave"); await wait(220); }
    stage.textContent = "";
    const el = h("section", "screen");
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
      b.onclick = () => { haptic(); setStep(1); next(); };
      a.appendChild(b);
      el.appendChild(a);
    });
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
      let locked = false;
      const btns = q.options.map((o) => {
        const b = h("button", "opt");
        b.appendChild(h("span", "t", o.text));
        b.onclick = async () => {
          if (locked) return;
          locked = true; haptic();
          btns.forEach((x) => x.classList.add(x === b ? "chosen" : "faded"));
          notify(q.stage + ": " + o.text);
          await react(slot, o.reaction);
          if (q.note) {
            await wait(500);
            const n = h("div", "note", q.note);
            n.appendChild(h("span", "sign", UI.noteSign));
            slot.appendChild(n);
            await wait(700);
          }
          const nb = h("button", "btn", UI.next);
          nb.onclick = () => { haptic(); setStep(i + 2); next(); };
          acts.appendChild(nb);
          nb.scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "nearest" });
        };
        return b;
      });
      btns.forEach((b) => box.appendChild(b));
      el.append(box, slot, acts);
    });
  }

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
          locked = true; haptic();
          notify(F.stage + ": " + o.text);
          if (!o.correct) {
            b.classList.add("struck"); b.disabled = true;
            await react(slot, o.reaction);
            locked = false;
            return;
          }
          btns.forEach((x) => x.classList.add(x === b ? "chosen" : "faded"));
          await react(slot, o.reaction);
          await wait(1300);
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
    const max = 1200, sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
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
    const ink = [20, 33, 61], paper = [246, 241, 231];
    for (let i = 0; i < n; i++) {
      let v = b[i] >= 255 ? 255 : Math.min(255, gray[i] * 255 / (255 - b[i]));   // color dodge
      v = 255 * Math.pow(v / 255, 1.25);                                          // deepen lines
      v = Math.max(0, Math.min(255, (v - 128) * 1.12 + 128));                     // slight contrast
      const k = v / 255;
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

  function confetti() {
    if (RM) return;
    const colors = ["#1f7a8c", "#14213d", "#e0a63a", "#f4efe6"];
    for (let i = 0; i < 26; i++) {
      const c = document.createElement("i");
      c.className = "confetti";
      const s = 5 + Math.random() * 6;
      c.style.cssText = "left:" + Math.random() * 100 + "vw;width:" + s + "px;height:" + s * (Math.random() > .5 ? 2 : 1) +
        "px;background:" + colors[i % colors.length] + ";border-radius:" + (Math.random() > .6 ? "50%" : "1px") +
        ";--dx:" + (Math.random() * 120 - 60) + "px;--rot:" + (Math.random() * 720 - 360) + "deg;animation-duration:" +
        (3.2 + Math.random() * 2.4) + "s;animation-delay:" + Math.random() * 0.8 + "s";
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 7000);
    }
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

    // load photo
    const img = new Image();
    let ok = false;
    try {
      img.src = F.sketchPhoto;
      if (img.decode) await img.decode(); else await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      ok = img.naturalWidth > 0;
    } catch (e) { ok = false; }

    const ps = h("div", "photo-stage");
    let color;
    if (ok) {
      let sk = null;
      try { sk = makeSketch(img); } catch (e) { sk = null; }
      color = new Image(); color.src = F.sketchPhoto; color.alt = "";
      if (sk) ps.append(sk, color);
      else { ps.append(color); color.style.webkitMaskImage = color.style.maskImage = "none"; }
    }
    document.body.append(root, ps);
    root.style.animation = "none";
    stage.style.visibility = "hidden";

    // sketch -> colour sweep
    await wait(900);
    if (color) {
      if (RM) color.style.setProperty("--p", "140%");
      else {
        const dur = 3500, t0 = performance.now();
        await new Promise((res) => {
          (function tick(now) {
            const k = Math.min(1, (now - t0) / dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
            color.style.setProperty("--p", (-20 + e * 160) + "%");
            k < 1 ? requestAnimationFrame(tick) : res();
          })(t0);
        });
      }
    }
    haptic("success");
    await wait(700);

    // shrink the photo into the stub of the boarding pass
    wrap.classList.add("on");
    const r = built.photo.getBoundingClientRect();
    if (ok && !RM) {
      ps.classList.add("moving");
      void ps.offsetWidth;
      Object.assign(ps.style, { top: r.top + "px", left: r.left + "px", width: r.width + "px", height: r.height + "px", borderRadius: "8px" });
      await wait(1050);
    }
    if (ok) built.photo.style.backgroundImage = "url(" + F.sketchPhoto + ")";
    ps.remove();
    confetti();
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
    out.scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "end" });
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
  next();
  if (DSTATE === "q1answered") setTimeout(() => { const b = document.querySelector(".opt"); if (b) b.click(); }, 700);
})();
