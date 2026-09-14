import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transition, validateHistory } from "./domain.mjs";
const seed = () =>
  JSON.parse(readFileSync(new URL("../fixtures/cases.json", import.meta.url)));
const actor = "demo-operator";
const first = "2026-09-14T11:00:00Z";
const next = "2026-09-14T11:01:00Z";
test("MT-OPS-01a: resolution requires an assigned operator and leaves original intact on refusal", () => {
  const cases = seed();
  const before = structuredClone(cases);
  assert.throws(
    () =>
      transition(cases, {
        id: "EX-1042",
        action: "resolve",
        actor,
        reason: "Investigated the discrepancy",
        at: first,
      }),
    /Assign/,
  );
  assert.deepEqual(cases, before);
});
test("MT-OPS-01b: blank or short reasons cannot close an assigned case", () => {
  const cases = transition(seed(), {
    id: "EX-1042",
    action: "assign",
    actor,
    at: first,
  });
  for (const reason of ["", "   ", "done", null])
    assert.throws(
      () =>
        transition(cases, {
          id: "EX-1042",
          action: "resolve",
          actor,
          reason,
          at: next,
        }),
      /12/,
    );
  assert.equal(cases[0].status, "assigned");
});
test("MT-OPS-01c: assignment and resolution preserve actor, reason and chronology", () => {
  const original = seed();
  const assigned = transition(original, {
    id: "EX-1042",
    action: "assign",
    actor,
    at: first,
  });
  const done = transition(assigned, {
    id: "EX-1042",
    action: "resolve",
    actor,
    reason: "Confirmed delayed event ordering.",
    at: next,
  });
  assert.equal(original[0].history.length, 0);
  assert.equal(done[0].status, "resolved");
  assert.deepEqual(
    done[0].history.map((e) => [e.action, e.actor]),
    [
      ["assign", actor],
      ["resolve", actor],
    ],
  );
  assert.equal(done[0].history[1].reason, done[0].reason);
  assert.deepEqual(validateHistory(done), []);
  assert.deepEqual(done.slice(1), original.slice(1));
});
test("MT-OPS-01c: missing, altered and backdated history is detected", () => {
  const assigned = transition(seed(), {
    id: "EX-1042",
    action: "assign",
    actor,
    at: first,
  });
  assert.throws(
    () =>
      transition(assigned, {
        id: "EX-1042",
        action: "resolve",
        actor,
        reason: "Confirmed feed discrepancy.",
        at: "2026-09-13T10:00:00Z",
      }),
    /chronolog/,
  );
  const done = transition(assigned, {
    id: "EX-1042",
    action: "resolve",
    actor,
    reason: "Confirmed feed discrepancy.",
    at: next,
  });
  const missing = structuredClone(done);
  missing[0].history = [];
  assert.match(validateHistory(missing).join(" "), /history/);
  const altered = structuredClone(done);
  altered[0].history[1].reason = "An unrelated reason";
  assert.match(validateHistory(altered).join(" "), /resolution/);
});
test("MT-OPS-01d: observer and unknown identities cannot mutate cases", () => {
  for (const actor of ["demo-observer", "someone-else", null])
    assert.throws(
      () =>
        transition(seed(), {
          id: "EX-1042",
          action: "assign",
          actor,
          at: first,
        }),
      /operator/,
    );
});
test("resolved cases, unknown cases and unsupported actions are refused", () => {
  const assigned = transition(seed(), {
    id: "EX-1042",
    action: "assign",
    actor,
    at: first,
  });
  const done = transition(assigned, {
    id: "EX-1042",
    action: "resolve",
    actor,
    reason: "Confirmed feed discrepancy.",
    at: next,
  });
  assert.throws(
    () =>
      transition(done, { id: "EX-1042", action: "assign", actor, at: next }),
    /resolved/,
  );
  assert.throws(
    () =>
      transition(seed(), { id: "EX-9999", action: "assign", actor, at: first }),
    /Unknown case/,
  );
  assert.throws(
    () =>
      transition(seed(), { id: "EX-1042", action: "delete", actor, at: first }),
    /Unsupported/,
  );
});
