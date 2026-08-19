import type { ParsedUrl } from "./canonicalize";

const BLOCKED_SCHEMES = new Set(["chrome:", "edge:", "devtools:", "about:"]);

export function isNavigableHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (BLOCKED_SCHEMES.has(u.protocol)) return false;
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function getOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function sameOrigin(a: string, b: string): boolean {
  const oa = getOrigin(a);
  const ob = getOrigin(b);
  return oa !== null && oa === ob;
}

export function originMatchesChooser(url: string, chooserOrigins: string[]): boolean {
  const origin = getOrigin(url);
  if (!origin) return false;
  return chooserOrigins.some((c) => {
    try {
      return new URL(c).origin === origin;
    } catch {
      return false;
    }
  });
}

export function hostPatternFromUrl(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.host}/*`;
}

export function parseGoogleAccountIndexFromPath(path: string): number | null {
  const m = path.match(/(?:^|\/)u\/(\d+)(?:\/|$)/);
  return m ? parseInt(m[1], 10) : null;
}

export function hasGoogleAccountSegment(path: string, index: number): boolean {
  const re = new RegExp(`(?:^|/)u/${index}(?:/|$)`);
  return re.test(path);
}

export function splitUrlParts(url: string): ParsedUrl {
  const u = new URL(url);
  return {
    href: url,
    origin: u.origin,
    protocol: u.protocol,
    host: u.host,
    pathname: u.pathname,
    search: u.search,
    hash: u.hash,
  };
}
