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
 * Fork: side-by-side editor panes.
 *
 * Every pane has its own tab strip and shows one of its tabs. Panes are laid
 * out from a split tree (see stores/editor-panes.ts) but rendered as absolutely
 * positioned siblings, so splitting, merging or moving panes keeps editors
 * mounted.
 *
 * Tabs, panes (via the grip in their tab strip) and notes from the list can be
 * dragged onto a pane: the edges split the pane, the middle moves the item
 * into it, and a tab strip reorders.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Flex } from "@theme-ui/components";
import { Global } from "@emotion/react";
import { create } from "zustand";
import { shallow } from "zustand/shallow";
import { Freeze } from "react-freeze";
import { EditorSession, useEditorStore } from "../../stores/editor-store";
import {
  PaneEdge,
  PaneLayoutNode,
  PaneSash,
  computePaneRects,
  isRectAtLeft,
  isRectAtRight,
  isRectAtTop,
  resizeSplit
} from "../../stores/editor-panes";
import { getDragData } from "../../utils/data-transfer";
import { PaneHeader } from "./action-bar";

/* ------------------------------------------------------------------------ */
/* Drag state                                                               */
/* ------------------------------------------------------------------------ */

export type PaneDragPayload =
  | { kind: "tab"; tabId: string; paneId: string }
  | { kind: "pane"; paneId: string }
  | { kind: "note"; noteIds: string[] };

type PaneDragStore = {
  drag?: PaneDragPayload;
};
export const usePaneDragStore = create<PaneDragStore>(() => ({
  drag: undefined
}));

export const PANE_DRAG_MIME = "application/vnd.notesnook.pane-drag";

export function startPaneDrag(e: React.DragEvent, payload: PaneDragPayload) {
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData(PANE_DRAG_MIME, JSON.stringify(payload));
  // Changing the DOM during dragstart can cancel the drag in Chromium, so the
  // drop zones are shown on the next tick.
  setTimeout(() => usePaneDragStore.setState({ drag: payload }));
}

export function endPaneDrag() {
  setTimeout(() => usePaneDragStore.setState({ drag: undefined }));
}

function usePaneDragEffects() {
  useEffect(() => {
    function onDragStart(e: DragEvent) {
      const dataTransfer = e.dataTransfer;
      if (!dataTransfer || dataTransfer.types.includes(PANE_DRAG_MIME)) return;
      const noteIds = getDragData(dataTransfer, "note");
      if (noteIds.length === 0) return;
      setTimeout(() =>
        usePaneDragStore.setState({ drag: { kind: "note", noteIds } })
      );
    }
    function onMouseMove(e: MouseEvent) {
      // dragend never reaches the document when the dragged element was
      // unmounted by the drop (e.g. a tab that moved to another pane).
      if (e.buttons === 0 && usePaneDragStore.getState().drag) endPaneDrag();
    }
    document.addEventListener("dragstart", onDragStart);
    document.addEventListener("dragend", endPaneDrag, true);
    document.addEventListener("drop", endPaneDrag, true);
    document.addEventListener("mousemove", onMouseMove);
    return () => {
      document.removeEventListener("dragstart", onDragStart);
      document.removeEventListener("dragend", endPaneDrag, true);
      document.removeEventListener("drop", endPaneDrag, true);
      document.removeEventListener("mousemove", onMouseMove);
    };
  }, []);
}

/* ------------------------------------------------------------------------ */
/* Grid                                                                     */
/* ------------------------------------------------------------------------ */

const MIN_PANE_WIDTH = 220;
const MIN_PANE_HEIGHT = 140;
const SASH_SIZE = 7;

type PaneGridProps = {
  renderSession: (session: EditorSession) => React.ReactNode;
};

export function PaneGrid(props: PaneGridProps) {
  const storeLayout = useEditorStore((store) => store.paneLayout);
  const [liveLayout, setLiveLayout] = useState<PaneLayoutNode>();
  const layout = liveLayout || storeLayout;
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = usePaneDragStore((store) => !!store.drag);
  const { panes, sashes } = computePaneRects(layout);

  usePaneDragEffects();

  return (
    <div
      ref={containerRef}
      className="editor-pane-grid"
      style={{
        position: "relative",
        flex: 1,
        width: "100%",
        height: "100%",
        overflow: "hidden"
      }}
    >
      <Global
        styles={`
          .editor-pane-sash:hover .editor-pane-sash-line {
            opacity: 0.7 !important;
            transition-delay: 300ms !important;
          }
        `}
      />
      {isDragging ? (
        <Global
          styles={`
            /* window drag regions swallow drag & drop events in Electron */
            .tabsScroll, .editor-action-bar, .editor-side-panel-header {
              -webkit-app-region: no-drag !important;
            }
          `}
        />
      ) : null}
      {panes.map(({ id, rect }) => (
        <EditorPaneView
          key={id}
          paneId={id}
          paneCount={panes.length}
          isTop={isRectAtTop(rect)}
          isLeading={isRectAtTop(rect) && isRectAtLeft(rect)}
          isTrailing={isRectAtTop(rect) && isRectAtRight(rect)}
          hasLeftBorder={!isRectAtLeft(rect)}
          hasTopBorder={!isRectAtTop(rect)}
          style={{
            position: "absolute",
            left: `${rect.x * 100}%`,
            top: `${rect.y * 100}%`,
            width: `${rect.w * 100}%`,
            height: `${rect.h * 100}%`
          }}
          renderSession={props.renderSession}
        />
      ))}
      {sashes.map((sash) => (
        <Sash
          key={`${sash.splitId}-${sash.index}`}
          sash={sash}
          containerRef={containerRef}
          onResize={(sizes) =>
            setLiveLayout(resizeSplit(storeLayout, sash.splitId, sizes))
          }
          onResizeEnd={(sizes) => {
            setLiveLayout(undefined);
            if (sizes)
              useEditorStore.getState().resizePaneSplit(sash.splitId, sizes);
          }}
          onReset={() =>
            useEditorStore.getState().equalizePaneSplit(sash.splitId)
          }
        />
      ))}
    </div>
  );
}

type SashProps = {
  sash: PaneSash;
  containerRef: React.RefObject<HTMLDivElement>;
  onResize: (sizes: number[]) => void;
  onResizeEnd: (sizes?: number[]) => void;
  onReset: () => void;
};
function Sash(props: SashProps) {
  const { sash, containerRef, onResize, onResizeEnd, onReset } = props;
  const [isActive, setIsActive] = useState(false);
  const isRow = sash.direction === "row";
  const { parent, position } = sash;

  const style: React.CSSProperties = isRow
    ? {
        left: `calc(${(parent.x + position * parent.w) * 100}% - ${
          SASH_SIZE / 2
        }px)`,
        top: `${parent.y * 100}%`,
        width: SASH_SIZE,
        height: `${parent.h * 100}%`,
        cursor: "col-resize"
      }
    : {
        top: `calc(${(parent.y + position * parent.h) * 100}% - ${
          SASH_SIZE / 2
        }px)`,
        left: `${parent.x * 100}%`,
        height: SASH_SIZE,
        width: `${parent.w * 100}%`,
        cursor: "row-resize"
      };

  return (
    <div
      className="editor-pane-sash"
      style={{ position: "absolute", zIndex: 5, ...style }}
      onDoubleClick={onReset}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const container = containerRef.current;
        if (!container) return;
        e.preventDefault();
        const target = e.currentTarget;
        target.setPointerCapture(e.pointerId);
        setIsActive(true);

        const bounds = container.getBoundingClientRect();
        const parentPx = isRow
          ? parent.w * bounds.width
          : parent.h * bounds.height;
        const minFraction =
          (isRow ? MIN_PANE_WIDTH : MIN_PANE_HEIGHT) / Math.max(parentPx, 1);
        const start = isRow ? e.clientX : e.clientY;
        const before = sash.sizes[sash.index - 1];
        const after = sash.sizes[sash.index];
        let latest: number[] | undefined;

        function onMove(event: PointerEvent) {
          const delta =
            ((isRow ? event.clientX : event.clientY) - start) /
            Math.max(parentPx, 1);
          const total = before + after;
          const nextBefore = Math.min(
            Math.max(before + delta, Math.min(minFraction, total / 2)),
            total - Math.min(minFraction, total / 2)
          );
          const sizes = sash.sizes.slice();
          sizes[sash.index - 1] = nextBefore;
          sizes[sash.index] = total - nextBefore;
          latest = sizes;
          onResize(sizes);
        }
        function onUp(event: PointerEvent) {
          target.releasePointerCapture(event.pointerId);
          target.removeEventListener("pointermove", onMove);
          target.removeEventListener("pointerup", onUp);
          target.removeEventListener("pointercancel", onUp);
          document.body.style.removeProperty("cursor");
          setIsActive(false);
          onResizeEnd(latest);
        }
        document.body.style.cursor = isRow ? "col-resize" : "row-resize";
        target.addEventListener("pointermove", onMove);
        target.addEventListener("pointerup", onUp);
        target.addEventListener("pointercancel", onUp);
      }}
    >
      <div
        className="editor-pane-sash-line"
        style={{
          position: "absolute",
          ...(isRow
            ? { left: SASH_SIZE / 2 - 1, top: 0, bottom: 0, width: 2 }
            : { top: SASH_SIZE / 2 - 1, left: 0, right: 0, height: 2 }),
          background: "var(--accent)",
          opacity: isActive ? 1 : 0,
          transition: "opacity 150ms ease"
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Pane                                                                     */
/* ------------------------------------------------------------------------ */

type EditorPaneViewProps = {
  paneId: string;
  paneCount: number;
  isTop: boolean;
  isLeading: boolean;
  isTrailing: boolean;
  hasLeftBorder: boolean;
  hasTopBorder: boolean;
  style: React.CSSProperties;
  renderSession: (session: EditorSession) => React.ReactNode;
};

function EditorPaneView(props: EditorPaneViewProps) {
  const {
    paneId,
    paneCount,
    isTop,
    isLeading,
    isTrailing,
    hasLeftBorder,
    hasTopBorder,
    style,
    renderSession
  } = props;
  const tabs = useEditorStore(
    (store) => store.tabs.filter((t) => store.getPaneIdOfTab(t) === paneId),
    shallow
  );
  const sessions = useEditorStore(
    (store) => tabs.map((t) => store.getSession(t.sessionId)),
    shallow
  );
  const activeTabId = useEditorStore((store) =>
    store.getPaneActiveTabId(paneId)
  );
  const isFocused = useEditorStore((store) => store.activePaneId === paneId);
  const drag = usePaneDragStore((store) => store.drag);

  const activeIndex = tabs.findIndex((t) => t.id === activeTabId);
  const activeSession = activeIndex === -1 ? undefined : sessions[activeIndex];

  // Panes other than the focused one have to load their visible note
  // themselves (e.g. after a restart).
  useEffect(() => {
    if (isFocused || !activeTabId || !activeSession?.needsHydration) return;
    useEditorStore.getState().hydrateTabInBackground(activeTabId);
  }, [isFocused, activeTabId, activeSession]);

  return (
    <Flex
      className={`editor-pane-view${isFocused ? " editor-pane-focused" : ""}`}
      data-pane-id={paneId}
      style={style}
      sx={{
        flexDirection: "column",
        overflow: "hidden",
        bg: "background",
        borderLeft: hasLeftBorder ? "1px solid var(--border)" : "none",
        borderTop: hasTopBorder ? "1px solid var(--border)" : "none"
      }}
      onPointerDownCapture={() => {
        if (useEditorStore.getState().activePaneId !== paneId)
          useEditorStore.getState().focusPane(paneId);
      }}
    >
      <PaneHeader
        paneId={paneId}
        paneCount={paneCount}
        isTop={isTop}
        isLeading={isLeading}
        isTrailing={isTrailing}
        isFocused={isFocused}
      />
      <Flex
        className="editor-pane-body"
        sx={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          flexDirection: "column"
        }}
      >
        {tabs.map((tab, index) => {
          const session = sessions[index];
          if (!session) return null;
          return (
            <Freeze key={session.id} freeze={tab.id !== activeTabId}>
              {renderSession(session)}
            </Freeze>
          );
        })}
        {drag ? (
          <PaneDropOverlay paneId={paneId} drag={drag} tabCount={tabs.length} />
        ) : null}
      </Flex>
    </Flex>
  );
}

/* ------------------------------------------------------------------------ */
/* Drop zones                                                               */
/* ------------------------------------------------------------------------ */

type DropZone = PaneEdge | "center";
const EDGE_THRESHOLD = 0.28;

function getZone(e: React.DragEvent, element: HTMLElement): DropZone {
  const rect = element.getBoundingClientRect();
  const fx = (e.clientX - rect.left) / Math.max(rect.width, 1);
  const fy = (e.clientY - rect.top) / Math.max(rect.height, 1);
  const distances: [DropZone, number][] = [
    ["left", fx],
    ["right", 1 - fx],
    ["top", fy],
    ["bottom", 1 - fy]
  ];
  const [edge, distance] = distances.reduce((a, b) => (b[1] < a[1] ? b : a));
  return distance < EDGE_THRESHOLD ? edge : "center";
}

function isZoneAllowed(
  zone: DropZone,
  drag: PaneDragPayload,
  paneId: string,
  tabCount: number
) {
  if (drag.kind === "pane") return drag.paneId !== paneId;
  if (drag.kind === "tab" && drag.paneId === paneId) {
    // splitting a pane's only tab off from itself, or dropping a tab where it
    // already is, changes nothing.
    return zone !== "center" && tabCount > 1;
  }
  return true;
}

function PaneDropOverlay(props: {
  paneId: string;
  drag: PaneDragPayload;
  tabCount: number;
}) {
  const { paneId, drag, tabCount } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [zone, setZone] = useState<DropZone>();

  useLayoutEffect(() => setZone(undefined), [drag]);

  return (
    <div
      ref={ref}
      className="editor-pane-drop-overlay"
      style={{ position: "absolute", inset: 0, zIndex: 4 }}
      onDragOver={(e) => {
        if (!ref.current) return;
        const next = getZone(e, ref.current);
        if (!isZoneAllowed(next, drag, paneId, tabCount)) {
          setZone(undefined);
          return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = drag.kind === "note" ? "copy" : "move";
        if (next !== zone) setZone(next);
      }}
      onDragLeave={(e) => {
        if (
          e.relatedTarget instanceof Node &&
          ref.current?.contains(e.relatedTarget)
        )
          return;
        setZone(undefined);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const target = zone;
        setZone(undefined);
        endPaneDrag();
        if (!target || !isZoneAllowed(target, drag, paneId, tabCount)) return;

        const edge = target === "center" ? undefined : target;
        const store = useEditorStore.getState();
        if (drag.kind === "tab") {
          store.moveTab(drag.tabId, { paneId, edge });
        } else if (drag.kind === "pane") {
          store.movePaneTo(drag.paneId, { paneId, edge });
        } else if (drag.kind === "note") {
          const noteId = getDragData(e.dataTransfer, "note")[0];
          if (noteId) store.openNoteInPane(noteId, paneId, edge);
        }
      }}
    >
      <div
        style={{
          position: "absolute",
          pointerEvents: "none",
          borderRadius: 8,
          border:
            "2px solid color-mix(in srgb, var(--accent) 55%, transparent)",
          background: "color-mix(in srgb, var(--accent) 12%, transparent)",
          opacity: zone ? 1 : 0,
          transition:
            "left 140ms ease, top 140ms ease, width 140ms ease, height 140ms ease, opacity 120ms ease",
          ...zoneRect(zone)
        }}
      />
    </div>
  );
}

function zoneRect(zone?: DropZone): React.CSSProperties {
  const inset = 6;
  const full = `calc(100% - ${inset * 2}px)`;
  const half = `calc(50% - ${inset * 1.5}px)`;
  switch (zone) {
    case "left":
      return { left: inset, top: inset, width: half, height: full };
    case "right":
      return {
        left: `calc(50% + ${inset / 2}px)`,
        top: inset,
        width: half,
        height: full
      };
    case "top":
      return { left: inset, top: inset, width: full, height: half };
    case "bottom":
      return {
        left: inset,
        top: `calc(50% + ${inset / 2}px)`,
        width: full,
        height: half
      };
    default:
      return { left: inset, top: inset, width: full, height: full };
  }
}
