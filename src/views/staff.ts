// Reception's screens: who is on site, the roll call, expected visitors and the history.
import { html, raw } from "hono/html";
import { duration, initials, timeOf, when, type RollCall, type Site, type Tally, type VisitorType, type Person } from "../model.js";
import type { Invite, RollCallRow, VisitRow } from "../store.js";
import { icon } from "./icons.js";
import { avatar, notice } from "./layout.js";

const kindOf = (v: VisitRow) => (v.person_id !== null ? "staff" : v.contractor ? "contractor" : "visitor");

const siteTabs = (sites: Site[], current: number | null, path: string) =>
  sites.length > 1
    ? html`<nav class="segmented" aria-label="Sites">
        <a href="${path}"${current === null ? raw(' aria-current="page"') : ""}>All sites</a>
        ${sites.map((s) => html`<a href="${path}?site=${s.id}"${current === s.id ? raw(' aria-current="page"') : ""}>${s.name}</a>`)}
      </nav>`
    : "";

const personRow = (v: VisitRow, tz: string, now: Date, showSite: boolean) => html`
<div class="who${v.warning ? " flagged" : ""}">
  ${avatar(v.name, v.photo_upload_id, kindOf(v), initials(v.name))}
  <div style="min-width:0">
    <a class="name" href="/visits/${v.id}">${v.name}</a>
    <div class="sub">
      ${v.company ? html`<span>${v.company}</span>` : ""}
      ${v.person_id === null ? html`<span class="badge${v.contractor ? " warn" : " soft"}">${v.type_name}</span>` : ""}
      ${v.host_name ? html`<span>${icon.visitor} ${v.host_name}</span>` : ""}
      ${showSite ? html`<span>${icon.pin} ${v.site_name}</span>` : ""}
      ${v.warning ? html`<span class="badge bad">${icon.alert} ${v.warning}</span>` : ""}
    </div>
  </div>
  <div class="when">
    <span><b>${timeOf(v.signed_in_at, tz)}</b>${duration(v.signed_in_at, now)}</span>
    <form method="post" action="/desk/${v.site_id}/out/${v.id}" class="inline"><button class="icon-btn" type="submit" title="Sign ${v.name} out" aria-label="Sign ${v.name} out">${icon.logout}</button></form>
  </div>
</div>`;

export const onSitePage = (p: {
  sites: Site[];
  site: number | null;
  visits: VisitRow[];
  tally: Tally;
  expected: Invite[];
  rollCalls: RollCallRow[];
  tz: string;
  now: Date;
  flash?: string;
  dayLabel: string;
}) => {
  const people = p.visits.filter((v) => v.person_id === null);
  const staff = p.visits.filter((v) => v.person_id !== null);
  const deskSite = p.site ?? p.sites[0]?.id;
  const waiting = p.expected.filter((i) => !i.arrived_at);
  return html`
<section class="wrap">
  <div class="page-head">
    <div>
      <div class="kicker">${icon.calendar} ${p.dayLabel}</div>
      <h1>On site now</h1>
    </div>
    <div class="row">
      ${siteTabs(p.sites, p.site, "/")}
      ${deskSite ? html`<a class="btn primary" href="/desk/${deskSite}/in">${icon.plus} Sign someone in</a>` : ""}
    </div>
  </div>
  ${notice("good", p.flash)}
  ${p.rollCalls.map((r) => html`<a class="notice error" href="/rollcall/${r.id}" style="text-decoration:none">${icon.siren}<span><b>Roll call in progress</b> at ${p.sites.find((s) => s.id === r.site_id)?.name ?? "a site"}. Open it.</span></a>`)}
  <div class="board">
    <div data-live="15">
      <div class="stats">
        <div class="stat lead"><b>${p.tally.total}</b><span>On site</span></div>
        <div class="stat"><b>${p.tally.visitors}</b><span>Visitors</span></div>
        <div class="stat"><b>${p.tally.contractors}</b><span>Contractors</span></div>
        <div class="stat"><b>${p.tally.staff}</b><span>Staff</span></div>
      </div>
      <div class="group-head"><h2>Visitors and contractors</h2><span class="muted small">${people.length}</span></div>
      ${people.length ? html`<div class="people">${people.map((v) => personRow(v, p.tz, p.now, p.site === null && p.sites.length > 1))}</div>` : html`<div class="empty small">${icon.visitor}<h2>Nobody signed in</h2></div>`}
      ${staff.length
        ? html`<div class="group-head"><h2>Staff</h2><span class="muted small">${staff.length}</span></div><div class="people">${staff.map((v) => personRow(v, p.tz, p.now, p.site === null && p.sites.length > 1))}</div>`
        : ""}
    </div>
    <aside class="side">
      <div class="card alarm">
        <h2>${icon.siren} Emergency</h2>
        ${(p.site ? p.sites.filter((s) => s.id === p.site) : p.sites).map(
          (s) => html`<form method="post" action="/rollcall" style="margin-top:8px"><input type="hidden" name="site" value="${s.id}"><button class="btn alarm wide" type="submit">Start roll call${p.sites.length > 1 ? html`: ${s.name}` : ""}</button></form>`,
        )}
      </div>
      <div class="card">
        <div class="spread"><h2 style="margin:0">${icon.calendar} Expected today</h2><a class="btn small ghost" href="/expected">${icon.plus} Add</a></div>
        ${waiting.length
          ? html`<ul class="mini" style="margin-top:10px">${waiting.map(
              (i) => html`<li><span class="dot${i.ready_at ? " live" : ""}"></span><span class="grow"><b>${i.name}</b><small>${[i.company, i.host_name ? `for ${i.host_name}` : ""].filter(Boolean).join(" · ")}</small></span>${i.ready_at ? html`<span class="badge good">Ready</span>` : ""}</li>`,
            )}</ul>`
          : html`<p class="muted small" style="margin:10px 0 0">Nobody else expected.</p>`}
      </div>
    </aside>
  </div>
</section>`;
};

export const rollCallPage = (p: { site: Site; rc: RollCallRow; visits: VisitRow[]; safe: ReadonlySet<number>; summary: RollCall; tz: string; now: Date }) => html`
<section class="wrap" style="max-width:760px">
  <div class="roll-head" data-live="8" data-live-key="head">
    <div class="spread">
      <div>
        <div class="muted small" style="font-weight:600">${icon.siren} Roll call · ${p.site.name} · started ${timeOf(p.rc.started_at, p.tz)}</div>
        <div class="big-count">${p.summary.safe} <span class="muted" style="font-size:.5em;font-weight:650">of ${p.summary.total} safe</span></div>
      </div>
      ${p.rc.ended_at
        ? html`<span class="badge">Ended ${timeOf(p.rc.ended_at, p.tz)}</span>`
        : html`<form method="post" action="/rollcall/${p.rc.id}/end" data-confirm="End the roll call?"><button class="btn" type="submit">End roll call</button></form>`}
    </div>
    <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="${p.summary.total}" aria-valuenow="${p.summary.safe}"><i style="width:${p.summary.total ? Math.round((p.summary.safe / p.summary.total) * 100) : 0}%"></i></div>
    ${p.summary.missing ? html`<p class="small" style="margin:8px 0 0;color:var(--bad);font-weight:650">${p.summary.missing} not yet accounted for</p>` : p.summary.total ? html`<p class="small" style="margin:8px 0 0;color:var(--good);font-weight:650">Everyone is accounted for</p>` : ""}
  </div>
  <div class="roll" data-live="8" data-live-key="list">
    ${p.visits.length === 0 ? html`<div class="empty">${icon.check}<h2>Nobody is signed in here</h2></div>` : ""}
    ${[...p.visits]
      .sort((a, b) => Number(p.safe.has(a.id)) - Number(p.safe.has(b.id)) || a.name.localeCompare(b.name))
      .map(
        (v) => html`<form method="post" action="/rollcall/${p.rc.id}/mark/${v.id}" class="${p.safe.has(v.id) ? "safe" : ""}" data-roll>
          <input type="hidden" name="safe" value="${p.safe.has(v.id) ? "0" : "1"}">
          <button class="tap" type="submit"${p.rc.ended_at ? raw(" disabled") : ""}>
            ${avatar(v.name, v.photo_upload_id, kindOf(v), initials(v.name))}
            <span><b>${v.name}</b><small>${[v.person_id !== null ? "Staff" : v.type_name, v.company, v.host_name ? `with ${v.host_name}` : "", v.phone].filter(Boolean).join(" · ")}</small></span>
            <span class="state">${icon.check}</span>
          </button>
        </form>`,
      )}
  </div>
</section>`;

export const visitsPage = (p: { visits: VisitRow[]; sites: Site[]; types: VisitorType[]; f: { from: string; to: string; site: number | null; type: string; q: string }; tz: string; now: Date; capped: boolean; csvHref: string }) => html`
<section class="wrap" style="padding-bottom:72px">
  <div class="page-head"><h1>History</h1><a class="btn" href="${p.csvHref}">${icon.download} Download CSV</a></div>
  <form class="filters toolbar" method="get" action="/visits">
    <div class="field"><label for="f-from">From</label><input id="f-from" type="date" name="from" value="${p.f.from}"></div>
    <div class="field"><label for="f-to">To</label><input id="f-to" type="date" name="to" value="${p.f.to}"></div>
    ${p.sites.length > 1
      ? html`<div class="field"><label for="f-site">Site</label><select id="f-site" name="site"><option value="">All</option>${p.sites.map((s) => html`<option value="${s.id}"${p.f.site === s.id ? raw(" selected") : ""}>${s.name}</option>`)}</select></div>`
      : ""}
    <div class="field"><label for="f-type">Type</label><select id="f-type" name="type"><option value="">All</option>${[...p.types.map((t) => t.name), "Staff"].map((t) => html`<option${p.f.type === t ? raw(" selected") : ""}>${t}</option>`)}</select></div>
    <div class="field"><label for="f-q">Name or company</label><input id="f-q" type="search" name="q" value="${p.f.q}"></div>
    <button class="btn" type="submit">${icon.search} Show</button>
  </form>
  ${p.visits.length === 0
    ? html`<div class="empty">${icon.list}<h2>No visits</h2></div>`
    : html`<div class="table-wrap"><table class="table">
        <thead><tr><th>Name</th><th>Type</th><th>Company</th><th>Host</th>${p.sites.length > 1 ? html`<th>Site</th>` : ""}<th>In</th><th>Out</th></tr></thead>
        <tbody>${p.visits.map(
          (v) => html`<tr>
            <td><a href="/visits/${v.id}">${v.name}</a>${v.warning ? html` <span class="badge bad" title="${v.warning}">${icon.alert}</span>` : ""}</td>
            <td><span class="badge${v.contractor ? " warn" : v.person_id !== null ? "" : " soft"}">${v.type_name}</span></td>
            <td>${v.company}</td>
            <td>${v.host_name ?? ""}</td>
            ${p.sites.length > 1 ? html`<td>${v.site_name}</td>` : ""}
            <td class="num">${when(v.signed_in_at, p.tz, p.now)}</td>
            <td class="num">${v.signed_out_at ? html`${timeOf(v.signed_out_at, p.tz)}${v.signed_out_by === "automatic" ? html` <span class="badge warn">Auto</span>` : ""}` : html`<span class="badge good">On site</span>`}</td>
          </tr>`,
        )}</tbody></table></div>
        ${p.capped ? html`<p class="muted small" style="margin-top:12px">Showing the latest 500. Narrow the dates or download the CSV for all of them.</p>` : ""}`}
</section>`;

export const visitPage = (p: { v: VisitRow; tz: string; now: Date; admin: boolean; signatures: Map<number, string>; others: number; flash?: string }) => {
  const v = p.v;
  return html`
<section class="wrap" style="max-width:860px;padding-bottom:72px">
  <div class="page-head">
    <div class="row" style="align-items:center;gap:18px">
      ${avatar(v.name, v.photo_upload_id, kindOf(v), initials(v.name), true)}
      <div>
        <div class="kicker">${v.type_name}</div>
        <h1>${v.name}</h1>
        ${v.company ? html`<div class="muted">${v.company}</div>` : ""}
      </div>
    </div>
    ${v.signed_out_at
      ? ""
      : html`<form method="post" action="/desk/${v.site_id}/out/${v.id}"><button class="btn primary" type="submit">${icon.logout} Sign out</button></form>`}
  </div>
  ${notice("good", p.flash)}
  ${v.warning ? notice("error", v.warning) : ""}
  <div class="grid-2" style="gap:18px">
    <div class="card">
      <h2>Visit</h2>
      <dl class="facts">
        <dt>Site</dt><dd>${v.site_name}</dd>
        ${v.host_name ? html`<dt>Host</dt><dd>${v.host_name}</dd>` : ""}
        <dt>In</dt><dd>${when(v.signed_in_at, p.tz, p.now)}</dd>
        <dt>Out</dt><dd>${v.signed_out_at ? html`${when(v.signed_out_at, p.tz, p.now)} <span class="muted small">(${v.signed_out_by})</span>` : html`<span class="badge good">On site</span>`}</dd>
        <dt>Time</dt><dd>${duration(v.signed_in_at, v.signed_out_at ?? p.now)}</dd>
        <dt>By</dt><dd>${({ kiosk: "Kiosk", phone: "Their phone", staff: "Reception", invite: "Invitation" } as Record<string, string>)[v.source] ?? v.source}</dd>
      </dl>
    </div>
    <div class="card">
      <h2>Contact</h2>
      <dl class="facts">
        ${v.phone ? html`<dt>Phone</dt><dd><a href="tel:${v.phone}">${v.phone}</a></dd>` : ""}
        ${v.email ? html`<dt>Email</dt><dd><a href="mailto:${v.email}">${v.email}</a></dd>` : ""}
        ${!v.phone && !v.email ? html`<dt>None</dt><dd></dd>` : ""}
        ${v.answers.map((a) => html`<dt>${a.label}</dt><dd>${a.answer || html`<span class="muted">No answer</span>`}</dd>`)}
      </dl>
    </div>
  </div>
  ${v.inductions.length
    ? html`<div class="card" style="margin-top:18px"><h2>${icon.shield} Inductions</h2>
        <div class="list-card" style="border:0">${v.inductions.map(
          (i) => html`<div style="padding:12px 0"><span class="grow"><b>${i.title}</b><small>Version ${i.version} · ${i.score}%</small></span>
            ${p.signatures.get(i.induction_id) ? html`<svg class="sig" viewBox="0 0 600 220" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Signature"><path d="${p.signatures.get(i.induction_id)}"/></svg>` : ""}</div>`,
        )}</div></div>`
    : ""}
  ${p.admin && v.visitor_id
    ? html`<div class="card" style="margin-top:18px">
        <h2>Privacy</h2>
        <div class="row">
          <form method="post" action="/visits/${v.id}/delete" data-confirm="Delete this visit?"><button class="btn danger" type="submit">${icon.trash} Delete this visit</button></form>
          <form method="post" action="/visitors/${v.visitor_id}/forget" data-confirm="Delete ${v.name} and all ${p.others + 1} of their visits? This can't be undone."><button class="btn danger" type="submit">${icon.trash} Delete everything about ${v.name.split(" ")[0]}</button></form>
        </div>
      </div>`
    : ""}
</section>`;
};

export const expectedPage = (p: { invites: Invite[]; sites: Site[]; types: VisitorType[]; hosts: Person[]; today: string; tz: string; flash?: string; errors: Record<string, string>; values: Record<string, string>; dayLabel: (d: string) => string; baseUrl: string }) => {
  const days = [...new Set(p.invites.map((i) => i.expected_on))];
  return html`
<section class="wrap" style="padding-bottom:72px">
  <div class="page-head"><h1>Expected</h1></div>
  ${notice("good", p.flash)}
  <div class="board">
    <div>
      ${days.length === 0 ? html`<div class="empty">${icon.calendar}<h2>Nobody expected</h2></div>` : ""}
      ${days.map(
        (d) => html`<div class="group-head"><h2>${d === p.today ? "Today" : p.dayLabel(d)}</h2></div>
          <div class="list-card">${p.invites
            .filter((i) => i.expected_on === d)
            .map(
              (i) => html`<div>
                <span class="avatar">${initials(i.name)}</span>
                <span class="grow"><b>${i.name}</b><small>${[i.company, i.type_name, i.host_name ? `for ${i.host_name}` : "", p.sites.length > 1 ? i.site_name : ""].filter(Boolean).join(" · ")}</small></span>
                ${i.arrived_at ? html`<span class="badge good">Arrived</span>` : i.ready_at ? html`<span class="badge soft">Ready</span>` : html`<span class="badge">Code ${i.code}</span>`}
                <details class="menu"><summary class="icon-btn" aria-label="More">${raw("&#8943;")}</summary>
                  <div class="menu-body card" style="position:absolute;right:0;z-index:5;display:grid;gap:6px;min-width:240px">
                    <span class="small muted">Code <b class="num">${i.code}</b></span>
                    <div class="copyfield"><input id="link-${i.id}" type="text" readonly value="${p.baseUrl}/i/${i.token}"><button class="btn small" type="button" data-copy="link-${i.id}"><span class="label">Copy</span></button></div>
                    <form method="post" action="/expected/${i.id}/delete" data-confirm="Remove ${i.name}?"><button class="btn small danger wide" type="submit">${icon.trash} Remove</button></form>
                  </div>
                </details>
              </div>`,
            )}</div>`,
      )}
    </div>
    <aside>
      <form class="card" method="post" action="/expected">
        <h2>${icon.plus} Expect someone</h2>
        ${p.errors.form ? notice("error", p.errors.form) : ""}
        <div class="field${p.errors.name ? " bad" : ""}"><label for="f-name">Name</label><input id="f-name" name="name" type="text" value="${p.values.name ?? ""}">${p.errors.name ? html`<span class="err">${p.errors.name}</span>` : ""}</div>
        <div class="field${p.errors.email ? " bad" : ""}"><label for="f-email">Email <span class="muted">(optional)</span></label><input id="f-email" name="email" type="email" value="${p.values.email ?? ""}">${p.errors.email ? html`<span class="err">${p.errors.email}</span>` : ""}</div>
        <div class="field"><label for="f-company">Company <span class="muted">(optional)</span></label><input id="f-company" name="company" type="text" value="${p.values.company ?? ""}"></div>
        <div class="field${p.errors.day ? " bad" : ""}"><label for="f-day">Day</label><input id="f-day" name="day" type="date" min="${p.today}" value="${p.values.day ?? p.today}">${p.errors.day ? html`<span class="err">${p.errors.day}</span>` : ""}</div>
        ${p.sites.length > 1 ? html`<div class="field"><label for="f-site">Site</label><select id="f-site" name="site">${p.sites.map((s) => html`<option value="${s.id}"${String(s.id) === p.values.site ? raw(" selected") : ""}>${s.name}</option>`)}</select></div>` : html`<input type="hidden" name="site" value="${p.sites[0]?.id ?? ""}">`}
        <div class="field"><label for="f-type">Type</label><select id="f-type" name="type">${p.types.map((t) => html`<option value="${t.id}"${String(t.id) === p.values.type ? raw(" selected") : ""}>${t.name}</option>`)}</select></div>
        <div class="field"><label for="f-host">Host</label><select id="f-host" name="host"><option value="">None</option>${p.hosts.map((h) => html`<option value="${h.id}"${String(h.id) === p.values.host ? raw(" selected") : ""}>${h.name}</option>`)}</select></div>
        <button class="btn primary wide" type="submit">Add</button>
      </form>
    </aside>
  </div>
</section>`;
};
