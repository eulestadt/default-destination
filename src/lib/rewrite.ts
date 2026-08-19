import type { Intent, RuleV1 } from "../types";
import { canonicalizeUrl, urlsEqual } from "./canonicalize";
import {
  isExplicitGoogleSourcePath,
  parseAccountIndexFromDestination,
  rewriteGoogleAccountUrl,
} from "./googleAccount";
import { ruleMatchesUrl } from "./match";
import { splitUrlParts } from "./urlUtils";

export function computeDestination(
  rule: RuleV1,
  url: string,
  intent: Intent,
): string | null {
  if (!ruleMatchesUrl(rule, url)) return null;

  const accountIndex =
    rule.googleAccountIndex ??
    parseAccountIndexFromDestination(rule.destination) ??
    1;

  if (rule.recipeId === "google-calendar-account" || rule.recipeId === "google-workspace-account") {
    const rewritten = rewriteGoogleAccountUrl(
      url,
      accountIndex,
      intent,
      rule.preserveQuery,
      rule.preserveHash,
    );
    if (!rewritten) return null;
    if (urlsEqual(rewritten, url)) return null;
    return rewritten;
  }

  if (rule.destMode === "fixed") {
    try {
      const dest = new URL(rule.destination);
      const src = new URL(url);
      if (rule.preserveQuery && !dest.search && src.search) {
        dest.search = src.search;
      }
      if (rule.preserveHash && src.hash) {
        dest.hash = src.hash;
      }
      const result = dest.href;
      if (urlsEqual(result, url)) return null;
      return result;
    } catch {
      return null;
    }
  }

  // rewrite mode without recipe
  const canonical = canonicalizeUrl(url);
  if (!canonical) return null;

  if (rule.matchMode === "host") {
    try {
      const dest = new URL(rule.destination);
      const src = new URL(url);
      const destPath = dest.pathname;
      let newPath: string;

      if (destPath === "/" || destPath === "") {
        newPath = src.pathname;
      } else if (src.pathname === "/" || src.pathname === "") {
        newPath = destPath.endsWith("/") ? destPath : destPath + "/";
      } else {
        const base = destPath.endsWith("/") ? destPath : destPath + "/";
        const srcPath = src.pathname.startsWith("/") ? src.pathname.slice(1) : src.pathname;
        newPath = base + srcPath;
      }

      let result = `${dest.origin}${newPath}`;
      if (rule.preserveQuery) {
        result += src.search || (dest.search && !src.search ? dest.search : "");
      }
      if (rule.preserveHash && src.hash) result += src.hash;
      if (urlsEqual(result, url)) return null;
      return result;
    } catch {
      return null;
    }
  }

  // prefix rewrite
  const baseUrl = url.startsWith(rule.source) ? url : canonical;
  if (baseUrl.startsWith(rule.source) || canonical.startsWith(rule.source)) {
    const rest = baseUrl.slice(rule.source.length);
    let destBase = rule.destination;
    if (
      rest &&
      !rest.startsWith("/") &&
      !rest.startsWith("?") &&
      !rest.startsWith("#") &&
      !destBase.endsWith("/")
    ) {
      destBase += "/";
    }
    const replaced = destBase + rest;

    let result = replaced;
    const parts = splitUrlParts(url);
    if (!rule.preserveHash) {
      try {
        const u = new URL(result);
        u.hash = "";
        result = u.href;
      } catch {
        /* keep */
      }
    }
    if (urlsEqual(result, url)) return null;
    return result;
  }

  return null;
}

export function computeDestinationForRule(
  rule: RuleV1,
  url: string,
  intent: Intent,
): string | null {
  return computeDestination(rule, url, intent);
}

export function isExplicitSourceForRule(rule: RuleV1, url: string, transitionType: string): boolean {
  const typedLike = ["typed", "generated", "auto_bookmark"].includes(transitionType);

  if (!typedLike) return false;

  if (
    rule.recipeId === "google-calendar-account" ||
    rule.recipeId === "google-workspace-account"
  ) {
    try {
      const path = new URL(url).pathname;
      return isExplicitGoogleSourcePath(path);
    } catch {
      return false;
    }
  }

  if (rule.matchMode === "prefix" || rule.matchMode === "exact") {
    const canonical = canonicalizeUrl(url);
    const sourceCanonical = canonicalizeUrl(rule.source);
    if (!canonical || !sourceCanonical) return false;
    if (canonical === sourceCanonical) {
      try {
        const u = new URL(url);
        return u.pathname !== "/" && u.pathname !== "";
      } catch {
        return false;
      }
    }
  }

  return false;
}
