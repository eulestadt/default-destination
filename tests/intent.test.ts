import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyIntent } from "../src/lib/intent";

const fixtures = JSON.parse(
  readFileSync(join(__dirname, "../docs/fixtures/intent.json"), "utf8"),
);

describe("classifyIntent fixtures", () => {
  for (const row of fixtures.cases) {
    it(row.id, () => {
      const intent = classifyIntent({
        previousUrl: row.previousUrl,
        url: row.url,
        transitionType: row.transitionType,
        transitionQualifiers: row.transitionQualifiers,
        lastRedirect: row.lastRedirect
          ? { ...row.lastRedirect, at: Date.now() - (row.withinMs ? 100 : 5000) }
          : null,
        entryChain: row.entryChain,
        chooserOrigins: row.chooserOrigins,
        recipeId: row.recipe === "google-calendar-account" ? "google-calendar-account" : undefined,
        withinMs: row.withinMs ?? 2000,
      });
      expect(intent).toBe(row.expected);
    });
  }
});

describe("classifyIntent edge cases", () => {
  it("typed root is enter not explicit", () => {
    expect(
      classifyIntent({
        previousUrl: null,
        url: "https://calendar.google.com/",
        transitionType: "typed",
        transitionQualifiers: ["from_address_bar"],
        lastRedirect: null,
        sourceUrl: "https://calendar.google.com/",
      }),
    ).toBe("enter");
  });
});
