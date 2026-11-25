import assert from "node:assert/strict";
import { describe, it, test } from "node:test";
import {
  admit, ampm, atLocal, checkDetails, companyState, csv, expiryWarningDue, findOnSite, grade, inductionsDue, initials, isPublicUrl, isSignature,
  dayLabel, dayOf, localDay, passExpiry, phoneKey, questionProblems, rollCall, sameVisitor, seal, shortName, tally, timeOf, unseal, when,
  type Company, type Induction, type Person, type VisitorType,
} from "../src/model.ts";

const ind = (id: number, extra: Partial<Induction> = {}): Induction => ({
  id, title: `I${id}`, body: "", video_upload_id: null, questions: [], pass_mark: 100, valid_months: 12, version: 1, archived: false, ...extra,
});
const type = (extra: Partial<VisitorType> = {}): VisitorType => ({
  id: 1, name: "Visitor", icon: "visitor", position: 0, ask_company: true, ask_phone: true, ask_email: false, ask_host: true,
  photo: false, contractor: false, questions: [], induction_ids: [], archived: false, ...extra,
});
const company = (extra: Partial<Company> = {}): Company => ({
  id: 1, name: "Oakwood", contact_email: "", insurance_expires: null, licence_expires: null, certificate_upload_id: null, archived: false, ...extra,
});
const host: Person = { id: 7, name: "Mei Chen", email: "mei@example.com", site_id: 1, archived: false };
const now = new Date("2026-10-09T01:00:00Z");

describe("inductionsDue", () => {
  const all = [ind(1), ind(2, { version: 3 }), ind(3, { archived: true })];
  const cases: [string, number[], { induction_id: number; version: number; expires_at: Date }[], number[]][] = [
    ["none held", [1, 2], [], [1, 2]],
    ["current pass", [1], [{ induction_id: 1, version: 1, expires_at: new Date("2027-01-01") }], []],
    ["older version", [2], [{ induction_id: 2, version: 2, expires_at: new Date("2027-01-01") }], [2]],
    ["expired pass", [1], [{ induction_id: 1, version: 1, expires_at: new Date("2026-10-01") }], [1]],
    ["archived skipped", [3, 1], [], [1]],
    ["type order kept", [2, 1], [], [2, 1]],
  ];
  for (const [name, ids, passes, want] of cases)
    it(name, () => assert.deepEqual(inductionsDue(type({ induction_ids: ids }), all, passes, now).map((i) => i.id), want));
});

describe("grade", () => {
  const qs = [0, 1, 2, 0].map((answer) => ({ prompt: "?", choices: ["a", "b", "c"], answer }));
  const cases: [string, (number | null)[], number, { score: number; passed: boolean; wrong: number[] }][] = [
    ["all right", [0, 1, 2, 0], 100, { score: 100, passed: true, wrong: [] }],
    ["one wrong at 100", [0, 1, 2, 1], 100, { score: 75, passed: false, wrong: [3] }],
    ["one wrong at 75", [0, 1, 2, 1], 75, { score: 75, passed: true, wrong: [3] }],
    ["unanswered", [null, 1, null, 0], 50, { score: 50, passed: true, wrong: [0, 2] }],
  ];
  for (const [name, answers, mark, want] of cases) it(name, () => assert.deepEqual(grade(qs, answers, mark), want));
  it("no questions always passes", () => assert.deepEqual(grade([], [], 100), { score: 100, passed: true, wrong: [] }));
});

test("questionProblems names each broken question", () => {
  assert.deepEqual(
    questionProblems([
      { prompt: "", choices: ["a", "b"], answer: 0 },
      { prompt: "Q", choices: ["a", " "], answer: 0 },
      { prompt: "Q", choices: ["a", "b"], answer: 5 },
      { prompt: "Q", choices: ["a", "b"], answer: 1 },
    ]),
    ["Question 1 has no question.", "Question 2 needs at least two answers.", "Question 3 needs a right answer."],
  );
});

test("passExpiry: months, or the one visit", () => {
  const at = new Date("2026-10-09T01:00:00Z");
  assert.equal(passExpiry(at, 12).toISOString(), "2027-10-09T01:00:00.000Z");
  assert.equal(passExpiry(at, 0).toISOString(), "2026-10-09T17:00:00.000Z");
});

test("isSignature accepts path data only", () => {
  assert.ok(isSignature("M10 20 L30 40 L50 60"));
  assert.ok(!isSignature("M1"));
  assert.ok(!isSignature('M10 20"/><script>'));
});

describe("companyState", () => {
  const today = "2026-10-09";
  const cases: [string, Partial<Company>, string, string[], string[]][] = [
    ["no dates", {}, "unknown", [], []],
    ["far off", { insurance_expires: "2027-06-01" }, "ok", [], []],
    ["expires today is still valid", { insurance_expires: today }, "soon", [], ["insurance"]],
    ["within two weeks", { licence_expires: "2026-10-23" }, "soon", [], ["license"]],
    ["just outside two weeks", { licence_expires: "2026-10-24" }, "ok", [], []],
    ["lapsed beats soon", { insurance_expires: "2026-10-08", licence_expires: "2026-10-10" }, "lapsed", ["insurance"], ["license"]],
  ];
  for (const [name, c, state, lapsed, soon] of cases) it(name, () => assert.deepEqual(companyState(company(c), today), { state, lapsed, soon }));
});

describe("admit", () => {
  const today = "2026-10-09";
  const lapsed = company({ name: "Bright", insurance_expires: "2026-09-27" });
  const cases: [string, boolean, Company | undefined, "warn" | "block", boolean, { allow: boolean; warning: string }][] = [
    ["not a contractor", false, lapsed, "block", true, { allow: true, warning: "" }],
    ["unknown company, list kept", true, undefined, "block", true, { allow: true, warning: "Company not on the contractor list" }],
    ["unknown company, no list", true, undefined, "block", false, { allow: true, warning: "" }],
    ["lapsed, warn", true, lapsed, "warn", true, { allow: true, warning: "Bright: insurance expired" }],
    ["lapsed, block", true, lapsed, "block", true, { allow: false, warning: "Bright: insurance expired" }],
    ["current", true, company({ insurance_expires: "2027-01-01" }), "block", true, { allow: true, warning: "" }],
  ];
  for (const [name, contractor, c, policy, kept, want] of cases) it(name, () => assert.deepEqual(admit({ contractor }, c, policy, today, kept), want));
});

test("expiryWarningDue warns once, only when soon", () => {
  const soon = { insurance_expires: "2026-10-15", licence_expires: null, archived: false };
  assert.equal(expiryWarningDue({ ...soon, warned_at: null }, "2026-10-09"), true);
  assert.equal(expiryWarningDue({ ...soon, warned_at: new Date() }, "2026-10-09"), false);
  assert.equal(expiryWarningDue({ ...soon, archived: true, warned_at: null }, "2026-10-09"), false);
});

describe("checkDetails", () => {
  const contractor = type({ contractor: true, ask_email: true, questions: [{ label: "Work", required: true }] });
  it("clean details pass", () => {
    const r = checkDetails(contractor, [host], { name: "  Michael   Torres ", company: "Oakwood", phone: "212-555-0199", email: "M@Example.com", host_id: "7", q0: "Gate" });
    assert.equal(r.ok, true);
    assert.deepEqual(r.details, { name: "Michael Torres", company: "Oakwood", phone: "212-555-0199", email: "m@example.com", host_id: 7, answers: [{ label: "Work", answer: "Gate" }] });
  });
  it("each missing field has a message", () => {
    const r = checkDetails(contractor, [host], { name: "W", host_id: "99" });
    assert.equal(r.ok, false);
    assert.deepEqual(Object.keys(r.ok ? {} : r.errors).sort(), ["company", "email", "host_id", "name", "phone", "q0"]);
  });
  it("fields the type does not ask for are dropped", () => {
    const r = checkDetails(type({ ask_company: false, ask_phone: false, ask_host: false }), [host], { name: "Ana Silva", company: "X", phone: "1", host_id: "7" });
    assert.deepEqual(r, { ok: true, details: { name: "Ana Silva", company: "", phone: "", email: "", host_id: null, answers: [] } });
  });
  it("no hosts means no host needed", () => assert.equal(checkDetails(type({ ask_phone: false }), [], { name: "Ana Silva" }).ok, true));
});

test("phoneKey makes +1, 1 and ten-digit numbers the same", () => {
  assert.equal(phoneKey("+1 (212) 555-0199"), "2125550199");
  assert.equal(phoneKey("1-212-555-0199"), "2125550199");
  assert.equal(phoneKey("212.555.0199"), "2125550199");
  assert.equal(phoneKey("555-0199"), "5550199");
});

describe("sameVisitor", () => {
  const cases: [string, string, boolean][] = [
    ["Michael Torres", "michael torres", true],
    ["Michael James Torres", "Michael Torres", true],
    ["Zoë Brown", "Zoe Brown", true],
    ["Michael Torres", "Ana Torres", false],
    ["Michael Torres", "", false],
  ];
  for (const [stored, typed, want] of cases) it(`${stored} / ${typed}`, () => assert.equal(sameVisitor(stored, typed), want));
});

test("names for other visitors and avatars", () => {
  assert.equal(shortName("Ana Maria Silva"), "Ana S.");
  assert.equal(shortName("Cher"), "Cher");
  assert.equal(initials("Ana Maria Silva"), "AS");
  assert.equal(initials("Cher"), "C");
});

describe("findOnSite", () => {
  const people = [{ name: "Ana Silva" }, { name: "Sam Anderson" }, { name: "Mei Chen" }];
  const cases: [string, string[]][] = [
    ["a", []],
    ["an", ["Ana Silva", "Sam Anderson"]],
    ["CHE", ["Mei Chen"]],
    ["ana s", ["Ana Silva"]],
    ["zz", []],
  ];
  for (const [q, want] of cases) it(JSON.stringify(q), () => assert.deepEqual(findOnSite(people, q).map((p) => p.name), want));
});

test("tally splits staff, contractors and visitors", () => {
  assert.deepEqual(
    tally([{ person_id: 1, contractor: false }, { person_id: null, contractor: true }, { person_id: null, contractor: false }, { person_id: null, contractor: false }]),
    { total: 4, staff: 1, contractors: 1, visitors: 2 },
  );
});

describe("rollCall", () => {
  const on = [{ id: 1 }, { id: 2 }, { id: 3 }];
  it("partly done", () => assert.deepEqual(rollCall(on, new Set([1, 9])), { safe: 1, missing: 2, total: 3, done: false }));
  it("done", () => assert.deepEqual(rollCall(on, new Set([1, 2, 3])), { safe: 3, missing: 0, total: 3, done: true }));
  it("nobody on site is not done", () => assert.equal(rollCall([], new Set()).done, false));
});

describe("seal", () => {
  const token = seal("s1", { visit: 4 });
  it("round trips", () => assert.deepEqual(unseal("s1", token), { visit: 4 }));
  it("another secret fails", () => assert.equal(unseal("s2", token), undefined));
  it("a changed body fails", () => assert.equal(unseal("s1", `${Buffer.from('{"visit":5}').toString("base64url")}.${token.split(".")[1]}`), undefined));
  it("junk fails", () => assert.equal(unseal("s1", "nope"), undefined));
});

describe("times in New York", () => {
  it("localDay crosses midnight", () => assert.equal(localDay(new Date("2026-10-10T03:30:00Z"), "America/New_York"), "2026-10-09"));
  it("atLocal in daylight time", () => assert.equal(atLocal("2026-10-09", "09:00", "America/New_York").toISOString(), "2026-10-09T13:00:00.000Z"));
  it("atLocal in standard time", () => assert.equal(atLocal("2026-01-09", "09:00", "America/New_York").toISOString(), "2026-01-09T14:00:00.000Z"));
});

describe("dates and times in en-US", () => {
  const tz = "America/New_York";
  const morning = new Date("2026-10-09T13:14:00Z");
  it("ampm lowercases AM and PM", () => {
    assert.equal(ampm("9:14\u202fAM"), "9:14 am");
    assert.equal(ampm("Friday, October 9 at 4:02 PM"), "Friday, October 9 at 4:02 pm");
    assert.equal(ampm("4:02 p.m."), "4:02 pm");
    assert.equal(ampm("Saturday, September 12"), "Saturday, September 12");
  });
  it("timeOf", () => assert.equal(timeOf(morning, tz), "9:14 am"));
  it("dayOf", () => assert.equal(dayOf(morning, tz), "Fri, Oct 9"));
  it("dayLabel", () => assert.equal(dayLabel("2026-10-09"), "Friday, October 9"));
  it("when today", () => assert.equal(when(morning, tz, new Date("2026-10-09T20:00:00Z")), "9:14 am"));
  it("when another day", () => assert.equal(when(new Date("2026-10-08T20:02:00Z"), tz, morning), "Thu, Oct 8, 4:02 pm"));
});

test("csv quotes and stops formulas", () => {
  assert.equal(csv(["A", "B"], [["=SUM(1)", 'say "hi", ok'], [null, 3]]), `A,B\r\n'=SUM(1),"say ""hi"", ok"\r\n,3\r\n`);
});

test("isPublicUrl only allows outside https", () => {
  assert.ok(isPublicUrl("https://hooks.slack.com/services/x"));
  for (const bad of ["http://hooks.slack.com/x", "https://localhost/x", "https://10.0.0.1/x", "https://intranet/x", "nope"]) assert.ok(!isPublicUrl(bad), bad);
});
