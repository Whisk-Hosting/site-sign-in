// Reception: who is on site, roll calls, expected visitors, history and privacy requests.
import { demoTick } from "../demo.js";
import { addDays, csv, dayLabel, inviteCode, inviteProblems, isDay, localDay, rollCall, tally } from "../model.js";
import { baseUrl, invited, rollCallStarted } from "../notify.js";
import * as store from "../store.js";
import { expectedPage, onSitePage, rollCallPage, visitPage, visitsPage } from "../views/staff.js";
import { actor, adminOnly, flash, form, idParam, notFound, posInt, render, staffOnly, text, who, type App, type C } from "../web.js";
import { canAdmin } from "../whisk.js";

const siteFilter = async (c: C) => {
  const sites = await store.sites();
  const id = Number(c.req.query("site"));
  return { sites, site: sites.some((s) => s.id === id) ? id : null };
};

export const staffRoutes = (app: App) => {
  for (const path of ["/", "/rollcall", "/rollcall/*", "/expected", "/expected/*", "/visits", "/visits/*", "/visits.csv", "/visitors/*"]) app.use(path, staffOnly);

  app.get("/", async (c) => {
    await demoTick().catch(() => undefined);
    const [s, { sites, site }] = await Promise.all([store.settings(), siteFilter(c)]);
    const now = new Date();
    const today = localDay(now, s.timezone);
    const [visits, expected, rollCalls] = await Promise.all([
      store.onSite(site),
      store.invitesFrom(today, site),
      Promise.all((site ? [site] : sites.map((x) => x.id)).map((id) => store.openRollCall(id))),
    ]);
    c.header("Cache-Control", "no-store");
    return render(
      c,
      "On site",
      onSitePage({ sites, site, visits, tally: tally(visits), expected: expected.filter((i) => i.expected_on === today), rollCalls: rollCalls.filter((r) => !!r), tz: s.timezone, now, flash: flash(c), dayLabel: dayLabel(today) }),
      { nav: "onsite" },
    );
  });

  // ----- Roll call -----

  app.post("/rollcall", async (c) => {
    const body = await form(c);
    const site = await store.site(posInt(body.site));
    if (!site) return c.redirect("/", 303);
    const existing = await store.openRollCall(site.id);
    const id = await store.startRollCall(site.id, actor(who(c)));
    const s = await store.settings();
    if (!existing) await rollCallStarted(s, site.name, actor(who(c)))?.catch(() => undefined);
    return c.redirect(`/rollcall/${id}`, 303);
  });

  app.get("/rollcall/:id", async (c) => {
    const rc = await store.rollCallById(idParam(c));
    const site = rc ? await store.site(rc.site_id) : undefined;
    if (!rc || !site) return notFound(c, "roll call");
    const [s, visits, safe] = await Promise.all([store.settings(), store.onSite(site.id), store.marks(rc.id)]);
    c.header("Cache-Control", "no-store");
    return render(c, "Roll call", rollCallPage({ site, rc, visits, safe, summary: rollCall(visits, safe), tz: s.timezone, now: new Date() }), { nav: "onsite" });
  });

  app.post("/rollcall/:id/mark/:visit", async (c) => {
    const rc = await store.rollCallById(idParam(c));
    const v = await store.visitById(idParam(c, "visit"));
    if (rc && !rc.ended_at && v && v.site_id === rc.site_id) await store.mark(rc.id, v.id, (await form(c)).safe === "1", actor(who(c)));
    return c.redirect(`/rollcall/${idParam(c)}`, 303);
  });

  app.post("/rollcall/:id/end", async (c) => {
    await store.endRollCall(idParam(c));
    return c.redirect(`/rollcall/${idParam(c)}`, 303);
  });

  // ----- Expected visitors -----

  const expected = async (c: C, errors: Record<string, string> = {}, values: Record<string, string> = {}) => {
    const s = await store.settings();
    const today = localDay(new Date(), s.timezone);
    const [invites, sites, types, hosts] = await Promise.all([store.invitesFrom(today, null), store.sites(), store.types(), store.people()]);
    return render(c, "Expected", expectedPage({ invites, sites, types, hosts, today, tz: s.timezone, flash: flash(c), errors, values, dayLabel, baseUrl: baseUrl() }), { nav: "expected", status: Object.keys(errors).length ? 400 : 200 });
  };

  app.get("/expected", (c) => expected(c));

  app.post("/expected", async (c) => {
    const body = await form(c);
    const s = await store.settings();
    const today = localDay(new Date(), s.timezone);
    const values = Object.fromEntries(["name", "email", "company", "day", "site", "type", "host"].map((k) => [k, text(body[k], 200)]));
    const site = await store.site(posInt(values.site));
    const errors = {
      ...inviteProblems({ name: values.name, email: values.email, day: values.day }, today),
      ...(!site ? { form: "Add a site first, under Setup." } : {}),
    };
    if (Object.keys(errors).length || !site) return expected(c, errors, values);
    const type = await store.type(posInt(values.type));
    const host = await store.person(posInt(values.host));
    const id = await store.addInvite(
      { site_id: site.id, type_id: type?.id ?? null, host_id: host?.id ?? null, name: values.name, email: values.email.toLowerCase(), company: values.company, expected_on: values.day, created_by: actor(who(c)) },
      () => inviteCode(Math.random),
    );
    const inv = await store.invite(id);
    if (inv?.email) await invited(s, inv);
    return c.redirect(`/expected?ok=${inv?.email ? "invited" : "invited_no_email"}`, 303);
  });

  app.post("/expected/:id/delete", async (c) => {
    await store.deleteInvite(idParam(c));
    return c.redirect("/expected?ok=removed", 303);
  });

  // ----- History -----

  const filterOf = async (c: C) => {
    const s = await store.settings();
    const today = localDay(new Date(), s.timezone);
    const from = isDay(c.req.query("from") ?? "") ? c.req.query("from")! : addDays(today, -30);
    const to = isDay(c.req.query("to") ?? "") ? c.req.query("to")! : today;
    const { site } = await siteFilter(c);
    return { s, f: { from, to, site, type: text(c.req.query("type"), 80), q: text(c.req.query("q"), 80), tz: s.timezone } };
  };

  app.get("/visits", async (c) => {
    const { s, f } = await filterOf(c);
    const [visits, sites, types] = await Promise.all([store.history(f, 501), store.sites(), store.types(true)]);
    const qs = new URLSearchParams(Object.entries({ from: f.from, to: f.to, site: f.site ? String(f.site) : "", type: f.type, q: f.q }).filter(([, v]) => v)).toString();
    return render(c, "History", visitsPage({ visits: visits.slice(0, 500), sites, types, f, tz: s.timezone, now: new Date(), capped: visits.length > 500, csvHref: `/visits.csv?${qs}` }), { nav: "visits" });
  });

  app.get("/visits.csv", async (c) => {
    const { s, f } = await filterOf(c);
    const visits = await store.history(f, 50000);
    const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat("sv-SE", { timeZone: s.timezone, dateStyle: "short", timeStyle: "short" }).format(d) : "");
    const body = csv(
      ["Name", "Type", "Company", "Phone", "Email", "Host", "Site", "Signed in", "Signed out", "Signed out by", "Warning", "Answers", "Inductions"],
      visits.map((v) => [
        v.name,
        v.type_name,
        v.company,
        v.phone,
        v.email,
        v.host_name ?? "",
        v.site_name,
        fmt(v.signed_in_at),
        fmt(v.signed_out_at),
        v.signed_out_by ?? "",
        v.warning,
        v.answers.map((a) => `${a.label}: ${a.answer}`).join("; "),
        v.inductions.map((i) => `${i.title} v${i.version}`).join("; "),
      ]),
    );
    return c.body(body, 200, { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="visits-${f.from}-to-${f.to}.csv"` });
  });

  app.get("/visits/:id", async (c) => {
    const v = await store.visitById(idParam(c));
    if (!v) return notFound(c, "visit");
    const s = await store.settings();
    const [sigs, others] = v.visitor_id ? await Promise.all([store.signatures(v.visitor_id), store.visitsOf(v.visitor_id)]) : [new Map<number, string>(), []];
    return render(c, v.name, visitPage({ v, tz: s.timezone, now: new Date(), admin: canAdmin(who(c)), signatures: sigs, others: Math.max(0, others.length - 1), flash: flash(c) }), { nav: "visits" });
  });

  app.post("/visits/:id/delete", adminOnly, async (c) => {
    await store.deleteVisit(idParam(c));
    return c.redirect("/visits?ok=deleted", 303);
  });

  // A privacy request: the visitor, their visits, inductions and roll call marks, all at once.
  app.post("/visitors/:id/forget", adminOnly, async (c) => {
    await store.forget(idParam(c));
    return c.redirect("/visits?ok=forgotten", 303);
  });
};
