import test from "node:test";
import assert from "node:assert/strict";
import { weekPeriod, withinPeriod } from "../lib/gestao/period.ts";

test("weeks start on Monday and end on Sunday, including those days", () => {
  const expected = { start: "2026-11-16", end: "2026-11-22" };
  for (const date of ["2026-11-16", "2026-11-18", "2026-11-22"]) {
    assert.deepEqual(weekPeriod(date), expected);
  }
  assert.deepEqual(weekPeriod("2026-11-23"), {
    start: "2026-11-23", end: "2026-11-29",
  });
});

test("previous week handles month, year and leap-year boundaries", () => {
  assert.deepEqual(weekPeriod("2026-11-18", -1), {
    start: "2026-11-09", end: "2026-11-15",
  });
  assert.deepEqual(weekPeriod("2026-11-02", -1), {
    start: "2026-10-26", end: "2026-11-01",
  });
  assert.deepEqual(weekPeriod("2027-01-01"), {
    start: "2026-12-28", end: "2027-01-03",
  });
  assert.deepEqual(weekPeriod("2027-01-01", -1), {
    start: "2026-12-21", end: "2026-12-27",
  });
  assert.deepEqual(weekPeriod("2024-02-29"), {
    start: "2024-02-26", end: "2024-03-03",
  });
});

test("custom range includes both endpoints, for revenue and expense totals", () => {
  const period = { start: "2026-11-16", end: "2026-11-23" };
  const entries = [
    { date: "2026-11-15", type: "Entrada", cents: 99000 },
    { date: "2026-11-16", type: "Entrada", cents: 1000 },
    { date: "2026-11-23", type: "Entrada", cents: 2000 },
    { date: "2026-11-16", type: "Saída", cents: 300 },
    { date: "2026-11-23", type: "Saída", cents: 700 },
    { date: "2026-11-24", type: "Saída", cents: 99000 },
  ];
  const shown = entries.filter(e => withinPeriod(e.date, period));
  assert.equal(shown.length, 4);
  const sum = type => shown.filter(e => e.type === type).reduce((n, e) => n + e.cents, 0);
  assert.equal(sum("Entrada"), 3000);
  assert.equal(sum("Saída"), 1000);
});

test("single-day, all-time and cross-month ranges remain supported", () => {
  assert.equal(withinPeriod("2026-11-23", { start: "2026-11-23", end: "2026-11-23" }), true);
  assert.equal(withinPeriod("2026-11-24", { start: "2026-11-23", end: "2026-11-23" }), false);
  assert.equal(withinPeriod("2020-01-01", { start: "", end: "" }), true);
  assert.equal(withinPeriod("2026-11-01", { start: "2026-10-30", end: "2026-11-02" }), true);
});
