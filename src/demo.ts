// Demo mode, for the live example only. With DEMO=1 (set in demo/whisk.yaml):
// - "Look around" makes the visitor a guest member of staff, and "Try the kiosk" turns their
//   browser into a kiosk, so nobody has to sign up;
// - emails and chat posts are recorded in the outbox but never sent (notify.ts asks isDemo),
//   uploads are refused, and settings that point outside the app are read-only;
// - the guest can make API keys under Setup > Settings and try the API on the sample data; the
//   nightly reset deletes the keys with everything else;
// - sample people, contractors and a month of visits are put back every night, and today's
//   visitors arrive through the day as the clock passes their arrival times.
// A real install never sets DEMO, and nothing here runs: the routes answer 404 and the guest
// cookie is ignored. See demo/whisk.yaml and demo/deploy.mjs.
import { createHmac } from "node:crypto";
import type { Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { html } from "hono/html";
import { sql } from "./db.js";
import { addDays, atLocal, localDay, passExpiry, seal, unseal } from "./model.js";
import { seed } from "./seed.js";
import * as store from "./store.js";
import { inngest, type Identity } from "./whisk.js";

export const isDemo = () => process.env.DEMO === "1";

const GUEST = "guest";
const TZ = "America/New_York";

// ----- The guest -----

// demoWho is the guest's identity: a member of staff who may do everything, for this browser only.
export const demoWho = async (c: Context): Promise<Identity | undefined> => {
  if (!isDemo() || c.req.header("x-whisk-audience") === "team") return undefined;
  const g = unseal<{ exp: number }>(await store.secret(), getCookie(c, GUEST));
  if (!g || g.exp < Date.now()) return undefined;
  return { audience: "team", userId: "demo-guest", email: "guest@example.com", name: "Guest", groups: [], roles: ["member", "admin"], requestId: c.req.header("x-whisk-request-id") ?? "" };
};

const cookie = (c: Context, name: string, value: string, days: number) =>
  setCookie(c, name, value, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: days * 86400 });

export const demoRoutes = (app: Hono, landing: (c: Context) => Promise<Response>, kioskCookie: string) => {
  if (!isDemo()) return;
  // Anyone who is not signed in sees the way into the demo instead of a sign-in page.
  app.get("/", async (c, next) => ((await demoWho(c)) || c.req.header("x-whisk-audience") === "team" ? next() : landing(c)));
  app.post("/demo/start", async (c) => {
    cookie(c, GUEST, seal(await store.secret(), { exp: Date.now() + 7 * 86400000 }), 7);
    return c.redirect("/", 303);
  });
  app.get("/demo/leave", (c) => {
    deleteCookie(c, GUEST, { path: "/" });
    deleteCookie(c, kioskCookie, { path: "/" });
    return c.redirect("/");
  });
  app.post("/demo/kiosk", async (c) => {
    cookie(c, kioskCookie, kioskToken(await store.secret()), 7);
    return c.redirect("/kiosk", 303);
  });
};

export const demoLanding = (business: string) => html`
<section class="demo-hero wrap">
  <span class="badge accent">Live demo</span>
  <h1>${business}</h1>
  <p class="lead">Visitor and contractor sign-in, running on Whisk.</p>
  <div class="demo-actions">
    <form method="post" action="/demo/kiosk"><button class="demo-card" type="submit"><b>Try the kiosk</b><span>What visitors see on the tablet</span></button></form>
    <form method="post" action="/demo/start"><button class="demo-card" type="submit"><b>Look around</b><span>What reception and the team see</span></button></form>
  </div>
  <p class="muted small">Sample data. Nothing is sent. It all resets every night.</p>
</section>`;

// ----- Sample data -----

// A small seeded random, so the sample month is the same for everyone on a given day.
const rng = (seedValue: number) => {
  let a = seedValue >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const pick = <T>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];

const hosts = ["Sarah Mitchell", "Sam Patel", "Mei Chen", "Tom Fletcher", "Lucy Walsh", "Marcus Bennett", "Grace Kim"] as const;
const staffBoard = ["Sarah Mitchell", "Sam Patel", "Tom Fletcher", "Grace Kim"] as const;

type Sample = { name: string; company: string; phone: string; type: "Visitor" | "Contractor" | "Delivery" | "Interview"; work?: string };
const samples: Sample[] = [
  { name: "James Wilson", company: "Oakwood Plumbing", phone: "212-555-0142", type: "Contractor", work: "Replace the water heater" },
  { name: "Kevin Walker", company: "Southern Electrical", phone: "212-555-0178", type: "Contractor", work: "Electrical safety inspection" },
  { name: "Priya Sharma", company: "Northwind Accounting", phone: "212-555-0113", type: "Visitor" },
  { name: "Olivia Brown", company: "Lakeside Insurance", phone: "212-555-0190", type: "Visitor" },
  { name: "Daniel Ruiz", company: "Bright Scaffolding", phone: "212-555-0121", type: "Contractor", work: "Scaffold for the roof repair" },
  { name: "Sophie Martin", company: "Swift Couriers", phone: "", type: "Delivery" },
  { name: "Liam O'Connor", company: "Main Street Office Supplies", phone: "", type: "Delivery" },
  { name: "Ana Silva", company: "", phone: "212-555-0167", type: "Interview" },
  { name: "Ben Taylor", company: "Oakwood Plumbing", phone: "212-555-0155", type: "Contractor", work: "Fix the leaking faucet in the kitchen" },
  { name: "Chloe Nguyen", company: "Pacific Design Studio", phone: "212-555-0109", type: "Visitor" },
  { name: "Megan Parker", company: "Interstate Logistics", phone: "212-555-0184", type: "Visitor" },
  { name: "Jack Robinson", company: "Southern Electrical", phone: "212-555-0136", type: "Contractor", work: "New sockets in the meeting room" },
  { name: "Emily Clarke", company: "", phone: "212-555-0127", type: "Interview" },
  { name: "Noah Singh", company: "Fresh Fruit Co", phone: "", type: "Delivery" },
];

// Today's arrivals: each comes in when the clock passes its time and some leave later.
const today: { who: string; at: string; leave?: string; site: 0 | 1; host?: string }[] = [
  { who: "Sophie Martin", at: "07:55", leave: "08:05", site: 1 },
  { who: "James Wilson", at: "08:10", site: 1, host: "Tom Fletcher" },
  { who: "Kevin Walker", at: "08:40", leave: "12:20", site: 1, host: "Tom Fletcher" },
  { who: "Priya Sharma", at: "09:05", leave: "10:30", site: 0, host: "Mei Chen" },
  { who: "Daniel Ruiz", at: "09:30", site: 1, host: "Tom Fletcher" },
  { who: "Olivia Brown", at: "10:15", site: 0, host: "Sarah Mitchell" },
  { who: "Liam O'Connor", at: "11:00", leave: "11:10", site: 0 },
  { who: "Ana Silva", at: "13:20", leave: "14:15", site: 0, host: "Lucy Walsh" },
  { who: "Chloe Nguyen", at: "14:00", site: 0, host: "Sam Patel" },
  { who: "Jack Robinson", at: "14:45", site: 1, host: "Grace Kim" },
];

const ids = async () => {
  const [sites, types, people, visitors, inductions] = await Promise.all([
    sql<{ id: number }[]>`select id from sites order by position, id`,
    sql<{ id: number; name: string; induction_ids: number[] }[]>`select id, name, induction_ids from visitor_types`,
    sql<{ id: number; name: string }[]>`select id, name from people`,
    sql<{ id: number; name: string }[]>`select id, name from visitors`,
    sql<{ id: number; title: string; version: number; valid_months: number }[]>`select id, title, version, valid_months from inductions`,
  ]);
  const by = <T extends { name: string }>(xs: T[]) => new Map(xs.map((x) => [x.name, x]));
  return { sites, types: by(types), people: by(people), visitors: by(visitors), inductions };
};

const insertVisit = async (k: Awaited<ReturnType<typeof ids>>, s: Sample, siteIndex: number, hostName: string | undefined, inAt: Date, outAt: Date | null, outBy: string | null, token: string, source: string) => {
  const t = k.types.get(s.type)!;
  const done = k.inductions.filter((i) => t.induction_ids.includes(i.id)).map((i) => ({ induction_id: i.id, title: i.title, version: i.version, score: 100 }));
  const answers = s.work ? [{ label: "What work are you doing today?", answer: s.work }] : [];
  await sql`insert into visits (site_id, visitor_id, type_id, type_name, host_id, name, company, phone, answers, inductions, source, token, signed_in_at, signed_out_at, signed_out_by, warning)
    values (${k.sites[siteIndex].id}, ${k.visitors.get(s.name)!.id}, ${t.id}, ${s.type}, ${hostName ? k.people.get(hostName)!.id : null}, ${s.name}, ${s.company}, ${s.phone},
      ${sql.json(answers as never)}, ${sql.json(done as never)}, ${source}, ${token}, ${inAt}, ${outAt}, ${outBy},
      ${s.company === "Bright Scaffolding" ? "Bright Scaffolding: insurance expired" : ""})
    on conflict (token) do nothing`;
};

// sample fills a fresh install with people, contractors, a month of visits and some expected
// visitors, relative to the day it runs.
// The demo's one kiosk: every "Try the kiosk" shares it, so clicks don't pile up tablets.
const kioskToken = (secret: string) => createHmac("sha256", secret).update("demo-kiosk").digest("base64url");

const sample = async (now: Date) => {
  const day = localDay(now, TZ);
  await sql`update settings set business_name = 'Summit Build Co.', badges = true, admin_email = 'reception@example.com'`;
  const [first] = await sql<{ id: number }[]>`select id from sites order by id limit 1`;
  await sql`update sites set name = 'Downtown office', address = '12 Garden Street, Albany, NY 12207' where id = ${first.id}`;
  await sql`insert into sites (name, address, poster_token, position) values ('Riverside yard', '48 Station Road, Albany, NY 12205', ${store.token(9)}, 1)`;
  const siteIds = (await sql<{ id: number }[]>`select id from sites order by position, id`).map((r) => r.id);
  await sql`insert into kiosks (site_id, name, token_hash, paired_at) values (${siteIds[0]}, 'Reception tablet', ${store.hash(kioskToken(await store.secret()))}, now())`;
  for (const [i, name] of hosts.entries()) {
    const email = `${name.split(" ")[0].toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}@example.com`;
    await sql`insert into people (name, email, site_id) values (${name}, ${email}, ${i % 3 === 0 ? siteIds[1] : siteIds[0]})`;
  }
  await sql`insert into companies (name, contact_email, insurance_expires, licence_expires) values
    ('Oakwood Plumbing', 'office@example.com', ${addDays(day, 170)}, ${addDays(day, 260)}),
    ('Southern Electrical', 'admin@example.com', ${addDays(day, 9)}, ${addDays(day, 300)}),
    ('Bright Scaffolding', 'hello@example.com', ${addDays(day, -12)}, ${addDays(day, 90)})`;
  const k0 = await ids();
  for (const s of samples) {
    const [c] = await sql<{ id: number }[]>`select id from companies where name = ${s.company}`;
    const [v] = await sql<{ id: number }[]>`insert into visitors (name, phone, company, company_id, created_at, last_visit_at)
      values (${s.name}, ${s.phone}, ${s.company}, ${c?.id ?? null}, ${new Date(now.getTime() - 40 * 86400000)}, ${now}) returning id`;
    const t = k0.types.get(s.type)!;
    for (const i of k0.inductions.filter((x) => t.induction_ids.includes(x.id))) {
      const passed = new Date(now.getTime() - 30 * 86400000);
      await sql`insert into passes (visitor_id, induction_id, version, score, signature, passed_at, expires_at)
        values (${v.id}, ${i.id}, ${i.version}, 100, 'M10 30 C 20 10, 30 50, 40 30 S 60 10, 70 30', ${passed}, ${passExpiry(passed, i.valid_months)})`;
    }
  }
  const k = await ids();
  // The past month: a handful of visits each weekday, all signed out.
  const r = rng(Number(day.replace(/-/g, "")));
  for (let back = 30; back >= 1; back--) {
    const d = addDays(day, -back);
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const n = 3 + Math.floor(r() * 6);
    for (let j = 0; j < n; j++) {
      const s = pick(r, samples);
      const startMin = 7 * 60 + 30 + Math.floor(r() * 8 * 60);
      const stay = s.type === "Delivery" ? 5 + Math.floor(r() * 10) : 30 + Math.floor(r() * 300);
      const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const inAt = atLocal(d, hhmm(startMin), TZ);
      const forgot = r() < 0.08;
      const outAt = forgot ? atLocal(d, "23:00", TZ) : new Date(inAt.getTime() + stay * 60000);
      const site = s.type === "Contractor" ? 1 : r() < 0.7 ? 0 : 1;
      await insertVisit(k, s, site, s.type === "Delivery" ? undefined : pick(r, hosts), inAt, outAt, forgot ? "automatic" : r() < 0.6 ? "kiosk" : "phone", store.token(), r() < 0.7 ? "kiosk" : "phone");
    }
  }
  // Expected visitors: two today, a few later this week.
  const expected = [
    ["Ryan Morgan", "Interstate Logistics", 0, 0, "Sarah Mitchell"],
    ["Hannah Lee", "Oakwood Plumbing", 0, 1, "Tom Fletcher"],
    ["George Smith", "Lakeside Insurance", 1, 0, "Mei Chen"],
    ["Isla Thompson", "", 2, 0, "Lucy Walsh"],
    ["Mason Reid", "Southern Electrical", 3, 1, "Grace Kim"],
  ] as const;
  for (const [name, company, inDays, site, host] of expected) {
    const type = k.types.get(company === "Oakwood Plumbing" || company === "Southern Electrical" ? "Contractor" : company ? "Visitor" : "Interview")!;
    await store.addInvite(
      { site_id: k.sites[site].id, type_id: type.id, host_id: k.people.get(host)!.id, name, email: "", company, expected_on: addDays(day, inDays), created_by: "reception@example.com" },
      () => String(100000 + Math.floor(Math.random() * 900000)),
    );
  }
};

// demoTick brings the sample day up to now: arrivals whose time has passed come in, and those
// with a leaving time that has passed go out. Safe to run on every request; each arrival is
// keyed by its token.
let lastTick = 0;
export const demoTick = async (now = new Date()) => {
  if (!isDemo() || now.getTime() - lastTick < 30000) return;
  lastTick = now.getTime();
  const day = localDay(now, TZ);
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  const k = await ids();
  if (k.sites.length < 2 || k.visitors.size === 0) return;
  const staffAt = atLocal(day, "07:20", TZ);
  if (dow !== 0 && dow !== 6 && staffAt <= now) {
    for (const [i, name] of staffBoard.entries()) {
      const p = k.people.get(name);
      if (!p) continue;
      await sql`insert into visits (site_id, person_id, type_name, name, source, token, signed_in_at)
        values (${k.sites[i % 2].id}, ${p.id}, 'Staff', ${name}, 'kiosk', ${`demo-${day}-staff-${i}`}, ${new Date(staffAt.getTime() + i * 7 * 60000)})
        on conflict (token) do nothing`;
    }
  }
  for (const [i, a] of today.entries()) {
    const s = samples.find((x) => x.name === a.who);
    const inAt = atLocal(day, a.at, TZ);
    if (!s || !k.visitors.get(s.name) || inAt > now) continue;
    const t = `demo-${day}-${i}`;
    await insertVisit(k, s, a.site, a.host, inAt, null, null, t, i % 3 === 1 ? "phone" : "kiosk");
    const outAt = a.leave ? atLocal(day, a.leave, TZ) : undefined;
    if (outAt && outAt <= now) await sql`update visits set signed_out_at = ${outAt}, signed_out_by = 'kiosk' where token = ${t} and signed_out_at is null`;
  }
};

// reset puts the demo back to its sample state.
export const reset = async (now = new Date()) => {
  await sql`truncate api_keys, messages, roll_call_marks, roll_calls, kiosks, visits, invites, passes, visitors, companies, visitor_types, inductions, people, sites restart identity cascade`;
  await sql`update settings set business_name = 'Reception', accent = '#0f766e', timezone = ${TZ}, photos = false, badges = false, retention_months = 12,
    contractor_policy = 'warn', chat_webhook_url = '', email_from = '', admin_email = '',
    privacy_note = 'We keep your details to know who is on site and to keep everyone safe. They are deleted after 12 months.'`;
  await seed(sql);
  await sample(now);
  lastTick = 0;
  await demoTick(now);
};

export const demoFunctions = () =>
  isDemo()
    ? [inngest.createFunction({ id: "demo-reset", triggers: [{ cron: "0 3 * * *" }] }, async ({ step }) => step.run("reset", () => reset().then(() => "reset")))]
    : [];
