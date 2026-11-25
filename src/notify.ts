// Telling people: the host when their visitor arrives, an expected visitor their code, admins
// when a contractor's documents are about to lapse. Each message is written to the outbox first,
// then sent by the send-message function (or straight away where no queue runs), so staff can
// see what went and what failed.
import { isDemo } from "./demo.js";
import { dayLabel, isPublicUrl } from "./model.js";
import * as store from "./store.js";
import type { Settings } from "./store.js";
import { enqueue, isPreview, log, queueAvailable, whiskApi } from "./whisk.js";

export const baseUrl = () => (process.env.WHISK_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 8080}`).replace(/\/$/, "");

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// The one email layout: the business name, a heading, a few lines and an optional button.
const emailHtml = (s: Settings, heading: string, lines: string[], button?: { href: string; label: string }, big?: string) =>
  `<!doctype html><html><body style="margin:0;background:#f5f4f0;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1c1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;border:1px solid #e4e1d9">
<tr><td style="padding:28px 32px 8px;font-weight:700;font-size:15px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${s.accent};margin-right:8px"></span>${escape(s.business_name)}</td></tr>
<tr><td style="padding:8px 32px 28px">
<h1 style="font-size:22px;line-height:1.3;margin:8px 0 12px">${escape(heading)}</h1>
${lines.map((l) => `<p style="font-size:16px;line-height:1.55;margin:0 0 10px;color:#45423d">${escape(l)}</p>`).join("")}
${big ? `<p style="font:700 34px/1.2 ui-monospace,Menlo,monospace;letter-spacing:.18em;margin:18px 0;color:#1d1c1a">${escape(big)}</p>` : ""}
${button ? `<p style="margin:20px 0 0"><a href="${escape(button.href)}" style="display:inline-block;background:${s.accent};color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">${escape(button.label)}</a></p>` : ""}
</td></tr></table></td></tr></table></body></html>`;

const emailText = (heading: string, lines: string[], button?: { href: string; label: string }, big?: string) =>
  [heading, "", ...lines, ...(big ? ["", big] : []), ...(button ? ["", `${button.label}: ${button.href}`] : [])].join("\n");

// queue writes a message and hands it to the queue; without one (a laptop, a preview) it is sent
// at once. Sending never blocks or breaks the sign-in that caused it.
const queue = async (m: Parameters<typeof store.addMessage>[0]) => {
  const id = await store.addMessage(m);
  try {
    if (queueAvailable() && !isPreview()) await enqueue("message.send", { message_id: id }, `message-${id}`);
    else await sendNow(id, false);
  } catch (err) {
    log.error({ err: String(err), message_id: id }, "message not queued");
  }
  return id;
};

const email = (s: Settings, kind: string, to: string, subject: string, heading: string, lines: string[], button?: { href: string; label: string }, big?: string) =>
  to ? queue({ channel: "email", kind, to_addr: to, subject, html: emailHtml(s, heading, lines, button, big), text: emailText(heading, lines, button, big) }) : undefined;

const chat = (s: Settings, kind: string, text: string) => (s.chat_webhook_url ? queue({ channel: "chat", kind, to_addr: s.chat_webhook_url, subject: "", html: "", text }) : undefined);

// sendNow delivers one queued message. With rethrow, a failure is left for the queue to retry.
export const sendNow = async (id: number, rethrow = true) => {
  const m = await store.message(id);
  if (!m || m.status === "sent") return "done";
  const s = await store.settings();
  if (isDemo()) {
    await store.markMessage(id, "demo", "Demo: recorded, not sent.");
    return "demo";
  }
  try {
    if (m.channel === "email") {
      const from = s.email_from ? `"${s.business_name.replace(/["\\\r\n]/g, "")}" <${s.email_from}>` : undefined;
      await whiskApi("/email/send", { to: m.to_addr, subject: m.subject, html: m.html, text: m.text, from, reply_to: s.admin_email || undefined });
    } else {
      if (!isPublicUrl(m.to_addr)) throw new Error("The Slack or Teams address must be an https address.");
      const res = await fetch(m.to_addr, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: m.text }), signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`The chat app answered ${res.status}.`);
    }
    await store.markMessage(id, "sent");
    return "sent";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await store.markMessage(id, "failed", msg.slice(0, 500));
    if (rethrow) throw err;
    return "failed";
  }
};

// arrived tells the host, and the team's chat channel, that someone has signed in.
export const arrived = async (s: Settings, v: { name: string; company: string; type_name: string; site_name: string; warning: string; visit_id: number }, host: { name: string; email: string } | undefined) => {
  const who = v.company ? `${v.name} from ${v.company}` : v.name;
  const lines = [`${who} has signed in at ${v.site_name}.`, ...(v.warning ? [`Heads up: ${v.warning}.`] : [])];
  await Promise.all([
    host?.email ? email(s, "arrived", host.email, `${who} is here`, `${v.name} is here to see you`, lines, { href: `${baseUrl()}/visits/${v.visit_id}`, label: "See the visit" }) : undefined,
    chat(s, "arrived", `${v.type_name}: ${who} signed in at ${v.site_name}${host ? ` to see ${host.name}` : ""}.${v.warning ? ` Heads up: ${v.warning}.` : ""}`),
  ]);
};

// invited sends an expected visitor their code and the link to get ready before they come.
export const invited = (s: Settings, i: { name: string; email: string; expected_on: string; site_name: string; host_name: string | null; code: string; token: string }) =>
  email(
    s,
    "invite",
    i.email,
    `Your visit to ${s.business_name} on ${dayLabel(i.expected_on)}`,
    `See you on ${dayLabel(i.expected_on)}`,
    [
      `Hi ${i.name.split(" ")[0]}, you're expected at ${i.site_name}${i.host_name ? ` to see ${i.host_name}` : ""}.`,
      "Fill in your details and do the site induction before you come, then type this code at reception:",
    ],
    { href: `${baseUrl()}/i/${i.token}`, label: "Get ready for your visit" },
    i.code,
  );

// expiring tells the admins which contractor documents lapse in the next two weeks.
export const expiring = (s: Settings, names: string[]) =>
  s.admin_email && names.length
    ? email(s, "expiring", s.admin_email, "Contractor documents expiring soon", "Contractor documents expiring soon", [`These lapse in the next two weeks: ${names.join(", ")}.`], { href: `${baseUrl()}/setup/contractors`, label: "See contractors" })
    : undefined;

export const rollCallStarted = (s: Settings, siteName: string, by: string) => chat(s, "roll-call", `Roll call started at ${siteName} by ${by}.`);

