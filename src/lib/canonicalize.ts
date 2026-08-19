export interface ParsedUrl {
  href: string;
  origin: string;
  protocol: string;
  host: string;
  pathname: string;
  search: string;
  hash: string;
}

/**
 * Canonicalize URL for match/compare per SPEC §9.1.
 */
export function canonicalizeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;

    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.toLowerCase();

    if (u.protocol === "http:" && u.hostname.endsWith("google.com")) {
      u.protocol = "https:";
    }

    if (
      (u.protocol === "https:" && u.port === "443") ||
      (u.protocol === "http:" && u.port === "80")
    ) {
      u.port = "";
    }

    let path = u.pathname;
    if (!path) path = "/";

    // Origin-only: normalize trailing slash
    if (path === "/" && !u.search && !u.hash) {
      return `${u.origin}/`;
    }

    return `${u.origin}${path}${u.search}${u.hash}`;
  } catch {
    return null;
  }
}

export function canonicalizeForCompare(url: string): string | null {
  const c = canonicalizeUrl(url);
  if (!c) return null;
  // Strip hash for compare unless needed separately
  try {
    const u = new URL(c);
    u.hash = "";
    return u.href.replace(/\/$/, "") === u.origin + "/" ? `${u.origin}/` : u.href;
  } catch {
    return c;
  }
}

export function urlsEqual(a: string, b: string): boolean {
  const ca = canonicalizeForCompare(a);
  const cb = canonicalizeForCompare(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;

  try {
    const ua = new URL(ca);
    const ub = new URL(cb);
    ua.hash = "";
    ub.hash = "";
    const norm = (u: URL) => {
      let p = u.pathname;
      if (p !== "/" && p.endsWith("/")) p = p.slice(0, -1);
      return `${u.origin}${p}${u.search}`;
    };
    return norm(ua) === norm(ub);
  } catch {
    return false;
  }
}

export function isRootEnter(url: string, source: string): boolean {
  try {
    const u = new URL(url);
    const s = new URL(source);
    const pathIsRoot = u.pathname === "/" || u.pathname === "";
    const hostMatch = u.host === s.host;
    return hostMatch && pathIsRoot;
  } catch {
    return false;
  }
}
