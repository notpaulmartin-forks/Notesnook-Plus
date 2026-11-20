/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2023 Streetwriters (Private) Limited

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import { describe, expect, test } from "vitest";
import {
  PaneLayoutNode,
  computePaneRects,
  createPaneLayout,
  getLeadingPaneId,
  getPaneIds,
  getTrailingPaneId,
  insertPane,
  movePane,
  removePane,
  resizeSplit,
  sanitizeLayout
} from "../src/stores/editor-panes";

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("editor pane layout", () => {
  test("splitting a single pane to the right creates a row", () => {
    const layout = insertPane(createPaneLayout("a"), "a", "b", "right", "s1");
    expect(layout).toEqual({
      type: "split",
      id: "s1",
      direction: "row",
      children: [
        { type: "pane", id: "a" },
        { type: "pane", id: "b" }
      ],
      sizes: [0.5, 0.5]
    });
  });

  test("splitting along the same axis adds a sibling instead of nesting", () => {
    let layout = insertPane(createPaneLayout("a"), "a", "b", "right", "s1");
    layout = insertPane(layout, "b", "c", "right", "s2");
    expect(layout.type).toBe("split");
    if (layout.type !== "split") return;
    expect(getPaneIds(layout)).toEqual(["a", "b", "c"]);
    expect(layout.sizes).toEqual([0.5, 0.25, 0.25]);
  });

  test("splitting across axes nests a split", () => {
    let layout = insertPane(createPaneLayout("a"), "a", "b", "right", "s1");
    layout = insertPane(layout, "b", "c", "bottom", "s2");
    expect(getPaneIds(layout)).toEqual(["a", "b", "c"]);
    expect(getLeadingPaneId(layout)).toBe("a");
    expect(getTrailingPaneId(layout)).toBe("b");
  });

  test("leading edges insert before the target", () => {
    const layout = insertPane(createPaneLayout("a"), "a", "b", "left", "s1");
    expect(getPaneIds(layout)).toEqual(["b", "a"]);
    expect(getLeadingPaneId(layout)).toBe("b");
  });

  test("removing panes collapses splits and keeps sizes normalized", () => {
    let layout = insertPane(createPaneLayout("a"), "a", "b", "right", "s1");
    layout = insertPane(layout, "b", "c", "bottom", "s2");
    layout = removePane(layout, "c");
    expect(layout.type).toBe("split");
    if (layout.type === "split") expect(sum(layout.sizes)).toBeCloseTo(1);
    layout = removePane(layout, "b");
    expect(layout).toEqual({ type: "pane", id: "a" });
  });

  test("removing the last pane yields a default pane", () => {
    expect(removePane(createPaneLayout("a"), "a")).toEqual(createPaneLayout());
  });

  test("removing a middle pane flattens same-axis splits", () => {
    let layout = insertPane(createPaneLayout("a"), "a", "b", "right", "s1");
    layout = insertPane(layout, "b", "c", "bottom", "s2");
    layout = insertPane(layout, "c", "d", "right", "s3");
    // removing b leaves a row split [a, row[c, d]] which must flatten
    layout = removePane(layout, "b");
    expect(layout.type).toBe("split");
    if (layout.type !== "split") return;
    expect(layout.direction).toBe("row");
    expect(layout.children.every((c) => c.type === "pane")).toBe(true);
    expect(getPaneIds(layout)).toEqual(["a", "c", "d"]);
    expect(sum(layout.sizes)).toBeCloseTo(1);
  });

  test("moving a pane relocates it", () => {
    let layout = insertPane(createPaneLayout("a"), "a", "b", "right", "s1");
    layout = insertPane(layout, "b", "c", "right", "s2");
    layout = movePane(layout, "c", "a", "left", "s3");
    expect(getPaneIds(layout)).toEqual(["c", "a", "b"]);
  });

  test("moving a pane onto itself is a no-op", () => {
    const layout = insertPane(createPaneLayout("a"), "a", "b", "right", "s1");
    expect(movePane(layout, "a", "a", "left", "s2")).toBe(layout);
  });

  test("resizing normalizes sizes", () => {
    const layout = insertPane(createPaneLayout("a"), "a", "b", "right", "s1");
    const resized = resizeSplit(layout, "s1", [3, 1]);
    expect(resized.type === "split" && resized.sizes).toEqual([0.75, 0.25]);
  });

  test("rects tile the editor area", () => {
    let layout = insertPane(createPaneLayout("a"), "a", "b", "right", "s1");
    layout = insertPane(layout, "b", "c", "bottom", "s2");
    const { panes, sashes } = computePaneRects(layout);
    const area = sum(panes.map(({ rect }) => rect.w * rect.h));
    expect(area).toBeCloseTo(1);
    expect(sashes).toHaveLength(2);
    const c = panes.find((p) => p.id === "c");
    expect(c?.rect).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
  });

  test("sanitize drops unknown panes, duplicates and junk", () => {
    const broken = {
      type: "split",
      id: "s1",
      direction: "row",
      children: [
        { type: "pane", id: "a" },
        { type: "pane", id: "a" },
        { type: "pane", id: "gone" },
        { nonsense: true }
      ],
      sizes: [1, 1, 1, 1]
    } as unknown as PaneLayoutNode;
    expect(sanitizeLayout(broken, (id) => id !== "gone")).toEqual({
      type: "pane",
      id: "a"
    });
    expect(sanitizeLayout(undefined, () => true)).toBeUndefined();
  });
});
