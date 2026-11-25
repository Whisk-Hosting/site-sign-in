// Pure decisions about signing in: what a visitor type asks, which inductions are due, whether a
// contractor may come in, roll calls, times in the business's time zone, retention. No database
// and no requests; routes load rows, call these, and render or store what comes back.
import { createHmac, timingSafeEqual } from "node:crypto";

export type Site = { id: number; name: string; address: string; poster_token: string; position: number; archived: boolean };
export type Person = { id: number; name: string; email: string; site_id: number | null; archived: boolean };
export type Question = { prompt: string; choices: string[]; answer: number };
export type Induction = {
  id: number;
  title: string;
  body: string;
  video_upload_id: string | null;
  questions: Question[];
  pass_mark: number;
  valid_months: number;
  version: number;
  archived: boolean;
};
export type Ask = { label: string; required: boolean };
export type VisitorType = {
  id: number;
  name: string;
  icon: string;
  position: number;
  ask_company: boolean;
  ask_phone: boolean;
  ask_email: boolean;
  ask_host: boolean;
  photo: boolean;
  contractor: boolean;
  questions: Ask[];
  induction_ids: number[];
  archived: boolean;
};
export type Company = {
  id: number;
  name: string;
  contact_email: string;
  insurance_expires: string | null;
  licence_expires: string | null;
  certificate_upload_id: string | null;
  archived: boolean;
};
export type Pass = { induction_id: number; version: number; expires_at: Date };
export type Visit = {
  id: number;
  site_id: number;
  visitor_id: number | null;
  person_id: number | null;
  type_name: string;
  host_id: number | null;
  name: string;
  company: string;
  phone: string;
  email: string;
  photo_upload_id: string | null;
  warning: string;
  source: string;
  signed_in_at: Date;
  signed_out_at: Date | null;
  signed_out_by: string | null;
};

// ----- Times, always in the business's time zone -----

const partsIn = (d: Date, tz: string) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;

// localDay is the calendar day in the business's time zone, as YYYY-MM-DD.
export const localDay = (d: Date, tz: string) => {
  const p = partsIn(d, tz);
  return `${p.year}-${p.month}-${p.day}`;
};

// ampm writes "9:14 AM" as "9:14 am".
export const ampm = (s: string) => s.replace(/\s?\b([ap])\.?\s?m\b\.?/gi, (_, x: string) => ` ${x.toLowerCase()}m`);

export const timeOf = (d: Date, tz: string) =>
  ampm(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(d));

export const dayOf = (d: Date, tz: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(d);

export const dayLabel = (day: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${day}T00:00:00Z`));

// when says a moment the way a person would: "9:14 am" today, "Tue, Oct 8, 4:02 pm" otherwise.
export const when = (d: Date, tz: string, now: Date) => (localDay(d, tz) === localDay(now, tz) ? timeOf(d, tz) : `${dayOf(d, tz)}, ${timeOf(d, tz)}`);

export const duration = (from: Date, to: Date) => {
  const mins = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
};

// atLocal is the moment a local day and clock time ("08:30") happen in the time zone.
const offsetMs = (d: Date, tz: string) => {
  const p = partsIn(d, tz);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(d.getTime() / 60000) * 60000;
};
export const atLocal = (day: string, time: string, tz: string) => {
  const guess = new Date(`${day}T${time}:00Z`);
  return new Date(guess.getTime() - offsetMs(new Date(guess.getTime() - offsetMs(guess, tz)), tz));
};

export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export const addMonths = (d: Date, months: number) => {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + months);
  return r;
};

// ----- Inductions -----

// passExpiry: a pass lasts valid_months; 0 means it covers only the visit it was done on.
export const passExpiry = (passedAt: Date, validMonths: number) =>
  validMonths === 0 ? new Date(passedAt.getTime() + 16 * 3600000) : addMonths(passedAt, validMonths);

// inductionsDue lists the type's inductions the visitor still has to do, in the type's order: no
// pass, a pass for an older version, or a pass that has run out.
export const inductionsDue = (type: Pick<VisitorType, "induction_ids">, all: Induction[], passes: Pass[], now: Date): Induction[] =>
  type.induction_ids
    .map((id) => all.find((i) => i.id === id && !i.archived))
    .filter((i): i is Induction => !!i)
    .filter((i) => {
      const p = passes.find((x) => x.induction_id === i.id);
      return !p || p.version < i.version || p.expires_at.getTime() <= now.getTime();
    });

export type Graded = { score: number; passed: boolean; wrong: number[] };

// grade marks a quiz: score is a percentage, and an induction without questions always passes.
export const grade = (questions: Question[], answers: (number | null)[], passMark: number): Graded => {
  if (questions.length === 0) return { score: 100, passed: true, wrong: [] };
  const wrong = questions.flatMap((q, i) => (answers[i] === q.answer ? [] : [i]));
  const score = Math.round(((questions.length - wrong.length) / questions.length) * 100);
  return { score, passed: score >= passMark, wrong };
};

export const questionProblems = (qs: Question[]) =>
  qs.flatMap((q, i) =>
    !q.prompt.trim()
      ? [`Question ${i + 1} has no question.`]
      : q.choices.filter((c) => c.trim()).length < 2
        ? [`Question ${i + 1} needs at least two answers.`]
        : q.answer < 0 || q.answer >= q.choices.length || !q.choices[q.answer]?.trim()
          ? [`Question ${i + 1} needs a right answer.`]
          : [],
  );

// A signature is the strokes drawn on the pad as SVG path data, kept small and checked.
export const isSignature = (v: string) => v.length >= 10 && v.length <= 60000 && /^[ML0-9 .,-]+$/.test(v);

// ----- Contractors -----

export type CompanyState = { state: "ok" | "soon" | "lapsed" | "unknown"; lapsed: string[]; soon: string[] };

const SOON_DAYS = 14;

// companyState: a document lapses the day after its expiry date and is "soon" within two weeks.
export const companyState = (c: Pick<Company, "insurance_expires" | "licence_expires">, today: string): CompanyState => {
  const docs = [
    ["insurance", c.insurance_expires],
    ["license", c.licence_expires],
  ] as const;
  const known = docs.filter(([, d]) => !!d) as [string, string][];
  if (known.length === 0) return { state: "unknown", lapsed: [], soon: [] };
  const lapsed = known.filter(([, d]) => d < today).map(([k]) => k);
  const soon = known.filter(([, d]) => d >= today && d <= addDays(today, SOON_DAYS)).map(([k]) => k);
  return { state: lapsed.length ? "lapsed" : soon.length ? "soon" : "ok", lapsed, soon };
};

export type Admission = { allow: boolean; warning: string };

// admit decides whether a contractor may sign in. Where a contractor list is kept, a company not on
// it comes in with a warning for the host; a lapsed company is warned about, or turned away under "block".
export const admit = (type: Pick<VisitorType, "contractor">, company: Company | undefined, policy: "warn" | "block", today: string, listKept: boolean): Admission => {
  if (!type.contractor) return { allow: true, warning: "" };
  if (!company) return { allow: true, warning: listKept ? "Company not on the contractor list" : "" };
  const s = companyState(company, today);
  if (s.state !== "lapsed") return { allow: true, warning: "" };
  const warning = `${company.name}: ${s.lapsed.join(" and ")} expired`;
  return { allow: policy === "warn", warning };
};

// expiryWarningDue: tell the admins once when a company's documents come within two weeks of
// lapsing, and again only after the dates change (warned_at is cleared then).
export const expiryWarningDue = (c: Pick<Company, "insurance_expires" | "licence_expires" | "archived"> & { warned_at: Date | null }, today: string) =>
  !c.archived && c.warned_at === null && companyState(c, today).state === "soon";

// ----- The sign-in form -----

export type Details = { name: string; company: string; phone: string; email: string; host_id: number | null; answers: { label: string; answer: string }[] };
export type Checked = { ok: true; details: Details } | { ok: false; details: Details; errors: Record<string, string> };

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
// phoneKey makes the same number match however it was typed: digits only, without a leading US country code.
export const phoneKey = (v: string) => v.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// checkDetails reads the form for a visitor type into clean details, with a message per field
// that is missing or wrong.
export const checkDetails = (type: VisitorType, hosts: Person[], form: Record<string, unknown>): Checked => {
  const hostId = Number(form.host_id);
  const details: Details = {
    name: clean(form.name, 120),
    company: type.ask_company ? clean(form.company, 120) : "",
    phone: type.ask_phone ? clean(form.phone, 40) : "",
    email: type.ask_email ? clean(form.email, 200).toLowerCase() : "",
    host_id: type.ask_host && hosts.some((h) => h.id === hostId) ? hostId : null,
    answers: type.questions.map((q, i) => ({ label: q.label, answer: clean(form[`q${i}`], 500) })),
  };
  const errors: Record<string, string> = {
    ...(details.name.length < 2 ? { name: "Enter your full name." } : {}),
    ...(type.ask_company && type.contractor && !details.company ? { company: "Enter your company." } : {}),
    ...(type.ask_phone && phoneKey(details.phone).replace(/\D/g, "").length < 7 ? { phone: "Enter a phone number." } : {}),
    ...(type.ask_email && !looksLikeEmail(details.email) ? { email: "Enter an email address." } : {}),
    ...(type.ask_host && hosts.length > 0 && details.host_id === null ? { host_id: "Choose who you are here to see." } : {}),
    ...Object.fromEntries(type.questions.flatMap((q, i) => (q.required && !details.answers[i].answer ? [[`q${i}`, "Answer this question."]] : []))),
  };
  return Object.keys(errors).length ? { ok: false, details, errors } : { ok: true, details };
};

// inviteProblems checks an expected visitor before they are added, on the Expected screen and
// through the API alike: a name, an email that looks like one (or none), and today or later.
export const inviteProblems = (v: { name: string; email: string; day: string }, today: string): Record<string, string> => ({
  ...(v.name.length < 2 ? { name: "Enter their name." } : {}),
  ...(v.email && !looksLikeEmail(v.email) ? { email: "Check the email address." } : {}),
  ...(!isDay(v.day) || v.day < today ? { day: "Choose today or a later day." } : {}),
});

// sameVisitor: a returning visitor found by phone or email is only taken as the same person when
// the name they typed matches, so a borrowed number never inherits someone else's inductions.
export const sameVisitor = (stored: string, typed: string) => {
  const words = (n: string) => n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z]+/).filter(Boolean);
  const [a, b] = [words(stored), words(typed)];
  return a.length > 0 && b.length > 0 && a[0] === b[0] && a[a.length - 1] === b[b.length - 1];
};

// ----- Who is on site -----

// shortName shows a visitor to other visitors without giving their full name: "Ana S."
export const shortName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.length < 2 ? parts[0] ?? "" : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
};

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase())
    .filter((_, i, all) => i === 0 || i === all.length - 1)
    .join("");

// findOnSite matches what someone typed at the kiosk against the people on site, by the start of
// any part of their name. Two letters at least, so the list is never shown whole.
export const findOnSite = <V extends Pick<Visit, "name">>(onSite: V[], query: string): V[] => {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return onSite.filter((v) => v.name.toLowerCase().split(/\s+/).some((p) => p.startsWith(q)) || v.name.toLowerCase().startsWith(q));
};

export type Tally = { total: number; visitors: number; contractors: number; staff: number };
export const tally = (visits: (Pick<Visit, "person_id"> & { contractor: boolean })[]): Tally => ({
  total: visits.length,
  staff: visits.filter((v) => v.person_id !== null).length,
  contractors: visits.filter((v) => v.person_id === null && v.contractor).length,
  visitors: visits.filter((v) => v.person_id === null && !v.contractor).length,
});

export type RollCall = { safe: number; missing: number; total: number; done: boolean };
export const rollCall = (onSite: Pick<Visit, "id">[], safe: ReadonlySet<number>): RollCall => {
  const marked = onSite.filter((v) => safe.has(v.id)).length;
  return { safe: marked, missing: onSite.length - marked, total: onSite.length, done: onSite.length > 0 && marked === onSite.length };
};

// ----- Housekeeping -----

export const retentionCutoff = (now: Date, months: number) => addMonths(now, -months);

// ----- Signed tokens -----

// seal and unseal carry a sign-in in progress between steps, and remember a visitor's phone,
// without storing anything until it is finished. The HMAC stops anyone changing what is inside.
const b64 = (s: string) => Buffer.from(s).toString("base64url");
const mac = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest("base64url");

export const seal = (secret: string, value: unknown) => {
  const body = b64(JSON.stringify(value));
  return `${body}.${mac(secret, body)}`;
};

export const unseal = <T>(secret: string, token: string | undefined): T | undefined => {
  if (!token) return undefined;
  const [body, sig] = token.split(".");
  if (!body || !sig) return undefined;
  const want = Buffer.from(mac(secret, body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return undefined;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString()) as T;
  } catch {
    return undefined;
  }
};

// ----- Small things -----

export const isColor = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

export const isPublicUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(u.hostname) && u.hostname.includes(".");
  } catch {
    return false;
  }
};

// The six-digit code an expected visitor types at the kiosk.
export const inviteCode = (random: () => number) => String(Math.floor(random() * 900000) + 100000);

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  // A leading =, +, - or @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export const csv = (header: string[], rows: unknown[][]) => [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

export const slugToken = (random: (n: number) => Buffer, n = 9) => random(n).toString("base64url");
