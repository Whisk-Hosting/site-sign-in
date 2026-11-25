// What visitors see: the kiosk at reception, their own phone, and the page an expected visitor
// opens from their invitation. One set of screens; `base` says which of them is asking.
import { html, raw } from "hono/html";
import type { Graded, Induction, Person, VisitorType } from "../model.js";
import { markdown } from "../markdown.js";
import type { Settings } from "../store.js";
import { icon, typeIcon } from "./icons.js";
import type { Html } from "./layout.js";

export type Details = { name: string; company: string; phone: string; email: string; host_id: number | null; answers: { label: string; answer: string }[] };

const steps = (total: number, at: number) => html`<div class="k-steps" aria-hidden="true">${Array.from({ length: total }, (_, i) => html`<i class="${i <= at ? "on" : ""}"></i>`)}</div>`;

const back = (href: string, label = "Back") => html`<a class="k-back" href="${href}">${icon.left} ${label}</a>`;

export const welcome = (p: { s: Settings; base: string; hello: string; posterQr?: Html; staff: boolean; codes: boolean; clock: string }) => html`
<main class="k-main k-welcome">
  <div>
    <div class="k-clock" data-clock>${p.clock}</div>
    <h1 class="k-hello">${p.hello}</h1>
  </div>
  <div class="k-big">
    <a class="k-btn primary" href="${p.base}/in">${icon.login}<span><b>Sign in</b><small>Visitors, contractors and deliveries</small></span></a>
    <a class="k-btn" href="${p.base}/out">${icon.logout}<span><b>Sign out</b><small>On your way?</small></span></a>
  </div>
  <div class="k-links">
    ${p.codes ? html`<a class="k-pill" href="${p.base}/code">${icon.key} I have a code</a>` : ""}
    ${p.staff ? html`<a class="k-pill" href="${p.base}/staff">${icon.staff} Staff in and out</a>` : ""}
  </div>
  <div class="k-foot">
    <p>${p.s.privacy_note}</p>
    ${p.posterQr ? html`<div class="qr-img"><div class="qr">${p.posterQr}</div><span>Sign in on your phone</span></div>` : ""}
  </div>
</main>`;

export const chooseType = (p: { base: string; types: VisitorType[]; home: string; title?: string }) => html`
<main class="k-main">
  ${back(p.home)}
  <h1 class="k-title">${p.title ?? "What brings you in?"}</h1>
  <p class="k-sub">Choose one.</p>
  <div class="k-types">
    ${p.types.map((t) => html`<a class="k-type" href="${p.base}/in/${t.id}"><span class="type-ico">${typeIcon(t.icon)}</span><b>${t.name}</b></a>`)}
  </div>
</main>`;

const input = (p: { name: string; label: string; value: string; type?: string; error?: string; autocomplete?: string; required?: boolean; mode?: string }) => html`
<div class="field${p.error ? " bad" : ""}">
  <label for="f-${p.name}">${p.label}${p.required === false ? html` <span class="muted">(optional)</span>` : ""}</label>
  <input id="f-${p.name}" name="${p.name}" type="${p.type ?? "text"}" value="${p.value}"${p.autocomplete ? raw(` autocomplete="${p.autocomplete}"`) : ""}${p.mode ? raw(` inputmode="${p.mode}"`) : ""}>
  ${p.error ? html`<span class="err">${p.error}</span>` : ""}
</div>`;

export const detailsForm = (p: { base: string; type: VisitorType; hosts: Person[]; d: Details; errors: Record<string, string>; total: number; backTo: string; welcomeBack?: string; action?: string; draft?: string }) => html`
<main class="k-main narrow">
  ${back(p.backTo)}
  ${steps(p.total, 0)}
  <h1 class="k-title">${p.welcomeBack ? `Welcome back, ${p.welcomeBack}` : p.type.name}</h1>
  <p class="k-sub">${p.welcomeBack ? "Check these are still right." : "Your details."}</p>
  <form class="k-form" method="post" action="${p.action ?? `${p.base}/in/${p.type.id}`}" novalidate>
    ${p.draft ? html`<input type="hidden" name="d" value="${p.draft}">` : ""}
    ${input({ name: "name", label: "Full name", value: p.d.name, error: p.errors.name, autocomplete: "name" })}
    ${p.type.ask_company ? input({ name: "company", label: "Company", value: p.d.company, error: p.errors.company, autocomplete: "organization", required: p.type.contractor ? undefined : false }) : ""}
    ${p.type.ask_phone ? input({ name: "phone", label: "Phone number", value: p.d.phone, type: "tel", error: p.errors.phone, autocomplete: "tel", mode: "tel" }) : ""}
    ${p.type.ask_email ? input({ name: "email", label: "Email", value: p.d.email, type: "email", error: p.errors.email, autocomplete: "email", mode: "email" }) : ""}
    ${p.type.ask_host && p.hosts.length
      ? html`<div class="field${p.errors.host_id ? " bad" : ""}">
          <label for="f-host">Here to see</label>
          <select id="f-host" name="host_id">
            <option value="">Choose someone</option>
            ${p.hosts.map((h) => html`<option value="${h.id}"${h.id === p.d.host_id ? raw(" selected") : ""}>${h.name}</option>`)}
          </select>
          ${p.errors.host_id ? html`<span class="err">${p.errors.host_id}</span>` : ""}
        </div>`
      : ""}
    ${p.type.questions.map((q, i) =>
      html`<div class="field${p.errors[`q${i}`] ? " bad" : ""}">
        <label for="f-q${i}">${q.label}${q.required ? "" : html` <span class="muted">(optional)</span>`}</label>
        <input id="f-q${i}" name="q${i}" type="text" value="${p.d.answers[i]?.answer ?? ""}">
        ${p.errors[`q${i}`] ? html`<span class="err">${p.errors[`q${i}`]}</span>` : ""}
      </div>`,
    )}
    <div class="k-actions"><span></span><button class="btn primary" type="submit">Continue ${icon.right}</button></div>
  </form>
</main>`;

export const inductionPage = (p: { base: string; ind: Induction; draft: string; total: number; at: number; graded?: Graded; answers?: (number | null)[]; errors?: Record<string, string>; video: boolean; homeHref: string }) => html`
<main class="k-main narrow">
  ${back(p.homeHref, "Cancel")}
  ${steps(p.total, p.at)}
  <h1 class="k-title">${p.ind.title}</h1>
  <p class="k-sub">Read this, then sign at the bottom.</p>
  ${p.ind.video_upload_id && p.video ? html`<script src="/.whisk/player.js" defer></script><div class="media-frame"><whisk-video media="${p.ind.video_upload_id}"></whisk-video></div>` : ""}
  <form method="post" action="${p.base}/induction" data-sign-form>
    <input type="hidden" name="d" value="${p.draft}">
    <div class="k-card"><div class="prose">${raw(markdown(p.ind.body))}</div></div>
    ${p.ind.questions.length
      ? html`<div class="k-card">
          <h2>Check what you know</h2>
          ${p.graded && !p.graded.passed ? html`<div class="notice error" role="alert">${icon.alert}<span>Not quite. Have another look at the ones marked and try again.</span></div>` : ""}
          ${p.ind.questions.map(
            (q, i) => html`<fieldset class="question">
              <legend><span class="qn">Question ${i + 1}</span>${q.prompt}</legend>
              ${q.choices.map(
                (c, j) =>
                  html`<label class="choice${p.graded?.wrong.includes(i) && p.answers?.[i] === j ? " wrong" : ""}"><input type="radio" name="a${i}" value="${j}"${p.answers?.[i] === j && !p.graded?.wrong.includes(i) ? raw(" checked") : ""}> ${c}</label>`,
              )}
            </fieldset>`,
          )}
        </div>`
      : ""}
    <div class="k-card">
      <h2>Sign</h2>
      <label class="check"><input type="checkbox" name="agree"${p.answers ? raw(" checked") : ""}> I have read and understood this, and will follow it.</label>
      ${p.errors?.agree ? html`<p class="field"><span class="err">${p.errors.agree}</span></p>` : ""}
      <div class="sigpad" data-sigpad>
        <canvas></canvas>
        <div class="hintline"></div>
        <span class="placeholder">Sign here with your finger</span>
        <button type="button" class="btn small ghost" data-clear>Clear</button>
      </div>
      <input type="hidden" name="signature" value="">
      ${p.errors?.signature ? html`<p class="field"><span class="err">${p.errors.signature}</span></p>` : ""}
    </div>
    <div class="k-actions"><span></span><button class="btn primary" type="submit">I agree ${icon.right}</button></div>
  </form>
</main>`;

export const photoPage = (p: { base: string; draft: string; total: number; at: number; homeHref: string }) => html`
<main class="k-main narrow" data-camera>
  ${back(p.homeHref, "Cancel")}
  ${steps(p.total, p.at)}
  <h1 class="k-title">A quick photo</h1>
  <p class="k-sub">For your badge and so your host knows who to look for.</p>
  <div class="camera"><video playsinline muted autoplay></video><span data-camera-status>${icon.camera}</span></div>
  <form method="post" action="${p.base}/photo">
    <input type="hidden" name="d" value="${p.draft}">
    <input type="hidden" name="photo" value="">
    <div class="k-actions">
      <button class="btn ghost" type="submit" name="skip" value="1">Skip</button>
      <button class="btn primary" type="button" data-snap data-upload-url="${p.base}/upload">${icon.camera} Take photo</button>
    </div>
  </form>
</main>`;

export const blocked = (p: { home: string; warning: string; hostName?: string }) => html`
<main class="k-main narrow">
  <div class="done">
    <div class="tick stop">${icon.alert}</div>
    <h1 class="k-title">Please see reception</h1>
    <p class="k-sub">We can't sign you in yet: ${p.warning}. ${p.hostName ? `${p.hostName} can sort this out.` : ""}</p>
    <a class="btn primary" href="${p.home}">Done</a>
  </div>
</main>`;

export const badge = (p: { s: Settings; name: string; company: string; type: string; host?: string; site: string; date: string; photo: string | null }) => html`
<div class="vbadge print-me">
  <div class="band">${p.type}</div>
  <div class="body">
    ${p.photo ? html`<img class="ph" src="/.whisk/img/${p.photo}?w=240&h=240&fit=cover" alt="">` : ""}
    <div class="nm">${p.name}</div>
    ${p.company ? html`<div class="co">${p.company}</div>` : ""}
    <div class="meta">
      ${p.host ? html`<span>Visiting <b>${p.host}</b></span>` : ""}
      <span>${p.site} · ${p.date}</span>
      <span><b>${p.s.business_name}</b></span>
    </div>
  </div>
</div>`;

export const signedIn = (p: { home: string; first: string; host?: string; warning?: string; badge?: Html; print: boolean; phone: boolean; outAction?: string }) => html`
<main class="k-main narrow">
  <div class="done">
    <div class="tick">${icon.check}</div>
    <h1 class="k-title">You're signed in, ${p.first}</h1>
    <p class="k-sub">${p.host ? `We've let ${p.host} know you're here.` : "Welcome."}</p>
    ${p.phone && p.badge ? html`<div class="badge-preview">${p.badge}</div>` : ""}
    <div class="k-actions" style="justify-content:center">
      ${p.print && p.badge && !p.phone ? html`<button class="btn" type="button" data-print>${icon.print} Print badge</button>` : ""}
      ${p.phone && p.outAction ? html`<form method="post" action="${p.outAction}"><button class="btn primary" type="submit">${icon.logout} Sign out when you leave</button></form>` : html`<a class="btn primary" href="${p.home}">Done</a>`}
    </div>
    ${!p.phone && p.badge ? html`<div style="position:absolute;left:-9999px">${p.badge}</div>` : ""}
    ${p.phone ? "" : html`<p class="countdown" data-countdown="20">Back to the start in 20 seconds</p>`}
  </div>
</main>`;

export const goodbye = (p: { home: string; first: string; phone: boolean }) => html`
<main class="k-main narrow">
  <div class="done">
    <div class="tick out">${icon.check}</div>
    <h1 class="k-title">Thanks, ${p.first}. See you next time.</h1>
    <p class="k-sub">You're signed out.</p>
    ${p.phone ? "" : html`<a class="btn primary" href="${p.home}">Done</a><p class="countdown" data-countdown="8">Back to the start in 8 seconds</p>`}
  </div>
</main>`;

export const signOutSearch = (p: { base: string; home: string; q: string; results: { id: number; label: string; company: string; since: string }[] }) => html`
<main class="k-main narrow">
  ${back(p.home)}
  <h1 class="k-title">Sign out</h1>
  <p class="k-sub">Start typing your name.</p>
  <form class="k-form" method="get" action="${p.base}/out" data-live-search>
    <div class="field"><label class="sr" for="f-q">Your name</label><input id="f-q" name="q" type="search" value="${p.q}" autocomplete="off" autofocus placeholder="Your name"></div>
  </form>
  <div class="k-results">
    ${p.results.map(
      (r) => html`<form method="post" action="${p.base}/out/${r.id}"><button type="submit"><span class="grow"><b>${r.label}</b><br><span class="muted">${r.company ? `${r.company} · ` : ""}in since ${r.since}</span></span>${icon.logout}</button></form>`,
    )}
    ${p.q.trim().length >= 2 && p.results.length === 0 ? html`<p class="muted">Nobody on site by that name. Ask at reception.</p>` : ""}
  </div>
</main>`;

export const codeEntry = (p: { base: string; home: string; error?: string; value: string }) => html`
<main class="k-main narrow">
  ${back(p.home)}
  <h1 class="k-title">Your code</h1>
  <p class="k-sub">It's in the email we sent you.</p>
  <form class="k-form" method="post" action="${p.base}/code">
    <div class="field${p.error ? " bad" : ""}">
      <label class="sr" for="f-code">Code</label>
      <input class="code-input" id="f-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" value="${p.value}" autofocus>
      ${p.error ? html`<span class="err">${p.error}</span>` : ""}
    </div>
    <div class="k-actions"><span></span><button class="btn primary" type="submit">Continue ${icon.right}</button></div>
  </form>
</main>`;

export const staffBoard = (p: { base: string; home: string; people: { id: number; name: string; in: boolean }[] }) => html`
<main class="k-main">
  ${back(p.home)}
  <h1 class="k-title">Staff in and out</h1>
  <p class="k-sub">Tap your name.</p>
  <div class="k-results" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">
    ${p.people.map(
      (x) => html`<form method="post" action="${p.base}/staff/${x.id}"><button type="submit"><span class="dot${x.in ? " live" : ""}"></span><span class="grow"><b>${x.name}</b><br><span class="muted">${x.in ? "In" : "Out"}</span></span>${x.in ? icon.logout : icon.login}</button></form>`,
    )}
  </div>
</main>`;

export const pairPage = (p: { error?: string }) => html`
<main class="k-main narrow">
  <h1 class="k-title">Set up this kiosk</h1>
  <p class="k-sub">Enter the code from Setup, Sites, on a signed-in device.</p>
  <form class="k-form" method="post" action="/kiosk/pair">
    <div class="field${p.error ? " bad" : ""}">
      <label class="sr" for="f-code">Pairing code</label>
      <input class="code-input" id="f-code" name="code" type="text" inputmode="numeric" maxlength="6" autocomplete="off" autofocus>
      ${p.error ? html`<span class="err">${p.error}</span>` : ""}
    </div>
    <div class="k-actions"><span></span><button class="btn primary" type="submit">Pair ${icon.right}</button></div>
  </form>
</main>`;

export const phoneOnSite = (p: { base: string; first: string; since: string; site: string; outAction: string; badge: Html }) => html`
<main class="k-main narrow">
  <div class="done">
    <div class="tick">${icon.check}</div>
    <h1 class="k-title">You're on site, ${p.first}</h1>
    <p class="k-sub">At ${p.site} since ${p.since}.</p>
    <div class="badge-preview">${p.badge}</div>
    <form method="post" action="${p.outAction}"><button class="btn primary" type="submit" style="padding:18px 28px;font-size:1.1rem">${icon.logout} Sign out</button></form>
  </div>
</main>`;

export const inviteStart = (p: { base: string; name: string; day: string; site: string; address: string; host: string | null; ready: boolean; today: boolean; code: string }) => html`
<main class="k-main narrow">
  <h1 class="k-title">Hi ${p.name.split(" ")[0]}</h1>
  <p class="k-sub">You're expected at ${p.site} on ${p.day}${p.host ? `, to see ${p.host}` : ""}.</p>
  ${p.address ? html`<div class="k-note" style="margin-bottom:16px">${icon.pin}<span>${p.address}</span></div>` : ""}
  ${p.ready
    ? html`<div class="k-card" style="text-align:center">
        <h2>You're all set</h2>
        <p class="muted">At reception, tap "I have a code" and type</p>
        <p class="pair-code">${p.code}</p>
        ${p.today ? html`<form method="post" action="${p.base}/arrive"><button class="btn primary wide" type="submit">${icon.login} I'm here now</button></form>` : ""}
      </div>`
    : html`<div class="k-card">
        <h2>Details and induction</h2>
        <a class="btn primary wide" href="${p.base}/in">Start ${icon.right}</a>
      </div>`}
</main>`;
