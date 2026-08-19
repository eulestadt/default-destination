import type { Intent, RuleV1, ShouldRedirectInput } from "../types";
import { LOOP_GUARD_MS } from "../types";
import { urlsEqual } from "./canonicalize";
import { computeDestination } from "./rewrite";

export function wouldCauseRedirectLoop(allRules: RuleV1[], destination: string): boolean {
  for (const rule of allRules) {
    if (!rule.enabled) continue;
    const next = computeDestination(rule, destination, "enter");
    if (next && !urlsEqual(next, destination)) return true;
  }
  return false;
}

export function shouldRedirect(input: ShouldRedirectInput): {
  redirect: boolean;
  destination?: string;
  reason?: string;
} {
  const now = input.now ?? Date.now();

  if (input.paused) return { redirect: false, reason: "paused" };
  if (!input.rule.enabled) return { redirect: false, reason: "rule_disabled" };
  if (input.bypassRuleIds.includes(input.rule.id)) {
    return { redirect: false, reason: "bypassed" };
  }

  const intent = input.intent;

  if (
    intent === "back_forward" ||
    intent === "same_origin_nav" ||
    intent === "chooser" ||
    intent === "explicit_source" ||
    intent === "our_redirect"
  ) {
    return { redirect: false, reason: `intent_${intent}` };
  }

  if (intent === "reload") {
    return { redirect: false, reason: "reload_stay" };
  }

  if (intent !== "enter" && intent !== "unknown") {
    return { redirect: false, reason: `intent_${intent}` };
  }

  const destination = computeDestination(input.rule, input.url, "enter");
  if (!destination) {
    return { redirect: false, reason: "no_destination_change" };
  }

  if (urlsEqual(destination, input.url)) {
    return { redirect: false, reason: "already_at_destination" };
  }

  if (wouldCauseRedirectLoop(input.allRules, destination)) {
    return { redirect: false, reason: "dest_matches_rule_loop" };
  }

  if (input.lastRedirect) {
    const lr = input.lastRedirect;
    if (
      lr.ruleId === input.rule.id &&
      lr.from === input.url &&
      lr.to === destination &&
      now - lr.at < LOOP_GUARD_MS
    ) {
      return { redirect: false, reason: "loop_guard" };
    }
  }

  return { redirect: true, destination };
}

export function shouldRedirectOnReload(
  paused: boolean,
  rule: RuleV1,
  url: string,
  bypassRuleIds: string[],
  allRules: RuleV1[],
): { redirect: boolean; destination?: string } {
  if (paused || bypassRuleIds.includes(rule.id)) {
    return { redirect: false };
  }

  const dest = computeDestination(rule, url, "enter");
  if (!dest || urlsEqual(dest, url)) {
    return { redirect: false };
  }

  if (destinationWouldMatchAnyRule(allRules, dest)) {
    return { redirect: false };
  }

  if (wouldCauseRedirectLoop(allRules, dest)) {
    return { redirect: false };
  }

  return { redirect: true, destination: dest };
}

export function intentForEarlyNavigate(
  history: string[],
  url: string,
  lastRedirect?: { to: string; at: number },
  now = Date.now(),
): Intent | "tentative_back" | "our_redirect" {
  if (lastRedirect && lastRedirect.to === url && now - lastRedirect.at < 2000) {
    return "our_redirect";
  }
  if (history.length >= 2 && history[history.length - 2] === url) {
    return "tentative_back";
  }
  if (history.length === 0) {
    return "enter";
  }
  return "unknown";
}
