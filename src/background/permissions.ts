import { getRuleHosts } from "../lib/match";
import type { RuleV1 } from "../types";
import { hostPatternFromUrl } from "../lib/urlUtils";

export async function hasHostPermission(url: string): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: [hostPatternFromUrl(url)] });
  } catch {
    return false;
  }
}

export async function requestHostPermissionForRule(rule: RuleV1): Promise<boolean> {
  const patterns = [...new Set(getRuleHosts(rule))];
  try {
    return await chrome.permissions.request({ origins: patterns });
  } catch {
    return false;
  }
}

export async function requestHostPermission(origin: string): Promise<boolean> {
  try {
    const pattern = hostPatternFromUrl(origin.startsWith("http") ? origin : `https://${origin}`);
    return await chrome.permissions.request({ origins: [pattern] });
  } catch {
    return false;
  }
}

export function originsFromRules(rules: RuleV1[]): string[] {
  const set = new Set<string>();
  for (const rule of rules) {
    for (const p of getRuleHosts(rule)) set.add(p);
  }
  return [...set];
}
