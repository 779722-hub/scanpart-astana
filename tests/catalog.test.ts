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

test("stem: strips inflection for short words (задние/заднего → задн)", () => {
  assert.equal(stem("задние"), stem("заднего")); // was the bug: "задние" stayed whole
  assert.equal(stem("задние"), "задн");
  assert.equal(stem("оси"), "оси"); // too short to strip an ending
});

test("nameMatchesAll: 'задние' matches catalog 'заднего' (reported bug)", () => {
  assert.equal(nameMatchesAll("Колодки заднего дискового тормоза", tokens("колодки задние")), true);
  assert.equal(nameMatchesAll("Колодки переднего дискового тормоза", tokens("колодки задние")), false);
});

test("matchingLeafGroups: category noun outranks position qualifier", () => {
  const t: ShatemGroupNode[] = [
    leaf(15, "Колодки тормозные"),
    leaf(91, "Фонарь задний"),
    leaf(92, "Сальник коленвала задний"),
  ];
  // "колодк"(6) must beat the "задн"(4)-only lamp/seal groups.
  assert.deepEqual(matchingLeafGroups(t, "колодки задние", 1).map((n) => n.quickGroupId), [15]);
});

test("nameMatchesAll: order-independent, morphology-tolerant", () => {
  assert.equal(nameMatchesAll("Масляный фильтр", tokens("фильтр масляный")), true);
  assert.equal(nameMatchesAll("Колодки переднего дискового тормоза", tokens("колодки передние")), true);
  assert.equal(nameMatchesAll("Колодки заднего дискового тормоза", tokens("колодки передние")), false);
  assert.equal(nameMatchesAll("что угодно", []), false);
});

test("nameMatchesAll: category head rejects accessories (reported bug)", () => {
  // "Крепление масляного фильтра" contains both query words but is a mount.
  assert.equal(nameMatchesAll("Крепление масляного фильтра", tokens("масляный фильтр")), false);
  assert.equal(nameMatchesAll("Кронштейн масляного фильтра", tokens("масляный фильтр")), false);
  assert.equal(nameMatchesAll("Масляный фильтр", tokens("масляный фильтр")), true);
  // Position qualifiers are skipped when finding the category head.
  assert.equal(nameMatchesAll("Задний тормозной диск", tokens("тормозной диск")), true);
});

test("nameMatchesAll: Toyota-style 'Комплект … колодок' brake pads (reported bug)", () => {
  // Fleeting vowel: "колодки"→ must match the catalog's genitive "колодок".
  // Collection head "Комплект": judged by the noun it governs, not "комплект".
  assert.equal(nameMatchesAll("Комплект передних тормозных колодок", tokens("колодки")), true);
  assert.equal(nameMatchesAll("Комплект задних тормозных колодок", tokens("колодки")), true);
  assert.equal(nameMatchesAll("Комплект колодок заднего тормоза", tokens("колодки")), true);
  // Position filter still applies to the kits.
  assert.equal(nameMatchesAll("Комплект передних тормозных колодок", tokens("колодки задние")), false);
  assert.equal(nameMatchesAll("Комплект задних тормозных колодок", tokens("колодки задние")), true);
  // Hardware kits that merely mention pads are NOT the pads.
  assert.equal(nameMatchesAll("Комплект распорок задних тормозных колодок", tokens("колодки")), false);
  assert.equal(nameMatchesAll("Комплект прижимных пружин колодок заднего тормоза", tokens("колодки")), false);
  assert.equal(nameMatchesAll("Комплект соединительных деталей заднего дискового тормоза", tokens("колодки")), false);
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
