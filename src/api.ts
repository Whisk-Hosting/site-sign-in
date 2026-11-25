// /api/v1: everything reception does on its screens, for scripts and AI agents. Each call
// carries a key an admin made under Setup > Settings > API keys, as "Authorization: Bearer vis_...".
// Errors are {"error": {code, message, fix}}. Decisions live in model.ts and api-model.ts, shared
// with the screens; this file loads rows, asks them, stores and tells people what the screens would.
import { Hono, type Context } from "hono";
import {
  companyPatch,
  fieldErrors,
  id,
  inviteError,
  keyFrom,
  keyMissing,
  optionalId,
  pageFrom,
  pageFromRows,
  pageOf,
  personPatch,
  signInVerdict,
  str,
  visitForm,
  type ApiError,
  type Body,
  type Page,
} from "./api-model.js";
import { addDays, admit, checkDetails, companyState, inductionsDue, inviteCode, inviteProblems, isDay, localDay, phoneKey, rollCall, sameVisitor, tally, type Company, type Person, type Site, type VisitorType } from "./model.js";
import { arrived, baseUrl, invited, rollCallStarted } from "./notify.js";
import * as store from "./store.js";
import { log } from "./whisk.js";

type Env = { Variables: { key: store.ApiKey } };
type C = Context<Env>;
export const api = new Hono<Env>();

const fail = (c: Context, e: ApiError): Response => c.json({ error: { code: e.code, message: e.message, fix: e.fix } }, e.status);
const notFound = (c: Context, what: string, fix: string): Response => fail(c, { status: 404, code: `${what.toUpperCase().replace(/ /g, "_")}_NOT_FOUND`, message: `No ${what} has that id.`, fix });
const actor = (c: C) => `API key "${c.get("key").label}"`;

const body = async (c: Context): Promise<Body | undefined> => {
  const b = await c.req.json().catch(() => undefined);
  return b && typeof b === "object" && !Array.isArray(b) ? (b as Body) : undefined;
};
const badJson: ApiError = { status: 400, code: "BODY_INVALID", message: "The body is not a JSON object.", fix: "Send Content-Type: application/json and a JSON object." };

// paged answers one page of a list, or the reason the paging is wrong.
const paged = <T>(c: Context, run: (p: Page) => Promise<{ items: T[]; limit: number; offset: number; next_offset: number | null }>, name: string, map: (x: T) => unknown): Response | Promise<Response> => {
  const p = pageFrom({ limit: c.req.query("limit"), offset: c.req.query("offset") });
  if (!p.ok) return fail(c, p.error);
  return run(p.value).then((r): Response => c.json({ [name]: r.items.map(map), limit: r.limit, offset: r.offset, next_offset: r.next_offset }));
};

// ----- Shapes -----

const siteJson = (s: Site) => ({ id: s.id, name: s.name, address: s.address, archived: s.archived, poster_url: `${baseUrl()}/s/${s.poster_token}` });

const typeJson = (t: VisitorType) => ({
  id: t.id,
  name: t.name,
  contractor: t.contractor,
  asks: { company: t.ask_company, phone_number: t.ask_phone, email: t.ask_email, host: t.ask_host },
  questions: t.questions,
  induction_ids: t.induction_ids,
  archived: t.archived,
});

const visitJson = (v: store.VisitRow) => ({
  id: v.id,
  site: { id: v.site_id, name: v.site_name },
  kind: v.person_id !== null ? "staff" : v.contractor ? "contractor" : "visitor",
  type: v.type_name,
  full_name: v.name,
  company: v.company,
  phone_number: v.phone,
  email: v.email,
  host: v.host_id ? { id: v.host_id, name: v.host_name } : null,
  person_id: v.person_id,
  visitor_id: v.visitor_id,
  warning: v.warning || null,
  source: v.source,
  answers: v.answers,
  inductions: v.inductions.map((i) => ({ id: i.induction_id, title: i.title, version: i.version, score: i.score })),
  signed_in_at: v.signed_in_at,
  signed_out_at: v.signed_out_at,
  signed_out_by: v.signed_out_by,
  url: `${baseUrl()}/visits/${v.id}`,
});

const inviteJson = (i: store.Invite) => ({
  id: i.id,
  site: { id: i.site_id, name: i.site_name },
  type: i.type_id ? { id: i.type_id, name: i.type_name } : null,
  host: i.host_id ? { id: i.host_id, name: i.host_name } : null,
  full_name: i.name,
  email: i.email,
  company: i.company,
  expected_on: i.expected_on,
  code: i.code,
  invite_url: `${baseUrl()}/i/${i.token}`,
  ready: !!i.ready_at,
  arrived_at: i.arrived_at,
});

const personJson = (p: Person) => ({ id: p.id, name: p.name, email: p.email, site_id: p.site_id, archived: p.archived });

const companyJson = (co: Company, today: string) => {
  const s = companyState(co, today);
  return { id: co.id, name: co.name, contact_email: co.contact_email, insurance_expires: co.insurance_expires, licence_expires: co.licence_expires, state: s.state, lapsed: s.lapsed, expiring: s.soon, archived: co.archived };
};

const rollCallJson = async (rc: store.RollCallRow) => {
  const [visits, safe, site] = await Promise.all([store.onSite(rc.site_id), store.marks(rc.id), store.site(rc.site_id)]);
  return {
    id: rc.id,
    site: { id: rc.site_id, name: site?.name ?? "" },
    started_by: rc.started_by,
    started_at: rc.started_at,
    finished_at: rc.ended_at,
    summary: rollCall(visits, safe),
    people: visits.map((v) => ({ visit_id: v.id, full_name: v.name, company: v.company, kind: v.person_id !== null ? "staff" : v.contractor ? "contractor" : "visitor", safe: safe.has(v.id) })),
  };
};

const today = async () => {
  const s = await store.settings();
  return { s, day: localDay(new Date(), s.timezone) };
};

// ----- The list, open to anyone -----

api.get("/", (c) =>
  c.json({
    authentication: "Authorization: Bearer <key>, Basic auth with the key as the username, X-Api-Key: <key>, or ?token=<key>. Keys are made under Setup > Settings > API keys.",
    pagination: "Lists take ?limit= (1-200, default 50) and ?offset=, and answer next_offset (null on the last page).",
    errors: '{"error": {"code", "message", "fix"}}',
    endpoints: [
      "GET /api/v1/sites",
      "GET /api/v1/visitor-types",
      "GET /api/v1/on-site?site_id=",
      "GET /api/v1/visits?from=YYYY-MM-DD&to=YYYY-MM-DD&site_id=&type=&q=",
      "GET /api/v1/visits/:id",
      "POST /api/v1/visits {site_id, type_id, full_name, company?, phone_number?, email?, host_id?, answers?: [..] or {label: answer}, invite_id?} or {site_id, person_id} for staff",
      "POST /api/v1/visits/:id/sign-out",
      "GET /api/v1/invites?from=YYYY-MM-DD&site_id=",
      "POST /api/v1/invites {site_id, full_name, expected_on: YYYY-MM-DD, email?, company?, type_id?, host_id?}",
      "GET /api/v1/invites/:id",
      "DELETE /api/v1/invites/:id",
      "GET /api/v1/people?archived=true",
      "POST /api/v1/people {name, email?, site_id?}",
      "GET /api/v1/people/:id",
      "PATCH /api/v1/people/:id {name?, email?, site_id?, archived?}",
      "GET /api/v1/companies?archived=true",
      "POST /api/v1/companies {name, contact_email?, insurance_expires?, licence_expires?}",
      "GET /api/v1/companies/:id",
      "PATCH /api/v1/companies/:id {name?, contact_email?, insurance_expires?: YYYY-MM-DD | null, licence_expires?, archived?}",
      "GET /api/v1/roll-calls?site_id=",
      "POST /api/v1/roll-calls {site_id}",
      "GET /api/v1/roll-calls/:id",
      "POST /api/v1/roll-calls/:id/marks {visit_id, safe?: true}",
      "POST /api/v1/roll-calls/:id/finish",
    ],
  }),
);

// ----- Every other call needs a key -----

api.use("*", async (c, next) => {
  const raw = keyFrom({ authorization: c.req.header("authorization"), xApiKey: c.req.header("x-api-key"), token: c.req.query("token") });
  const key = raw ? await store.keyFor(raw) : undefined;
  if (!key) return fail(c, keyMissing);
  c.set("key", key);
  c.header("Cache-Control", "no-store");
  await next();
});

// ----- Sites and visitor types -----

api.get("/sites", (c) => paged(c, async (p) => pageOf(await store.sites(c.req.query("archived") === "true"), p), "sites", siteJson));

api.get("/visitor-types", (c) => paged(c, async (p) => pageOf(await store.types(c.req.query("archived") === "true"), p), "visitor_types", typeJson));

// ----- Who is on site now -----

api.get("/on-site", async (c) => {
  const siteId = optionalId(c.req.query("site_id"));
  if (Number.isNaN(siteId) || (siteId && !(await store.site(siteId)))) return notFound(c, "site", "GET /api/v1/sites lists them.");
  const p = pageFrom({ limit: c.req.query("limit"), offset: c.req.query("offset") });
  if (!p.ok) return fail(c, p.error);
  const sites = siteId ? [siteId] : (await store.sites()).map((s) => s.id);
  const [visits, open] = await Promise.all([store.onSite(siteId ?? null), Promise.all(sites.map((x) => store.openRollCall(x)))]);
  const page = pageOf(visits, p.value);
  return c.json({
    tally: tally(visits),
    roll_calls: open.filter((r) => !!r).map((r) => ({ id: r!.id, site_id: r!.site_id, started_at: r!.started_at })),
    visits: page.items.map(visitJson),
    limit: page.limit,
    offset: page.offset,
    next_offset: page.next_offset,
  });
});

// ----- Visits: history, signing in and out -----

api.get("/visits", async (c) => {
  const { s, day } = await today();
  const from = c.req.query("from") ?? addDays(day, -30);
  const to = c.req.query("to") ?? day;
  if (!isDay(from) || !isDay(to)) return fail(c, { status: 400, code: "DATE_INVALID", message: "from and to must be dates as YYYY-MM-DD.", fix: "Send ?from=2026-10-01&to=2026-10-31, or leave them out for the last 30 days." });
  const site = optionalId(c.req.query("site_id"));
  if (Number.isNaN(site)) return notFound(c, "site", "GET /api/v1/sites lists them.");
  const f = { from, to, site: site ?? null, type: str(c.req.query("type"), 80), q: str(c.req.query("q"), 80), tz: s.timezone };
  return paged(c, async (p) => pageFromRows(await store.history(f, p.limit + 1, p.offset), p), "visits", visitJson);
});

api.get("/visits/:id", async (c) => {
  const v = await store.visitById(id(c.req.param("id")));
  return v ? c.json({ visit: visitJson(v) }) : notFound(c, "visit", "GET /api/v1/visits lists them.");
});

api.post("/visits", async (c) => {
  const b = await body(c);
  if (!b) return fail(c, badJson);
  const site = await store.site(id(b.site_id));
  if (!site || site.archived) return notFound(c, "site", "Send site_id from GET /api/v1/sites.");

  // A member of staff: the same as tapping their name on the kiosk's staff board.
  if (b.person_id !== undefined) {
    const p = await store.person(id(b.person_id));
    if (!p || p.archived || (p.site_id !== null && p.site_id !== site.id)) return notFound(c, "person", "GET /api/v1/people lists staff and their site.");
    const visit = await store.signIn(
      { site_id: site.id, visitor_id: null, person_id: p.id, type_id: null, type_name: "Staff", host_id: null, invite_id: null, name: p.name, company: "", phone: "", email: p.email, answers: [], inductions: [], photo_upload_id: null, warning: "", source: "staff" },
      [],
      null,
    );
    return c.json({ visit: visitJson((await store.visitById(visit.id))!) }, 201);
  }

  const inv = b.invite_id !== undefined ? await store.invite(id(b.invite_id)) : undefined;
  if (b.invite_id !== undefined && (!inv || inv.site_id !== site.id)) return notFound(c, "invite", "GET /api/v1/invites lists them; the invite must be for this site.");
  const types = (await store.types()).filter((t) => !t.archived);
  const t = types.find((x) => x.id === (b.type_id !== undefined ? id(b.type_id) : inv?.type_id)) ?? (b.type_id === undefined && types.length === 1 ? types[0] : undefined);
  if (!t) return notFound(c, "visitor type", "Send type_id from GET /api/v1/visitor-types.");

  const { s, day } = await today();
  const [hosts, inductions, companies] = await Promise.all([store.hostsFor(site.id), store.inductions(true), store.companies()]);
  const fromInvite = inv ? { full_name: inv.name, company: inv.company, email: inv.email, host_id: inv.host_id ?? undefined } : {};
  const checked = checkDetails(t, hosts, visitForm(t, { ...fromInvite, ...b }));
  const d = checked.details;
  const found = await store.findVisitor(phoneKey(d.phone), d.email);
  const known = (found && sameVisitor(found.name, d.name) ? found : undefined) ?? (inv?.visitor_id ? await store.visitor(inv.visitor_id) : undefined);
  const company = t.contractor && d.company ? await store.companyByName(d.company) : undefined;
  const admission = admit(t, company, s.contractor_policy, day, companies.length > 0);
  const due = inductionsDue(t, inductions, known ? await store.passes(known.id) : [], new Date());
  const verdict = signInVerdict(checked, admission, due);
  if (!verdict.ok) return c.json({ error: { code: verdict.error.code, message: verdict.error.message, fix: verdict.error.fix, ...(checked.ok ? {} : { fields: fieldErrors(checked.errors) }), ...(due.length ? { inductions: due.map((i) => ({ id: i.id, title: i.title })) } : {}) } }, verdict.error.status);

  const visit = await store.signIn(
    { site_id: site.id, visitor_id: known?.id ?? null, person_id: null, type_id: t.id, type_name: t.name, invite_id: inv?.id ?? null, ...d, inductions: [], photo_upload_id: null, warning: admission.warning, source: "staff" },
    [],
    company?.id ?? null,
  );
  const host = d.host_id ? await store.person(d.host_id) : undefined;
  await arrived(s, { ...d, type_name: t.name, site_name: site.name, warning: admission.warning, visit_id: visit.id }, host).catch((err) => log.error({ err: String(err) }, "host not told"));
  return c.json({ visit: visitJson((await store.visitById(visit.id))!) }, 201);
});

api.post("/visits/:id/sign-out", async (c) => {
  const v = await store.visitById(id(c.req.param("id")));
  if (!v) return notFound(c, "visit", "GET /api/v1/on-site lists who is in.");
  if (v.signed_out_at || !(await store.signOut(v.id, actor(c))))
    return fail(c, { status: 409, code: "ALREADY_SIGNED_OUT", message: `${v.name} is already signed out.`, fix: "GET /api/v1/on-site lists who is still in." });
  return c.json({ visit: visitJson((await store.visitById(v.id))!) });
});

// ----- Expected visitors -----

api.get("/invites", async (c) => {
  const { day } = await today();
  const from = c.req.query("from") ?? day;
  if (!isDay(from)) return fail(c, { status: 400, code: "DATE_INVALID", message: "from must be a date as YYYY-MM-DD.", fix: "Send ?from=2026-10-01, or leave it out for today on." });
  const site = optionalId(c.req.query("site_id"));
  if (Number.isNaN(site)) return notFound(c, "site", "GET /api/v1/sites lists them.");
  return paged(c, async (p) => pageOf(await store.invitesFrom(from, site ?? null), p), "invites", inviteJson);
});

api.get("/invites/:id", async (c) => {
  const i = await store.invite(id(c.req.param("id")));
  return i ? c.json({ invite: inviteJson(i) }) : notFound(c, "invite", "GET /api/v1/invites lists them.");
});

api.post("/invites", async (c) => {
  const b = await body(c);
  if (!b) return fail(c, badJson);
  const { s, day } = await today();
  const values = { name: str(b.full_name ?? b.name, 200), email: str(b.email, 200).toLowerCase(), company: str(b.company, 200), day: str(b.expected_on, 10) };
  const problems = inviteProblems(values, day);
  if (Object.keys(problems).length) return fail(c, inviteError(problems));
  const site = await store.site(id(b.site_id));
  if (!site || site.archived) return notFound(c, "site", "Send site_id from GET /api/v1/sites.");
  const type = b.type_id !== undefined && b.type_id !== null ? await store.type(id(b.type_id)) : undefined;
  if (b.type_id !== undefined && b.type_id !== null && !type) return notFound(c, "visitor type", "GET /api/v1/visitor-types lists them.");
  const host = b.host_id !== undefined && b.host_id !== null ? await store.person(id(b.host_id)) : undefined;
  if (b.host_id !== undefined && b.host_id !== null && !host) return notFound(c, "person", "Send host_id from GET /api/v1/people.");
  const newId = await store.addInvite(
    { site_id: site.id, type_id: type?.id ?? null, host_id: host?.id ?? null, name: values.name, email: values.email, company: values.company, expected_on: values.day, created_by: actor(c) },
    () => inviteCode(Math.random),
  );
  const inv = (await store.invite(newId))!;
  if (inv.email) await invited(s, inv);
  return c.json({ invite: inviteJson(inv), emailed: !!inv.email }, 201);
});

api.delete("/invites/:id", async (c) => {
  const i = await store.invite(id(c.req.param("id")));
  if (!i) return notFound(c, "invite", "GET /api/v1/invites lists them.");
  await store.deleteInvite(i.id);
  return c.body(null, 204);
});

// ----- Staff -----

api.get("/people", (c) => paged(c, async (p) => pageOf(await store.people(c.req.query("archived") === "true"), p), "people", personJson));

api.get("/people/:id", async (c) => {
  const p = await store.person(id(c.req.param("id")));
  return p ? c.json({ person: personJson(p) }) : notFound(c, "person", "GET /api/v1/people lists them.");
});

api.post("/people", async (c) => {
  const b = await body(c);
  if (!b) return fail(c, badJson);
  if (b.name === undefined) return fail(c, { status: 422, code: "NAME_REQUIRED", message: "name is missing.", fix: 'Send {"name": "Mei Chen", "email": "mei@example.com"}.' });
  const r = personPatch(b, (await store.sites()).map((s) => s.id));
  if (!r.ok) return fail(c, r.error);
  const newId = await store.addPerson(r.value.name!, r.value.email ?? "", r.value.site_id ?? null);
  return c.json({ person: personJson((await store.person(newId))!) }, 201);
});

api.patch("/people/:id", async (c) => {
  const p = await store.person(id(c.req.param("id")));
  if (!p) return notFound(c, "person", "GET /api/v1/people lists them.");
  const b = await body(c);
  if (!b) return fail(c, badJson);
  const r = personPatch(b, (await store.sites(true)).map((s) => s.id));
  if (!r.ok) return fail(c, r.error);
  const next = { ...p, ...r.value };
  await store.savePerson(p.id, next.name, next.email, next.site_id, next.archived);
  return c.json({ person: personJson((await store.person(p.id))!) });
});

// ----- Contractor companies -----

api.get("/companies", async (c) => {
  const { day } = await today();
  return paged(c, async (p) => pageOf(await store.companies(c.req.query("archived") === "true"), p), "companies", (co: Company) => companyJson(co, day));
});

api.get("/companies/:id", async (c) => {
  const co = await store.company(id(c.req.param("id")));
  return co ? c.json({ company: companyJson(co, (await today()).day) }) : notFound(c, "company", "GET /api/v1/companies lists them.");
});

api.post("/companies", async (c) => {
  const b = await body(c);
  if (!b) return fail(c, badJson);
  if (b.name === undefined) return fail(c, { status: 422, code: "NAME_REQUIRED", message: "name is missing.", fix: 'Send {"name": "Oakwood Plumbing"}.' });
  const r = companyPatch(b);
  if (!r.ok) return fail(c, r.error);
  const co = (await store.company(await store.addCompany(r.value.name!)))!;
  await store.saveCompany({ ...co, ...r.value });
  return c.json({ company: companyJson((await store.company(co.id))!, (await today()).day) }, 201);
});

api.patch("/companies/:id", async (c) => {
  const co = await store.company(id(c.req.param("id")));
  if (!co) return notFound(c, "company", "GET /api/v1/companies lists them.");
  const b = await body(c);
  if (!b) return fail(c, badJson);
  const r = companyPatch(b);
  if (!r.ok) return fail(c, r.error);
  await store.saveCompany({ ...co, ...r.value });
  return c.json({ company: companyJson((await store.company(co.id))!, (await today()).day) });
});

// ----- Roll calls -----

const rollCallFrom = async (c: C) => store.rollCallById(id(c.req.param("id")));
const noRollCall = (c: C) => notFound(c, "roll call", "GET /api/v1/roll-calls lists the open ones.");

api.get("/roll-calls", async (c) => {
  const site = optionalId(c.req.query("site_id"));
  if (Number.isNaN(site)) return notFound(c, "site", "GET /api/v1/sites lists them.");
  const ids = site ? [site] : (await store.sites()).map((s) => s.id);
  const open = (await Promise.all(ids.map((x) => store.openRollCall(x)))).filter((r): r is store.RollCallRow => !!r);
  return paged(c, async (p) => pageOf(await Promise.all(open.map(rollCallJson)), p), "roll_calls", (r) => r);
});

api.post("/roll-calls", async (c) => {
  const b = await body(c);
  if (!b) return fail(c, badJson);
  const site = await store.site(id(b.site_id));
  if (!site) return notFound(c, "site", "Send site_id from GET /api/v1/sites.");
  const existing = await store.openRollCall(site.id);
  const rcId = await store.startRollCall(site.id, actor(c));
  if (!existing) await rollCallStarted(await store.settings(), site.name, actor(c))?.catch(() => undefined);
  return c.json({ roll_call: await rollCallJson((await store.rollCallById(rcId))!), started: !existing }, existing ? 200 : 201);
});

api.get("/roll-calls/:id", async (c) => {
  const rc = await rollCallFrom(c);
  return rc ? c.json({ roll_call: await rollCallJson(rc) }) : noRollCall(c);
});

api.post("/roll-calls/:id/marks", async (c) => {
  const rc = await rollCallFrom(c);
  if (!rc) return noRollCall(c);
  if (rc.ended_at) return fail(c, { status: 409, code: "ROLL_CALL_FINISHED", message: "This roll call is finished.", fix: "Start a new one with POST /api/v1/roll-calls." });
  const b = await body(c);
  if (!b) return fail(c, badJson);
  if (b.safe !== undefined && typeof b.safe !== "boolean") return fail(c, { status: 400, code: "SAFE_INVALID", message: "safe must be true or false.", fix: 'Send {"visit_id": 12, "safe": true}.' });
  const v = await store.visitById(id(b.visit_id));
  if (!v || v.site_id !== rc.site_id || v.signed_out_at) return notFound(c, "visit", "Send a visit_id from this roll call's people.");
  await store.mark(rc.id, v.id, b.safe !== false, actor(c));
  return c.json({ roll_call: await rollCallJson(rc) });
});

api.post("/roll-calls/:id/finish", async (c) => {
  const rc = await rollCallFrom(c);
  if (!rc) return noRollCall(c);
  if (rc.ended_at) return fail(c, { status: 409, code: "ROLL_CALL_FINISHED", message: "This roll call is already finished.", fix: "Start a new one with POST /api/v1/roll-calls." });
  await store.endRollCall(rc.id);
  return c.json({ roll_call: await rollCallJson((await store.rollCallById(rc.id))!) });
});

api.all("*", (c) => fail(c, { status: 404, code: "NOT_FOUND", message: "There is no such API endpoint.", fix: "GET /api/v1 lists the endpoints." }));
