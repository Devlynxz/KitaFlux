import { describe, expect, it } from "vitest";

import { pageBounds, pageWindow, parsePage } from "../pagination";

describe("parsePage", () => {
  it("reads a positive whole number", () => {
    expect(parsePage("1")).toBe(1);
    expect(parsePage("7")).toBe(7);
    expect(parsePage(["3", "9"])).toBe(3);
  });

  it("falls back to page 1 for anything else", () => {
    for (const bad of [undefined, "", "0", "-2", "1.5", "abc", "1e3", " 2", "9999999999"]) {
      expect(parsePage(bad)).toBe(1);
    }
  });
});

describe("pageBounds", () => {
  it("computes the offset for a page", () => {
    expect(pageBounds(112, 3, 25)).toEqual({ page: 3, pageCount: 5, skip: 50, take: 25 });
  });

  it("clamps a page past the end to the last page", () => {
    expect(pageBounds(51, 40, 25)).toEqual({ page: 3, pageCount: 3, skip: 50, take: 25 });
  });

  it("treats an empty list as one empty page", () => {
    expect(pageBounds(0, 5, 25)).toEqual({ page: 1, pageCount: 1, skip: 0, take: 25 });
  });

  it("does not add a page for an exact multiple", () => {
    expect(pageBounds(50, 3, 25).pageCount).toBe(2);
  });
});

describe("pageWindow", () => {
  it("shows every page when there are few", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it("collapses long runs into gaps around the current page", () => {
    expect(pageWindow(5, 12)).toEqual([1, null, 4, 5, 6, null, 12]);
    expect(pageWindow(1, 12)).toEqual([1, 2, null, 12]);
    expect(pageWindow(12, 12)).toEqual([1, null, 11, 12]);
  });

  it("fills a one-page gap with the page instead of an ellipsis", () => {
    expect(pageWindow(4, 12)).toEqual([1, 2, 3, 4, 5, null, 12]);
  });
});
