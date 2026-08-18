import { test } from "node:test";
import assert from "node:assert/strict";
import { proxyStatusTransition } from "../lib/proxy-health";

// Алерт шлём только на РЕАЛЬНОМ переходе; первый замер лишь сохраняется.

test("proxyStatusTransition: absent → down = store, no alert", () => {
  assert.deepEqual(proxyStatusTransition(undefined, "down"), { changed: false });
});

test("proxyStatusTransition: absent → up = store, no alert", () => {
  assert.deepEqual(proxyStatusTransition(undefined, "up"), { changed: false });
});

test("proxyStatusTransition: down → up = alert up", () => {
  assert.deepEqual(proxyStatusTransition("down", "up"), { changed: true, alert: "up" });
});

test("proxyStatusTransition: up → down = alert down", () => {
  assert.deepEqual(proxyStatusTransition("up", "down"), { changed: true, alert: "down" });
});

test("proxyStatusTransition: up → up = no change", () => {
  assert.deepEqual(proxyStatusTransition("up", "up"), { changed: false });
});

test("proxyStatusTransition: down → down = no change", () => {
  assert.deepEqual(proxyStatusTransition("down", "down"), { changed: false });
});
