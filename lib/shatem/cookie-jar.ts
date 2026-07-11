/**
 * Minimal in-memory cookie jar for a single origin, on native fetch.
 * Just enough for the Shate-M web session (login → jar → refresh-on-401):
 * store cookies from Set-Cookie, emit a Cookie header. No domain/path
 * matching — we only ever talk to one host.
 *
 * No new dependency (avoids tough-cookie/axios) — Node 20 fetch exposes
 * response.headers.getSetCookie().
 */
export class CookieJar {
  private cookies = new Map<string, string>();

  /** Absorb Set-Cookie headers from a response. */
  absorb(res: Response): void {
    const setCookies =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : [];
    for (const line of setCookies) {
      const first = line.split(";")[0]?.trim();
      if (!first) continue;
      const eq = first.indexOf("=");
      if (eq <= 0) continue;
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      // Expiry via Max-Age=0 / empty value → delete.
      if (!value || /(?:^|;)\s*max-age=0\b/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  /** Cookie header string, or "" when empty. */
  header(): string {
    return Array.from(this.cookies, ([k, v]) => `${k}=${v}`).join("; ");
  }

  get size(): number {
    return this.cookies.size;
  }

  clear(): void {
    this.cookies.clear();
  }

  /** Seed from a raw Cookie header (e.g. captured from the browser for probes). */
  seedFromHeader(raw: string): void {
    for (const part of raw.split(";")) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      this.cookies.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    }
  }
}
