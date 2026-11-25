// A first install gets a site, four visitor types and two inductions, so the kiosk works the
// moment it is opened. Admins change or archive any of it. Nothing is added once a site exists.
import type { Sql } from "postgres";
import type { Ask, Question } from "./model.js";

const visitorRules = `Welcome. While you're with us:

- **Stay with your host**, and wear your badge where it can be seen.
- **If the alarm sounds**, leave by the nearest exit and go to the assembly point in the parking lot. Don't stop to collect things.
- **Tell your host** about anything that looks unsafe, or if you're hurt, however small.
- Some areas are **staff only**. Your host will show you where you can go.`;

const siteRules = `This induction covers what everyone working on site must know. It takes about three minutes.

## Before you start

- Sign in every time you arrive, and **sign out when you leave**, so we know who is on site in an emergency.
- Check in with your host before starting work.

## Personal protective equipment

- **A hi-vis vest, safety boots and a hard hat** in the yard at all times.
- Eye and hearing protection where signs say so.

## Hazards

- Forklifts and trucks move through the yard. **Stay inside the walkways** and make eye contact with drivers.
- Tell your host before any hot work, work at height or work on electrical equipment. These need a permit.

## In an emergency

- On the alarm, stop work, make your work area safe if you can, and go to the **assembly point by the front gate**.
- Don't leave until a warden has marked you safe.

## Incidents

- Report every injury, near miss and hazard to your host before you leave.`;

const siteQuiz: Question[] = [
  { prompt: "Where do you go when the alarm sounds?", choices: ["Back to my vehicle", "The assembly point by the front gate", "Wherever is closest"], answer: 1 },
  { prompt: "What must you wear in the yard?", choices: ["A hi-vis vest, safety boots and a hard hat", "Whatever is comfortable", "Only a hi-vis vest"], answer: 0 },
  { prompt: "When do you sign out?", choices: ["Only at the end of the week", "When you leave the site", "Never, it happens on its own"], answer: 1 },
];

type SeedType = { name: string; icon: string; ask_company: boolean; ask_phone: boolean; ask_email: boolean; ask_host: boolean; contractor: boolean; questions: Ask[]; inductions: ("visitor" | "site")[] };

const typesToAdd: SeedType[] = [
  { name: "Visitor", icon: "visitor", ask_company: true, ask_phone: true, ask_email: false, ask_host: true, contractor: false, questions: [], inductions: ["visitor"] },
  { name: "Contractor", icon: "contractor", ask_company: true, ask_phone: true, ask_email: true, ask_host: true, contractor: true, questions: [{ label: "What work are you doing today?", required: true }], inductions: ["site"] },
  { name: "Delivery", icon: "delivery", ask_company: true, ask_phone: false, ask_email: false, ask_host: false, contractor: false, questions: [], inductions: [] },
  { name: "Interview", icon: "interview", ask_company: false, ask_phone: true, ask_email: true, ask_host: true, contractor: false, questions: [], inductions: ["visitor"] },
];

export const seed = async (sql: Sql, siteName = "Main office"): Promise<boolean> => {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from sites`;
  if (n > 0) return false;
  await sql.begin(async (tx) => {
    await tx`insert into sites (name, poster_token) values (${siteName}, ${(await import("node:crypto")).randomBytes(9).toString("base64url")})`;
    const [visitor] = await tx<{ id: number }[]>`insert into inductions (title, body, valid_months) values ('Visitor safety', ${visitorRules}, 12) returning id`;
    const [site] = await tx<{ id: number }[]>`insert into inductions (title, body, questions, pass_mark, valid_months)
      values ('Site induction', ${siteRules}, ${tx.json(siteQuiz as never)}, 100, 12) returning id`;
    const ids = { visitor: visitor.id, site: site.id };
    for (const [i, t] of typesToAdd.entries()) {
      await tx`insert into visitor_types (name, icon, position, ask_company, ask_phone, ask_email, ask_host, contractor, questions, induction_ids)
        values (${t.name}, ${t.icon}, ${i}, ${t.ask_company}, ${t.ask_phone}, ${t.ask_email}, ${t.ask_host}, ${t.contractor},
          ${tx.json(t.questions as never)}, ${t.inductions.map((k) => ids[k])})`;
    }
  });
  return true;
};
