import { describe, expect, it } from "vitest";
import { canonicalizeUrl, urlsEqual } from "../src/lib/canonicalize";

describe("canonicalizeUrl", () => {
  it("normalizes host case", () => {
    expect(canonicalizeUrl("HTTPS://CALENDAR.GOOGLE.COM/")).toBe(
      "https://calendar.google.com/",
    );
  });

  it("upgrades google http to https", () => {
    expect(canonicalizeUrl("http://calendar.google.com/")).toBe(
      "https://calendar.google.com/",
    );
  });

  it("urlsEqual ignores trivial differences", () => {
    expect(
      urlsEqual(
        "https://calendar.google.com/calendar/u/1/",
        "https://calendar.google.com/calendar/u/1",
      ),
    ).toBe(true);
  });
});
