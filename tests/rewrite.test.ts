import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RuleV1 } from "../src/types";
import { rewriteGoogleAccountUrl } from "../src/lib/googleAccount";
import { computeDestination } from "../src/lib/rewrite";

const fixtures = JSON.parse(
  readFileSync(join(__dirname, "../docs/fixtures/url-rewrite.json"), "utf8"),
);

const seedRule: RuleV1 = {
  id: "test",
  name: "Calendar",
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

function partialRule(partial: Record<string, unknown>): RuleV1 {
  return {
    ...seedRule,
    id: "partial",
    recipeId: undefined,
    ...partial,
    bypass: seedRule.bypass,
    excludePatterns: [],
  } as RuleV1;
}

describe("google calendar rewriter fixtures", () => {
  for (const row of fixtures.googleCalendar) {
    it(row.id, () => {
      const intent = row.intent as import("../src/types").Intent;
      const result = computeDestination(seedRule, row.input, intent);
      if (row.expected === null) {
        expect(result).toBeNull();
      } else {
        expect(result).toBe(row.expected);
      }
    });
  }
});

describe("generic rewrite fixtures", () => {
  for (const row of fixtures.genericPrefix) {
    it(row.id, () => {
      const rule = partialRule(row.rule);
      const intent = row.intent as import("../src/types").Intent;
      const result = computeDestination(rule, row.input, intent);
      if (row.expected === null) {
        expect(result).toBeNull();
      } else {
        expect(result).toBe(row.expected);
      }
    });
  }
});

describe("rewriteGoogleAccountUrl direct", () => {
  it("preserves hash and query", () => {
    const out = rewriteGoogleAccountUrl(
      "https://calendar.google.com/calendar/r/eventedit/abc?eid=xyz#hash",
      1,
      "enter",
      true,
      true,
    );
    expect(out).toBe(
      "https://calendar.google.com/calendar/u/1/r/eventedit/abc?eid=xyz#hash",
    );
  });
});
