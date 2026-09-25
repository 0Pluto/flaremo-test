import { describe, expect, it } from "vitest";
import { formatMemoRelativeTime, formatMemoTime } from "./memo";

describe("formatMemoTime", () => {
  it("omits the year for dates in the current year", () => {
    const thisYear = new Date().getFullYear();
    const formatted = formatMemoTime(
      `${thisYear}-09-20T20:43:00+08:00`,
      "zh-CN",
    );
    expect(formatted).toContain("9");
    expect(formatted).toContain("20");
    expect(formatted).not.toContain(String(thisYear));
  });

  it("includes the year for dates in other years (e.g. imported history)", () => {
    const thisYear = new Date().getFullYear();
    const formatted = formatMemoTime("2019-09-20T20:43:00+08:00", "zh-CN");
    if (thisYear !== 2019) {
      expect(formatted).toContain("2019");
    }
  });

  it("returns an empty string for invalid input", () => {
    expect(formatMemoTime("not-a-date", "zh-CN")).toBe("");
  });
});

describe("formatMemoRelativeTime", () => {
  it("falls back to a year-qualified absolute date beyond a week", () => {
    const formatted = formatMemoRelativeTime(
      "2019-09-20T20:43:00+08:00",
      "zh-CN",
    );
    expect(formatted).toContain("2019");
  });
});
