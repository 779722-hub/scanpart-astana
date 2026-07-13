import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeLegs } from "../lib/delivery/roadroute";

test("summarizeLegs: empty array → zeros", () => {
  assert.deepEqual(summarizeLegs([]), { totalKm: 0, totalMin: 0 });
});

test("summarizeLegs: km rounded to 0.1, min to nearest int", () => {
  assert.deepEqual(
    summarizeLegs([
      { km: 1.24, min: 3.6 },
      { km: 2.11, min: 4.4 },
    ]),
    { totalKm: 3.4, totalMin: 8 }
  );
});
