// Pure decisions for the JSON API (src/api.ts): reading the key from a request, pages, turning a
// JSON body into the fields the screens' own checks read, and what each refusal says. No database
// and no requests; the business rules themselves stay in model.ts and are shared with the screens.
import type { Admission, Checked, VisitorType } from "./model.js";

export type Status = 400 | 401 | 403 | 404 | 409 | 422;
export type ApiError = { status: Status; code: string; message: string; fix: string };
export type Result<T> = { ok: true; value: T } | { ok: false; error: ApiError };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const no = (status: Status, code: string, message: string, fix: string): Result<never> => ({ ok: false, error: { status, code, message, fix } });

// ----- Keys -----

// A key is "vis_" and 32 base64url characters (24 random bytes).
export const KEY_PREFIX = "vis_";
export const makeKey = (random: (n: number) => Buffer) => `${KEY_PREFIX}${random(24).toString("base64url")}`;
export const isKeyShape = (k: string) => /^vis_[A-Za-z0-9_-]{32}$/.test(k);

// keyFrom finds the key wherever a client put it: Authorization: Bearer <key>, Basic auth with
// the key as the username, X-Api-Key, or ?token=. The first one present wins.
export const keyFrom = (h: { authorization?: string; xApiKey?: string; token?: string }): string => {
  const auth = (h.authorization ?? "").trim();
  const bearer = /^bearer\s+(.+)$/i.exec(auth)?.[1];
  const basic = /^basic\s+(.+)$/i.exec(auth)?.[1];
  const fromBasic = basic ? Buffer.from(basic.trim(), "base64").toString("utf8").split(":")[0] : undefined;
  return (bearer ?? fromBasic ?? h.xApiKey ?? h.token ?? "").trim();
};

export const keyMissing: ApiError = {
  status: 401,
  code: "API_KEY_INVALID",
  message: "No valid API key was sent.",
  fix: "Send Authorization: Bearer <key>. An admin makes keys under Setup > Settings > API keys.",
};

// ----- Pages -----

export type Page = { limit: number; offset: number };
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const wholeNumber = (v: string | undefined, fallback: number) => (v === undefined || v === "" ? fallback : /^\d+$/.test(v) ? Number(v) : NaN);

// pageFrom reads ?limit= (1 to 200, 50 by default) and ?offset= (0 by default).
export const pageFrom = (q: { limit?: string; offset?: string }): Result<Page> => {
  const limit = wholeNumber(q.limit, DEFAULT_LIMIT);
  const offset = wholeNumber(q.offset, 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return no(400, "LIMIT_INVALID", `limit must be a whole number from 1 to ${MAX_LIMIT}.`, "Send ?limit=50, or leave it out.");
  if (!Number.isInteger(offset)) return no(400, "OFFSET_INVALID", "offset must be a whole number, 0 or more.", "Send the next_offset from the last page, or leave it out.");
  return ok({ limit, offset });
};

// pageOf cuts one page from a whole list; pageFromRows does the same for rows fetched with one
// row more than the limit. next_offset is null on the last page.
export const pageOf = <T>(items: readonly T[], p: Page) => ({
  items: items.slice(p.offset, p.offset + p.limit),
  limit: p.limit,
  offset: p.offset,
  next_offset: p.offset + p.limit < items.length ? p.offset + p.limit : null,
});
export const pageFromRows = <T>(rows: readonly T[], p: Page) => ({
  items: rows.slice(0, p.limit),
  limit: p.limit,
  offset: p.offset,
  next_offset: rows.length > p.limit ? p.offset + p.limit : null,
});

// ----- Reading a body -----

export type Body = Readonly<Record<string, unknown>>;

export const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : typeof v === "number" ? String(v) : "");
export const id = (v: unknown) => {
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : 0;
};
export const optionalId = (v: unknown): number | null | undefined => (v === undefined ? undefined : v === null || v === "" ? null : id(v) || NaN);

// visitForm turns an API body into the form fields checkDetails reads, so a sign-in through the
// API is checked exactly as one on the kiosk. Names follow Envoy's: full_name and phone_number,
// with name and phone accepted too. answers is a list in the type's question order, or an object
// keyed by question label.
export const visitForm = (t: Pick<VisitorType, "questions">, b: Body): Record<string, unknown> => {
  const answers = b.answers;
  const answerFor = (label: string, i: number) =>
    Array.isArray(answers) ? answers[i] : answers && typeof answers === "object" ? (answers as Record<string, unknown>)[label] : undefined;
  return {
    name: b.full_name ?? b.name,
    company: b.company,
    phone: b.phone_number ?? b.phone,
    email: b.email,
    host_id: b.host_id,
    ...Object.fromEntries(t.questions.map((q, i) => [`q${i}`, answerFor(q.label, i)])),
  };
};

// The fields' API names, for error messages.
const apiField: Record<string, string> = { name: "full_name", phone: "phone_number", email: "email", company: "company", host_id: "host_id" };
export const fieldErrors = (errors: Record<string, string>) =>
  Object.fromEntries(Object.entries(errors).map(([k, v]) => [apiField[k] ?? (k.startsWith("q") ? `answers[${k.slice(1)}]` : k), v]));

const describe = (errors: Record<string, string>) =>
  Object.entries(fieldErrors(errors))
    .map(([k, v]) => `${k}: ${v}`)
    .join(" ");

// signInVerdict decides whether a visitor may be signed in through the API, in the kiosk's order:
// the details, then the contractor check, then inductions. Inductions need the visitor's own
// signature, so the API never does them for anyone; it says which are due instead.
export const signInVerdict = (checked: Checked, admission: Admission, due: readonly { id: number; title: string }[]): Result<true> =>
  !checked.ok
    ? no(422, "DETAILS_INVALID", describe(checked.errors), "Send the fields this visitor type asks for. GET /api/v1/visitor-types lists them.")
    : !admission.allow
      ? no(409, "CONTRACTOR_BLOCKED", `Turned away: ${admission.warning}.`, "Update the company's dates with PATCH /api/v1/companies/:id, or set contractors to warn instead of turn away in Setup > Settings.")
      : due.length
        ? no(409, "INDUCTION_DUE", `They have to do ${due.map((i) => i.title).join(" and ")} first.`, "Inductions need the visitor's signature: they sign in at the kiosk, on the site's QR poster, or from an invite link.")
        : ok(true);

export const inviteError = (errors: Record<string, string>): ApiError => ({
  status: 422,
  code: "INVITE_INVALID",
  message: Object.entries(errors)
    .map(([k, v]) => `${k === "name" ? "full_name" : k === "day" ? "expected_on" : k}: ${v}`)
    .join(" "),
  fix: 'Send {"site_id": 1, "full_name": "Ana Silva", "expected_on": "YYYY-MM-DD"}, with email to send them their code.',
});

// ----- Companies -----

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export type CompanyPatch = { name?: string; contact_email?: string; insurance_expires?: string | null; licence_expires?: string | null; archived?: boolean };

// companyPatch reads the fields a company may change; a date is YYYY-MM-DD or null to clear it.
export const companyPatch = (b: Body): Result<CompanyPatch> => {
  const date = (k: string): Result<string | null | undefined> => {
    const v = b[k];
    if (v === undefined) return ok(undefined);
    if (v === null || v === "") return ok(null);
    return typeof v === "string" && isDate(v) ? ok(v) : no(400, "DATE_INVALID", `${k} must be a date as YYYY-MM-DD, or null.`, `Send {"${k}": "2027-06-30"}.`);
  };
  const ins = date("insurance_expires");
  if (!ins.ok) return ins;
  const lic = date("licence_expires");
  if (!lic.ok) return lic;
  if (b.name !== undefined && str(b.name, 120).length < 1) return no(422, "NAME_REQUIRED", "name cannot be empty.", 'Send {"name": "Oakwood Plumbing"}.');
  if (b.archived !== undefined && typeof b.archived !== "boolean") return no(400, "ARCHIVED_INVALID", "archived must be true or false.", 'Send {"archived": true}.');
  if (b.contact_email !== undefined && str(b.contact_email, 200) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(b.contact_email, 200)))
    return no(422, "EMAIL_INVALID", "contact_email is not an email address.", 'Send {"contact_email": "office@example.com"}, or "" to clear it.');
  return ok({
    ...(b.name !== undefined ? { name: str(b.name, 120) } : {}),
    ...(b.contact_email !== undefined ? { contact_email: str(b.contact_email, 200).toLowerCase() } : {}),
    ...(ins.value !== undefined ? { insurance_expires: ins.value } : {}),
    ...(lic.value !== undefined ? { licence_expires: lic.value } : {}),
    ...(b.archived !== undefined ? { archived: b.archived as boolean } : {}),
  });
};

// ----- Staff -----

export type PersonPatch = { name?: string; email?: string; site_id?: number | null; archived?: boolean };

export const personPatch = (b: Body, siteIds: readonly number[]): Result<PersonPatch> => {
  if (b.name !== undefined && str(b.name, 120).length < 1) return no(422, "NAME_REQUIRED", "name cannot be empty.", 'Send {"name": "Mei Chen"}.');
  const email = b.email === undefined ? undefined : str(b.email, 200).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return no(422, "EMAIL_INVALID", "email is not an email address.", 'Send {"email": "mei@example.com"}, or "" for none.');
  const site = optionalId(b.site_id);
  if (site !== undefined && site !== null && !siteIds.includes(site)) return no(404, "SITE_NOT_FOUND", "No site has that site_id.", "GET /api/v1/sites lists them; send null for every site.");
  if (b.archived !== undefined && typeof b.archived !== "boolean") return no(400, "ARCHIVED_INVALID", "archived must be true or false.", 'Send {"archived": true}.');
  return ok({
    ...(b.name !== undefined ? { name: str(b.name, 120) } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(site !== undefined ? { site_id: site } : {}),
    ...(b.archived !== undefined ? { archived: b.archived as boolean } : {}),
  });
};
