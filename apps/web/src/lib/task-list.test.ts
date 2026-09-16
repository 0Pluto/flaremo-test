import { describe, expect, it } from "vitest";
import { countTaskItems, toggleTaskItem } from "./task-list";

describe("toggleTaskItem", () => {
  const doc = "- [ ] a\n- [x] b\ntext\n- [ ] c";

  it("checks the nth unchecked item", () => {
    expect(toggleTaskItem(doc, 0)).toBe("- [x] a\n- [x] b\ntext\n- [ ] c");
  });

  it("unchecks the nth checked item", () => {
    expect(toggleTaskItem(doc, 1)).toBe("- [ ] a\n- [ ] b\ntext\n- [ ] c");
  });

  it("ignores items outside the list", () => {
    expect(toggleTaskItem(doc, 5)).toBe(doc);
    expect(toggleTaskItem(doc, -1)).toBe(doc);
  });

  it("keeps the list marker and indentation", () => {
    expect(toggleTaskItem("  * [ ] indented", 0)).toBe("  * [x] indented");
    expect(toggleTaskItem("1. [ ] ordered", 0)).toBe("1. [x] ordered");
  });
});

describe("countTaskItems", () => {
  it("counts task items in document order", () => {
    expect(countTaskItems("- [ ] a\n- [x] b\ntext\n- [ ] c")).toBe(3);
    expect(countTaskItems("no tasks here")).toBe(0);
    expect(countTaskItems("- [] no checkbox mark")).toBe(0);
    expect(countTaskItems("- [ ] extra pair brackets")).toBe(1);
  });
});
