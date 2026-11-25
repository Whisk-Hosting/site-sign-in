// The Whisk conventions this app uses: identity from the platform headers, JSON logs with the
// request id, and calls to the Whisk API with the app's service token.
import { randomBytes } from "node:crypto";
import { Inngest } from "inngest";
import pino from "pino";

export const env = (name: string, fallback?: string): string => {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`${name} is not set`);
  return v;
};

export const log = pino({ level: process.env.LOG_LEVEL ?? "info", base: { app: process.env.WHISK_APP_NAME } });

// Only the X-Whisk-* headers say who the caller is; the platform strips any copy from outside.
export type Identity = {
  audience: "anonymous" | "team" | "customer" | "service";
  userId?: string;
  email?: string;
  name?: string;
  groups: string[];
  roles: string[];
  requestId: string;
};

const list = (v: string | undefined) => (v ?? "").split(",").filter(Boolean);

export const identity = (h: (name: string) => string | undefined): Identity => ({
  audience: (h("x-whisk-audience") as Identity["audience"]) ?? "anonymous",
  userId: h("x-whisk-user-id"),
  email: h("x-whisk-email"),
  name: h("x-whisk-name"),
  groups: list(h("x-whisk-groups")),
  roles: list(h("x-whisk-roles")),
  requestId: h("x-whisk-request-id") ?? "",
});

// Staff are the business's own Whisk team; visitors never sign in to Whisk at all. Everyone on
// the team runs reception: who is on site, roll calls, expected visitors and history. Admins (the
// team's owners and admins, and the "reception-admins" group) also set up sites, visitor types,
// inductions, contractors and settings, and delete records.
export const canStaff = (id: Identity) => id.audience === "team";
export const canAdmin = (id: Identity) =>
  canStaff(id) && (["owner", "admin"].some((r) => id.roles.includes(r)) || id.groups.includes("reception-admins"));

// The API origin and the app's path on it come from WHISK_QUEUE_URL
// (https://api.whisk.run/v1/orgs/<org>/apps/<app>/events).
export const appApi = (path: string) => env("WHISK_QUEUE_URL").replace(/\/events$/, "") + path;

export type ApiError = { code: string; message: string; fix?: string };

// whiskApi calls the Whisk API as this app. The service token rotates daily, so it is read
// from the environment on every call.
export const whiskApi = async <T>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> => {
  if (devStub()) return (await devApi(path, body, method)) as T;
  const res = await fetch(appApi(path), {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${env("WHISK_SERVICE_TOKEN")}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: ApiError };
  if (!res.ok) throw Object.assign(new Error(json.error?.message ?? `Whisk API ${res.status}`), { api: json.error });
  return json as T;
};

// The Inngest client. The platform delivers function runs to /.whisk/inngest and signs them with
// WHISK_INNGEST_SIGNING_KEY. Event names are plain: the platform keeps each app's events apart.
export const inngest = new Inngest({
  id: process.env.WHISK_APP_NAME ?? "visitors",
  eventKey: process.env.WHISK_INNGEST_EVENT_KEY,
  signingKey: process.env.WHISK_INNGEST_SIGNING_KEY,
  baseUrl: process.env.WHISK_INNGEST_URL,
  isDev: process.env.WHISK_DEV === "1",
  logger: log,
});

// queueAvailable is false outside Whisk (a plain local run), where work runs inline instead.
export const queueAvailable = () => !!process.env.WHISK_QUEUE_URL && !!process.env.WHISK_SERVICE_TOKEN;

// enqueue sends an event through the platform queue. Previews run no functions, so there the
// caller does the work inline.
export const enqueue = async (name: string, data: unknown, dedupeKey?: string): Promise<void> => {
  const res = await fetch(env("WHISK_QUEUE_URL"), {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env("WHISK_SERVICE_TOKEN")}` },
    body: JSON.stringify({ name, data, dedupe_key: dedupeKey }),
  });
  if (!res.ok) throw new Error(`enqueue ${name}: ${res.status} ${await res.text()}`);
};
export const isPreview = () => (process.env.WHISK_ENV ?? "").startsWith("preview:");

// ----- Local stand-in -----

// On a laptop without Whisk (WHISK_DEV=1 and no platform variables), the few Whisk API calls
// the app makes are answered here, so every screen can be tried: uploads go to /.dev/storage,
// emails are logged.
export const devStub = () => process.env.WHISK_DEV === "1" && !process.env.WHISK_QUEUE_URL;
const devBase = () => process.env.WHISK_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 8080}`;

export const devApi = async (path: string, body: unknown, method: string): Promise<unknown> => {
  const b = (body ?? {}) as Record<string, string>;
  if (path === "/uploads" && method === "POST") {
    const id = `up${randomBytes(8).toString("hex")}`;
    return { id, url: `${devBase()}/.dev/storage/${id}`, fields: { key: id } };
  }
  const up = /^\/uploads\/([A-Za-z0-9_-]+)$/.exec(path);
  if (up && method === "GET") return { id: up[1], status: "clean", url: `${devBase()}/.dev/storage/${up[1]}` };
  if (path === "/email/send") {
    log.info({ to: b.to, subject: b.subject }, "dev: email not sent");
    return { id: "dev" };
  }
  throw Object.assign(new Error(`No local stand-in for ${method} ${path}`), { api: { code: "DEV_STUB", message: "Not available locally." } });
};
