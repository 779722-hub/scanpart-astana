import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyBracketMarkup,
  parsePriceBrackets,
  type PriceBracket,
} from "../lib/markup";

const B = (from: number, to: number | null, kind: "percent" | "fixed", value: number): PriceBracket => ({
  from,
  to,
  kind,
  value,
});

test("applyBracketMarkup: percent bracket", () => {
  const brackets = [B(0, 3000, "percent", 100)];
  assert.equal(applyBracketMarkup(1000, brackets, 35), 2000); // *2
});

test("applyBracketMarkup: fixed bracket adds tenge", () => {
  const brackets = [B(10000, null, "fixed", 6000)];
  assert.equal(applyBracketMarkup(12000, brackets, 35), 18000);
});

test("applyBracketMarkup: open-ended last bracket catches high prices", () => {
  const brackets = [B(0, 10000, "percent", 60), B(10000, null, "fixed", 6000)];
  assert.equal(applyBracketMarkup(50000, brackets, 35), 56000);
});

test("applyBracketMarkup: boundary — from inclusive, to exclusive", () => {
  const brackets = [B(0, 3000, "percent", 100), B(3000, 10000, "percent", 60)];
  // price == 3000 falls in the SECOND bracket (from inclusive, prev to exclusive)
  assert.equal(applyBracketMarkup(3000, brackets, 35), 4800); // 3000 * 1.6
  // price just below 3000 stays in the first bracket
  assert.equal(applyBracketMarkup(2999, brackets, 35), Math.round(2999 * 2));
});

test("applyBracketMarkup: no match → fallback global percent", () => {
  const brackets = [B(0, 1000, "percent", 100)];
  // 5000 matches nothing → global 35%
  assert.equal(applyBracketMarkup(5000, brackets, 35), Math.round(5000 * 1.35));
});

test("applyBracketMarkup: empty brackets → fallback global percent", () => {
  assert.equal(applyBracketMarkup(5000, [], 35), Math.round(5000 * 1.35));
});

test("parsePriceBrackets: parses JSON string, sorts ascending", () => {
  const json = JSON.stringify([
    { from: 3000, to: 10000, kind: "percent", value: 60 },
    { from: 0, to: 3000, kind: "percent", value: 100 },
  ]);
  const out = parsePriceBrackets(json);
  assert.equal(out.length, 2);
  assert.equal(out[0].from, 0);
  assert.equal(out[1].from, 3000);
});

test("parsePriceBrackets: malformed input ignored", () => {
  assert.deepEqual(parsePriceBrackets("not json"), []);
  assert.deepEqual(parsePriceBrackets(""), []);
  assert.deepEqual(parsePriceBrackets(undefined), []);
  assert.deepEqual(parsePriceBrackets(null), []);
  assert.deepEqual(parsePriceBrackets(42), []);
  // array with junk elements → junk dropped
  const out = parsePriceBrackets([
    { from: 0, to: 100, kind: "percent", value: 50 },
    { from: "x", to: 200, kind: "percent", value: 10 }, // bad from
    { from: 200, to: 100, kind: "percent", value: 10 }, // to <= from
    { from: 300, to: null, kind: "bogus", value: 10 }, // bad kind
    { from: 400, to: null, kind: "fixed", value: -5 }, // negative value
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].from, 0);
});

test("parsePriceBrackets: drops overlaps keeping earlier", () => {
  const out = parsePriceBrackets([
    { from: 0, to: 5000, kind: "percent", value: 100 },
    { from: 3000, to: 8000, kind: "percent", value: 60 }, // overlaps → dropped
    { from: 8000, to: null, kind: "fixed", value: 6000 },
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((b) => b.from),
    [0, 8000]
  );
});

test("parsePriceBrackets: open-ended bracket swallows anything after it", () => {
  const out = parsePriceBrackets([
    { from: 0, to: null, kind: "percent", value: 50 },
    { from: 100, to: 200, kind: "percent", value: 10 },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].to, null);
});

test("parsePriceBrackets: caps at 10 brackets", () => {
  const many = Array.from({ length: 15 }, (_, i) => ({
    from: i * 1000,
    to: (i + 1) * 1000,
    kind: "percent" as const,
    value: 10,
  }));
  assert.equal(parsePriceBrackets(many).length, 10);
});
