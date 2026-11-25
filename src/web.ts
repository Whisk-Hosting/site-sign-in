// Small helpers every route shares: who is asking, rendering inside the layouts, reading form
// fields, and the access checks.
import type { Context, Hono, Next } from "hono";
import { html } from "hono/html";
import { demoWho, isDemo } from "./demo.js";
import * as store from "./store.js";
import { kioskLayout, layout, type Html, type Section } from "./views/layout.js";
import { icon } from "./views/icons.js";
import { canAdmin, canStaff, identity, type Identity } from "./whisk.js";

export type Env = { Variables: { id: Identity } };
export type App = Hono<Env>;
export type C = Context<Env>;

// identify works out who is asking once per request: the platform's headers, or the demo guest.
export const identify = async (c: C, next: Next) => {
  c.set("id", (await demoWho(c)) ?? identity((n) => c.req.header(n)));
  await next();
};

export const who = (c: C): Identity => c.get("id") ?? identity((n) => c.req.header(n));
export const actor = (id: Identity) => id.name || id.email || "someone";

export const render = async (c: C, title: string, body: Html, opts: { nav?: Section; status?: 200 | 400 | 403 | 404; poster?: boolean } = {}) => {
  const id = who(c);
  const s = await store.settings();
  return c.html(layout({ s, who: { name: actor(id), email: id.email, admin: canAdmin(id), guest: id.userId === "demo-guest" }, title, nav: opts.nav, body, poster: opts.poster, challenge: isDemo() }), opts.status ?? 200);
};

export const message = (title: string, text: string, link?: { href: string; label: string }) => html`
<section class="wrap" style="padding:80px 24px;max-width:640px">
  <h1>${title}</h1>
  <p class="muted">${text}</p>
  ${link ? html`<a class="btn primary" href="${link.href}">${link.label} ${icon.right}</a>` : ""}
</section>`;

export const kioskMessage = async (c: C, title: string, text: string, opts: { status?: 400 | 403 | 404; home?: string; phone?: boolean } = {}) =>
  c.html(
    kioskLayout({
      s: await store.settings(),
      title,
      phone: opts.phone,
      home: opts.home,
      body: html`<main class="k-main narrow"><div class="done"><div class="tick out">${icon.alert}</div><h1 class="k-title">${title}</h1><p class="k-sub">${text}</p>
        ${opts.home ? html`<a class="btn primary" href="${opts.home}">Start again</a>` : ""}</div></main>`,
    }),
    opts.status ?? 200,
  );

export const notFound = (c: C, what = "page") => render(c, "Not found", message(`No such ${what}`, "It may have been removed.", { href: "/", label: "Back to reception" }), { status: 404 });

// staffOnly lets the team in. Anyone else is sent to sign in, or told this is for staff.
export const staffOnly = async (c: C, next: Next) => {
  const id = who(c);
  if (canStaff(id)) return next();
  if (id.audience === "anonymous") return c.redirect(isDemo() ? "/" : `/.whisk/login?return=${encodeURIComponent(c.req.path)}`);
  return render(c, "Not allowed", message("This part is for staff", "Ask an owner of this business to give you access to this app."), { status: 403 });
};

export const adminOnly = async (c: C, next: Next) => {
  if (canAdmin(who(c))) return next();
  return render(c, "Not allowed", message("This part is for admins", "Ask an owner to add you to the reception-admins group."), { status: 403 });
};

// Messages shown after a redirect, by key, so no text travels in the URL.
const flashes: Record<string, string> = {
  saved: "Saved.",
  added: "Added.",
  deleted: "Deleted.",
  out: "Signed out.",
  in: "Signed in.",
  invited: "Added. Their code is on its way.",
  invited_no_email: "Added. Give them their code.",
  forgotten: "Everything about them is deleted.",
  ended: "Roll call ended.",
  paired: "Kiosk ready.",
  poster: "New poster made. Print it and take the old ones down.",
  removed: "Removed.",
  key_off: "Key turned off. Anything using it stops working now.",
};
export const flash = (c: C) => flashes[c.req.query("ok") ?? ""];

export const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const bool = (v: unknown) => v === "on" || v === "true" || v === "1";
export const idParam = (c: C, name = "id") => {
  const n = Number(c.req.param(name));
  return Number.isInteger(n) && n > 0 ? n : 0;
};
export const posInt = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
};
export const intIn = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
};
export const form = async (c: C) => (await c.req.parseBody({ all: true })) as Record<string, string | string[] | File>;
export const all = (v: unknown) => (Array.isArray(v) ? v : v === undefined ? [] : [v]).filter((x): x is string => typeof x === "string");
