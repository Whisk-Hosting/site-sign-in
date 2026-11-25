// The little JavaScript the app needs. Every form works without it; it adds the signature pad,
// the camera, live refresh, the kiosk's return to the start, and solving the edge's challenge
// on public forms.
export const js = String.raw`
(() => {
  const body = document.body;

  // ----- Posting forms, solving the proof-of-work challenge when the edge asks for one -----
  const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  const solve = async (ch) => {
    const enc = new TextEncoder();
    for (let n = 0; n <= ch.maxnumber; n++) {
      if (hex(await crypto.subtle.digest("SHA-256", enc.encode(ch.salt + n))) === ch.challenge)
        return btoa(JSON.stringify({ algorithm: ch.algorithm, challenge: ch.challenge, number: n, salt: ch.salt, signature: ch.signature }));
    }
    return "";
  };
  // solved sends a request, and once more with the solution if the edge asks for a challenge.
  const solved = async (url, init) => {
    const res = await fetch(url, { credentials: "same-origin", ...init });
    if (res.status !== 403) return res;
    const err = await res.clone().json().catch(() => null);
    const ch = err && err.error && err.error.code === "CHALLENGE_REQUIRED" && err.error.details && err.error.details.challenge;
    return ch ? fetch(url, { credentials: "same-origin", ...init, headers: { ...(init.headers || {}), "x-altcha": await solve(ch) } }) : res;
  };
  const post = (form, submitter) => {
    const data = new FormData(form);
    if (submitter && submitter.name) data.append(submitter.name, submitter.value);
    return solved(form.action, { method: "POST", body: new URLSearchParams(data).toString(), headers: { "content-type": "application/x-www-form-urlencoded" } });
  };
  // A form on a challenged page asks first with ?_probe, which the app answers with nothing and
  // the edge answers with a challenge. The form then goes as a normal submit with the solution
  // in its altcha field, so the browser shows the answer as it would any other page.
  const hidden = (form, name, value) => { const i = document.createElement("input"); i.type = "hidden"; i.name = name; i.dataset.added = ""; i.value = value; form.append(i); };
  const submitSolved = async (form, submitter) => {
    const url = new URL(form.action, location.href);
    url.searchParams.set("_probe", "1");
    form.querySelectorAll("input[data-added]").forEach((i) => i.remove());
    const res = await fetch(url, { method: "POST", credentials: "same-origin" });
    const err = res.status === 403 ? await res.json().catch(() => null) : null;
    const ch = err && err.error && err.error.code === "CHALLENGE_REQUIRED" && err.error.details && err.error.details.challenge;
    if (ch) hidden(form, "altcha", await solve(ch));
    if (submitter && submitter.name) hidden(form, submitter.name, submitter.value);
    form.submit();
  };

  document.addEventListener("submit", async (e) => {
    const form = e.target;
    const msg = form.getAttribute("data-confirm");
    if (msg && !confirm(msg)) { e.preventDefault(); return; }
    if (form.hasAttribute("data-sign-form") && !signed(form)) { e.preventDefault(); return; }
    if (form.hasAttribute("data-roll")) { e.preventDefault(); roll(form); return; }
    if (!body.hasAttribute("data-challenge") || (form.method || "").toLowerCase() !== "post") return;
    e.preventDefault();
    const btn = e.submitter;
    if (btn) btn.disabled = true;
    try { await submitSolved(form, btn); } catch { if (btn) btn.disabled = false; alert("No connection. Try again."); }
  });

  // ----- Small things -----
  document.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
    const field = document.getElementById(b.getAttribute("data-copy"));
    try { await navigator.clipboard.writeText(field.value); } catch { field.select(); document.execCommand("copy"); }
    const label = b.querySelector(".label");
    if (label) { const was = label.textContent; label.textContent = "Copied"; setTimeout(() => (label.textContent = was), 1500); }
  }));
  document.querySelectorAll("[data-print]").forEach((b) => b.addEventListener("click", () => window.print()));
  document.querySelectorAll("[data-clock]").forEach((el) => {
    const tick = () => (el.textContent = new Intl.DateTimeFormat("en-US", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()).replace(/\s?\b([ap])\.?\s?m\b\.?/gi, (_, x) => " " + x.toLowerCase() + "m"));
    setInterval(tick, 15000);
  });

  // ----- The kiosk goes back to the start when nobody is using it -----
  const home = body.getAttribute("data-idle") || (document.querySelector(".k-top .brand") || {}).getAttribute?.("href");
  const countdown = document.querySelector("[data-countdown]");
  if (countdown && home) {
    let left = Number(countdown.getAttribute("data-countdown"));
    const t = setInterval(() => { left--; countdown.textContent = "Back to the start in " + left + " second" + (left === 1 ? "" : "s"); if (left <= 0) { clearInterval(t); location.href = home; } }, 1000);
  } else if (body.hasAttribute("data-idle")) {
    let last = Date.now();
    ["pointerdown", "keydown", "input"].forEach((ev) => document.addEventListener(ev, () => (last = Date.now()), { passive: true }));
    setInterval(() => { if (Date.now() - last > 90000) location.href = home; }, 5000);
  }

  // ----- Signature pad: strokes kept as SVG path data on a 600 × 220 grid -----
  const pads = new Map();
  document.querySelectorAll("[data-sigpad]").forEach((pad) => {
    const canvas = pad.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const strokes = [];
    let current = null;
    const fit = () => {
      const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      canvas.width = r.width * dpr; canvas.height = r.height * dpr;
      ctx.scale(dpr, dpr); ctx.lineWidth = 2.6; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#1c1b19";
      redraw();
    };
    const toPx = (p) => { const r = canvas.getBoundingClientRect(); return [p[0] / 600 * r.width, p[1] / 220 * r.height]; };
    const redraw = () => {
      const r = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, r.width, r.height);
      strokes.forEach((s) => { ctx.beginPath(); s.forEach((p, i) => { const [x, y] = toPx(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); if (s.length === 1) { const [x, y] = toPx(s[0]); ctx.lineTo(x + .1, y); } ctx.stroke(); });
    };
    const at = (e) => { const r = canvas.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * 600), Math.round((e.clientY - r.top) / r.height * 220)]; };
    canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); current = [at(e)]; strokes.push(current); pad.classList.add("signed"); redraw(); });
    canvas.addEventListener("pointermove", (e) => { if (!current) return; const p = at(e), q = current[current.length - 1]; if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 2) { current.push(p); redraw(); } });
    const end = () => (current = null);
    canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
    pad.querySelector("[data-clear]").addEventListener("click", () => { strokes.length = 0; pad.classList.remove("signed"); redraw(); });
    window.addEventListener("resize", fit);
    fit();
    pads.set(pad, strokes);
  });
  const signed = (form) => {
    const pad = form.querySelector("[data-sigpad]");
    if (!pad) return true;
    const strokes = pads.get(pad) || [];
    const d = strokes.map((s) => "M" + s.map((p) => p[0] + " " + p[1]).join(" L")).join(" ");
    form.querySelector("input[name=signature]").value = d.length > 60000 ? d.slice(0, 60000).replace(/ [^ ]*$/, "") : d;
    if (!strokes.length) { pad.scrollIntoView({ behavior: "smooth", block: "center" }); pad.animate([{ borderColor: "#c2392f" }, { borderColor: "" }], { duration: 1200 }); return false; }
    return true;
  };

  // ----- Camera: a square photo, sent straight to storage -----
  const cam = document.querySelector("[data-camera]");
  if (cam) {
    const video = cam.querySelector("video"), status = cam.querySelector("[data-camera-status]"), snap = cam.querySelector("[data-snap]");
    const form = snap.closest("form");
    let stream = null;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user", width: { ideal: 960 } }, audio: false })
      .then((s) => { stream = s; video.srcObject = s; status.hidden = true; })
      .catch(() => { video.hidden = true; status.textContent = "No camera"; snap.disabled = true; });
    snap.addEventListener("click", async () => {
      if (!stream) return;
      snap.disabled = true; snap.textContent = "Saving…";
      const size = Math.min(video.videoWidth, video.videoHeight), c = document.createElement("canvas");
      c.width = c.height = 640;
      c.getContext("2d").drawImage(video, (video.videoWidth - size) / 2, (video.videoHeight - size) / 2, size, size, 0, 0, 640, 640);
      stream.getTracks().forEach((t) => t.stop());
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
      try {
        const ask = await solved(snap.getAttribute("data-upload-url"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ d: form.querySelector("[name=d]").value }) });
        const up = await ask.json();
        if (!ask.ok) throw new Error(up.error);
        const fd = new FormData();
        Object.entries(up.fields || {}).forEach(([k, v]) => fd.append(k, v));
        fd.append("file", blob, "photo.jpg");
        const put = await fetch(up.url, { method: "POST", body: fd });
        if (!put.ok) throw new Error("storage " + put.status);
        form.querySelector("[name=photo]").value = up.id;
      } catch { /* The visit goes ahead without a photo. */ }
      form.requestSubmit();
    });
  }

  // ----- Sign-out search at the kiosk, as you type -----
  document.querySelectorAll("[data-live-search]").forEach((f) => {
    const input = f.querySelector("input"); let t;
    input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(async () => {
      const url = f.action + "?q=" + encodeURIComponent(input.value);
      const doc = new DOMParser().parseFromString(await (await fetch(url)).text(), "text/html");
      document.querySelector(".k-results").replaceWith(doc.querySelector(".k-results"));
      history.replaceState(null, "", url);
    }, 250); });
    input.focus(); input.setSelectionRange(input.value.length, input.value.length);
  });

  // ----- Live sections refresh on their own -----
  const lives = document.querySelectorAll("[data-live]");
  const refresh = async () => {
    if (document.hidden || document.querySelector("details[open]") || document.activeElement?.matches("input,select,textarea")) return;
    const doc = new DOMParser().parseFromString(await (await fetch(location.href, { headers: { "cache-control": "no-store" } })).text(), "text/html");
    const fresh = doc.querySelectorAll("[data-live]");
    document.querySelectorAll("[data-live]").forEach((el, i) => { if (fresh[i]) el.replaceWith(fresh[i]); });
  };
  if (lives.length) setInterval(() => refresh().catch(() => {}), Number(lives[0].getAttribute("data-live")) * 1000);

  // ----- Roll call: a tap marks someone safe at once -----
  const roll = async (form) => {
    form.classList.toggle("safe");
    const input = form.querySelector("[name=safe]");
    try { await post(form); input.value = input.value === "1" ? "0" : "1"; await refresh(); } catch { form.classList.toggle("safe"); }
  };

  // ----- Uploads in Setup: induction videos and contractor certificates -----
  document.querySelectorAll("[data-upload]").forEach((box) => {
    const input = box.querySelector("input[type=file]"), status = box.querySelector(".status"), bar = box.querySelector(".bar"), fill = bar.querySelector("i");
    input.addEventListener("change", async () => {
      const file = input.files[0]; if (!file) return;
      status.textContent = "Getting ready…"; bar.hidden = false;
      const ask = await solved("/setup/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: box.getAttribute("data-kind"), filename: file.name, content_type: file.type, size: file.size }) });
      const up = await ask.json().catch(() => ({}));
      if (!ask.ok) { status.textContent = up.error || "The upload could not start."; return; }
      const fd = new FormData();
      Object.entries(up.fields || {}).forEach(([k, v]) => fd.append(k, v));
      fd.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", up.url);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) { const p = Math.round(e.loaded / e.total * 100); fill.style.width = p + "%"; status.textContent = "Uploading… " + p + "%"; } };
      xhr.onerror = () => (status.textContent = "The upload failed. Check your connection and try again.");
      xhr.onload = async () => {
        if (xhr.status >= 300) { status.textContent = "Storage refused the file."; return; }
        status.textContent = "Saving…";
        await solved(box.getAttribute("data-upload"), { method: "POST", body: new URLSearchParams({ upload_id: up.id }).toString(), headers: { "content-type": "application/x-www-form-urlencoded" } });
        location.reload();
      };
      xhr.send(fd);
    });
  });
})();
`;
