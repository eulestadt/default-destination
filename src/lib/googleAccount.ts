import type { Intent } from "../types";
import {
  hasGoogleAccountSegment,
  parseGoogleAccountIndexFromPath,
  splitUrlParts,
} from "./urlUtils";

const NO_REWRITE_INTENTS: Intent[] = [
  "explicit_source",
  "back_forward",
  "same_origin_nav",
  "chooser",
];

export function parseAccountIndexFromDestination(destination: string): number | null {
  try {
    return parseGoogleAccountIndexFromPath(new URL(destination).pathname);
  } catch {
    return null;
  }
}

/**
 * Rewrite Google Workspace /u/N paths per SPEC §9.3.
 * Returns null if no change needed.
 */
export function rewriteGoogleAccountPath(
  pathname: string,
  accountIndex: number,
  intent: Intent,
): string | null {
  if (NO_REWRITE_INTENTS.includes(intent)) return null;

  const existing = parseGoogleAccountIndexFromPath(pathname);

  if (existing !== null) {
    if (existing === accountIndex) return null;
    if (existing !== 0) return null; // explicit other account
  }

  let path = pathname || "/";

  // /calendar/u/0/rest → /calendar/u/N/rest
  const u0Match = path.match(/^\/calendar\/u\/0(\/.*)?$/);
  if (u0Match) {
    const rest = u0Match[1] ?? "";
    return `/calendar/u/${accountIndex}${rest}`;
  }

  // /calendar/r + rest
  const rMatch = path.match(/^\/calendar\/r(\/.*)?$/);
  if (rMatch) {
    const rest = rMatch[1] ?? "";
    return `/calendar/u/${accountIndex}/r${rest}`;
  }

  // /calendar or /calendar/
  if (path === "/calendar" || path === "/calendar/") {
    return `/calendar/u/${accountIndex}/`;
  }

  // /calendar/... without /u/N
  const calRest = path.match(/^\/calendar\/(?!u\/\d+)(.*)$/);
  if (calRest) {
    const rest = calRest[1];
    return `/calendar/u/${accountIndex}/${rest}`;
  }

  // Root /
  if (path === "/" || path === "") {
    return `/calendar/u/${accountIndex}/`;
  }

  // Gmail-style /mail/u/0/...
  const mailU0 = path.match(/^\/mail\/u\/0(\/.*)?$/);
  if (mailU0) {
    const rest = mailU0[1] ?? "";
    return `/mail/u/${accountIndex}${rest}`;
  }

  const mailNoU = path.match(/^\/mail\/(?!u\/\d+)(.*)$/);
  if (mailNoU) {
    const rest = mailNoU[1];
    return `/mail/u/${accountIndex}/${rest}`;
  }

  // Generic /u/0/rest at start
  const genericU0 = path.match(/^\/u\/0(\/.*)?$/);
  if (genericU0) {
    const rest = genericU0[1] ?? "";
    return `/u/${accountIndex}${rest}`;
  }

  return null;
}

export function rewriteGoogleAccountUrl(
  url: string,
  accountIndex: number,
  intent: Intent,
  preserveQuery: boolean,
  preserveHash: boolean,
): string | null {
  const parts = splitUrlParts(url);
  const newPath = rewriteGoogleAccountPath(parts.pathname, accountIndex, intent);
  if (!newPath) return null;

  let result = `${parts.origin}${newPath}`;
  if (parts.protocol === "http:" && parts.host.endsWith("google.com")) {
    result = result.replace(/^http:/, "https:");
  }
  if (preserveQuery && parts.search) result += parts.search;
  if (preserveHash && parts.hash) result += parts.hash;
  return result;
}

export function isExplicitGoogleSourcePath(pathname: string): boolean {
  return hasGoogleAccountSegment(pathname, 0);
}
