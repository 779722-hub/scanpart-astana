import { test } from "node:test";
import assert from "node:assert/strict";
import { getProxyAgent, resetProxyAgent, isProxyConnError } from "../lib/proxy";

// --- isProxyConnError: TRUE for connection-level (dead tunnel) failures -------

test("isProxyConnError: true for ECONNREFUSED", () => {
  assert.equal(isProxyConnError(new Error("connect ECONNREFUSED 1.2.3.4:8080")), true);
});

test("isProxyConnError: true for undici «Request was cancelled»", () => {
  assert.equal(isProxyConnError(new Error("Request was cancelled")), true);
});

test("isProxyConnError: true for «socket hang up»", () => {
  assert.equal(isProxyConnError(new Error("socket hang up")), true);
});

test("isProxyConnError: true for «fetch failed» with connect cause", () => {
  const err = new Error("fetch failed");
  (err as { cause?: unknown }).cause = { code: "ECONNRESET", message: "read ECONNRESET" };
  assert.equal(isProxyConnError(err), true);
});

test("isProxyConnError: reads cause.code even when message is generic", () => {
  const err = new Error("something opaque");
  (err as { cause?: unknown }).cause = { code: "ENOTFOUND" };
  assert.equal(isProxyConnError(err), true);
});

// --- isProxyConnError: FALSE for our own request timeout of a healthy tunnel --

test("isProxyConnError: false for plain AbortError «This operation was aborted»", () => {
  const err = new Error("This operation was aborted");
  err.name = "AbortError";
  assert.equal(isProxyConnError(err), false);
});

test("isProxyConnError: false for null/undefined/plain string", () => {
  assert.equal(isProxyConnError(undefined), false);
  assert.equal(isProxyConnError(null), false);
  assert.equal(isProxyConnError("just a slow response"), false);
});

// --- resetProxyAgent evicts the cached agent so the next one is fresh ---------

test("resetProxyAgent: next getProxyAgent returns a NEW instance", () => {
  process.env.PHAETON_PROXY_URL = "http://user:pass@proxy.test:8080";

  const a1 = getProxyAgent("PHAETON_PROXY_URL");
  const a2 = getProxyAgent("PHAETON_PROXY_URL");
  assert.ok(a1, "agent created when proxy env is set");
  assert.equal(a1, a2, "same instance is cached between calls");

  resetProxyAgent("PHAETON_PROXY_URL");

  const a3 = getProxyAgent("PHAETON_PROXY_URL");
  assert.ok(a3, "agent rebuilt after reset");
  assert.notEqual(a1, a3, "reset forces a fresh instance");

  delete process.env.PHAETON_PROXY_URL;
});

test("getProxyAgent: undefined when no proxy env set (dev/direct)", () => {
  delete process.env.PHAETON_PROXY_URL;
  delete process.env.SHATEM_PROXY_URL;
  assert.equal(getProxyAgent("SHATEM_PROXY_URL", "PHAETON_PROXY_URL"), undefined);
});
