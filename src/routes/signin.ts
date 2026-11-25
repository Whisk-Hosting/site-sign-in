// Signing in and out. The same steps run in four places, each a "channel":
//   /kiosk          the tablet at reception, paired to a site with a cookie
//   /s/<poster>     a visitor's own phone, from the QR poster at a site
//   /i/<invite>     an expected visitor getting ready from their invitation
//   /desk/<site>    a member of staff signing someone in for them
// A sign-in in progress travels between steps in a sealed draft (model.seal), so nothing is
// stored until it is finished.
import type { Next } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { html, raw } from "hono/html";
import QRCode from "qrcode";
import { demoTick, isDemo } from "../demo.js";
import { admit, ampm, checkDetails, dayLabel, findOnSite, grade, inductionsDue, isSignature, localDay, passExpiry, phoneKey, sameVisitor, seal, shortName, timeOf, unseal, type Details, type Site, type VisitorType } from "../model.js";
import { arrived, baseUrl } from "../notify.js";
import * as store from "../store.js";
import * as k from "../views/kiosk.js";
import { kioskLayout, type Html } from "../views/layout.js";
import { staffOnly, who, actor, form, kioskMessage, type App, type C } from "../web.js";
import { canStaff, devStub, log, whiskApi } from "../whisk.js";

export const KIOSK_COOKIE = "kiosk";
const ME_COOKIE = "me";
const VISIT_COOKIE = "visit";
const DRAFT_HOURS = 2;

type Kind = "kiosk" | "phone" | "invite" | "desk";
type Channel = { kind: Kind; base: string; home: string; site: Site; invite?: store.Invite };

type DraftPass = { induction_id: number; version: number; score: number; signature: string };
type Draft = {
  site: number;
  type: number;
  visitor: number | null;
  invite: number | null;
  company: number | null;
  warning: string;
  details: Details;
  due: number[];
  passes: DraftPass[];
  photo: string | null;
  photoDone: boolean;
  exp: number;
};

const cookieOpts = (days: number) => ({ httpOnly: true, secure: true, sameSite: "Lax" as const, path: "/", maxAge: days * 86400 });

const page = async (c: C, ch: Channel, title: string, body: Html, opts: { status?: 200 | 400 | 403 | 404; idle?: boolean } = {}) =>
  c.html(
    kioskLayout({ s: await store.settings(), title, site: ch.site.name, body, phone: ch.kind === "phone" || ch.kind === "invite", home: ch.home, challenge: ch.kind === "phone" || ch.kind === "invite" || isDemo(), idle: opts.idle ?? ch.kind === "kiosk" }),
    opts.status ?? 200,
  );

const qr = async (text: string) => raw(await QRCode.toString(text, { type: "svg", margin: 1, color: { dark: "#1c1b19", light: "#ffffff" } }));

const emptyDetails = (): Details => ({ name: "", company: "", phone: "", email: "", host_id: null, answers: [] });

// ----- Channels -----

type Resolve = (c: C) => Promise<Channel | Response>;

const kioskChannel: Resolve = async (c) => {
  const cookie = getCookie(c, KIOSK_COOKIE);
  const kiosk = cookie ? await store.kioskByCookie(cookie) : undefined;
  const site = kiosk ? await store.site(kiosk.site_id) : undefined;
  if (!site || site.archived) return c.redirect("/kiosk/pair");
  return { kind: "kiosk", base: "/kiosk", home: "/kiosk", site };
};

const phoneChannel: Resolve = async (c) => {
  const site = await store.siteByPoster(c.req.param("poster") ?? "");
  if (!site) return kioskMessage(c, "This poster is out of date", "Ask at reception for the new one.", { status: 404, phone: true });
  const base = `/s/${site.poster_token}`;
  return { kind: "phone", base, home: base, site };
};

const inviteChannel: Resolve = async (c) => {
  const invite = await store.inviteByToken(c.req.param("invite") ?? "");
  const site = invite ? await store.site(invite.site_id) : undefined;
  if (!invite || !site) return kioskMessage(c, "This link has expired", "Ask the person who invited you for a new one.", { status: 404, phone: true });
  const base = `/i/${invite.token}`;
  return { kind: "invite", base, home: base, site, invite };
};

const deskChannel: Resolve = async (c) => {
  const site = await store.site(Number(c.req.param("site")));
  if (!site || site.archived) return c.redirect("/");
  return { kind: "desk", base: `/desk/${site.id}`, home: "/", site };
};

// ----- Steps -----

const usableTypes = async () => (await store.types()).filter((t) => !t.archived);

const needsPhoto = (ch: Channel, s: store.Settings, t: VisitorType) => s.photos && t.photo && ch.kind !== "invite";

const stepCount = (ch: Channel, s: store.Settings, t: VisitorType, due: number) => 2 + due + (needsPhoto(ch, s, t) ? 1 : 0);

const readDraft = async (c: C, ch: Channel, body: Record<string, unknown>): Promise<Draft | undefined> => {
  const d = unseal<Draft>(await store.secret(), typeof body.d === "string" ? body.d : undefined);
  return d && d.site === ch.site.id && d.exp > Date.now() ? d : undefined;
};

const expired = (c: C, ch: Channel) => kioskMessage(c, "Timed out", "", { home: ch.home, phone: ch.kind !== "kiosk" });

// next shows the step the draft is up to: an induction, the photo, or the finish.
const next = async (c: C, ch: Channel, d: Draft, extra?: { answers: (number | null)[]; graded?: ReturnType<typeof grade>; errors?: Record<string, string> }) => {
  const s = await store.settings();
  const t = await store.type(d.type);
  if (!t) return expired(c, ch);
  const secret = await store.secret();
  const remaining = d.due.filter((id) => !d.passes.some((p) => p.induction_id === id));
  const total = stepCount(ch, s, t, d.due.length);
  if (remaining.length) {
    const ind = await store.induction(remaining[0]);
    if (!ind) return finish(c, ch, { ...d, due: d.due.filter((x) => x !== remaining[0]) });
    return page(
      c,
      ch,
      ind.title,
      k.inductionPage({ base: ch.base, ind, draft: seal(secret, d), total, at: 1 + d.passes.length, ...extra, video: true, homeHref: ch.home }),
      { status: extra ? 400 : 200, idle: false },
    );
  }
  if (needsPhoto(ch, s, t) && !d.photoDone) return page(c, ch, "Photo", k.photoPage({ base: ch.base, draft: seal(secret, d), total, at: total - 2, homeHref: ch.home }), { idle: false });
  return finish(c, ch, d);
};

const finish = async (c: C, ch: Channel, d: Draft) => {
  const [s, t, inductions] = await Promise.all([store.settings(), store.type(d.type), store.inductions(true)]);
  if (!t) return expired(c, ch);
  const passes = d.passes.map((p) => {
    const ind = inductions.find((i) => i.id === p.induction_id);
    return { ...p, expires_at: passExpiry(new Date(), ind?.valid_months ?? 12) };
  });
  const secret = await store.secret();
  if (ch.kind === "invite" && ch.invite) {
    const visitorId = await store.prepare(ch.invite.id, d.visitor, d.details, passes, d.company);
    setCookie(c, ME_COOKIE, seal(secret, { visitor: visitorId }), cookieOpts(365));
    return c.redirect(ch.base, 303);
  }
  const visit = await store.signIn(
    {
      site_id: ch.site.id,
      visitor_id: d.visitor,
      person_id: null,
      type_id: t.id,
      type_name: t.name,
      invite_id: d.invite,
      ...d.details,
      inductions: d.passes.map((p) => ({ induction_id: p.induction_id, title: inductions.find((i) => i.id === p.induction_id)?.title ?? "", version: p.version, score: p.score })),
      photo_upload_id: d.photo,
      warning: d.warning,
      source: ch.kind === "invite" ? "invite" : ch.kind === "desk" ? "staff" : ch.kind,
    },
    passes,
    d.company,
  );
  const host = d.details.host_id ? await store.person(d.details.host_id) : undefined;
  await arrived(s, { ...d.details, type_name: t.name, site_name: ch.site.name, warning: d.warning, visit_id: visit.id }, host).catch((err) => log.error({ err: String(err) }, "host not told"));
  if (ch.kind === "phone") {
    if (visit.visitorId) setCookie(c, ME_COOKIE, seal(secret, { visitor: visit.visitorId }), cookieOpts(365));
    setCookie(c, VISIT_COOKIE, visit.token, cookieOpts(1));
  }
  if (ch.kind === "desk") return c.redirect("/?ok=in", 303);
  return c.redirect(`${ch.base}/done/${visit.token}`, 303);
};

// startDraft checks the details and works out what is left to do: which inductions, and whether
// a contractor may come in at all.
const startDraft = async (c: C, ch: Channel, t: VisitorType, body: Record<string, unknown>, carried: { invite: number | null }) => {
  const [s, hosts, inductions] = await Promise.all([store.settings(), store.hostsFor(ch.site.id), store.inductions(true)]);
  const checked = checkDetails(t, hosts, body);
  if (!checked.ok) {
    const secret = await store.secret();
    return page(
      c,
      ch,
      t.name,
      k.detailsForm({ base: ch.base, type: t, hosts, d: checked.details, errors: checked.errors, total: stepCount(ch, s, t, t.induction_ids.length), backTo: `${ch.base}/in`, draft: carried.invite ? seal(secret, { invite: carried.invite, exp: Date.now() + 3600000 }) : undefined }),
      { status: 400 },
    );
  }
  const details = checked.details;
  const fromCookie = unseal<{ visitor: number }>(await store.secret(), getCookie(c, ME_COOKIE))?.visitor;
  const found = await store.findVisitor(phoneKey(details.phone), details.email);
  const known = (found && sameVisitor(found.name, details.name) ? found : undefined) ?? (ch.kind !== "kiosk" && fromCookie ? await store.visitor(fromCookie) : undefined) ?? (ch.invite?.visitor_id ? await store.visitor(ch.invite.visitor_id) : undefined);
  const company = t.contractor && details.company ? await store.companyByName(details.company) : undefined;
  const today = localDay(new Date(), s.timezone);
  const verdict = admit(t, company, s.contractor_policy, today, (await store.companies()).length > 0);
  if (!verdict.allow) {
    const host = details.host_id ? await store.person(details.host_id) : undefined;
    return page(c, ch, "Please see reception", k.blocked({ home: ch.home, warning: verdict.warning.replace(/^[^:]+: /, "your company's "), hostName: host?.name }));
  }
  const passes = known ? await store.passes(known.id) : [];
  const due = inductionsDue(t, inductions, passes, new Date()).map((i) => i.id);
  const d: Draft = {
    site: ch.site.id,
    type: t.id,
    visitor: known?.id ?? null,
    invite: carried.invite,
    company: company?.id ?? null,
    warning: verdict.warning,
    details,
    due,
    passes: [],
    photo: null,
    photoDone: false,
    exp: Date.now() + DRAFT_HOURS * 3600000,
  };
  return next(c, ch, d);
};

// prefill: a returning visitor on their own phone, or an expected one, starts with their details.
const prefill = async (c: C, ch: Channel): Promise<{ d: Details; known?: string }> => {
  const secret = await store.secret();
  const fromCookie = ch.kind === "phone" || ch.kind === "invite" ? unseal<{ visitor: number }>(secret, getCookie(c, ME_COOKIE))?.visitor : undefined;
  const visitorId = ch.invite?.visitor_id ?? fromCookie;
  const v = visitorId ? await store.visitor(visitorId) : undefined;
  if (v) return { d: { ...emptyDetails(), name: v.name, company: v.company, phone: v.phone, email: v.email, host_id: ch.invite?.host_id ?? null }, known: v.name.split(" ")[0] };
  if (ch.invite) return { d: { ...emptyDetails(), name: ch.invite.name, company: ch.invite.company, email: ch.invite.email, host_id: ch.invite.host_id } };
  return { d: emptyDetails() };
};

// ----- Routes -----

const mount = (app: App, prefix: string, resolve: Resolve, guard?: (c: C, next: Next) => Promise<Response | void>) => {
  const withChannel =
    (handler: (c: C, ch: Channel) => Promise<Response>) =>
    async (c: C): Promise<Response> => {
      await demoTick().catch(() => undefined);
      const ch = await resolve(c);
      return ch instanceof Response ? ch : handler(c, ch);
    };
  if (guard) {
    app.use(prefix, guard);
    app.use(`${prefix}/*`, guard);
  }

  // The start: the kiosk's welcome, the phone's "you're on site", or the invitation.
  app.get(
    prefix,
    withChannel(async (c, ch) => {
      const s = await store.settings();
      const now = new Date();
      if (ch.kind === "invite" && ch.invite) {
        const i = ch.invite;
        const site = await store.site(i.site_id);
        return page(c, ch, "Your visit", k.inviteStart({ base: ch.base, name: i.name, day: dayLabel(i.expected_on), site: i.site_name, address: site?.address ?? "", host: i.host_name, ready: !!i.ready_at, today: i.expected_on === localDay(now, s.timezone) && !i.arrived_at, code: i.code }));
      }
      if (ch.kind === "phone") {
        const open = await openVisitHere(c, ch);
        if (open) {
          return page(c, ch, "On site", k.phoneOnSite({ base: ch.base, first: open.name.split(" ")[0], since: timeOf(open.signed_in_at, s.timezone), site: ch.site.name, outAction: `${ch.base}/leave`, badge: k.badge({ s, name: open.name, company: open.company, type: open.type_name, host: open.host_name ?? undefined, site: ch.site.name, date: dayLabel(localDay(open.signed_in_at, s.timezone)), photo: open.photo_upload_id }) }));
        }
        return c.redirect(`${ch.base}/in`);
      }
      if (ch.kind === "desk") return c.redirect(`${ch.base}/in`);
      const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: s.timezone, hour: "numeric", hourCycle: "h23" }).format(now));
      const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
      const clock = ampm(new Intl.DateTimeFormat("en-US", { timeZone: s.timezone, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true }).format(now));
      const staff = (await store.hostsFor(ch.site.id)).length > 0;
      return page(c, ch, "Welcome", k.welcome({ s, base: ch.base, hello, clock, staff, codes: true, posterQr: await qr(`${baseUrl()}/s/${ch.site.poster_token}`) }), { idle: false });
    }),
  );

  app.get(
    `${prefix}/in`,
    withChannel(async (c, ch) => {
      const types = await usableTypes();
      if (ch.kind === "invite" && ch.invite) {
        const t = types.find((x) => x.id === ch.invite?.type_id) ?? types[0];
        return t ? c.redirect(`${ch.base}/in/${t.id}`) : kioskMessage(c, "Nothing to sign in to yet", "Ask at reception.", { phone: true });
      }
      if (types.length === 1) return c.redirect(`${ch.base}/in/${types[0].id}`);
      const known = (await prefill(c, ch)).known;
      return page(c, ch, "Sign in", k.chooseType({ base: ch.base, types, home: ch.home, title: known ? `Welcome back, ${known}` : undefined }));
    }),
  );

  app.get(
    `${prefix}/in/:type`,
    withChannel(async (c, ch) => {
      const t = await store.type(Number(c.req.param("type")));
      if (!t || t.archived) return c.redirect(`${ch.base}/in`);
      const [s, hosts, pre] = await Promise.all([store.settings(), store.hostsFor(ch.site.id), prefill(c, ch)]);
      const secret = await store.secret();
      const ticket = unseal<{ invite: number; exp: number }>(secret, c.req.query("t"));
      const carried = ticket && ticket.exp > Date.now() ? await store.invite(ticket.invite) : undefined;
      const d = carried && carried.site_id === ch.site.id ? { ...pre.d, name: carried.name, company: carried.company, email: carried.email, host_id: carried.host_id } : pre.d;
      return page(
        c,
        ch,
        t.name,
        k.detailsForm({ base: ch.base, type: t, hosts, d, errors: {}, total: stepCount(ch, s, t, t.induction_ids.length), backTo: ch.kind === "invite" ? ch.home : `${ch.base}/in`, welcomeBack: carried ? undefined : pre.known, draft: carried ? seal(secret, { invite: carried.id, exp: Date.now() + 3600000 }) : undefined }),
      );
    }),
  );

  app.post(
    `${prefix}/in/:type`,
    withChannel(async (c, ch) => {
      const t = await store.type(Number(c.req.param("type")));
      if (!t || t.archived) return c.redirect(`${ch.base}/in`, 303);
      const body = await form(c);
      const carried = unseal<{ invite: number; exp: number }>(await store.secret(), typeof body.d === "string" ? body.d : undefined);
      const invite = ch.invite?.id ?? (carried && carried.exp > Date.now() ? carried.invite : null);
      return startDraft(c, ch, t, body, { invite });
    }),
  );

  app.post(
    `${prefix}/induction`,
    withChannel(async (c, ch) => {
      const body = await form(c);
      const d = await readDraft(c, ch, body);
      if (!d) return expired(c, ch);
      const id = d.due.find((x) => !d.passes.some((p) => p.induction_id === x));
      const ind = id ? await store.induction(id) : undefined;
      if (!ind) return next(c, ch, d);
      const answers = ind.questions.map((_, i) => (typeof body[`a${i}`] === "string" && body[`a${i}`] !== "" ? Number(body[`a${i}`]) : null));
      const graded = grade(ind.questions, answers, ind.pass_mark);
      const signature = typeof body.signature === "string" ? body.signature : "";
      const errors = {
        ...(body.agree === "on" ? {} : { agree: "Tick to agree." }),
        ...(isSignature(signature) ? {} : { signature: "Sign in the box." }),
      };
      if (!graded.passed || Object.keys(errors).length) return next(c, ch, d, { answers, graded: graded.passed ? undefined : graded, errors });
      return next(c, ch, { ...d, passes: [...d.passes, { induction_id: ind.id, version: ind.version, score: graded.score, signature }] });
    }),
  );

  app.post(
    `${prefix}/photo`,
    withChannel(async (c, ch) => {
      const body = await form(c);
      const d = await readDraft(c, ch, body);
      if (!d) return expired(c, ch);
      const photo = typeof body.photo === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(body.photo) && body.skip !== "1" ? body.photo : null;
      return next(c, ch, { ...d, photo, photoDone: true });
    }),
  );

  // The browser asks for a one-off upload address and sends the photo straight to storage.
  app.post(
    `${prefix}/upload`,
    withChannel(async (c, ch) => {
      const body = (await c.req.json().catch(() => ({}))) as { d?: string };
      if (!(await readDraft(c, ch, body))) return c.json({ error: "Start again." }, 400);
      if (isDemo()) return c.json({ error: "Photos are off in the demo." }, 400);
      try {
        const up = await whiskApi<{ id: string; url: string; fields: Record<string, string> }>("/uploads", { filename: "photo.jpg", content_type: "image/jpeg", max_bytes: 5_000_000 });
        return c.json(up);
      } catch (err) {
        log.error({ err: String(err) }, "photo upload refused");
        return c.json({ error: "The photo could not be saved." }, 502);
      }
    }),
  );

  app.get(
    `${prefix}/done/:token`,
    withChannel(async (c, ch) => {
      const v = await store.visitByToken(c.req.param("token") ?? "");
      if (!v || v.site_id !== ch.site.id) return c.redirect(ch.home);
      const s = await store.settings();
      const phone = ch.kind === "phone";
      const b = k.badge({ s, name: v.name, company: v.company, type: v.type_name, host: v.host_name ?? undefined, site: ch.site.name, date: dayLabel(localDay(v.signed_in_at, s.timezone)), photo: v.photo_upload_id });
      return page(c, ch, "Signed in", k.signedIn({ home: ch.home, first: v.name.split(" ")[0], host: v.host_name ?? undefined, warning: v.warning || undefined, badge: s.badges || phone ? b : undefined, print: s.badges, phone, outAction: phone ? `${ch.base}/leave` : undefined }));
    }),
  );

  // Signing out: by name at the kiosk, by the visit cookie or phone number on a phone.
  app.get(
    `${prefix}/out`,
    withChannel(async (c, ch) => {
      const s = await store.settings();
      if (ch.kind === "phone") {
        const open = await openVisitHere(c, ch);
        if (open) return c.redirect(ch.base);
        return page(c, ch, "Sign out", html`<main class="k-main narrow"><a class="k-back" href="${ch.base}/in">Back</a><h1 class="k-title">Sign out</h1><p class="k-sub">The phone number you signed in with.</p>
          <form class="k-form" method="post" action="${ch.base}/out"><div class="field"><label class="sr" for="f-phone">Phone number</label><input id="f-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel"></div>
          <div class="k-actions"><span></span><button class="btn primary" type="submit">Sign out</button></div></form></main>`);
      }
      const q = (c.req.query("q") ?? "").slice(0, 60);
      const onSite = (await store.onSite(ch.site.id)).filter((v) => v.person_id === null);
      const results = findOnSite(onSite, q)
        .slice(0, 8)
        .map((v) => ({ id: v.id, label: ch.kind === "desk" ? v.name : shortName(v.name), company: v.company, since: timeOf(v.signed_in_at, s.timezone) }));
      return page(c, ch, "Sign out", k.signOutSearch({ base: ch.base, home: ch.home, q, results }));
    }),
  );

  app.post(
    `${prefix}/out`,
    withChannel(async (c, ch) => {
      if (ch.kind !== "phone") return c.redirect(`${ch.base}/out`, 303);
      const body = await form(c);
      const v = await store.openVisitByPhone(ch.site.id, phoneKey(typeof body.phone === "string" ? body.phone : ""));
      if (v) await store.signOut(v.id, "phone");
      deleteCookie(c, VISIT_COOKIE, { path: "/" });
      return v ? page(c, ch, "Signed out", k.goodbye({ home: ch.home, first: v.name.split(" ")[0], phone: true })) : kioskMessage(c, "Nobody on site with that number", "Check the number, or sign out at reception.", { home: `${ch.base}/out`, phone: true });
    }),
  );

  app.post(
    `${prefix}/out/:id`,
    withChannel(async (c, ch) => {
      if (ch.kind === "phone" || ch.kind === "invite") return c.redirect(ch.base, 303);
      const v = await store.visitById(Number(c.req.param("id")));
      if (!v || v.site_id !== ch.site.id || v.signed_out_at) return c.redirect(`${ch.base}/out`, 303);
      await store.signOut(v.id, ch.kind === "desk" ? actor(who(c)) : "kiosk");
      if (ch.kind === "desk") return c.redirect("/?ok=out", 303);
      return page(c, ch, "Signed out", k.goodbye({ home: ch.home, first: v.name.split(" ")[0], phone: false }));
    }),
  );

  app.post(
    `${prefix}/leave`,
    withChannel(async (c, ch) => {
      const open = await openVisitHere(c, ch);
      if (open) await store.signOut(open.id, "phone");
      deleteCookie(c, VISIT_COOKIE, { path: "/" });
      return page(c, ch, "Signed out", k.goodbye({ home: ch.home, first: open?.name.split(" ")[0] ?? "", phone: true }));
    }),
  );

  // An expected visitor's code, at the kiosk.
  app.get(
    `${prefix}/code`,
    withChannel(async (c, ch) => page(c, ch, "Your code", k.codeEntry({ base: ch.base, home: ch.home, value: "" }))),
  );
  app.post(
    `${prefix}/code`,
    withChannel(async (c, ch) => {
      const body = await form(c);
      const code = (typeof body.code === "string" ? body.code : "").replace(/\D/g, "").slice(0, 6);
      const s = await store.settings();
      const inv = code.length === 6 ? await store.inviteByCode(code, ch.site.id, localDay(new Date(), s.timezone)) : undefined;
      if (!inv) return page(c, ch, "Your code", k.codeEntry({ base: ch.base, home: ch.home, value: code, error: "That code isn't for today at this site." }), { status: 400 });
      const types = await usableTypes();
      const t = types.find((x) => x.id === inv.type_id) ?? types[0];
      return c.redirect(`${ch.base}/in/${t.id}?t=${seal(await store.secret(), { invite: inv.id, exp: Date.now() + 3600000 })}`, 303);
    }),
  );

  // Staff in and out, at the kiosk.
  app.get(
    `${prefix}/staff`,
    withChannel(async (c, ch) => {
      const [people, on] = await Promise.all([store.hostsFor(ch.site.id), store.staffOnSite(ch.site.id)]);
      return page(c, ch, "Staff", k.staffBoard({ base: ch.base, home: ch.home, people: people.map((p) => ({ id: p.id, name: p.name, in: on.some((o) => o.person_id === p.id) })) }));
    }),
  );
  app.post(
    `${prefix}/staff/:person`,
    withChannel(async (c, ch) => {
      const p = await store.person(Number(c.req.param("person")));
      if (!p || p.archived || (p.site_id !== null && p.site_id !== ch.site.id)) return c.redirect(`${ch.base}/staff`, 303);
      const on = (await store.staffOnSite(ch.site.id)).find((o) => o.person_id === p.id);
      if (on) await store.signOut(on.visit_id, "kiosk");
      else
        await store.signIn(
          { site_id: ch.site.id, visitor_id: null, person_id: p.id, type_id: null, type_name: "Staff", host_id: null, invite_id: null, name: p.name, company: "", phone: "", email: p.email, answers: [], inductions: [], photo_upload_id: null, warning: "", source: ch.kind === "desk" ? "staff" : "kiosk" },
          [],
          null,
        );
      return page(c, ch, on ? "Signed out" : "Signed in", on ? k.goodbye({ home: ch.home, first: p.name.split(" ")[0], phone: false }) : k.signedIn({ home: ch.home, first: p.name.split(" ")[0], print: false, phone: false }));
    }),
  );

  // An expected visitor who is ready signs in from their invitation with one tap.
  app.post(
    `${prefix}/arrive`,
    withChannel(async (c, ch) => {
      const i = ch.invite;
      if (!i || !i.visitor_id) return c.redirect(ch.base, 303);
      const [s, v, types, inductions] = await Promise.all([store.settings(), store.visitor(i.visitor_id), usableTypes(), store.inductions(true)]);
      const t = types.find((x) => x.id === i.type_id) ?? types[0];
      if (!v || !t || i.expected_on !== localDay(new Date(), s.timezone)) return c.redirect(ch.base, 303);
      const due = inductionsDue(t, inductions, await store.passes(v.id), new Date());
      if (due.length) return c.redirect(`${ch.base}/in`, 303);
      const company = t.contractor && v.company ? await store.companyByName(v.company) : undefined;
      const verdict = admit(t, company, s.contractor_policy, localDay(new Date(), s.timezone), (await store.companies()).length > 0);
      if (!verdict.allow) return page(c, ch, "Please see reception", k.blocked({ home: ch.home, warning: verdict.warning.replace(/^[^:]+: /, "your company's ") }));
      const phoneCh: Channel = { ...ch, kind: "phone", base: `/s/${ch.site.poster_token}`, home: `/s/${ch.site.poster_token}` };
      return finish(c, phoneCh, {
        site: ch.site.id,
        type: t.id,
        visitor: v.id,
        invite: i.id,
        company: company?.id ?? null,
        warning: verdict.warning,
        details: { name: v.name, company: v.company, phone: v.phone, email: v.email, host_id: i.host_id, answers: [] },
        due: [],
        passes: [],
        photo: null,
        photoDone: true,
        exp: Date.now() + 60000,
      });
    }),
  );
};

const openVisitHere = async (c: C, ch: Channel) => {
  const t = getCookie(c, VISIT_COOKIE);
  const v = t ? await store.visitByToken(t) : undefined;
  return v && v.site_id === ch.site.id && !v.signed_out_at ? v : undefined;
};

export const signInRoutes = (app: App) => {
  // Pairing a tablet: a code made under Setup, Sites, typed in on the tablet.
  app.get("/kiosk/pair", async (c) =>
    c.html(kioskLayout({ s: await store.settings(), title: "Set up this kiosk", body: k.pairPage({}), home: "/kiosk/pair", challenge: true })),
  );
  app.post("/kiosk/pair", async (c) => {
    const body = await form(c);
    const code = (typeof body.code === "string" ? body.code : "").replace(/\D/g, "");
    const cookie = code.length === 6 ? await store.pairKiosk(code) : undefined;
    if (!cookie) return c.html(kioskLayout({ s: await store.settings(), title: "Set up this kiosk", body: k.pairPage({ error: "That code has expired or is wrong. Make a new one." }), home: "/kiosk/pair", challenge: true }), 400);
    setCookie(c, KIOSK_COOKIE, cookie, cookieOpts(3650));
    return c.redirect("/kiosk", 303);
  });

  mount(app, "/kiosk", kioskChannel);
  mount(app, "/s/:poster", phoneChannel);
  mount(app, "/i/:invite", inviteChannel);
  mount(app, "/desk/:site", deskChannel, async (c, n) => (canStaff(who(c)) ? n() : staffOnly(c, n)));
};

// The poster's address, for the QR code on the kiosk, the poster and Setup.
export const posterUrl = (site: Site) => `${baseUrl()}/s/${site.poster_token}`;
export { qr };
export const localUploads = devStub;
