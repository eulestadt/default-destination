import { describe, expect, it } from "vitest";
import type { RuleV1 } from "../src/types";
import { findMatchingRule, ruleMatchesUrl, destinationWouldMatchAnyRule } from "../src/lib/match";
import { shouldRedirect } from "../src/lib/engine";

const baseRule: RuleV1 = {
  id: "r1",
  name: "Test",
  enabled: true,
  createdAt: "",
  updatedAt: "",
  source: "https://calendar.google.com/",
  destination: "https://calendar.google.com/calendar/u/1",
  matchMode: "host",
  destMode: "rewrite",
  preserveQuery: true,
  preserveHash: true,
  recipeId: "google-calendar-account",
  googleAccountIndex: 1,
  excludePatterns: [],
  bypass: {
    onBackForward: true,
    onSameOriginLink: true,
    onExplicitSourceTyped: true,
    onChooser: true,
    duration: "tab",
  },
};

describe("match", () => {
  it("host mode matches calendar paths", () => {
    expect(ruleMatchesUrl(baseRule, "https://calendar.google.com/calendar/r")).toBe(true);
    expect(ruleMatchesUrl(baseRule, "https://mail.google.com/")).toBe(false);
  });

  it("finds first matching rule in order", () => {
    const second = {
      ...baseRule,
      id: "r2",
      source: "https://example.com/",
      matchMode: "prefix" as const,
      recipeId: undefined,
    };
    const found = findMatchingRule([second, baseRule], "https://example.com/page");
    expect(found?.id).toBe("r2");
  });
});

describe("shouldRedirect", () => {
  it("does not redirect on back_forward", () => {
    const result = shouldRedirect({
      paused: false,
      rule: baseRule,
      url: "https://calendar.google.com/",
      intent: "back_forward",
      bypassRuleIds: [],
      allRules: [baseRule],
    });
    expect(result.redirect).toBe(false);
  });

  it("redirects on enter", () => {
    const result = shouldRedirect({
      paused: false,
      rule: baseRule,
      url: "https://calendar.google.com/",
      intent: "enter",
      bypassRuleIds: [],
      allRules: [baseRule],
    });
    expect(result.redirect).toBe(true);
    expect(result.destination).toContain("/calendar/u/1");
  });

  it("respects bypass", () => {
    const result = shouldRedirect({
      paused: false,
      rule: baseRule,
      url: "https://calendar.google.com/",
      intent: "enter",
      bypassRuleIds: ["r1"],
      allRules: [baseRule],
    });
    expect(result.redirect).toBe(false);
  });

  it("aborts when destination would chain redirect", () => {
    const chainRule: RuleV1 = {
      ...baseRule,
      id: "chain",
      source: "https://calendar.google.com/",
      destination: "https://calendar.google.com/calendar/r",
      recipeId: undefined,
      destMode: "fixed",
      matchMode: "prefix",
    };
    const result = shouldRedirect({
      paused: false,
      rule: chainRule,
      url: "https://calendar.google.com/",
      intent: "enter",
      bypassRuleIds: [],
      allRules: [chainRule, baseRule],
    });
    expect(result.redirect).toBe(false);
  });
});

describe("destinationWouldMatchAnyRule", () => {
  it("detects dest on same host rule", () => {
    expect(
      destinationWouldMatchAnyRule([baseRule], "https://calendar.google.com/calendar/u/0/r"),
    ).toBe(true);
  });
});
