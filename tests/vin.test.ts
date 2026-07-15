import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeVin,
  isVinFormatValid,
  isVinAcceptable,
} from "../lib/vin/validator";

test("normalizeVin: uppercases, strips spaces and dashes", () => {
  assert.equal(normalizeVin(" jn8as05y37x012386 "), "JN8AS05Y37X012386");
  assert.equal(normalizeVin("ae100-1234567"), "AE1001234567");
});

test("isVinFormatValid: strict 17-char ISO VIN (no I/O/Q)", () => {
  assert.equal(isVinFormatValid("JN8AS05Y37X012386"), true); // 17
  assert.equal(isVinFormatValid("JN8AS05Y37X01238"), false); // 16
  assert.equal(isVinFormatValid("JN8AS05Y37X01238O"), false); // has O
});

test("isVinAcceptable: 8–17 alphanumeric (Korean/JDM/older frame numbers)", () => {
  assert.equal(isVinAcceptable("JN8AS05Y37X012386"), true); // 17 standard
  assert.equal(isVinAcceptable("AE1001234567"), true); // 12 frame number
  assert.equal(isVinAcceptable("KMHDN41BP6U"), true); // 11
  assert.equal(isVinAcceptable("ABCDEFGH"), true); // 8 (min)
  assert.equal(isVinAcceptable("SHORT"), false); // 5 too short
  assert.equal(isVinAcceptable("JN8AS05Y37X0123867"), false); // 18 too long
  assert.equal(isVinAcceptable("AE100-123456"), false); // dash — must normalize first
});
