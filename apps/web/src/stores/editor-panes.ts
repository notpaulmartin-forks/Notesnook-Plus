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

/**
 * Pure helpers for the editor pane layout tree.
 *
 * The editor area is a tree: leaves are panes (each pane holds an ordered
 * list of tabs), inner nodes are splits that lay their children out in a row
 * (side by side) or a column (stacked). Sizes are fractions that sum to 1.
 *
 * Every helper returns a new tree and never mutates its input.
 */

export type PaneSplitDirection = "row" | "column";
export type PaneEdge = "left" | "right" | "top" | "bottom";

export type PaneLeaf = { type: "pane"; id: string };
export type PaneSplit = {
  type: "split";
  id: string;
  direction: PaneSplitDirection;
  children: PaneLayoutNode[];
  sizes: number[];
};
export type PaneLayoutNode = PaneLeaf | PaneSplit;

export const DEFAULT_PANE_ID = "main";
export const MIN_PANE_FRACTION = 0.1;

export function createPaneLayout(paneId = DEFAULT_PANE_ID): PaneLayoutNode {
  return { type: "pane", id: paneId };
}

/** Pane ids in visual order (left to right, top to bottom). */
export function getPaneIds(node: PaneLayoutNode): string[] {
  if (node.type === "pane") return [node.id];
  return node.children.flatMap(getPaneIds);
}

export function hasPane(node: PaneLayoutNode, paneId: string) {
  return getPaneIds(node).includes(paneId);
}

/** The pane that touches the top-left corner of the editor area. */
export function getLeadingPaneId(node: PaneLayoutNode): string {
  return node.type === "pane" ? node.id : getLeadingPaneId(node.children[0]);
}

/** The pane that touches the top-right corner of the editor area. */
export function getTrailingPaneId(node: PaneLayoutNode): string {
  if (node.type === "pane") return node.id;
  return getTrailingPaneId(
    node.direction === "row"
      ? node.children[node.children.length - 1]
      : node.children[0]
  );
}

/** Whether a pane's top edge touches the top of the editor area. */
export function isTopPane(node: PaneLayoutNode, paneId: string): boolean {
  if (node.type === "pane") return node.id === paneId;
  if (node.direction === "row")
    return node.children.some((child) => isTopPane(child, paneId));
  return isTopPane(node.children[0], paneId);
}

function edgeToDirection(edge: PaneEdge): PaneSplitDirection {
  return edge === "left" || edge === "right" ? "row" : "column";
}

function isLeadingEdge(edge: PaneEdge) {
  return edge === "left" || edge === "top";
}

/**
 * Insert `newPaneId` next to `targetPaneId` on the given edge. The target's
 * share of space is split in half between it and the new pane.
 */
export function insertPane(
  root: PaneLayoutNode,
  targetPaneId: string,
  newPaneId: string,
  edge: PaneEdge,
  splitId: string
): PaneLayoutNode {
  const direction = edgeToDirection(edge);
  const leading = isLeadingEdge(edge);
  const newLeaf: PaneLeaf = { type: "pane", id: newPaneId };

  function visit(node: PaneLayoutNode): PaneLayoutNode {
    if (node.type === "pane") {
      if (node.id !== targetPaneId) return node;
      return {
        type: "split",
        id: splitId,
        direction,
        children: leading ? [newLeaf, node] : [node, newLeaf],
        sizes: [0.5, 0.5]
      };
    }

    const index = node.children.findIndex(
      (child) => child.type === "pane" && child.id === targetPaneId
    );
    if (index !== -1 && node.direction === direction) {
      // same axis: add a sibling instead of nesting another split.
      const children = node.children.slice();
      const sizes = node.sizes.slice();
      const half = sizes[index] / 2;
      sizes[index] = half;
      const insertAt = leading ? index : index + 1;
      children.splice(insertAt, 0, newLeaf);
      sizes.splice(insertAt, 0, half);
      return { ...node, children, sizes };
    }

    return { ...node, children: node.children.map(visit) };
  }

  return visit(root);
}

/**
 * Remove a pane from the tree. Its space goes to its siblings and splits that
 * end up with a single child are collapsed into that child.
 */
export function removePane(
  root: PaneLayoutNode,
  paneId: string
): PaneLayoutNode {
  function visit(node: PaneLayoutNode): PaneLayoutNode | null {
    if (node.type === "pane") return node.id === paneId ? null : node;

    const children: PaneLayoutNode[] = [];
    const sizes: number[] = [];
    node.children.forEach((child, i) => {
      const next = visit(child);
      if (!next) return;
      children.push(next);
      sizes.push(node.sizes[i]);
    });

    if (children.length === 0) return null;
    if (children.length === 1) return children[0];

    const flattened = flatten({
      ...node,
      children,
      sizes: normalizeSizes(sizes)
    });
    return flattened;
  }

  return visit(root) || createPaneLayout();
}

/** Move an existing pane next to another pane. */
export function movePane(
  root: PaneLayoutNode,
  paneId: string,
  targetPaneId: string,
  edge: PaneEdge,
  splitId: string
): PaneLayoutNode {
  if (paneId === targetPaneId) return root;
  const without = removePane(root, paneId);
  if (!hasPane(without, targetPaneId)) return root;
  return insertPane(without, targetPaneId, paneId, edge, splitId);
}

export function resizeSplit(
  root: PaneLayoutNode,
  splitId: string,
  sizes: number[]
): PaneLayoutNode {
  function visit(node: PaneLayoutNode): PaneLayoutNode {
    if (node.type === "pane") return node;
    if (node.id === splitId && sizes.length === node.children.length)
      return { ...node, sizes: normalizeSizes(sizes) };
    return { ...node, children: node.children.map(visit) };
  }
  return visit(root);
}

/** Give every pane in a split the same amount of space. */
export function equalizeSplit(
  root: PaneLayoutNode,
  splitId: string
): PaneLayoutNode {
  function visit(node: PaneLayoutNode): PaneLayoutNode {
    if (node.type === "pane") return node;
    if (node.id === splitId)
      return {
        ...node,
        sizes: node.children.map(() => 1 / node.children.length)
      };
    return { ...node, children: node.children.map(visit) };
  }
  return visit(root);
}

/**
 * Make sure the tree is well formed: only known panes, no empty or single
 * child splits, sizes that add up to 1.
 */
export function sanitizeLayout(
  root: PaneLayoutNode | undefined,
  isValidPane: (paneId: string) => boolean
): PaneLayoutNode | undefined {
  if (!root || typeof root !== "object") return undefined;

  const seen = new Set<string>();
  function visit(node: PaneLayoutNode): PaneLayoutNode | null {
    if (!node || typeof node !== "object") return null;
    if (node.type === "pane") {
      if (typeof node.id !== "string" || seen.has(node.id)) return null;
      if (!isValidPane(node.id)) return null;
      seen.add(node.id);
      return { type: "pane", id: node.id };
    }
    if (node.type !== "split" || !Array.isArray(node.children)) return null;

    const children: PaneLayoutNode[] = [];
    const sizes: number[] = [];
    node.children.forEach((child, i) => {
      const next = visit(child);
      if (!next) return;
      children.push(next);
      const size = Array.isArray(node.sizes) ? node.sizes[i] : undefined;
      sizes.push(typeof size === "number" && size > 0 ? size : 1);
    });
    if (children.length === 0) return null;
    if (children.length === 1) return children[0];
    return flatten({
      type: "split",
      id: node.id,
      direction: node.direction === "column" ? "column" : "row",
      children,
      sizes: normalizeSizes(sizes)
    });
  }

  return visit(root) || undefined;
}

/** Merge child splits that run along the same axis as their parent. */
function flatten(node: PaneSplit): PaneSplit {
  const children: PaneLayoutNode[] = [];
  const sizes: number[] = [];
  node.children.forEach((child, i) => {
    if (child.type === "split" && child.direction === node.direction) {
      child.children.forEach((grandChild, j) => {
        children.push(grandChild);
        sizes.push(node.sizes[i] * child.sizes[j]);
      });
    } else {
      children.push(child);
      sizes.push(node.sizes[i]);
    }
  });
  return { ...node, children, sizes: normalizeSizes(sizes) };
}

export function normalizeSizes(sizes: number[]) {
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (!total || !isFinite(total)) return sizes.map(() => 1 / sizes.length);
  return sizes.map((size) => size / total);
}

/**
 * Find which pane lies in a direction from another pane. Used for keyboard
 * navigation between panes. Falls back to visual order.
 */
export function getAdjacentPaneId(
  root: PaneLayoutNode,
  paneId: string,
  offset: 1 | -1
): string | undefined {
  const ids = getPaneIds(root);
  const index = ids.indexOf(paneId);
  if (index === -1 || ids.length < 2) return undefined;
  return ids[(index + offset + ids.length) % ids.length];
}

export type PaneRect = { x: number; y: number; w: number; h: number };
export type PaneSash = {
  splitId: string;
  /** index of the child after the sash */
  index: number;
  direction: PaneSplitDirection;
  /** the split's rect, as fractions of the whole editor area */
  parent: PaneRect;
  sizes: number[];
  /** sash position along the split's axis, as a fraction of the split */
  position: number;
};

const EPSILON = 0.0001;

/**
 * Flatten the tree into absolute rects (fractions of the editor area) so
 * panes can be rendered as siblings. Restructuring the tree then never
 * remounts a pane's editors.
 */
export function computePaneRects(root: PaneLayoutNode) {
  const panes: { id: string; rect: PaneRect }[] = [];
  const sashes: PaneSash[] = [];

  function visit(node: PaneLayoutNode, rect: PaneRect) {
    if (node.type === "pane") {
      panes.push({ id: node.id, rect });
      return;
    }
    let offset = 0;
    node.children.forEach((child, i) => {
      const size = node.sizes[i];
      const childRect: PaneRect =
        node.direction === "row"
          ? {
              x: rect.x + offset * rect.w,
              y: rect.y,
              w: size * rect.w,
              h: rect.h
            }
          : {
              x: rect.x,
              y: rect.y + offset * rect.h,
              w: rect.w,
              h: size * rect.h
            };
      if (i > 0)
        sashes.push({
          splitId: node.id,
          index: i,
          direction: node.direction,
          parent: rect,
          sizes: node.sizes,
          position: offset
        });
      visit(child, childRect);
      offset += size;
    });
  }

  visit(root, { x: 0, y: 0, w: 1, h: 1 });
  return { panes, sashes };
}

export function isRectAtTop(rect: PaneRect) {
  return rect.y < EPSILON;
}
export function isRectAtLeft(rect: PaneRect) {
  return rect.x < EPSILON;
}
export function isRectAtRight(rect: PaneRect) {
  return rect.x + rect.w > 1 - EPSILON;
}
