import { describe, expect, it } from "vitest";
import { currentStreak } from "./activity";

function days(counts: number[]) {
  return counts.map((count, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, "0")}`,
    count,
  }));
}

describe("currentStreak", () => {
  it("counts consecutive active days ending today", () => {
    expect(currentStreak(days([0, 1, 1, 0, 2, 3, 1]))).toBe(3);
  });

  it("gives an empty today one free pass", () => {
    expect(currentStreak(days([1, 1, 1, 0]))).toBe(3);
  });

  it("breaks on any other empty day", () => {
    expect(currentStreak(days([1, 1, 0, 1, 1, 1, 0]))).toBe(3);
  });

  it("returns zero without any recent activity", () => {
    expect(currentStreak(days([1, 0, 0, 0]))).toBe(0);
    expect(currentStreak([])).toBe(0);
  });
});
