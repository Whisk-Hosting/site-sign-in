import assert from "node:assert/strict";
import { describe, it, test } from "node:test";
import { companyPatch, fieldErrors, isKeyShape, keyFrom, makeKey, pageFrom, pageFromRows, pageOf, personPatch, signInVerdict, visitForm } from "../src/api-model.ts";
import { checkDetails, inviteProblems, type VisitorType } from "../src/model.ts";

const key = `vis_${"a".repeat(32)}`;
const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("keyFrom", () => {
  const cases: [string, Parameters<typeof keyFrom>[0], string][] = [
    ["bearer", { authorization: `Bearer ${key}` }, key],
    ["bearer, any case", { authorization: `bearer   ${key}` }, key],
    ["basic, key as username", { authorization: `Basic ${b64(`${key}:`)}` }, key],
    ["basic, with a password", { authorization: `Basic ${b64(`${key}:x`)}` }, key],
    ["x-api-key", { xApiKey: key }, key],
    ["token query", { token: key }, key],
    ["header wins over query", { authorization: `Bearer ${key}`, token: "other" }, key],
    ["nothing", {}, ""],
    ["other scheme", { authorization: "Digest abc" }, ""],
  ];
  for (const [name, h, want] of cases) it(name, () => assert.equal(keyFrom(h), want));
});

test("makeKey: vis_ and 32 base64url characters", () => {
  const k = makeKey((n) => Buffer.alloc(n, 255));
  assert.equal(k.length, 36);
  assert.ok(isKeyShape(k));
  assert.ok(!isKeyShape("vis_short"));
  assert.ok(!isKeyShape(`trn_${"a".repeat(32)}`));
});

describe("pageFrom", () => {
  const cases: [string, { limit?: string; offset?: string }, unknown][] = [
    ["defaults", {}, { limit: 50, offset: 0 }],
    ["given", { limit: "10", offset: "20" }, { limit: 10, offset: 20 }],
    ["empty strings are defaults", { limit: "", offset: "" }, { limit: 50, offset: 0 }],
    ["limit 0", { limit: "0" }, "LIMIT_INVALID"],
    ["limit too big", { limit: "201" }, "LIMIT_INVALID"],
    ["limit not a number", { limit: "ten" }, "LIMIT_INVALID"],
    ["negative offset", { offset: "-1" }, "OFFSET_INVALID"],
    ["fractional offset", { offset: "1.5" }, "OFFSET_INVALID"],
  ];
  for (const [name, q, want] of cases)
    it(name, () => {
      const r = pageFrom(q);
      assert.deepEqual(r.ok ? r.value : r.error.code, want);
      if (!r.ok) assert.equal(r.error.status, 400);
    });
});

describe("pages", () => {
  const xs = [1, 2, 3, 4, 5];
  const cases: [string, number, number, number[], number | null][] = [
    ["first", 2, 0, [1, 2], 2],
    ["middle", 2, 2, [3, 4], 4],
    ["last", 2, 4, [5], null],
    ["exact end", 5, 0, [1, 2, 3, 4, 5], null],
    ["past the end", 2, 10, [], null],
  ];
  for (const [name, limit, offset, items, next] of cases)
    it(`pageOf ${name}`, () => assert.deepEqual(pageOf(xs, { limit, offset }), { items, limit, offset, next_offset: next }));
  it("pageFromRows: one row more than the limit means another page", () => {
    assert.deepEqual(pageFromRows([1, 2, 3], { limit: 2, offset: 4 }), { items: [1, 2], limit: 2, offset: 4, next_offset: 6 });
    assert.deepEqual(pageFromRows([1, 2], { limit: 2, offset: 4 }), { items: [1, 2], limit: 2, offset: 4, next_offset: null });
  });
});

const type = (extra: Partial<VisitorType> = {}): VisitorType => ({
  id: 1, name: "Visitor", icon: "visitor", position: 0, ask_company: true, ask_phone: true, ask_email: false, ask_host: true,
  photo: false, contractor: false, questions: [{ label: "Vehicle", required: true }, { label: "Notes", required: false }], induction_ids: [], archived: false, ...extra,
});
const hosts = [{ id: 7, name: "Mei Chen", email: "", site_id: null, archived: false }];

describe("visitForm feeds the kiosk's own checks", () => {
  it("Envoy names", () => {
    const r = checkDetails(type(), hosts, visitForm(type(), { full_name: "Ana Silva", phone_number: "212-555-0167", company: "Acme", host_id: 7, answers: ["Van", ""] }));
    assert.ok(r.ok);
    assert.deepEqual(r.details, { name: "Ana Silva", company: "Acme", phone: "212-555-0167", email: "", host_id: 7, answers: [{ label: "Vehicle", answer: "Van" }, { label: "Notes", answer: "" }] });
  });
  it("plain names and answers by label", () => {
    const r = checkDetails(type(), hosts, visitForm(type(), { name: "Ana Silva", phone: "2125550167", host_id: "7", answers: { Vehicle: "Car" } }));
    assert.ok(r.ok);
    assert.equal(r.details.answers[0].answer, "Car");
  });
  it("missing fields come back under their API names", () => {
    const r = checkDetails(type(), hosts, visitForm(type(), { full_name: "A" }));
    assert.ok(!r.ok);
    assert.deepEqual(Object.keys(fieldErrors(r.errors)).sort(), ["answers[0]", "full_name", "host_id", "phone_number"]);
  });
});

describe("signInVerdict", () => {
  const good = checkDetails(type({ questions: [] }), [], { name: "Ana Silva", phone: "2125550167" });
  const bad = checkDetails(type({ questions: [] }), [], { name: "" });
  const allow = { allow: true, warning: "" };
  const block = { allow: false, warning: "Oakwood: insurance expired" };
  const due = [{ id: 3, title: "Site safety" }];
  const cases: [string, typeof good, typeof allow, typeof due, string | null, number | null][] = [
    ["all clear", good, allow, [], null, null],
    ["details first", bad, block, due, "DETAILS_INVALID", 422],
    ["then the contractor check", good, block, due, "CONTRACTOR_BLOCKED", 409],
    ["then inductions", good, allow, due, "INDUCTION_DUE", 409],
  ];
  for (const [name, checked, admission, d, code, status] of cases)
    it(name, () => {
      const r = signInVerdict(checked, admission, d);
      assert.equal(r.ok ? null : r.error.code, code);
      assert.equal(r.ok ? null : r.error.status, status);
      if (!r.ok) assert.ok(r.error.fix.length > 0);
    });
  it("names the inductions due", () => {
    const r = signInVerdict(good, allow, [...due, { id: 4, title: "PPE" }]);
    assert.ok(!r.ok && r.error.message.includes("Site safety and PPE"));
  });
});

describe("inviteProblems, shared with the Expected screen", () => {
  const today = "2026-10-10";
  const cases: [string, { name: string; email: string; day: string }, string[]][] = [
    ["fine", { name: "Ana Silva", email: "ana@example.com", day: today }, []],
    ["no email is fine", { name: "Ana Silva", email: "", day: "2026-12-01" }, []],
    ["short name", { name: "A", email: "", day: today }, ["name"]],
    ["bad email", { name: "Ana", email: "ana@", day: today }, ["email"]],
    ["past day", { name: "Ana", email: "", day: "2026-10-09" }, ["day"]],
    ["not a day", { name: "Ana", email: "", day: "tomorrow" }, ["day"]],
  ];
  for (const [name, v, want] of cases) it(name, () => assert.deepEqual(Object.keys(inviteProblems(v, today)), want));
});

describe("companyPatch", () => {
  const cases: [string, Record<string, unknown>, unknown][] = [
    ["nothing", {}, {}],
    ["dates and a clear", { insurance_expires: "2027-06-30", licence_expires: null }, { insurance_expires: "2027-06-30", licence_expires: null }],
    ["empty string clears", { licence_expires: "" }, { licence_expires: null }],
    ["name trimmed", { name: "  Oakwood  " }, { name: "Oakwood" }],
    ["email lower-cased", { contact_email: "Office@Example.com" }, { contact_email: "office@example.com" }],
    ["archived", { archived: true }, { archived: true }],
    ["bad date", { insurance_expires: "30/06/2027" }, "DATE_INVALID"],
    ["empty name", { name: " " }, "NAME_REQUIRED"],
    ["bad email", { contact_email: "office" }, "EMAIL_INVALID"],
    ["archived not boolean", { archived: "yes" }, "ARCHIVED_INVALID"],
  ];
  for (const [name, b, want] of cases)
    it(name, () => {
      const r = companyPatch(b);
      assert.deepEqual(r.ok ? r.value : r.error.code, want);
    });
});

describe("personPatch", () => {
  const sites = [1, 2];
  const cases: [string, Record<string, unknown>, unknown][] = [
    ["name and email", { name: "Mei Chen", email: "Mei@Example.com" }, { name: "Mei Chen", email: "mei@example.com" }],
    ["a site", { site_id: 2 }, { site_id: 2 }],
    ["every site", { site_id: null }, { site_id: null }],
    ["unknown site", { site_id: 9 }, "SITE_NOT_FOUND"],
    ["nonsense site", { site_id: "x" }, "SITE_NOT_FOUND"],
    ["empty name", { name: "" }, "NAME_REQUIRED"],
    ["bad email", { email: "mei" }, "EMAIL_INVALID"],
    ["no email is fine", { email: "" }, { email: "" }],
  ];
  for (const [name, b, want] of cases)
    it(name, () => {
      const r = personPatch(b, sites);
      assert.deepEqual(r.ok ? r.value : r.error.code, want);
    });
});
