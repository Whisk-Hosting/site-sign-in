// Setup, for admins: sites and kiosks, visitor types, inductions, people, contractors, settings
// and what was sent. Plain labels and fields.
import { html, raw } from "hono/html";
import { companyState, timeOf, when, type Company, type Induction, type Person, type Site, type VisitorType } from "../model.js";
import type { ApiKey, Kiosk, Message, Settings } from "../store.js";
import { icon, typeIcon, typeIcons } from "./icons.js";
import { notice, type Html } from "./layout.js";

export type Tab = "sites" | "types" | "inductions" | "people" | "contractors" | "settings" | "sent";

const tabs: [Tab, string, keyof typeof icon][] = [
  ["sites", "Sites", "pin"],
  ["types", "Visitor types", "visitor"],
  ["inductions", "Inductions", "shield"],
  ["people", "Staff", "people"],
  ["contractors", "Contractors", "contractor"],
  ["settings", "Settings", "settings"],
  ["sent", "Sent", "mail"],
];

export const frame = (on: Tab, title: string, body: Html, flashText?: string, actions?: Html) => html`
<section class="wrap" style="padding-bottom:72px">
  <div class="page-head"><h1>${title}</h1>${actions ?? ""}</div>
  <nav class="tabs" aria-label="Setup">${tabs.map(([k, label, i]) => html`<a href="/setup/${k}"${k === on ? raw(' aria-current="page"') : ""}>${icon[i]} ${label}</a>`)}</nav>
  ${notice("good", flashText)}
  ${body}
</section>`;

const checked = (on: boolean) => (on ? raw(" checked") : "");
const selected = (on: boolean) => (on ? raw(" selected") : "");
const addRow = (action: string, placeholder: string, label: string) => html`
<form class="row" method="post" action="${action}" style="margin-top:16px">
  <input type="text" name="name" placeholder="${placeholder}" style="flex:1;min-width:200px" required>
  <button class="btn" type="submit">${icon.plus} ${label}</button>
</form>`;

// ----- Sites -----

export const sitesPage = (sites: Site[], counts: Map<number, number>) => html`
<div class="list-card">
  ${sites.map(
    (s) => html`<a href="/setup/sites/${s.id}"><span class="type-ico">${icon.pin}</span><span class="grow"><b>${s.name}</b><small>${s.address || "No address"}${s.archived ? " · Archived" : ""}</small></span>
      <span class="muted small">${counts.get(s.id) ?? 0} kiosk${counts.get(s.id) === 1 ? "" : "s"}</span>${icon.right}</a>`,
  )}
</div>
${addRow("/setup/sites", "Site name", "Add site")}`;

export const sitePage = (p: { site: Site; kiosks: Kiosk[]; tz: string; now: Date; posterQr: Html; posterUrl: string; pairing?: { code: string; url: string; qr: Html } }) => html`
<div class="grid-2" style="gap:18px;align-items:start">
  <form class="card" method="post" action="/setup/sites/${p.site.id}">
    <h2>Site</h2>
    <div class="field"><label for="f-name">Name</label><input id="f-name" name="name" type="text" value="${p.site.name}" required></div>
    <div class="field"><label for="f-address">Address</label><input id="f-address" name="address" type="text" value="${p.site.address}"></div>
    <label class="check"><input type="checkbox" name="archived"${checked(p.site.archived)}> Archived</label>
    <button class="btn primary" type="submit">Save</button>
  </form>
  <div class="card">
    <h2>${icon.qr} Sign in by phone</h2>
    <div class="qr-box">
      <div class="qr">${p.posterQr}</div>
      <div class="row" style="flex-direction:column;align-items:stretch;gap:8px">
        <a class="btn primary" href="/setup/sites/${p.site.id}/poster">${icon.print} Print poster</a>
        <div class="copyfield"><input id="poster-url" type="text" readonly value="${p.posterUrl}"><button class="btn small" type="button" data-copy="poster-url"><span class="label">Copy</span></button></div>
        <form method="post" action="/setup/sites/${p.site.id}/new-poster" data-confirm="Old posters will stop working. Make a new one?"><button class="btn small ghost wide" type="submit">New poster</button></form>
      </div>
    </div>
  </div>
</div>
<div class="card" style="margin-top:18px">
  <div class="spread"><h2 style="margin:0">${icon.tablet} Kiosks</h2>
    <div class="row">
      <form method="post" action="/setup/sites/${p.site.id}/kiosks"><button class="btn" type="submit">${icon.plus} Pair a tablet</button></form>
      <form method="post" action="/setup/sites/${p.site.id}/this-device"><button class="btn primary" type="submit">${icon.tablet} Use this device</button></form>
    </div>
  </div>
  ${p.pairing
    ? html`<div class="notice good" style="margin-top:16px;display:grid;grid-template-columns:120px 1fr;gap:18px;align-items:center">
        <div class="qr-img">${p.pairing.qr}</div>
        <div><div class="small muted">On the tablet, open</div><b>${p.pairing.url}</b><div class="small muted" style="margin-top:8px">and enter</div><div class="pair-code">${p.pairing.code}</div><div class="small muted">Works for 15 minutes.</div></div>
      </div>`
    : ""}
  ${p.kiosks.length
    ? html`<table class="table" style="margin-top:12px"><thead><tr><th>Kiosk</th><th>Last seen</th><th></th></tr></thead><tbody>
        ${p.kiosks.map(
          (k) => html`<tr><td>${k.name}</td><td>${k.paired_at ? (k.last_seen_at ? when(k.last_seen_at, p.tz, p.now) : "Never") : html`<span class="badge warn">Waiting for code</span>`}</td>
            <td style="text-align:right"><form method="post" action="/setup/sites/${p.site.id}/kiosks/${k.id}/delete" class="inline" data-confirm="Remove this kiosk? The tablet will need pairing again."><button class="icon-btn" type="submit" aria-label="Remove">${icon.trash}</button></form></td></tr>`,
        )}</tbody></table>`
    : html`<p class="muted small" style="margin:12px 0 0">No kiosks yet.</p>`}
</div>`;

export const posterPage = (p: { s: Settings; site: Site; qr: Html }) => html`
<section class="wrap" style="padding-top:32px">
  <div class="row no-print" style="justify-content:center;margin-bottom:20px"><a class="btn ghost" href="/setup/sites/${p.site.id}">${icon.left} Back</a><button class="btn primary" type="button" data-print>${icon.print} Print</button></div>
  <div class="poster">
    <div class="brand"><span class="brand-dot"></span>${p.s.business_name}</div>
    <h1>Sign in here</h1>
    <p>Scan with your phone camera.</p>
    <div class="qr">${p.qr}</div>
    <p><b>${p.site.name}</b></p>
  </div>
</section>`;

// ----- Visitor types -----

export const typesPage = (types: VisitorType[], inductions: Induction[]) => html`
<div class="list-card">
  ${types.map(
    (t, i) => html`<div>
      <span class="type-ico">${typeIcon(t.icon)}</span>
      <a class="grow" href="/setup/types/${t.id}" style="text-decoration:none"><b>${t.name}</b><small>${[
        t.contractor ? "Contractor checks" : "",
        t.induction_ids.map((id) => inductions.find((x) => x.id === id)?.title).filter(Boolean).join(", "),
        t.archived ? "Archived" : "",
      ]
        .filter(Boolean)
        .join(" · ") || "No induction"}</small></a>
      <form method="post" action="/setup/types/${t.id}/move" class="inline"><input type="hidden" name="by" value="-1"><button class="icon-btn" type="submit" aria-label="Move up"${i === 0 ? raw(" disabled") : ""}>${icon.up}</button></form>
      <form method="post" action="/setup/types/${t.id}/move" class="inline"><input type="hidden" name="by" value="1"><button class="icon-btn" type="submit" aria-label="Move down"${i === types.length - 1 ? raw(" disabled") : ""}>${icon.down}</button></form>
    </div>`,
  )}
</div>
${addRow("/setup/types", "Type name", "Add type")}`;

export const typePage = (t: VisitorType, inductions: Induction[]) => {
  const qs = [...t.questions, { label: "", required: false }, { label: "", required: false }].slice(0, Math.max(t.questions.length + 1, 2));
  return html`
<form method="post" action="/setup/types/${t.id}" class="stack">
  <div class="card">
    <div class="field"><label for="f-name">Name</label><input id="f-name" name="name" type="text" value="${t.name}" required></div>
    <div class="field"><span class="label">Icon</span><div class="icon-pick">${typeIcons.map((n) => html`<label><input type="radio" name="icon" value="${n}"${checked(t.icon === n)}><span title="${n}">${icon[n]}</span></label>`)}</div></div>
  </div>
  <div class="card">
    <h2>Ask for</h2>
    <label class="check"><input type="checkbox" name="ask_company"${checked(t.ask_company)}> Company</label>
    <label class="check"><input type="checkbox" name="ask_phone"${checked(t.ask_phone)}> Phone number</label>
    <label class="check"><input type="checkbox" name="ask_email"${checked(t.ask_email)}> Email</label>
    <label class="check"><input type="checkbox" name="ask_host"${checked(t.ask_host)}> Who they're here to see</label>
    <label class="check"><input type="checkbox" name="photo"${checked(t.photo)}> Photo <span class="muted small">(when photos are on in Settings)</span></label>
    <label class="check"><input type="checkbox" name="contractor"${checked(t.contractor)}> Check their company's insurance and license</label>
  </div>
  <div class="card">
    <h2>Questions</h2>
    ${qs.map(
      (q, i) => html`<div class="row" style="margin-bottom:10px"><input type="text" name="q${i}" value="${q.label}" placeholder="Question" style="flex:1;min-width:200px"><label class="check" style="margin:0"><input type="checkbox" name="q${i}_required"${checked(q.required)}> Required</label></div>`,
    )}
  </div>
  <div class="card">
    <h2>Inductions</h2>
    ${inductions.length ? inductions.map((i) => html`<label class="check"><input type="checkbox" name="inductions" value="${i.id}"${checked(t.induction_ids.includes(i.id))}> ${i.title}</label>`) : html`<p class="muted">None yet.</p>`}
  </div>
  <div class="card"><label class="check" style="margin:0"><input type="checkbox" name="archived"${checked(t.archived)}> Archived</label></div>
  <div><button class="btn primary" type="submit">Save</button></div>
</form>`;
};

// ----- Inductions -----

export const inductionsPage = (list: Induction[]) => html`
<div class="list-card">
  ${list.map(
    (i) => html`<a href="/setup/inductions/${i.id}"><span class="type-ico">${icon.shield}</span><span class="grow"><b>${i.title}</b><small>${[
      i.questions.length ? `${i.questions.length} questions` : "No quiz",
      i.video_upload_id ? "Video" : "",
      i.valid_months === 0 ? "Every visit" : `Lasts ${i.valid_months} months`,
      `Version ${i.version}`,
      i.archived ? "Archived" : "",
    ]
      .filter(Boolean)
      .join(" · ")}</small></span>${icon.right}</a>`,
  )}
</div>
${addRow("/setup/inductions", "Induction title", "Add induction")}`;

export const inductionPage = (i: Induction, errors: string[]) => {
  const qs = [...i.questions, { prompt: "", choices: ["", "", ""], answer: 0 }];
  return html`
${errors.length ? notice("error", errors.join(" ")) : ""}
<div class="stack">
<form method="post" action="/setup/inductions/${i.id}" class="stack" style="padding:0">
  <div class="card">
    <div class="field"><label for="f-title">Title</label><input id="f-title" name="title" type="text" value="${i.title}" required></div>
    <div class="field"><label for="f-body">Text</label><textarea id="f-body" class="code" name="body">${i.body}</textarea><span class="hint">Markdown: ## heading, **bold**, - list.</span></div>
    <div class="grid-2">
      <div class="field"><label for="f-valid">Lasts</label><select id="f-valid" name="valid_months">${[0, 1, 3, 6, 12, 24, 36].map((m) => html`<option value="${m}"${selected(i.valid_months === m)}>${m === 0 ? "Every visit" : `${m} month${m === 1 ? "" : "s"}`}</option>`)}</select></div>
      <div class="field"><label for="f-pass">Pass mark</label><select id="f-pass" name="pass_mark">${[50, 60, 70, 80, 90, 100].map((m) => html`<option value="${m}"${selected(i.pass_mark === m)}>${m}%</option>`)}</select></div>
    </div>
  </div>
  <div class="card">
    <h2>Quiz</h2>
    ${qs.map(
      (q, n) => html`<div class="ed-question">
        <div class="field"><label for="q${n}">Question ${n + 1}</label><input id="q${n}" name="q${n}" type="text" value="${q.prompt}"></div>
        ${[0, 1, 2, 3].map((j) => html`<div class="ed-choice"><input type="radio" name="q${n}_answer" value="${j}"${checked(q.answer === j && !!q.prompt)} aria-label="Right answer"><input type="text" name="q${n}_c${j}" value="${q.choices[j] ?? ""}" placeholder="Answer ${j + 1}"></div>`)}
      </div>`,
    )}
    <span class="hint muted small">Tick the right answer. Clear a question to remove it.</span>
  </div>
  <div class="card"><label class="check" style="margin:0"><input type="checkbox" name="archived"${checked(i.archived)}> Archived</label></div>
  <div class="row"><button class="btn primary" type="submit">Save</button><a class="btn ghost" href="/setup/inductions/${i.id}/preview">${icon.eye} Preview</a></div>
</form>
<div class="card">
  <h2>${icon.play} Video</h2>
  ${i.video_upload_id
    ? html`<script src="/.whisk/player.js" defer></script><div class="media-frame"><whisk-video media="${i.video_upload_id}"></whisk-video></div>
      <form method="post" action="/setup/inductions/${i.id}/video"><input type="hidden" name="upload_id" value=""><button class="btn danger small" type="submit">${icon.trash} Remove video</button></form>`
    : html`<div class="upload-box" data-upload="/setup/inductions/${i.id}/video" data-kind="video">
        <input type="file" accept="video/*" id="video-file" class="sr"><label for="video-file" class="btn">${icon.upload} Upload a video</label>
        <p class="status muted small" style="margin:10px 0 0"></p><div class="bar" hidden><i></i></div>
      </div>`}
</div>
</div>`;
};

// ----- People -----

export const peoplePage = (people: Person[], sites: Site[]) => html`
<div class="table-wrap"><table class="table">
  <thead><tr><th>Name</th><th>Email</th>${sites.length > 1 ? html`<th>Site</th>` : ""}<th></th></tr></thead>
  <tbody>
  ${people.map(
    (p) => html`<tr${p.archived ? raw(' style="opacity:.55"') : ""}><td colspan="${sites.length > 1 ? 4 : 3}" style="padding:6px 12px">
      <form method="post" action="/setup/people/${p.id}" class="row" style="gap:8px">
        <input type="text" name="name" value="${p.name}" aria-label="Name" style="flex:1;min-width:140px">
        <input type="email" name="email" value="${p.email}" aria-label="Email" placeholder="Email for arrival alerts" style="flex:1.4;min-width:180px">
        ${sites.length > 1 ? html`<select name="site" aria-label="Site" style="width:auto"><option value="">All sites</option>${sites.map((s) => html`<option value="${s.id}"${selected(p.site_id === s.id)}>${s.name}</option>`)}</select>` : ""}
        <label class="check" style="margin:0"><input type="checkbox" name="archived"${checked(p.archived)}> Archived</label>
        <button class="btn small" type="submit">Save</button>
      </form></td></tr>`,
  )}
  </tbody>
</table></div>
<form class="card" method="post" action="/setup/people" style="margin-top:18px">
  <h2>${icon.plus} Add someone</h2>
  <div class="grid-3">
    <div class="field"><label for="f-name">Name</label><input id="f-name" name="name" type="text" required></div>
    <div class="field"><label for="f-email">Email</label><input id="f-email" name="email" type="email"></div>
    ${sites.length > 1 ? html`<div class="field"><label for="f-site">Site</label><select id="f-site" name="site"><option value="">All sites</option>${sites.map((s) => html`<option value="${s.id}">${s.name}</option>`)}</select></div>` : ""}
  </div>
  <button class="btn primary" type="submit">Add</button>
</form>`;

// ----- Contractors -----

const stateBadge = (c: Pick<Company, "insurance_expires" | "licence_expires">, today: string) => {
  const s = companyState(c, today);
  return s.state === "lapsed"
    ? html`<span class="badge bad">${s.lapsed.join(" and ")} expired</span>`
    : s.state === "soon"
      ? html`<span class="badge warn">${s.soon.join(" and ")} expiring</span>`
      : s.state === "ok"
        ? html`<span class="badge good">Current</span>`
        : html`<span class="badge">No dates</span>`;
};

export const contractorsPage = (list: Company[], today: string, policy: string) => html`
<p class="muted small">${policy === "block" ? "Contractors from a company with expired documents are turned away." : "Hosts are warned when a contractor's company has expired documents."} <a href="/setup/settings">Change</a></p>
${list.length
  ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Company</th><th>Insurance</th><th>License</th><th></th></tr></thead><tbody>
      ${list.map(
        (c) => html`<tr${c.archived ? raw(' style="opacity:.55"') : ""}><td><a href="/setup/contractors/${c.id}">${c.name}</a></td><td class="num">${c.insurance_expires ?? "-"}</td><td class="num">${c.licence_expires ?? "-"}</td><td>${stateBadge(c, today)}</td></tr>`,
      )}</tbody></table></div>`
  : html`<div class="empty">${icon.contractor}<h2>No contractor companies</h2></div>`}
${addRow("/setup/contractors", "Company name", "Add company")}`;

export const contractorPage = (c: Company, today: string) => html`
<div class="stack">
<form class="card" method="post" action="/setup/contractors/${c.id}">
  <div class="spread"><h2 style="margin:0">${c.name}</h2>${stateBadge(c, today)}</div>
  <div class="field" style="margin-top:16px"><label for="f-name">Name</label><input id="f-name" name="name" type="text" value="${c.name}" required><span class="hint">Matched to what contractors type as their company.</span></div>
  <div class="field"><label for="f-email">Contact email</label><input id="f-email" name="contact_email" type="email" value="${c.contact_email}"></div>
  <div class="grid-2">
    <div class="field"><label for="f-ins">Insurance expires</label><input id="f-ins" name="insurance_expires" type="date" value="${c.insurance_expires ?? ""}"></div>
    <div class="field"><label for="f-lic">License expires</label><input id="f-lic" name="licence_expires" type="date" value="${c.licence_expires ?? ""}"></div>
  </div>
  <label class="check"><input type="checkbox" name="archived"${checked(c.archived)}> Archived</label>
  <button class="btn primary" type="submit">Save</button>
</form>
<div class="card">
  <h2>${icon.upload} Certificate</h2>
  ${c.certificate_upload_id
    ? html`<div class="row"><a class="btn" href="/setup/contractors/${c.id}/certificate">${icon.download} Open</a>
        <form method="post" action="/setup/contractors/${c.id}/certificate"><input type="hidden" name="upload_id" value=""><button class="btn danger small" type="submit">${icon.trash} Remove</button></form></div>`
    : html`<div class="upload-box" data-upload="/setup/contractors/${c.id}/certificate" data-kind="file">
        <input type="file" accept="application/pdf,image/*" id="cert-file" class="sr"><label for="cert-file" class="btn">${icon.upload} Upload PDF or photo</label>
        <p class="status muted small" style="margin:10px 0 0"></p><div class="bar" hidden><i></i></div>
      </div>`}
</div>
</div>`;

// ----- Settings -----

const zones = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "America/Toronto", "America/Mexico_City", "Europe/London", "Europe/Berlin", "Asia/Tokyo", "Australia/Sydney", "UTC"];

export const settingsPage = (s: Settings, errors: Record<string, string>, locked = false) => html`
<form method="post" action="/setup/settings" class="stack">
  <div class="card">
    <h2>Look</h2>
    <div class="field${errors.business_name ? " bad" : ""}"><label for="f-bn">Business name</label><input id="f-bn" name="business_name" type="text" value="${s.business_name}" required></div>
    <div class="grid-2">
      <div class="field"><label for="f-accent">Color</label><input id="f-accent" name="accent" type="color" value="${s.accent}"></div>
      <div class="field"><label for="f-tz">Time zone</label><select id="f-tz" name="timezone">${[...new Set([s.timezone, ...zones])].map((z) => html`<option${selected(z === s.timezone)}>${z}</option>`)}</select></div>
    </div>
    <div class="field"><label for="f-privacy">Privacy note on the kiosk</label><textarea id="f-privacy" name="privacy_note" style="min-height:70px">${s.privacy_note}</textarea></div>
  </div>
  <div class="card">
    <h2>Signing in</h2>
    <label class="check"><input type="checkbox" name="photos"${checked(s.photos)}> Take photos <span class="muted small">(for types that ask)</span></label>
    <label class="check"><input type="checkbox" name="badges"${checked(s.badges)}> Print badges</label>
    <div class="field" style="margin-top:14px"><span class="label">Contractor with expired documents</span>
      <div class="segmented">
        <label><input type="radio" name="contractor_policy" value="warn"${checked(s.contractor_policy === "warn")}><span>Warn the host</span></label>
        <label><input type="radio" name="contractor_policy" value="block"${checked(s.contractor_policy === "block")}><span>Turn away</span></label>
      </div>
    </div>
    <div class="field"><label for="f-ret">Delete visits after</label><select id="f-ret" name="retention_months">${[3, 6, 12, 24, 36, 60, 84].map((m) => html`<option value="${m}"${selected(s.retention_months === m)}>${m} months</option>`)}</select></div>
  </div>
  <div class="card">
    <h2>Alerts</h2>
    <div class="field${errors.chat_webhook_url ? " bad" : ""}"><label for="f-chat">Slack or Teams webhook</label><input id="f-chat" name="chat_webhook_url"${locked ? raw(" disabled") : ""} type="url" value="${s.chat_webhook_url}" placeholder="https://hooks.slack.com/services/…">${errors.chat_webhook_url ? html`<span class="err">${errors.chat_webhook_url}</span>` : ""}</div>
    <div class="field${errors.admin_email ? " bad" : ""}"><label for="f-admin">Admin email</label><input id="f-admin" name="admin_email"${locked ? raw(" disabled") : ""} type="email" value="${s.admin_email}"><span class="hint">Expiring contractor documents. Replies to emails go here too.</span></div>
    <div class="field${errors.email_from ? " bad" : ""}"><label for="f-from">Send email from</label><input id="f-from" name="email_from"${locked ? raw(" disabled") : ""} type="email" value="${s.email_from}" placeholder="reception@yourbusiness.com"><span class="hint">An address on a domain verified in Whisk. Empty sends from Whisk.</span>${errors.email_from ? html`<span class="err">${errors.email_from}</span>` : ""}</div>
  </div>
  <div><button class="btn primary" type="submit">Save</button></div>
</form>`;

// ----- API keys, on the Settings tab -----

// keys is undefined when they could not be loaded; newKey is shown on this one response only.
export const apiKeysCard = (p: { keys: ApiKey[] | undefined; base: string; tz: string; now: Date; newKey?: string; error?: string; demo: boolean }) => html`
<div class="card" id="api" style="margin-top:18px">
  <h2>${icon.key} API keys</h2>
  <p class="muted small">Scripts and AI agents use the API to do what reception does here: sign people in and out, add expected visitors, keep staff and contractors up to date, and run a roll call.${p.demo ? " In the demo, keys work on the sample data and are deleted with it every night." : ""}</p>
  ${notice("error", p.error)}
  ${p.newKey
    ? html`<div class="notice good" style="display:block"><div style="margin-bottom:8px"><b>Copy the key now. It won't show again.</b></div>
        <div class="copyfield"><input id="new-key" type="text" readonly value="${p.newKey}" aria-label="New API key"><button class="btn small" type="button" data-copy="new-key"><span class="label">Copy</span></button></div></div>`
    : ""}
  ${p.keys === undefined
    ? notice("error", "The keys could not be loaded. Reload the page to try again.")
    : p.keys.length === 0
      ? html`<div class="empty small">${icon.key}<h2>No keys yet</h2><p class="small">Make one below for each script or agent, so you can turn one off without stopping the others.</p></div>`
      : html`<div class="table-wrap"><table class="table"><tbody>${p.keys.map(
          (k) => html`<tr${k.revoked_at ? raw(' style="opacity:.55"') : ""}>
            <td><b>${k.label}</b><br><code class="small">${k.prefix}…</code></td>
            <td class="small muted">Made by ${k.created_by}</td>
            <td class="small muted">${k.revoked_at ? `Turned off ${when(k.revoked_at, p.tz, p.now)}` : k.last_used_at ? `Used ${when(k.last_used_at, p.tz, p.now)}` : "Not used yet"}</td>
            <td style="text-align:right">${k.revoked_at ? "" : html`<form method="post" action="/setup/settings/keys/${k.id}/revoke" data-confirm="Turn off ${k.label}? Anything using it stops working."><button class="btn small ghost danger" type="submit">Turn off</button></form>`}</td>
          </tr>`,
        )}</tbody></table></div>`}
  <form class="row" method="post" action="/setup/settings/keys" style="margin-top:16px;align-items:flex-end">
    <div class="field" style="flex:1;min-width:200px;margin:0"><label for="f-key">Name</label><input id="f-key" name="label" type="text" required maxlength="80" placeholder="Front desk agent"></div>
    <button class="btn" type="submit">${icon.key} Make key</button>
  </form>
  <details style="margin-top:18px"><summary class="small" style="cursor:pointer;font-weight:620">How to use the API</summary>
    <p class="small muted">Base URL: <code>${p.base}/api/v1</code></p>
    <pre class="codeblock">curl ${p.base}/api/v1/on-site \
  -H "Authorization: Bearer YOUR_KEY"

curl ${p.base}/api/v1/invites \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"site_id": 1, "full_name": "Ana Silva", "email": "ana@example.com", "expected_on": "2026-12-01"}'</pre>
    <p class="small muted">GET ${p.base}/api/v1 lists every endpoint. Errors come back as {"error": {"code", "message", "fix"}}.</p>
  </details>
</div>`;

export const sentPage = (list: Message[], tz: string, now: Date) => html`
${list.length
  ? html`<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>To</th><th>What</th><th>Status</th></tr></thead><tbody>
      ${list.map(
        (m) => html`<tr><td class="num">${when(m.created_at, tz, now)}</td><td>${m.channel === "chat" ? "Slack or Teams" : m.to_addr}</td><td>${m.subject || m.text.slice(0, 90)}</td>
          <td>${m.status === "sent" ? html`<span class="badge good">Sent</span>` : m.status === "failed" ? html`<span class="badge bad" title="${m.error}">Failed</span>` : m.status === "demo" ? html`<span class="badge" title="${m.error}">Demo, not sent</span>` : html`<span class="badge warn">Queued</span>`}</td></tr>`,
      )}</tbody></table></div>`
  : html`<div class="empty">${icon.mail}<h2>Nothing sent yet</h2></div>`}`;

export { timeOf };
