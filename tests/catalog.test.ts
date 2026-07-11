import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tokens,
  stem,
  nameMatchesAll,
  matchingLeafGroups,
} from "../lib/shatem/catalog";
import type { ShatemGroupNode } from "../lib/shatem/types";

const leaf = (quickGroupId: number, name: string): ShatemGroupNode => ({
  quickGroupId,
  name,
  isLink: true,
  childs: [],
});

// Synthetic tree mirroring the real Laximo shape for a Nissan/Infiniti.
const tree: ShatemGroupNode[] = [
  {
    quickGroupId: 1,
    name: "Двигатель",
    isLink: false,
    childs: [leaf(2, "Масляный фильтр"), leaf(3, "Свеча зажигания")],
  },
  {
    quickGroupId: 10,
    name: "Тормозная система",
    isLink: false,
    childs: [
      leaf(15, "Колодки тормозные дисковые"),
      leaf(16, "Колодки тормозные барабанные"),
      leaf(17, "Диск тормозной"),
    ],
  },
];

const ids = (nodes: ShatemGroupNode[]) => nodes.map((n) => n.quickGroupId).sort((a, b) => a - b);

test("tokens: splits, lowercases, drops <3 chars and punctuation", () => {
  assert.deepEqual(tokens("Колодки, передние!"), ["колодки", "передние"]);
  assert.deepEqual(tokens("в на колодки"), ["колодки"]); // 2-char words dropped
});

test("stem: 6-char prefix handles Russian inflection", () => {
  assert.equal(stem("передние"), stem("переднего")); // both → "передн"
  assert.equal(stem("колодки"), "колодк");
  assert.equal(stem("тормозные"), "тормоз");
});

test("nameMatchesAll: order-independent, morphology-tolerant", () => {
  assert.equal(nameMatchesAll("Масляный фильтр", tokens("фильтр масляный")), true);
  assert.equal(nameMatchesAll("Колодки переднего дискового тормоза", tokens("колодки передние")), true);
  assert.equal(nameMatchesAll("Колодки заднего дискового тормоза", tokens("колодки передние")), false);
  assert.equal(nameMatchesAll("что угодно", []), false);
});

test("matchingLeafGroups: single noun → all relevant leaves", () => {
  assert.deepEqual(ids(matchingLeafGroups(tree, "колодки")), [15, 16]);
});

test("matchingLeafGroups: multi-word (word order + declension) still matches", () => {
  // Regression: "тормозные колодки" used to yield 0.
  const got = matchingLeafGroups(tree, "тормозные колодки");
  assert.ok(got.some((n) => n.quickGroupId === 15), "front pads present");
  assert.ok(got.some((n) => n.quickGroupId === 16), "rear pads present");
});

test("matchingLeafGroups: ranks by token-match count (pads before plain 'тормозной')", () => {
  const got = matchingLeafGroups(tree, "тормозные колодки", 2);
  // Both top-2 must be the two-token pad groups, not the single-token "Диск тормозной" (17).
  assert.deepEqual(ids(got), [15, 16]);
});

test("matchingLeafGroups: 'масляный фильтр' → the oil-filter leaf, not brakes", () => {
  assert.deepEqual(ids(matchingLeafGroups(tree, "масляный фильтр")), [2]);
});

test("matchingLeafGroups: empty / non-matching query → []", () => {
  assert.deepEqual(matchingLeafGroups(tree, ""), []);
  assert.deepEqual(matchingLeafGroups(tree, "зеркало"), []);
});
