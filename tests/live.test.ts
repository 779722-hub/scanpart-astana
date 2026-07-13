import { test } from "node:test";
import assert from "node:assert/strict";
import { minutesAgo, isStale, agoLabel } from "../lib/delivery/live";

const now = Date.parse("2026-07-13T12:00:00.000Z");

test("minutesAgo: parses and floors, clamps to >= 0", () => {
  assert.equal(minutesAgo("2026-07-13T11:57:00.000Z", now), 3);
  assert.equal(minutesAgo("2026-07-13T12:05:00.000Z", now), 0); // future clamps to 0
  assert.equal(minutesAgo("not-a-date", now), null);
});

test("isStale: threshold + missing", () => {
  assert.equal(isStale("2026-07-13T11:58:00.000Z", now, 5), false); // 2 min
  assert.equal(isStale("2026-07-13T11:54:00.000Z", now, 5), true); // 6 min
  assert.equal(isStale("", now, 5), true);
});

test("agoLabel: human text", () => {
  assert.equal(agoLabel("2026-07-13T12:00:00.000Z", now), "только что");
  assert.equal(agoLabel("2026-07-13T11:57:00.000Z", now), "3 мин назад");
  assert.equal(agoLabel("2026-07-13T10:00:00.000Z", now), "2 ч назад");
  assert.equal(agoLabel("", now), "нет данных");
});
