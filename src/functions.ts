// The app's background functions. Step names match workflows/*.graph.yaml.
import { demoFunctions } from "./demo.js";
import { expiryWarningDue, localDay, retentionCutoff } from "./model.js";
import { expiring, sendNow } from "./notify.js";
import * as store from "./store.js";
import { inngest } from "./whisk.js";

type Failure = { event: { data: { event: { data: Record<string, unknown> } } }; error: Error };

export const sendMessage = inngest.createFunction(
  {
    id: "send-message",
    triggers: [{ event: "message.send" }],
    retries: 4,
    throttle: { limit: 60, period: "1m" },
    onFailure: async ({ event, error }: Failure) => {
      await store.markMessage(Number(event.data.event.data.message_id), "failed", error.message);
    },
  },
  async ({ event, step }) => step.run("send", () => sendNow(Number(event.data.message_id))),
);

// Every night: sign out anyone still on site (marked as automatic), delete visits older than the
// business keeps them, and warn the admins about contractor documents about to lapse.
export const nightly = inngest.createFunction({ id: "nightly", triggers: [{ cron: "0 23 * * *" }] }, async ({ step }) => {
  const signedOut = await step.run("sign-everyone-out", () => store.signOutAll());
  const expired = await step.run("delete-old-visits", async () => {
    const s = await store.settings();
    return store.expire(retentionCutoff(new Date(), s.retention_months));
  });
  const warned = await step.run("warn-expiring-contractors", async () => {
    const s = await store.settings();
    const today = localDay(new Date(), s.timezone);
    const due = (await store.companies()).filter((c) => expiryWarningDue(c, today));
    if (!due.length || !s.admin_email) return 0;
    await expiring(s, due.map((c) => c.name));
    await store.markWarned(due.map((c) => c.id));
    return due.length;
  });
  return { signedOut, expired, warned };
});

export const functions = [sendMessage, nightly, ...demoFunctions()];
