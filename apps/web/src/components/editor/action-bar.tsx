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

import { Button, Flex, Text } from "@theme-ui/components";
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Cross,
  Icon,
  Lock,
  NewTab,
  Note,
  NoteRemove,
  Pin,
  Plus,
  Properties,
  Publish,
  Published,
  Readonly,
  Redo,
  Search,
  TableOfContents,
  Trash,
  Undo,
  Unlock,
  DragHandle,
  SplitRight,
  SplitDown
} from "../icons";
import { ScrollContainer } from "@notesnook/ui";
import {
  SaveState,
  SessionType,
  isLockedSession,
  useEditorStore
} from "../../stores/editor-store";
import { Menu } from "../../hooks/use-menu";
import { useStore as useAppStore } from "../../stores/app-store";
import { useEditorManager } from "./manager";
import { shallow } from "zustand/shallow";
import { MenuItem } from "@notesnook/ui";
import { AppEventManager, AppEvents } from "../../common/app-events";
import { useWindowControls } from "../../hooks/use-window-controls";
import { useStore as useMonographStore } from "../../stores/monograph-store";
import { useStore as useUserStore } from "../../stores/user-store";
import { db } from "../../common/db";
import { showPublishView } from "../publish-view";
import useMobile from "../../hooks/use-mobile";
import { strings } from "@notesnook/intl";
import { getWindowControls, TITLE_BAR_HEIGHT } from "../title-bar";
import useTablet from "../../hooks/use-tablet";
import { isMac } from "../../utils/platform";
import { CREATE_BUTTON_MAP } from "../../common";
import { getDragData } from "../../utils/data-transfer";
import { saveContent } from "./index";
import { endPaneDrag, startPaneDrag, usePaneDragStore } from "./panes";

type ToolButton = {
  title: string;
  icon: Icon;
  enabled?: boolean;
  hidden?: boolean;
  hideOnMobile?: boolean;
  toggled?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
};

type PaneHeaderProps = {
  paneId: string;
  paneCount: number;
  /** the pane touches the top of the editor area (part of the title bar) */
  isTop: boolean;
  /** top-left pane: hosts the new note / back / forward buttons */
  isLeading: boolean;
  /** top-right pane: hosts the editor tools and window controls */
  isTrailing: boolean;
  isFocused: boolean;
};

export function PaneHeader(props: PaneHeaderProps) {
  const { paneId, paneCount, isTop, isLeading, isTrailing, isFocused } = props;
  const { isMaximized, isFullscreen, hasNativeWindowControls } =
    useWindowControls();
  const activeTab = useEditorStore((store) => store.getActiveTab());
  const activeSession = useEditorStore((store) =>
    activeTab ? store.getSession(activeTab.sessionId) : undefined
  );
  const editorManager = useEditorManager((store) =>
    activeSession?.id ? store.editors[activeSession?.id] : undefined
  );
  const isLoggedIn = useUserStore((store) => store.isLoggedIn);
  const arePropertiesVisible = useEditorStore(
    (store) => store.arePropertiesVisible
  );
  const isTOCVisible = useEditorStore((store) => store.isTOCVisible);
  useMonographStore((store) => store.monographs);
  const isNotePublished =
    activeSession &&
    "note" in activeSession &&
    db.monographs.isPublished(activeSession.note.id);
  const isMobile = useMobile();
  const isTablet = useTablet();

  const tools: ToolButton[] = [
    {
      title: strings.newTab(),
      icon: NewTab,
      enabled: true,
      onClick: () => useEditorStore.getState().addTab()
    },
    {
      title: strings.undo(),
      icon: Undo,
      enabled: editorManager?.canUndo,
      onClick: () => editorManager?.editor?.undo(),
      hidden: activeSession?.type === "readonly"
    },
    {
      title: strings.redo(),
      icon: Redo,
      enabled: editorManager?.canRedo,
      onClick: () => editorManager?.editor?.redo(),
      hidden: activeSession?.type === "readonly"
    },
    {
      title: isNotePublished ? strings.published() : strings.publish(),
      icon: isNotePublished ? Published : Publish,
      hidden: !isLoggedIn,
      hideOnMobile: true,
      enabled:
        activeSession &&
        (activeSession.type === "default" || activeSession.type === "readonly"),
      onClick: (e) => {
        if (
          !activeSession ||
          (activeSession.type !== "default" &&
            activeSession.type !== "readonly")
        )
          return;
        showPublishView(activeSession.note, e.target as HTMLElement);
      }
    },
    {
      title: strings.toc(),
      icon: TableOfContents,
      enabled:
        activeSession &&
        activeSession.type !== "locked" &&
        activeSession.type !== "diff" &&
        activeSession.type !== "conflicted",
      onClick: () => useEditorStore.getState().toggleTableOfContents(),
      toggled: isTOCVisible
    },
    {
      title: strings.search(),
      icon: Search,
      enabled:
        activeSession &&
        activeSession.type !== "new" &&
        activeSession.type !== "locked" &&
        activeSession.type !== "diff" &&
        activeSession.type !== "conflicted",
      onClick: () => editorManager?.editor?.startSearch()
    },
    {
      title: strings.properties(),
      icon: Properties,
      enabled:
        activeSession &&
        activeSession.type !== "new" &&
        activeSession.type !== "locked" &&
        activeSession.type !== "conflicted",
      onClick: () => useEditorStore.getState().toggleProperties(),
      toggled: arePropertiesVisible
    },
    ...getWindowControls(
      hasNativeWindowControls,
      isFullscreen,
      isMaximized,
      isTablet,
      isMobile
    )
  ];

  return (
    <Flex
      className={`editor-action-bar${isLeading ? " pane-header-leading" : ""}`}
      sx={{
        zIndex: 2,
        height: TITLE_BAR_HEIGHT,
        flexShrink: 0,
        bg: "background-secondary"
      }}
      style={
        isTop
          ? undefined
          : ({ WebkitAppRegion: "no-drag" } as React.CSSProperties)
      }
    >
      {isMobile ? (
        <Flex sx={{ flex: 1 }}>
          <Button
            variant={"secondary"}
            sx={{
              height: "100%",
              bg: "transparent",
              borderRadius: 0,
              flexShrink: 0
            }}
            onClick={() =>
              AppEventManager.publish(AppEvents.toggleEditor, false)
            }
          >
            <ArrowLeft size={18} />
          </Button>
        </Flex>
      ) : (
        <TabStrip
          paneId={paneId}
          paneCount={paneCount}
          isLeading={isLeading}
          isTop={isTop}
          isFocused={isFocused}
        />
      )}
      {isTrailing ? (
        <Flex
          sx={{
            alignItems: "center",
            justifyContent: "center",
            mr:
              hasNativeWindowControls && !isMac() && !isMobile && !isTablet
                ? `calc(100vw - env(titlebar-area-width))`
                : 1,
            pl: 1,
            borderLeft: "1px solid var(--border)",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0
          }}
        >
          {tools.map((tool) => (
            <Button
              data-test-id={tool.title}
              disabled={!tool.enabled}
              variant={tool.title === "Close" ? "error" : "secondary"}
              title={tool.title}
              key={tool.title}
              sx={{
                p: 1,
                alignItems: "center",
                bg: tool.toggled ? "background-selected" : "transparent",
                display: [
                  "hideOnMobile" in tool && tool.hideOnMobile ? "none" : "flex",
                  tool.hidden ? "none" : "flex"
                ],
                flexShrink: 0,
                "&:hover svg path": {
                  fill:
                    tool.title === "Close"
                      ? "var(--accentForeground-error) !important"
                      : "var(--icon)"
                }
              }}
              onClick={tool.onClick}
            >
              <tool.icon size={16} />
            </Button>
          ))}
        </Flex>
      ) : null}
    </Flex>
  );
}

type TabStripProps = {
  paneId: string;
  paneCount: number;
  isLeading: boolean;
  isTop: boolean;
  isFocused: boolean;
};

const TabStrip = React.memo(function TabStrip(props: TabStripProps) {
  const { paneId, paneCount, isLeading, isTop, isFocused } = props;
  useEditorStore((store) => store.getActiveSession()); // otherwise the tab title won't update on opening a note
  const tabs = useEditorStore(
    (store) => store.tabs.filter((t) => store.getPaneIdOfTab(t) === paneId),
    shallow
  );
  // re-render when a session of this pane changes (e.g. its title)
  useEditorStore(
    (store) => tabs.map((t) => store.getSession(t.sessionId)),
    shallow
  );
  const currentTab = useEditorStore((store) =>
    store.getPaneActiveTabId(paneId)
  );
  const canGoBack = useEditorStore((store) => store.canGoBack);
  const canGoForward = useEditorStore((store) => store.canGoForward);
  const isFocusMode = useAppStore((store) => store.isFocusMode);
  const drag = usePaneDragStore((store) => store.drag);
  const tabsRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [dropIndex, setDropIndex] = useState<number>();
  const isDraggingTabOrPane =
    drag?.kind === "tab" || (drag?.kind === "pane" && drag.paneId !== paneId);
  const showPaneControls = paneCount > 1;

  useEffect(() => {
    if (!drag) setDropIndex(undefined);
  }, [drag]);

  function getDropIndex(clientX: number) {
    const elements = Array.from(
      tabsRef.current?.querySelectorAll<HTMLElement>("[data-tab-id]") || []
    );
    const index = elements.findIndex((el) => {
      const rect = el.getBoundingClientRect();
      return clientX < rect.left + rect.width / 2;
    });
    return index === -1 ? elements.length : index;
  }

  function getIndicatorOffset(index: number) {
    const elements = Array.from(
      tabsRef.current?.querySelectorAll<HTMLElement>("[data-tab-id]") || []
    );
    if (elements.length === 0) return 0;
    if (index >= elements.length) {
      const last = elements[elements.length - 1];
      return last.offsetLeft + last.offsetWidth;
    }
    return elements[index].offsetLeft;
  }

  function closePaneTabs(
    filter: (tab: (typeof tabs)[number], i: number) => boolean
  ) {
    useEditorStore
      .getState()
      .closeTabs(
        ...tabs.filter((s, i) => !s.pinned && filter(s, i)).map((s) => s.id)
      );
  }

  return (
    <Flex sx={{ flex: 1, minWidth: 0 }}>
      {isLeading ? (
        <Flex
          sx={{
            px: 1,
            borderRight: "1px solid var(--border)",
            borderBottom: "1px solid var(--border)",
            alignItems: "center",
            flexShrink: 0
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="accent"
            {...CREATE_BUTTON_MAP.notes}
            data-test-id={`create-new-note`}
            sx={{
              p: 1,
              borderRadius: "100%",
              mr: "small"
            }}
          >
            <Plus size={16} color="accentForeground" />
          </Button>
          <Button
            disabled={!canGoBack}
            onClick={() => useEditorStore.getState().goBack()}
            variant="secondary"
            sx={{ p: 1, bg: "transparent" }}
            data-test-id="go-back"
          >
            <ArrowLeft size={16} />
          </Button>
          <Button
            disabled={!canGoForward}
            onClick={() => useEditorStore.getState().goForward()}
            variant="secondary"
            sx={{ p: 1, bg: "transparent" }}
            data-test-id="go-forward"
          >
            <ArrowRight size={16} />
          </Button>
        </Flex>
      ) : null}
      {showPaneControls ? (
        <Flex
          draggable
          title={strings.dragToMovePane()}
          className="pane-grip"
          onDragStart={(e) => {
            const header = e.currentTarget.closest(".editor-pane-view");
            if (header instanceof HTMLElement)
              e.dataTransfer.setDragImage(header, 20, 16);
            startPaneDrag(e, { kind: "pane", paneId });
          }}
          onDragEnd={endPaneDrag}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            Menu.openMenu(paneMenuItems(paneId));
          }}
          sx={{
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            width: 18,
            cursor: "grab",
            borderBottom: "1px solid var(--border)",
            opacity: isFocused ? 1 : 0.6,
            "&:hover": { bg: "hover" },
            "&:active": { cursor: "grabbing" }
          }}
          data-test-id="pane-grip"
        >
          <DragHandle size={14} color={isFocused ? "icon" : "icon-secondary"} />
        </Flex>
      ) : null}
      <ScrollContainer
        className="tabsScroll"
        suppressScrollY
        style={
          {
            flex: 1,
            height: "100%",
            ...(isTop ? {} : { WebkitAppRegion: "no-drag" })
          } as React.CSSProperties
        }
        trackStyle={() => ({
          backgroundColor: "transparent",
          "--ms-track-size": "6px"
        })}
        thumbStyle={() => ({ height: 3 })}
        onWheel={(e) => {
          const scrollcontainer =
            (e.currentTarget as HTMLElement).closest(".tabsScroll") ||
            (e.currentTarget as HTMLElement);
          if (e.deltaY > 0) scrollcontainer.scrollLeft += 100;
          else if (e.deltaY < 0) scrollcontainer.scrollLeft -= 100;
        }}
      >
        <Flex
          ref={tabsRef}
          sx={{
            flex: 1,
            height: "100%",
            position: "relative"
          }}
          onDoubleClick={async (e) => {
            e.stopPropagation();
            useEditorStore.getState().addTab(undefined, paneId);
          }}
          onContextMenu={(e) => {
            if (e.target !== e.currentTarget) return;
            e.preventDefault();
            Menu.openMenu(paneMenuItems(paneId));
          }}
          onDragOver={(e) => {
            e.preventDefault();
            const drag = usePaneDragStore.getState().drag;
            if (
              drag?.kind === "tab" ||
              (drag?.kind === "pane" && drag.paneId !== paneId)
            ) {
              e.dataTransfer.dropEffect = "move";
              const index = getDropIndex(e.clientX);
              if (index !== dropIndex) setDropIndex(index);
            }
          }}
          onDragLeave={(e) => {
            if (
              e.relatedTarget instanceof Node &&
              e.currentTarget.contains(e.relatedTarget)
            )
              return;
            setDropIndex(undefined);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const drag = usePaneDragStore.getState().drag;
            const index = getDropIndex(e.clientX);
            setDropIndex(undefined);
            endPaneDrag();

            if (drag?.kind === "tab") {
              useEditorStore.getState().moveTab(drag.tabId, { paneId, index });
              return;
            }
            if (drag?.kind === "pane") {
              if (drag.paneId !== paneId)
                useEditorStore
                  .getState()
                  .movePaneTo(drag.paneId, { paneId, index });
              return;
            }

            const noteId = getDragData(e.dataTransfer, "note")?.[0];
            if (!noteId) return;
            useEditorStore.getState().openNoteInPane(noteId, paneId);
          }}
          data-test-id="tabs"
        >
          {tabs.map((tab, i) => {
            const session = useEditorStore.getState().getSession(tab.sessionId);
            if (!session) return null;

            const isUnsaved =
              session.type === "default" &&
              session.saveState === SaveState.NotSaved;

            return (
              <Tab
                id={tab.id}
                paneId={paneId}
                key={tab.id}
                title={
                  session.title ||
                  ("note" in session ? session.note.title : strings.untitled())
                }
                isUnsaved={isUnsaved}
                isActive={tab.id === currentTab}
                isPaneFocused={isFocused}
                showFocusIndicator={showPaneControls}
                isDragged={drag?.kind === "tab" && drag.tabId === tab.id}
                isPinned={!!tab.pinned}
                isLocked={isLockedSession(session)}
                isRevealInListDisabled={isFocusMode}
                type={session.type}
                canClosePane={showPaneControls}
                onSave={() => {
                  const editor = useEditorManager
                    .getState()
                    .getEditor(session.id)?.editor;
                  if (!editor) return;
                  saveContent(session.id, false, editor.getContent());
                }}
                onFocus={() => {
                  if (tab.id !== useEditorStore.getState().activeTabId) {
                    useEditorStore.getState().activateSession(tab.sessionId);
                  }
                }}
                onClose={() => useEditorStore.getState().closeTabs(tab.id)}
                onCloseAll={() => closePaneTabs(() => true)}
                onCloseOthers={() => closePaneTabs((s) => s.id !== tab.id)}
                onCloseToTheRight={() =>
                  closePaneTabs((_s, index) => index > i)
                }
                onCloseToTheLeft={() => closePaneTabs((_s, index) => index < i)}
                onRevealInList={
                  "note" in session
                    ? () =>
                        AppEventManager.publish(
                          AppEvents.revealItemInList,
                          session.note.id,
                          true
                        )
                    : undefined
                }
                onPin={() => useEditorStore.getState().pinTab(tab.id)}
              />
            );
          })}
          {isDraggingTabOrPane && dropIndex !== undefined ? (
            <div
              className="tab-drop-indicator"
              style={{
                position: "absolute",
                top: 6,
                bottom: 6,
                width: 2,
                borderRadius: 1,
                left: Math.max(0, getIndicatorOffset(dropIndex) - 1),
                background: "var(--accent)",
                pointerEvents: "none",
                zIndex: 3
              }}
            />
          ) : null}
          <div
            style={{ width: "100%", borderBottom: "1px solid var(--border)" }}
          />
        </Flex>
      </ScrollContainer>
    </Flex>
  );
});

function paneMenuItems(paneId: string): MenuItem[] {
  const store = useEditorStore.getState();
  const paneCount = store.panes.length;
  return [
    {
      type: "button",
      key: "new-tab",
      title: strings.newTab(),
      onClick: () => store.addTab(undefined, paneId)
    },
    { type: "separator", key: "sep-new" },
    {
      type: "button",
      key: "split-right",
      title: strings.splitRight(),
      icon: SplitRight.path,
      onClick: () => store.splitPane("right", store.getPaneActiveTabId(paneId))
    },
    {
      type: "button",
      key: "split-down",
      title: strings.splitDown(),
      icon: SplitDown.path,
      onClick: () => store.splitPane("bottom", store.getPaneActiveTabId(paneId))
    },
    { type: "separator", key: "sep-pane", isHidden: paneCount < 2 },
    {
      type: "button",
      key: "close-pane",
      title: strings.closePane(),
      isHidden: paneCount < 2,
      onClick: () => store.closePane(paneId)
    }
  ];
}

type TabProps = {
  id: string;
  paneId: string;
  title: string;
  isActive: boolean;
  isPaneFocused: boolean;
  showFocusIndicator: boolean;
  isDragged: boolean;
  canClosePane: boolean;
  isPinned: boolean;
  isLocked: boolean;
  isUnsaved: boolean;
  isRevealInListDisabled: boolean;
  type: SessionType;
  onFocus: () => void;
  onClose: () => void;
  onCloseOthers: () => void;
  onCloseToTheRight: () => void;
  onCloseToTheLeft: () => void;
  onCloseAll: () => void;
  onPin: () => void;
  onSave: () => void;
  onRevealInList?: () => void;
};
function Tab(props: TabProps) {
  const {
    id,
    paneId,
    title,
    isActive,
    isPaneFocused,
    showFocusIndicator,
    isDragged,
    canClosePane,
    isPinned,
    isLocked,
    isUnsaved,
    isRevealInListDisabled,
    type,
    onFocus,
    onClose,
    onCloseAll,
    onCloseOthers,
    onCloseToTheRight,
    onCloseToTheLeft,
    onRevealInList,
    onPin,
    onSave
  } = props;
  const Icon = isLocked
    ? type === "locked"
      ? Lock
      : Unlock
    : type === "readonly"
    ? Readonly
    : type === "deleted"
    ? Trash
    : isUnsaved
    ? NoteRemove
    : Note;
  const activeTabRef = useRef<HTMLElement | null>(null);
  const isHighlighted = isActive && (isPaneFocused || !showFocusIndicator);

  useEffect(() => {
    if (activeTabRef.current && isActive) {
      const tab = activeTabRef.current;
      tab.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest"
      });
    }
  }, [isActive]);

  return (
    <Flex
      ref={(el) => {
        activeTabRef.current = el;
      }}
      className={`tab${isActive ? " active" : ""}`}
      data-test-id={`tab-${id}`}
      data-tab-id={id}
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        startPaneDrag(e, { kind: "tab", tabId: id, paneId });
      }}
      onDragEnd={endPaneDrag}
      onDrop={(e) => {
        // dropping a note on a tab opens it in that tab; tabs and panes are
        // handled by the strip.
        const noteId = getDragData(e.dataTransfer, "note")?.[0];
        if (!noteId) return;
        e.preventDefault();
        e.stopPropagation();
        endPaneDrag();
        useEditorStore.getState().openSessionInTab(noteId, id);
      }}
      sx={{
        height: "100%",
        cursor: "pointer",
        pl: 2,
        borderRight: "1px solid var(--border)",
        borderBottom: isActive
          ? "1px solid transparent"
          : "1px solid var(--border)",
        position: "relative",
        opacity: isDragged ? 0.4 : 1,
        transition: "opacity 150ms ease",
        "&::before": {
          content: '""',
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 2,
          bg: "accent",
          opacity: showFocusIndicator && isActive && isPaneFocused ? 1 : 0,
          transition: "opacity 150ms ease"
        },

        bg: isActive ? "background" : "transparent",
        justifyContent: "space-between",
        alignItems: "center",
        flexShrink: 0,
        ":hover": {
          "& .closeTabButton": {
            opacity: 1
          },
          bg: isActive ? "background" : "hover"
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        Menu.openMenu([
          {
            type: "button",
            title: strings.save(),
            key: "save",
            onClick: onSave,
            isHidden: !isUnsaved
          },
          { type: "separator", key: "sep0", isHidden: !isUnsaved },
          {
            type: "button",
            title: strings.close(),
            key: "close",
            onClick: onClose
          },
          {
            type: "button",
            title: strings.closeOthers(),
            key: "close-others",
            onClick: onCloseOthers
          },
          {
            type: "button",
            title: strings.closeToRight(),
            key: "close-to-the-right",
            onClick: onCloseToTheRight
          },
          {
            type: "button",
            title: strings.closeToLeft(),
            key: "close-to-the-left",
            onClick: onCloseToTheLeft
          },
          {
            type: "button",
            title: strings.closeAll(),
            key: "close-all",
            onClick: onCloseAll
          },
          { type: "separator", key: "sep1" },
          {
            type: "button",
            title: strings.revealInList(),
            key: "reveal-in-list",
            onClick: onRevealInList,
            isHidden: !onRevealInList,
            isDisabled: isRevealInListDisabled
          },
          { type: "separator", key: "sep2", isHidden: !onRevealInList },
          {
            type: "button",
            key: "split-right",
            title: strings.splitRight(),
            icon: SplitRight.path,
            onClick: () => useEditorStore.getState().splitPane("right", id)
          },
          {
            type: "button",
            key: "split-down",
            title: strings.splitDown(),
            icon: SplitDown.path,
            onClick: () => useEditorStore.getState().splitPane("bottom", id)
          },
          {
            type: "button",
            key: "move-right",
            title: strings.moveToNewPaneRight(),
            onClick: () =>
              useEditorStore.getState().moveTab(id, { paneId, edge: "right" })
          },
          {
            type: "button",
            key: "move-down",
            title: strings.moveToNewPaneBelow(),
            onClick: () =>
              useEditorStore.getState().moveTab(id, { paneId, edge: "bottom" })
          },
          {
            type: "button",
            key: "close-pane",
            title: strings.closePane(),
            isHidden: !canClosePane,
            onClick: () => useEditorStore.getState().closePane(paneId)
          },
          { type: "separator", key: "sep3" },
          {
            type: "button",
            key: "pin",
            title: strings.pin(),
            onClick: onPin,
            isChecked: isPinned
          }
        ]);
      }}
      onAuxClick={(e) => {
        if (e.button == 1) onClose();
      }}
      onClick={() => onFocus()}
    >
      <Flex>
        <Icon
          data-test-id={`tab-icon${isUnsaved ? "-unsaved" : ""}`}
          size={14}
          color={
            isUnsaved
              ? "icon-error"
              : isHighlighted
              ? "icon-selected"
              : "icon-secondary"
          }
        />
        <Text
          data-test-id="tab-title"
          variant="body"
          sx={{
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            overflowX: "hidden",
            pointerEvents: "none",
            maxWidth: 120,
            color: isHighlighted ? "paragraph-selected" : "paragraph-secondary"
          }}
          ml={1}
        >
          {title}
        </Text>
      </Flex>
      {isPinned ? (
        <Pin
          sx={{
            borderRadius: "default",
            flexShrink: 0,
            ml: "small",
            mr: 1,
            "&:hover": {
              bg: "hover-secondary"
            }
          }}
          size={14}
          onClick={onPin}
        />
      ) : (
        <Cross
          sx={{
            borderRadius: "default",
            flexShrink: 0,
            opacity: isActive ? 1 : 0,
            ml: "small",
            mr: 1,
            "&:hover": {
              bg: "hover-secondary"
            }
          }}
          onClick={onClose}
          className="closeTabButton"
          data-test-id={"tab-close-button"}
          size={14}
        />
      )}
    </Flex>
  );
}
