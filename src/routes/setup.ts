// Setup, for admins: sites and kiosks, visitor types, inductions, staff, contractors, settings.
import { randomBytes } from "node:crypto";
import { setCookie } from "hono/cookie";
import { makeKey } from "../api-model.js";
import { html } from "hono/html";
import { isDemo } from "../demo.js";
import { isColor, isDay, isPublicUrl, localDay, questionProblems, type Question } from "../model.js";
import { baseUrl } from "../notify.js";
import * as store from "../store.js";
import { inductionPage as inductionPreview } from "../views/kiosk.js";
import { kioskLayout } from "../views/layout.js";
import * as v from "../views/setup.js";
import { actor, adminOnly, all, bool, flash, form, idParam, notFound, posInt, render, staffOnly, text, who, type App, type C } from "../web.js";
import { log, whiskApi } from "../whisk.js";
import { KIOSK_COOKIE, posterUrl, qr } from "./signin.js";

const page = (c: C, tab: v.Tab, title: string, body: Parameters<typeof v.frame>[2], actions?: Parameters<typeof v.frame>[4], status: 200 | 400 = 200) =>
  render(c, title, v.frame(tab, title, body, flash(c), actions), { nav: "setup", status });

export const setupRoutes = (app: App) => {
  app.use("/setup", staffOnly, adminOnly);
  app.use("/setup/*", staffOnly, adminOnly);
  app.get("/setup", (c) => c.redirect("/setup/sites"));

  // ----- Sites and kiosks -----

  app.get("/setup/sites", async (c) => {
    const sites = await store.sites(true);
    const counts = new Map(await Promise.all(sites.map(async (s) => [s.id, (await store.kiosks(s.id)).filter((k) => k.paired_at).length] as [number, number])));
    return page(c, "sites", "Sites", v.sitesPage(sites, counts));
  });
  app.post("/setup/sites", async (c) => {
    const name = text((await form(c)).name, 120);
    if (!name) return c.redirect("/setup/sites", 303);
    return c.redirect(`/setup/sites/${await store.addSite(name, "")}?ok=added`, 303);
  });

  const sitePage = async (c: C, pairing?: { code: string }) => {
    const site = await store.site(idParam(c));
    if (!site) return notFound(c, "site");
    const s = await store.settings();
    const pairUrl = `${baseUrl()}/kiosk/pair`;
    return page(
      c,
      "sites",
      site.name,
      v.sitePage({ site, kiosks: await store.kiosks(site.id), tz: s.timezone, now: new Date(), posterQr: await qr(posterUrl(site)), posterUrl: posterUrl(site), pairing: pairing ? { code: pairing.code, url: pairUrl, qr: await qr(pairUrl) } : undefined }),
      html`<a class="btn ghost" href="/setup/sites">All sites</a>`,
    );
  };
  app.get("/setup/sites/:id", (c) => sitePage(c));
  app.post("/setup/sites/:id", async (c) => {
    const body = await form(c);
    const name = text(body.name, 120);
    if (name) await store.saveSite(idParam(c), name, text(body.address, 200), bool(body.archived));
    return c.redirect(`/setup/sites/${idParam(c)}?ok=saved`, 303);
  });
  app.post("/setup/sites/:id/new-poster", async (c) => {
    await store.newPoster(idParam(c));
    return c.redirect(`/setup/sites/${idParam(c)}?ok=poster`, 303);
  });
  app.get("/setup/sites/:id/poster", async (c) => {
    const site = await store.site(idParam(c));
    if (!site) return notFound(c, "site");
    return render(c, "Poster", v.posterPage({ s: await store.settings(), site, qr: await qr(posterUrl(site)) }), { nav: "setup", poster: true });
  });
  app.post("/setup/sites/:id/kiosks", async (c) => {
    const site = await store.site(idParam(c));
    if (!site) return notFound(c, "site");
    const n = (await store.kiosks(site.id)).length + 1;
    const { code } = await store.addKiosk(site.id, `Kiosk ${n}`);
    return sitePage(c, { code });
  });
  // Turn the browser in use into this site's kiosk, for setting up on the tablet itself.
  app.post("/setup/sites/:id/this-device", async (c) => {
    const site = await store.site(idParam(c));
    if (!site) return notFound(c, "site");
    const n = (await store.kiosks(site.id)).length + 1;
    const { code } = await store.addKiosk(site.id, `Kiosk ${n}`);
    const cookie = await store.pairKiosk(code);
    if (cookie) setCookie(c, KIOSK_COOKIE, cookie, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 3650 * 86400 });
    return c.redirect("/kiosk", 303);
  });
  app.post("/setup/sites/:id/kiosks/:kiosk/delete", async (c) => {
    await store.removeKiosk(idParam(c, "kiosk"), idParam(c));
    return c.redirect(`/setup/sites/${idParam(c)}?ok=removed`, 303);
  });

  // ----- Visitor types -----

  app.get("/setup/types", async (c) => page(c, "types", "Visitor types", v.typesPage(await store.types(true), await store.inductions(true))));
  app.post("/setup/types", async (c) => {
    const name = text((await form(c)).name, 80);
    if (!name) return c.redirect("/setup/types", 303);
    return c.redirect(`/setup/types/${await store.addType(name)}?ok=added`, 303);
  });
  app.get("/setup/types/:id", async (c) => {
    const t = await store.type(idParam(c));
    if (!t) return notFound(c, "visitor type");
    return page(c, "types", t.name, v.typePage(t, await store.inductions()), html`<a class="btn ghost" href="/setup/types">All types</a>`);
  });
  app.post("/setup/types/:id", async (c) => {
    const t = await store.type(idParam(c));
    if (!t) return notFound(c, "visitor type");
    const body = await form(c);
    const known = new Set((await store.inductions(true)).map((i) => i.id));
    const questions = Array.from({ length: 12 }, (_, i) => ({ label: text(body[`q${i}`], 160), required: bool(body[`q${i}_required`]) })).filter((q) => q.label);
    await store.saveType({
      ...t,
      name: text(body.name, 80) || t.name,
      icon: text(body.icon, 30) || t.icon,
      ask_company: bool(body.ask_company),
      ask_phone: bool(body.ask_phone),
      ask_email: bool(body.ask_email),
      ask_host: bool(body.ask_host),
      photo: bool(body.photo),
      contractor: bool(body.contractor),
      questions,
      induction_ids: all(body.inductions).map(Number).filter((id) => known.has(id)),
      archived: bool(body.archived),
    });
    return c.redirect(`/setup/types/${t.id}?ok=saved`, 303);
  });
  app.post("/setup/types/:id/move", async (c) => {
    await store.moveType(idParam(c), Number((await form(c)).by) < 0 ? -1 : 1);
    return c.redirect("/setup/types", 303);
  });

  // ----- Inductions -----

  app.get("/setup/inductions", async (c) => page(c, "inductions", "Inductions", v.inductionsPage(await store.inductions(true))));
  app.post("/setup/inductions", async (c) => {
    const title = text((await form(c)).name, 120);
    if (!title) return c.redirect("/setup/inductions", 303);
    return c.redirect(`/setup/inductions/${await store.addInduction(title)}?ok=added`, 303);
  });
  app.get("/setup/inductions/:id", async (c) => {
    const i = await store.induction(idParam(c));
    if (!i) return notFound(c, "induction");
    return page(c, "inductions", i.title, v.inductionPage(i, []), html`<a class="btn ghost" href="/setup/inductions">All inductions</a>`);
  });
  app.post("/setup/inductions/:id", async (c) => {
    const i = await store.induction(idParam(c));
    if (!i) return notFound(c, "induction");
    const body = await form(c);
    const questions: Question[] = Array.from({ length: 20 }, (_, n) => {
      const choices = [0, 1, 2, 3].map((j) => text(body[`q${n}_c${j}`], 200));
      const kept = choices.filter(Boolean);
      const answer = Number(body[`q${n}_answer`]);
      return { prompt: text(body[`q${n}`], 300), choices: kept, answer: Number.isInteger(answer) && choices[answer] ? kept.indexOf(choices[answer]) : -1 };
    }).filter((q) => q.prompt);
    const next = { ...i, title: text(body.title, 120) || i.title, body: text(body.body, 20000), questions, pass_mark: posInt(body.pass_mark) || 100, valid_months: Math.max(0, Math.min(60, Number(body.valid_months) || 0)), archived: bool(body.archived) };
    const problems = questionProblems(questions);
    if (problems.length) return page(c, "inductions", i.title, v.inductionPage(next, problems), undefined, 400);
    const changed = next.body !== i.body || JSON.stringify(next.questions) !== JSON.stringify(i.questions);
    await store.saveInduction(next, changed);
    return c.redirect(`/setup/inductions/${i.id}?ok=saved`, 303);
  });
  app.get("/setup/inductions/:id/preview", async (c) => {
    const i = await store.induction(idParam(c));
    if (!i) return notFound(c, "induction");
    return c.html(kioskLayout({ s: await store.settings(), title: i.title, body: inductionPreview({ base: "/setup/preview", ind: i, draft: "", total: 3, at: 1, video: true, homeHref: `/setup/inductions/${i.id}` }), home: `/setup/inductions/${i.id}` }));
  });
  app.post("/setup/inductions/:id/video", async (c) => {
    const body = await c.req.parseBody();
    const upload = typeof body.upload_id === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(body.upload_id) ? body.upload_id : null;
    await store.setInductionVideo(idParam(c), upload);
    return c.req.header("content-type")?.includes("json") ? c.json({ ok: true }) : c.redirect(`/setup/inductions/${idParam(c)}?ok=saved`, 303);
  });

  // The browser asks for a one-off upload address and sends the file straight to storage.
  app.post("/setup/upload", async (c) => {
    if (isDemo()) return c.json({ error: "Uploads are off in the demo." }, 400);
    const b = (await c.req.json().catch(() => ({}))) as { filename?: string; content_type?: string; size?: number; kind?: string };
    const video = b.kind === "video";
    const type = String(b.content_type ?? "");
    if (video ? !type.startsWith("video/") : !(type === "application/pdf" || type.startsWith("image/"))) return c.json({ error: video ? "Choose a video." : "Choose a PDF or a photo." }, 400);
    try {
      const up = await whiskApi<{ id: string; url: string; fields: Record<string, string> }>("/uploads", {
        filename: String(b.filename ?? "file").slice(0, 120),
        content_type: type,
        max_bytes: video ? 2_000_000_000 : 20_000_000,
        // Visitors watch induction videos at the kiosk without signing in.
        ...(video ? { visibility: "public" } : {}),
      });
      return c.json(up);
    } catch (err) {
      log.error({ err: String(err) }, "upload refused");
      return c.json({ error: "The upload could not start. Try again." }, 502);
    }
  });

  // ----- Staff -----

  app.get("/setup/people", async (c) => page(c, "people", "Staff", v.peoplePage(await store.people(true), await store.sites())));
  app.post("/setup/people", async (c) => {
    const body = await form(c);
    const name = text(body.name, 120);
    if (name) await store.addPerson(name, text(body.email, 200).toLowerCase(), posInt(body.site) || null);
    return c.redirect("/setup/people?ok=added", 303);
  });
  app.post("/setup/people/:id", async (c) => {
    const body = await form(c);
    const name = text(body.name, 120);
    if (name) await store.savePerson(idParam(c), name, text(body.email, 200).toLowerCase(), posInt(body.site) || null, bool(body.archived));
    return c.redirect("/setup/people?ok=saved", 303);
  });

  // ----- Contractors -----

  app.get("/setup/contractors", async (c) => {
    const s = await store.settings();
    return page(c, "contractors", "Contractors", v.contractorsPage(await store.companies(true), localDay(new Date(), s.timezone), s.contractor_policy));
  });
  app.post("/setup/contractors", async (c) => {
    const name = text((await form(c)).name, 120);
    if (!name) return c.redirect("/setup/contractors", 303);
    return c.redirect(`/setup/contractors/${await store.addCompany(name)}?ok=added`, 303);
  });
  app.get("/setup/contractors/:id", async (c) => {
    const co = await store.company(idParam(c));
    if (!co) return notFound(c, "company");
    const s = await store.settings();
    return page(c, "contractors", co.name, v.contractorPage(co, localDay(new Date(), s.timezone)), html`<a class="btn ghost" href="/setup/contractors">All contractors</a>`);
  });
  app.post("/setup/contractors/:id", async (c) => {
    const co = await store.company(idParam(c));
    if (!co) return notFound(c, "company");
    const body = await form(c);
    const day = (x: unknown) => (typeof x === "string" && isDay(x) ? x : null);
    await store.saveCompany({ id: co.id, name: text(body.name, 120) || co.name, contact_email: text(body.contact_email, 200), insurance_expires: day(body.insurance_expires), licence_expires: day(body.licence_expires), archived: bool(body.archived) });
    return c.redirect(`/setup/contractors/${co.id}?ok=saved`, 303);
  });
  app.post("/setup/contractors/:id/certificate", async (c) => {
    const body = await c.req.parseBody();
    const upload = typeof body.upload_id === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(body.upload_id) ? body.upload_id : null;
    await store.setCertificate(idParam(c), upload);
    return c.req.header("content-type")?.includes("json") ? c.json({ ok: true }) : c.redirect(`/setup/contractors/${idParam(c)}?ok=saved`, 303);
  });
  app.get("/setup/contractors/:id/certificate", async (c) => {
    const co = await store.company(idParam(c));
    if (!co?.certificate_upload_id) return notFound(c, "certificate");
    const up = await whiskApi<{ url: string }>(`/uploads/${co.certificate_upload_id}`);
    return c.redirect(up.url);
  });

  // ----- Settings -----

  // The settings form, and the API keys under it. A key made just now is shown on this response only.
  const settingsView = async (c: C, opts: { s?: store.Settings; errors?: Record<string, string>; newKey?: string; keyError?: string; status?: 200 | 400 } = {}) => {
    const [s, keys] = await Promise.all([opts.s ? Promise.resolve(opts.s) : store.settings(), store.apiKeys().catch((err) => (log.error({ err: String(err) }, "api keys not loaded"), undefined))]);
    const body = html`${v.settingsPage(s, opts.errors ?? {}, isDemo())}${v.apiKeysCard({ keys, base: baseUrl(), tz: s.timezone, now: new Date(), newKey: opts.newKey, error: opts.keyError, demo: isDemo() })}`;
    return page(c, "settings", "Settings", body, undefined, opts.status ?? 200);
  };

  app.get("/setup/settings", (c) => settingsView(c));
  app.post("/setup/settings/keys", async (c) => {
    const label = text((await form(c)).label, 80);
    if (!label) return settingsView(c, { keyError: "Give the key a name, like the script or agent that will use it.", status: 400 });
    const key = makeKey(randomBytes);
    await store.addApiKey(label, key, actor(who(c)));
    c.header("Cache-Control", "no-store");
    return settingsView(c, { newKey: key });
  });
  app.post("/setup/settings/keys/:id/revoke", async (c) => {
    await store.revokeApiKey(idParam(c));
    return c.redirect("/setup/settings?ok=key_off#api", 303);
  });
  app.post("/setup/settings", async (c) => {
    const body = await form(c);
    const s = await store.settings();
    const next = {
      business_name: text(body.business_name, 80),
      accent: isColor(text(body.accent, 7)) ? text(body.accent, 7) : s.accent,
      timezone: (() => {
        const z = text(body.timezone, 60);
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: z });
          return z;
        } catch {
          return s.timezone;
        }
      })(),
      privacy_note: text(body.privacy_note, 600),
      photos: bool(body.photos),
      badges: bool(body.badges),
      retention_months: Math.max(1, Math.min(120, posInt(body.retention_months) || 12)),
      contractor_policy: body.contractor_policy === "block" ? ("block" as const) : ("warn" as const),
      // The demo never points outside the app.
      chat_webhook_url: isDemo() ? s.chat_webhook_url : text(body.chat_webhook_url, 500),
      email_from: isDemo() ? s.email_from : text(body.email_from, 200).toLowerCase(),
      admin_email: isDemo() ? s.admin_email : text(body.admin_email, 200).toLowerCase(),
    };
    const errors = {
      ...(next.business_name ? {} : { business_name: "Enter a name." }),
      ...(next.chat_webhook_url && !isPublicUrl(next.chat_webhook_url) ? { chat_webhook_url: "Use the https address Slack or Teams gave you." } : {}),
      ...(next.email_from && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email_from) ? { email_from: "Check the address." } : {}),
      ...(next.admin_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.admin_email) ? { admin_email: "Check the address." } : {}),
    };
    if (Object.keys(errors).length) return settingsView(c, { s: { ...s, ...next }, errors, status: 400 });
    await store.saveSettings(next);
    return c.redirect("/setup/settings?ok=saved", 303);
  });

  app.get("/setup/sent", async (c) => {
    const s = await store.settings();
    return page(c, "sent", "Sent", v.sentPage(await store.recentMessages(100), s.timezone, new Date()));
  });
};
