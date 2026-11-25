import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import { isColor } from "../model.js";
import type { Settings } from "../store.js";
import { icon } from "./icons.js";

export type Html = HtmlEscapedString | Promise<HtmlEscapedString>;
export type Section = "onsite" | "expected" | "visits" | "setup";

const current = (on: boolean) => (on ? raw(' aria-current="page"') : "");
const V = 6;

const head = (s: Settings, title: string) => {
  const accent = isColor(s.accent) ? s.accent : "#0f766e";
  return html`<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title === s.business_name ? title : `${title} · ${s.business_name}`}</title>
<link rel="preload" href="/assets/fonts/figtree-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/app.css?v=${V}">
<style>:root { --accent: ${raw(accent)}; }</style>
<meta name="theme-color" content="${raw(accent)}">
<link rel="icon" href="data:image/svg+xml,${raw(encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="${accent}"/></svg>`))}">
<script src="/assets/app.js?v=${V}" defer></script>`;
};

export type Staff = { name: string; email?: string; admin: boolean; guest: boolean };

// The staff screens: reception, expected visitors, history and setup.
export const layout = (p: { s: Settings; who: Staff; title: string; nav?: Section; body: Html; challenge?: boolean; poster?: boolean }) => html`<!doctype html>
<html lang="en">
<head>${head(p.s, p.title)}</head>
<body${p.challenge ? raw(" data-challenge") : ""}${p.poster ? raw(' class="print-poster"') : ""}>
${p.who.guest ? html`<div class="demo-bar no-print">Guest view. Nothing is sent; it resets tonight. <a href="/kiosk">Open the kiosk</a> · <a href="/demo/leave">Leave demo</a></div>` : ""}
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="/"><span class="brand-dot"></span>${p.s.business_name}</a>
    <nav class="nav" aria-label="Main">
      <a href="/"${current(p.nav === "onsite")} title="On site">${icon.people}<span class="label">On site</span></a>
      <a href="/expected"${current(p.nav === "expected")} title="Expected">${icon.calendar}<span class="label">Expected</span></a>
      <a href="/visits"${current(p.nav === "visits")} title="History">${icon.list}<span class="label">History</span></a>
      ${p.who.admin ? html`<a href="/setup"${current(p.nav === "setup")} title="Setup">${icon.settings}<span class="label">Setup</span></a>` : ""}
      ${p.who.guest ? "" : html`<a href="/.whisk/logout?return=/" title="Signed in as ${p.who.email ?? p.who.name}">${icon.logout}<span class="label">Sign out</span></a>`}
    </nav>
  </div>
</header>
<main>${p.body}</main>
<footer class="site no-print"><div class="wrap spread"><span>${p.s.business_name}</span><span>Runs on <a href="https://whisk.run">Whisk</a></span></div></footer>
</body>
</html>`;

// The kiosk and the visitor's own phone: no navigation, big targets, the site in the corner.
export const kioskLayout = (p: { s: Settings; title: string; site?: string; body: Html; phone?: boolean; home?: string; challenge?: boolean; idle?: boolean }) => html`<!doctype html>
<html lang="en">
<head>${head(p.s, p.title)}</head>
<body class="kiosk${p.phone ? " phone" : ""}"${p.challenge ? raw(" data-challenge") : ""}${p.idle && p.home ? raw(` data-idle="${p.home}"`) : ""}>
<header class="k-top">
  <a class="brand" href="${p.home ?? "/"}"><span class="brand-dot"></span>${p.s.business_name}</a>
  ${p.site ? html`<span class="where">${icon.pin}${p.site}</span>` : ""}
</header>
${p.body}
</body>
</html>`;

export const notice = (kind: "good" | "error" | "warn" | "", text?: string) =>
  text ? html`<div class="notice ${kind}" role="status">${kind === "good" ? icon.check : kind ? icon.alert : ""}<span>${text}</span></div>` : "";

export const field = (p: { name: string; label: string; value?: string; type?: string; error?: string; hint?: string; required?: boolean; attrs?: string; autocomplete?: string }) => html`
<div class="field${p.error ? " bad" : ""}">
  <label for="f-${p.name}">${p.label}</label>
  <input id="f-${p.name}" name="${p.name}" type="${p.type ?? "text"}" value="${p.value ?? ""}"${p.required ? raw(" required") : ""}${p.autocomplete ? raw(` autocomplete="${p.autocomplete}"`) : ""}${p.attrs ? raw(" " + p.attrs) : ""}>
  ${p.hint ? html`<span class="hint">${p.hint}</span>` : ""}
  ${p.error ? html`<span class="err">${p.error}</span>` : ""}
</div>`;

export const avatar = (name: string, photo: string | null, kind: "visitor" | "contractor" | "staff", initials: string, big = false) =>
  html`<span class="avatar ${kind}${big ? " big" : ""}">${photo ? html`<img src="/.whisk/img/${photo}?w=${big ? 176 : 96}&h=${big ? 176 : 96}&fit=cover" alt="" loading="lazy">` : initials}</span>`;
