// Reading and writing rows. Each function is one small query or one short transaction;
// decisions live in model.ts.
import { createHash, randomBytes } from "node:crypto";
import { sql } from "./db.js";
import type { Ask, Company, Induction, Pass, Person, Question, Site, Visit, VisitorType } from "./model.js";

export type Settings = {
  business_name: string;
  accent: string;
  timezone: string;
  privacy_note: string;
  photos: boolean;
  badges: boolean;
  retention_months: number;
  contractor_policy: "warn" | "block";
  chat_webhook_url: string;
  email_from: string;
  admin_email: string;
  secret: string;
};

export const settings = async (): Promise<Settings> =>
  (await sql<Settings[]>`select business_name, accent, timezone, privacy_note, photos, badges, retention_months, contractor_policy,
    chat_webhook_url, email_from, admin_email, secret from settings where id = 1`)[0];

// The signing secret never changes once made, so it is read once.
let cachedSecret: Promise<string> | undefined;
export const secret = () => (cachedSecret ??= sql<{ secret: string }[]>`select secret from settings where id = 1`.then((r) => r[0].secret));

export const saveSettings = (s: Omit<Settings, "secret">) =>
  sql`update settings set business_name = ${s.business_name}, accent = ${s.accent}, timezone = ${s.timezone}, privacy_note = ${s.privacy_note},
    photos = ${s.photos}, badges = ${s.badges}, retention_months = ${s.retention_months}, contractor_policy = ${s.contractor_policy},
    chat_webhook_url = ${s.chat_webhook_url}, email_from = ${s.email_from}, admin_email = ${s.admin_email}, updated_at = now() where id = 1`;

export const token = (n = 18) => randomBytes(n).toString("base64url");
export const hash = (v: string) => createHash("sha256").update(v).digest("hex");

// ----- Sites -----

const siteCols = sql`id, name, address, poster_token, position, archived`;
export const sites = (withArchived = false) => sql<Site[]>`select ${siteCols} from sites where ${withArchived} or not archived order by position, id`;
export const site = async (id: number) => (await sql<Site[]>`select ${siteCols} from sites where id = ${id}`)[0];
export const siteByPoster = async (t: string) => (await sql<Site[]>`select ${siteCols} from sites where poster_token = ${t} and not archived`)[0];
export const addSite = async (name: string, address: string) =>
  (await sql<{ id: number }[]>`insert into sites (name, address, poster_token, position)
    values (${name}, ${address}, ${token(9)}, coalesce((select max(position) + 1 from sites), 0)) returning id`)[0].id;
export const saveSite = (id: number, name: string, address: string, archived: boolean) =>
  sql`update sites set name = ${name}, address = ${address}, archived = ${archived} where id = ${id}`;
export const newPoster = (id: number) => sql`update sites set poster_token = ${token(9)} where id = ${id}`;

// ----- People (staff and hosts) -----

const personCols = sql`id, name, email, site_id, archived`;
export const people = (withArchived = false) => sql<Person[]>`select ${personCols} from people where ${withArchived} or not archived order by lower(name)`;
export const person = async (id: number) => (await sql<Person[]>`select ${personCols} from people where id = ${id}`)[0];
export const hostsFor = (siteId: number) =>
  sql<Person[]>`select ${personCols} from people where not archived and (site_id is null or site_id = ${siteId}) order by lower(name)`;
export const addPerson = async (name: string, email: string, siteId: number | null) =>
  (await sql<{ id: number }[]>`insert into people (name, email, site_id) values (${name}, ${email}, ${siteId}) returning id`)[0].id;
export const savePerson = (id: number, name: string, email: string, siteId: number | null, archived: boolean) =>
  sql`update people set name = ${name}, email = ${email}, site_id = ${siteId}, archived = ${archived} where id = ${id}`;

// ----- Inductions -----

const inductionCols = sql`id, title, body, video_upload_id, questions, pass_mark, valid_months, version, archived`;
export const inductions = (withArchived = false) =>
  sql<Induction[]>`select ${inductionCols} from inductions where ${withArchived} or not archived order by lower(title)`;
export const induction = async (id: number) => (await sql<Induction[]>`select ${inductionCols} from inductions where id = ${id}`)[0];
export const addInduction = async (title: string) =>
  (await sql<{ id: number }[]>`insert into inductions (title) values (${title}) returning id`)[0].id;

// A change to the words or the quiz is a new version: everyone does it again on their next visit.
export const saveInduction = (i: Omit<Induction, "version" | "video_upload_id">, newVersion: boolean) =>
  sql`update inductions set title = ${i.title}, body = ${i.body}, questions = ${sql.json(i.questions as never)}, pass_mark = ${i.pass_mark},
    valid_months = ${i.valid_months}, archived = ${i.archived}, version = version + ${newVersion ? 1 : 0}, updated_at = now() where id = ${i.id}`;
export const setInductionVideo = (id: number, upload: string | null) =>
  sql`update inductions set video_upload_id = ${upload}, version = version + 1, updated_at = now() where id = ${id}`;

// ----- Visitor types -----

const typeCols = sql`id, name, icon, position, ask_company, ask_phone, ask_email, ask_host, photo, contractor, questions, induction_ids, archived`;
export const types = (withArchived = false) => sql<VisitorType[]>`select ${typeCols} from visitor_types where ${withArchived} or not archived order by position, id`;
export const type = async (id: number) => (await sql<VisitorType[]>`select ${typeCols} from visitor_types where id = ${id}`)[0];
export const addType = async (name: string) =>
  (await sql<{ id: number }[]>`insert into visitor_types (name, position) values (${name}, coalesce((select max(position) + 1 from visitor_types), 0)) returning id`)[0].id;
export const saveType = (t: VisitorType) =>
  sql`update visitor_types set name = ${t.name}, icon = ${t.icon}, ask_company = ${t.ask_company}, ask_phone = ${t.ask_phone}, ask_email = ${t.ask_email},
    ask_host = ${t.ask_host}, photo = ${t.photo}, contractor = ${t.contractor}, questions = ${sql.json(t.questions as Ask[] as never)},
    induction_ids = ${t.induction_ids}, archived = ${t.archived} where id = ${t.id}`;
export const moveType = (id: number, by: -1 | 1) =>
  sql.begin(async (tx) => {
    const all = await tx<{ id: number }[]>`select id from visitor_types order by position, id`;
    const i = all.findIndex((t) => t.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= all.length) return;
    const order = all.map((t) => t.id).map((t, k) => (k === i ? all[j].id : k === j ? all[i].id : t));
    await Promise.all(order.map((t, k) => tx`update visitor_types set position = ${k} where id = ${t}`));
  });

// ----- Contractor companies -----

const companyCols = sql`id, name, contact_email, insurance_expires::text, licence_expires::text, certificate_upload_id, archived`;
export const companies = (withArchived = false) =>
  sql<(Company & { warned_at: Date | null })[]>`select ${companyCols}, warned_at from companies where ${withArchived} or not archived order by lower(name)`;
export const company = async (id: number) => (await sql<Company[]>`select ${companyCols} from companies where id = ${id}`)[0];
export const companyByName = async (name: string) =>
  (await sql<Company[]>`select ${companyCols} from companies where lower(name) = lower(${name.trim()}) and not archived limit 1`)[0];
export const addCompany = async (name: string) => (await sql<{ id: number }[]>`insert into companies (name) values (${name}) returning id`)[0].id;
export const saveCompany = (c: Omit<Company, "certificate_upload_id">) =>
  sql`update companies set name = ${c.name}, contact_email = ${c.contact_email}, archived = ${c.archived},
    warned_at = case when insurance_expires is not distinct from ${c.insurance_expires}::date and licence_expires is not distinct from ${c.licence_expires}::date then warned_at end,
    insurance_expires = ${c.insurance_expires}, licence_expires = ${c.licence_expires} where id = ${c.id}`;
export const setCertificate = (id: number, upload: string | null) => sql`update companies set certificate_upload_id = ${upload} where id = ${id}`;
export const markWarned = (ids: number[]) => sql`update companies set warned_at = now() where id = any(${ids})`;

// ----- Visitors -----

export type Visitor = { id: number; name: string; phone: string; email: string; company: string };
export const visitor = async (id: number) => (await sql<Visitor[]>`select id, name, phone, email, company from visitors where id = ${id}`)[0];

// findVisitor recognizes a returning visitor by phone number or email.
export const findVisitor = async (phoneKey: string, email: string) =>
  (await sql<Visitor[]>`select id, name, phone, email, company from visitors
    where (${phoneKey} <> '' and regexp_replace(regexp_replace(phone, '[^0-9]', '', 'g'), '^1([0-9]{10})$', '\\1') = ${phoneKey})
       or (${email} <> '' and lower(email) = ${email})
    order by last_visit_at desc nulls last limit 1`)[0];

export const passes = (visitorId: number) =>
  sql<Pass[]>`select induction_id, version, expires_at from passes where visitor_id = ${visitorId}`;

export const signatures = async (visitorId: number) =>
  new Map((await sql<{ induction_id: number; signature: string }[]>`select induction_id, signature from passes where visitor_id = ${visitorId}`).map((r) => [r.induction_id, r.signature]));

export type VisitorRow = Visitor & { visits: number; last_visit_at: Date | null };

// ----- Visits -----

export type VisitRow = Visit & { site_name: string; host_name: string | null; contractor: boolean; answers: { label: string; answer: string }[]; inductions: { induction_id: number; title: string; version: number; score: number }[] };

const visitCols = sql`v.id, v.site_id, v.visitor_id, v.person_id, v.type_name, v.host_id, v.name, v.company, v.phone, v.email, v.photo_upload_id,
  v.warning, v.source, v.signed_in_at, v.signed_out_at, v.signed_out_by, v.answers, v.inductions,
  s.name as site_name, h.name as host_name, coalesce(t.contractor, false) as contractor`;
const visitFrom = sql`visits v join sites s on s.id = v.site_id left join people h on h.id = v.host_id left join visitor_types t on t.id = v.type_id`;

export const onSite = (siteId: number | null) =>
  sql<VisitRow[]>`select ${visitCols} from ${visitFrom} where v.signed_out_at is null and (${siteId}::int is null or v.site_id = ${siteId})
    order by v.signed_in_at desc`;

export const visitById = async (id: number) => (await sql<VisitRow[]>`select ${visitCols} from ${visitFrom} where v.id = ${id}`)[0];
export const visitByToken = async (t: string) => (await sql<VisitRow[]>`select ${visitCols} from ${visitFrom} where v.token = ${t}`)[0];

export type Filter = { from: string; to: string; site: number | null; type: string; q: string; tz: string };
// history: visits signed in between two local days, newest first.
export const history = (f: Filter, limit: number, offset = 0) =>
  sql<VisitRow[]>`select ${visitCols} from ${visitFrom}
    where v.signed_in_at >= (${f.from}::date)::timestamp at time zone ${f.tz}
      and v.signed_in_at < (${f.to}::date + 1)::timestamp at time zone ${f.tz}
      and (${f.site}::int is null or v.site_id = ${f.site})
      and (${f.type} = '' or v.type_name = ${f.type})
      and (${f.q} = '' or v.name ilike ${"%" + f.q + "%"} or v.company ilike ${"%" + f.q + "%"})
    order by v.signed_in_at desc, v.id desc limit ${limit} offset ${offset}`;

// openVisitByPhone finds a visitor on site by the phone number they signed in with.
export const openVisitByPhone = async (siteId: number, phoneKey: string) =>
  phoneKey.replace(/\D/g, "").length < 7
    ? undefined
    : (await sql<VisitRow[]>`select ${visitCols} from ${visitFrom} where v.site_id = ${siteId} and v.signed_out_at is null and v.person_id is null
        and regexp_replace(regexp_replace(v.phone, '[^0-9]', '', 'g'), '^1([0-9]{10})$', '\\1') = ${phoneKey} order by v.signed_in_at desc limit 1`)[0];

export const visitsOf = (visitorId: number) => sql<VisitRow[]>`select ${visitCols} from ${visitFrom} where v.visitor_id = ${visitorId} order by v.signed_in_at desc`;

export type NewVisit = {
  site_id: number;
  visitor_id: number | null;
  person_id: number | null;
  type_id: number | null;
  type_name: string;
  host_id: number | null;
  invite_id: number | null;
  name: string;
  company: string;
  phone: string;
  email: string;
  answers: { label: string; answer: string }[];
  inductions: { induction_id: number; title: string; version: number; score: number }[];
  photo_upload_id: string | null;
  warning: string;
  source: "kiosk" | "phone" | "staff" | "invite";
};

export type NewPass = { induction_id: number; version: number; score: number; signature: string; expires_at: Date };

// saveVisitor finds or adds the visitor's own record and keeps their latest details.
const saveVisitor = async (tx: typeof sql, id: number | null, v: Pick<NewVisit, "name" | "phone" | "email" | "company">, companyId: number | null) =>
  id
    ? (await tx<{ id: number }[]>`update visitors set name = ${v.name}, phone = coalesce(nullif(${v.phone}, ''), phone), email = coalesce(nullif(${v.email}, ''), email),
        company = ${v.company}, company_id = ${companyId}, last_visit_at = now() where id = ${id} returning id`)[0]?.id
    : (await tx<{ id: number }[]>`insert into visitors (name, phone, email, company, company_id, last_visit_at)
        values (${v.name}, ${v.phone}, ${v.email}, ${v.company}, ${companyId}, now()) returning id`)[0].id;

const savePasses = (tx: typeof sql, visitorId: number, ps: NewPass[]) =>
  Promise.all(
    ps.map(
      (p) => tx`insert into passes (visitor_id, induction_id, version, score, signature, passed_at, expires_at)
        values (${visitorId}, ${p.induction_id}, ${p.version}, ${p.score}, ${p.signature}, now(), ${p.expires_at})
        on conflict (visitor_id, induction_id) do update set version = excluded.version, score = excluded.score, signature = excluded.signature,
          passed_at = excluded.passed_at, expires_at = excluded.expires_at`,
    ),
  );

// signIn writes the visitor, the inductions they passed and the visit in one transaction. A
// visitor already on site at this site is signed out of the earlier visit first.
export const signIn = (v: NewVisit, ps: NewPass[], companyId: number | null) =>
  sql.begin(async (tx) => {
    const visitorId = v.person_id ? null : await saveVisitor(tx as unknown as typeof sql, v.visitor_id, v, companyId);
    if (visitorId) await savePasses(tx as unknown as typeof sql, visitorId, ps);
    await tx`update visits set signed_out_at = now(), signed_out_by = 'signed in again'
      where signed_out_at is null and site_id = ${v.site_id} and (visitor_id = ${visitorId} or person_id = ${v.person_id})`;
    const t = token();
    const [row] = await tx<{ id: number }[]>`insert into visits (site_id, visitor_id, person_id, type_id, type_name, host_id, invite_id, name, company,
        phone, email, answers, inductions, photo_upload_id, warning, source, token)
      values (${v.site_id}, ${visitorId}, ${v.person_id}, ${v.type_id}, ${v.type_name}, ${v.host_id}, ${v.invite_id}, ${v.name}, ${v.company},
        ${v.phone}, ${v.email}, ${tx.json(v.answers as never)}, ${tx.json(v.inductions as never)}, ${v.photo_upload_id}, ${v.warning}, ${v.source}, ${t})
      returning id`;
    return { id: row.id, token: t, visitorId };
  });

// prepare keeps an expected visitor's details and inductions ahead of their visit.
export const prepare = (inviteId: number, visitorId: number | null, v: Pick<NewVisit, "name" | "phone" | "email" | "company">, ps: NewPass[], companyId: number | null) =>
  sql.begin(async (tx) => {
    const id = await saveVisitor(tx as unknown as typeof sql, visitorId, v, companyId);
    await savePasses(tx as unknown as typeof sql, id, ps);
    await tx`update invites set visitor_id = ${id}, ready_at = now() where id = ${inviteId}`;
    return id;
  });

export const signOut = async (visitId: number, by: string) =>
  (await sql<{ id: number }[]>`update visits set signed_out_at = now(), signed_out_by = ${by} where id = ${visitId} and signed_out_at is null returning id`).length > 0;

// signOutAll closes every open visit: the nightly sign-out.
export const signOutAll = async () =>
  (await sql<{ id: number }[]>`update visits set signed_out_at = now(), signed_out_by = 'automatic' where signed_out_at is null returning id`).length;

export const staffOnSite = (siteId: number) =>
  sql<{ person_id: number; visit_id: number }[]>`select person_id, id as visit_id from visits where site_id = ${siteId} and person_id is not null and signed_out_at is null`;

// ----- Expected visitors -----

export type Invite = {
  id: number;
  site_id: number;
  type_id: number | null;
  host_id: number | null;
  name: string;
  email: string;
  company: string;
  expected_on: string;
  code: string;
  token: string;
  visitor_id: number | null;
  ready_at: Date | null;
  site_name: string;
  host_name: string | null;
  type_name: string | null;
  arrived_at: Date | null;
};
const inviteCols = sql`i.id, i.site_id, i.type_id, i.host_id, i.name, i.email, i.company, i.expected_on::text, i.code, i.token, i.visitor_id, i.ready_at,
  s.name as site_name, h.name as host_name, t.name as type_name, (select min(signed_in_at) from visits where invite_id = i.id) as arrived_at`;
const inviteFrom = sql`invites i join sites s on s.id = i.site_id left join people h on h.id = i.host_id left join visitor_types t on t.id = i.type_id`;

export const invitesFrom = (day: string, siteId: number | null) =>
  sql<Invite[]>`select ${inviteCols} from ${inviteFrom} where i.expected_on >= ${day}::date and (${siteId}::int is null or i.site_id = ${siteId})
    order by i.expected_on, lower(i.name) limit 300`;
export const inviteByToken = async (t: string) => (await sql<Invite[]>`select ${inviteCols} from ${inviteFrom} where i.token = ${t}`)[0];
export const inviteByCode = async (code: string, siteId: number, day: string) =>
  (await sql<Invite[]>`select ${inviteCols} from ${inviteFrom} where i.code = ${code} and i.site_id = ${siteId} and i.expected_on = ${day}::date`)[0];
export const invite = async (id: number) => (await sql<Invite[]>`select ${inviteCols} from ${inviteFrom} where i.id = ${id}`)[0];

export const addInvite = async (i: { site_id: number; type_id: number | null; host_id: number | null; name: string; email: string; company: string; expected_on: string; created_by: string }, code: () => string) => {
  // A code is unique across every invite; try again on the rare clash.
  for (let attempt = 0; attempt < 8; attempt++) {
    const rows = await sql<{ id: number }[]>`insert into invites (site_id, type_id, host_id, name, email, company, expected_on, code, token, created_by)
      values (${i.site_id}, ${i.type_id}, ${i.host_id}, ${i.name}, ${i.email}, ${i.company}, ${i.expected_on}, ${code()}, ${token()}, ${i.created_by})
      on conflict (code) do nothing returning id`;
    if (rows[0]) return rows[0].id;
  }
  throw new Error("could not find a free invite code");
};
export const deleteInvite = (id: number) => sql`delete from invites where id = ${id}`;

// ----- Kiosks -----

export type Kiosk = { id: number; site_id: number; name: string; paired_at: Date | null; last_seen_at: Date | null; pair_code: string | null; pair_expires: Date | null };
const kioskCols = sql`id, site_id, name, paired_at, last_seen_at, pair_code, pair_expires`;
export const kiosks = (siteId: number) => sql<Kiosk[]>`select ${kioskCols} from kiosks where site_id = ${siteId} order by id`;

// A kiosk is a browser holding a long random cookie; only its hash is kept here.
export const kioskByCookie = async (cookie: string) =>
  (await sql<Kiosk[]>`update kiosks set last_seen_at = now() where token_hash = ${hash(cookie)} and paired_at is not null returning ${kioskCols}`)[0];

export const addKiosk = async (siteId: number, name: string): Promise<{ id: number; code: string }> => {
  const code = String(Math.floor(Math.random() * 900000) + 100000);
  const [row] = await sql<{ id: number }[]>`insert into kiosks (site_id, name, pair_code, pair_expires) values (${siteId}, ${name}, ${code}, now() + interval '15 minutes')
    on conflict (pair_code) do nothing returning id`;
  return row ? { id: row.id, code } : addKiosk(siteId, name);
};

// pairKiosk turns an unexpired pairing code into this browser's kiosk cookie.
export const pairKiosk = async (code: string) => {
  const cookie = token(24);
  const [row] = await sql<{ id: number }[]>`update kiosks set token_hash = ${hash(cookie)}, paired_at = now(), last_seen_at = now(), pair_code = null, pair_expires = null
    where pair_code = ${code} and pair_expires > now() returning id`;
  return row ? cookie : undefined;
};
export const removeKiosk = (id: number, siteId: number) => sql`delete from kiosks where id = ${id} and site_id = ${siteId}`;

// ----- Roll calls -----

export type RollCallRow = { id: number; site_id: number; started_by: string; started_at: Date; ended_at: Date | null };
export const openRollCall = async (siteId: number) =>
  (await sql<RollCallRow[]>`select id, site_id, started_by, started_at, ended_at from roll_calls where site_id = ${siteId} and ended_at is null order by id desc limit 1`)[0];
export const rollCallById = async (id: number) => (await sql<RollCallRow[]>`select id, site_id, started_by, started_at, ended_at from roll_calls where id = ${id}`)[0];
export const startRollCall = async (siteId: number, by: string) =>
  (await openRollCall(siteId))?.id ?? (await sql<{ id: number }[]>`insert into roll_calls (site_id, started_by) values (${siteId}, ${by}) returning id`)[0].id;
export const endRollCall = (id: number) => sql`update roll_calls set ended_at = now() where id = ${id} and ended_at is null`;
export const marks = async (rollCallId: number) =>
  new Set((await sql<{ visit_id: number }[]>`select visit_id from roll_call_marks where roll_call_id = ${rollCallId}`).map((r) => r.visit_id));
export const mark = (rollCallId: number, visitId: number, safe: boolean, by: string) =>
  safe
    ? sql`insert into roll_call_marks (roll_call_id, visit_id, marked_by) values (${rollCallId}, ${visitId}, ${by}) on conflict do nothing`
    : sql`delete from roll_call_marks where roll_call_id = ${rollCallId} and visit_id = ${visitId}`;

// ----- API keys -----

// A key is shown once when it is made; only its SHA-256 and its first 10 characters are kept.
export type ApiKey = { id: number; label: string; prefix: string; created_by: string; created_at: Date; last_used_at: Date | null; revoked_at: Date | null };
const keyCols = sql`id, label, prefix, created_by, created_at, last_used_at, revoked_at`;
export const apiKeys = () => sql<ApiKey[]>`select ${keyCols} from api_keys order by revoked_at nulls first, id desc`;
export const addApiKey = (label: string, key: string, by: string) =>
  sql`insert into api_keys (label, prefix, hash, created_by) values (${label}, ${key.slice(0, 10)}, ${hash(key)}, ${by})`;
export const keyFor = async (key: string) =>
  (await sql<ApiKey[]>`update api_keys set last_used_at = now() where hash = ${hash(key)} and revoked_at is null returning ${keyCols}`)[0];
export const revokeApiKey = (id: number) => sql`update api_keys set revoked_at = now() where id = ${id} and revoked_at is null`;

// ----- Privacy -----

// forget removes a visitor and everything about them: visits, inductions, roll call marks.
export const forget = (visitorId: number) => sql`delete from visitors where id = ${visitorId}`;
export const deleteVisit = (id: number) => sql`delete from visits where id = ${id}`;

// expire deletes visits older than the cutoff, by id, and then visitors left with no visits and
// no upcoming invite. Returns the counts.
export const expire = (cutoff: Date) =>
  sql.begin(async (tx) => {
    const old = await tx<{ id: number }[]>`select id from visits where signed_in_at < ${cutoff} order by id limit 5000`;
    const ids = old.map((r) => r.id);
    if (ids.length) await tx`delete from visits where id = any(${ids})`;
    const gone = await tx<{ id: number }[]>`select id from visitors x where coalesce(last_visit_at, created_at) < ${cutoff}
      and not exists (select 1 from visits where visitor_id = x.id)
      and not exists (select 1 from invites where visitor_id = x.id and expected_on >= current_date) limit 5000`;
    const vids = gone.map((r) => r.id);
    if (vids.length) await tx`delete from visitors where id = any(${vids})`;
    await tx`delete from invites where expected_on < ${cutoff}::date`;
    await tx`delete from messages where created_at < now() - interval '90 days'`;
    await tx`delete from roll_calls where started_at < ${cutoff}`;
    return { visits: ids.length, visitors: vids.length };
  });

// ----- Outbox -----

export type Message = { id: number; channel: "email" | "chat"; kind: string; to_addr: string; subject: string; html: string; text: string; status: string; error: string; created_at: Date };
export const addMessage = async (m: Pick<Message, "channel" | "kind" | "to_addr" | "subject" | "html" | "text">) =>
  (await sql<{ id: number }[]>`insert into messages (channel, kind, to_addr, subject, html, text) values (${m.channel}, ${m.kind}, ${m.to_addr}, ${m.subject}, ${m.html}, ${m.text}) returning id`)[0].id;
export const message = async (id: number) =>
  (await sql<Message[]>`select id, channel, kind, to_addr, subject, html, text, status, error, created_at from messages where id = ${id}`)[0];
export const markMessage = (id: number, status: "sent" | "failed" | "demo", error = "") =>
  sql`update messages set status = ${status}, error = ${error}, sent_at = case when ${status} = 'sent' then now() end where id = ${id}`;
export const recentMessages = (limit: number) =>
  sql<Message[]>`select id, channel, kind, to_addr, subject, '' as html, text, status, error, created_at from messages order by id desc limit ${limit}`;

export type { Question };
