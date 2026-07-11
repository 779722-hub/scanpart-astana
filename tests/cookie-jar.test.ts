import { test } from "node:test";
import assert from "node:assert/strict";
import { CookieJar } from "../lib/shatem/cookie-jar";

test("seedFromHeader + header round-trip", () => {
  const jar = new CookieJar();
  jar.seedFromHeader("a=1; b=2;  c=3");
  assert.equal(jar.size, 3);
  assert.match(jar.header(), /a=1/);
  assert.match(jar.header(), /b=2/);
  assert.match(jar.header(), /c=3/);
});

test("absorb: stores name=value from Set-Cookie, ignores attributes", () => {
  const h = new Headers();
  h.append("set-cookie", "X-Access-Token=abc123; Path=/; HttpOnly; Secure");
  h.append("set-cookie", "sessid=zzz; Path=/");
  const jar = new CookieJar();
  jar.absorb(new Response(null, { headers: h }));
  assert.equal(jar.size, 2);
  assert.equal(jar.header(), "X-Access-Token=abc123; sessid=zzz");
});

test("absorb: Max-Age=0 deletes a cookie", () => {
  const jar = new CookieJar();
  jar.seedFromHeader("keep=1; drop=2");
  const h = new Headers();
  h.append("set-cookie", "drop=; Max-Age=0; Path=/");
  jar.absorb(new Response(null, { headers: h }));
  assert.equal(jar.size, 1);
  assert.equal(jar.header(), "keep=1");
});

test("absorb: later value overwrites earlier", () => {
  const jar = new CookieJar();
  jar.seedFromHeader("t=old");
  const h = new Headers();
  h.append("set-cookie", "t=new; Path=/");
  jar.absorb(new Response(null, { headers: h }));
  assert.equal(jar.header(), "t=new");
});

test("clear empties the jar", () => {
  const jar = new CookieJar();
  jar.seedFromHeader("a=1");
  jar.clear();
  assert.equal(jar.size, 0);
  assert.equal(jar.header(), "");
});
