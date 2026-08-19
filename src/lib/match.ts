import type { RuleV1 } from "../types";
import { canonicalizeUrl } from "./canonicalize";
import { splitUrlParts } from "./urlUtils";

function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const re = escaped.replace(/\*/g, ".*");
  return new RegExp(`^${re}$`);
}

function matchesExclude(url: string, patterns: string[]): boolean {
  for (const p of patterns) {
    if (p.startsWith("/") && p.endsWith("/") && p.length > 2) {
      try {
        if (new RegExp(p.slice(1, -1)).test(url)) return true;
      } catch {
        /* ignore */
      }
    } else if (url.includes(p) || url.startsWith(p)) {
      return true;
    }
  }
  return false;
}

export function ruleMatchesUrl(rule: RuleV1, url: string): boolean {
  const canonical = canonicalizeUrl(url);
  if (!canonical) return false;

  let matched = false;

  switch (rule.matchMode) {
    case "host": {
      try {
        const u = new URL(canonical);
        const s = new URL(rule.source);
        matched = u.host === s.host;
      } catch {
        matched = false;
      }
      break;
    }
    case "prefix":
      matched = canonical.startsWith(rule.source) || url.startsWith(rule.source);
      break;
    case "exact": {
      const noHash = canonical.split("#")[0];
      const srcNoHash = rule.source.split("#")[0];
      matched = noHash === srcNoHash || canonical === rule.source;
      break;
    }
    case "wildcard":
      matched = wildcardToRegex(rule.source).test(canonical) || wildcardToRegex(rule.source).test(url);
      break;
    case "regex": {
      try {
        matched = new RegExp(rule.source).test(canonical) || new RegExp(rule.source).test(url);
      } catch {
        matched = false;
      }
      break;
    }
  }

  if (!matched) return false;
  if (matchesExclude(canonical, rule.excludePatterns)) return false;
  return true;
}

export function findMatchingRule(rules: RuleV1[], url: string): RuleV1 | null {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (ruleMatchesUrl(rule, url)) return rule;
  }
  return null;
}

export function destinationWouldMatchAnyRule(rules: RuleV1[], destUrl: string): boolean {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (ruleMatchesUrl(rule, destUrl)) return true;
  }
  return false;
}

export function getRuleHosts(rule: RuleV1): string[] {
  try {
    const s = new URL(rule.source);
    const d = new URL(rule.destination);
    return [`${s.protocol}//${s.host}/*`, `${d.protocol}//${d.host}/*`];
  } catch {
    return [];
  }
}

export function validateRuleUrls(rule: Partial<RuleV1>): string[] {
  const errors: string[] = [];
  try {
    const s = new URL(rule.source ?? "");
    const d = new URL(rule.destination ?? "");
    if (s.protocol !== "http:" && s.protocol !== "https:") {
      errors.push("Source must be http or https.");
    }
    if (d.protocol !== "http:" && d.protocol !== "https:") {
      errors.push("Destination must be http or https.");
    }
    if (rule.source === rule.destination) {
      errors.push("Source and destination cannot be the same.");
    }
    if (rule.matchMode === "regex" && rule.source) {
      try {
        new RegExp(rule.source);
      } catch {
        errors.push("Regex pattern is invalid.");
      }
    }
  } catch {
    errors.push("Source and destination must be valid URLs.");
  }
  return errors;
}

export function isGoogleRecipeHost(host: string): boolean {
  const googleHosts = new Set([
    "calendar.google.com",
    "mail.google.com",
    "drive.google.com",
    "chat.google.com",
    "docs.google.com",
    "meet.google.com",
  ]);
  return googleHosts.has(host);
}

export function recipeHostForRule(rule: RuleV1): string | null {
  if (rule.recipeId === "google-calendar-account") return "calendar.google.com";
  if (rule.recipeId === "google-workspace-account") {
    try {
      return new URL(rule.source).host;
    } catch {
      return null;
    }
  }
  return null;
}
