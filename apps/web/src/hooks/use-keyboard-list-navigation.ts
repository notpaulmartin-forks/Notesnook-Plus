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

import { useCallback, useRef } from "react";
import { keydownHandler } from "../common/key-handler";

enum DIRECTION {
  UP = -1,
  SAME = 0,
  DOWN = 1
}

type UseKeyboardListNavigationOptions = {
  length: number;
  reset: () => void;
  select: (index: number, toggleable?: boolean) => void;
  deselect: (index: number) => void;
  bulkSelect: (indices: number[]) => void;
  focusItemAt: (index: number) => void;
  open?: (index: number) => void;
  skip?: (index: number) => boolean;
  /**
   * Fork: Enter renames, Delete/Backspace archives and Mod-Delete/Backspace
   * trashes. Return true when the action was handled.
   */
  onItemAction?: (
    action: ListItemAction,
    index: number,
    event: KeyboardEvent
  ) => boolean;
};

export type ListItemAction = "rename" | "archive" | "trash";

function isTextInput(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement)
  );
}

export function useKeyboardListNavigation(
  options: UseKeyboardListNavigationOptions
) {
  const {
    length,
    skip,
    open,
    deselect,
    reset,
    select,
    bulkSelect,
    focusItemAt,
    onItemAction
  } = options;
  const cursor = useRef(-1);
  const anchor = useRef(-1);
  // const { reset, select, deselect } = useSelection();

  const direction = useCallback(() => {
    return cursor.current === anchor.current
      ? DIRECTION.SAME
      : cursor.current > anchor.current
      ? DIRECTION.DOWN
      : DIRECTION.UP;
  }, []);

  const resetSelection = useCallback(() => {
    reset();
    anchor.current = -1;
  }, [reset]);

  const openActiveItem = useCallback(() => {
    if (!open || cursor.current < 0 || cursor.current >= length) return false;
    resetSelection();
    open(cursor.current);
    select(cursor.current);
    return true;
  }, [open, resetSelection, select, length]);

  const onMouseUp = useCallback(
    (e: MouseEvent, itemIndex: number) => {
      if (e.button !== 0) return;
      if (e.ctrlKey || e.metaKey) {
        select(itemIndex, true);
      } else if (e.shiftKey) {
        const startIndex =
          itemIndex > cursor.current ? cursor.current : itemIndex;
        const endIndex =
          itemIndex > cursor.current ? itemIndex : cursor.current;
        const indices = [];
        for (let i = startIndex; i <= endIndex; ++i) {
          if (skip && skip(i)) continue;
          indices.push(i);
        }
        bulkSelect(indices);
        focusItemAt(itemIndex);
      } else {
        resetSelection();
        select(itemIndex);
      }
      cursor.current = itemIndex;
    },
    [select, resetSelection, bulkSelect, skip, focusItemAt]
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const max = length - 1;
      const itemAction = (action: ListItemAction) => () => {
        if (!onItemAction || isTextInput(e.target)) return false;
        if (!onItemAction(action, cursor.current, e)) return false;
        e.preventDefault();
        return true;
      };

      keydownHandler({
        Space: openActiveItem,
        Enter: () => itemAction("rename")() || openActiveItem(),
        Backspace: itemAction("archive"),
        Delete: itemAction("archive"),
        "Mod-Backspace": itemAction("trash"),
        "Mod-Delete": itemAction("trash"),
        ArrowUp: () => {
          resetSelection();

          let nextIndex = moveUpCyclic(cursor.current, max);
          while (skip && skip(nextIndex))
            nextIndex = moveUpCyclic(nextIndex, max);
          focusItemAt(nextIndex);
          cursor.current = nextIndex;
          return true;
        },
        ArrowDown: () => {
          resetSelection();

          let nextIndex = moveDownCyclic(cursor.current, max);
          while (skip && skip(nextIndex))
            nextIndex = moveDownCyclic(nextIndex, max);
          focusItemAt(nextIndex);
          cursor.current = nextIndex;
          return true;
        },
        "Mod-a": () => {
          resetSelection();
          bulkSelect(new Array(length).fill(0).map((_, i) => i));
          return true;
        },
        "Shift-ArrowUp": () => {
          if (anchor.current === -1) {
            anchor.current = cursor.current;
            if (anchor.current >= 0 && anchor.current < length) {
              select(anchor.current);
            }
          }

          if (
            direction() === DIRECTION.DOWN &&
            cursor.current >= 0 &&
            cursor.current < length
          ) {
            deselect(cursor.current);
          }

          let nextIndex = moveUp(cursor.current);
          if (skip && skip(nextIndex)) nextIndex = moveUp(nextIndex);
          if (nextIndex === cursor.current) return false;

          focusItemAt(nextIndex);
          cursor.current = nextIndex;
          if (direction() === DIRECTION.UP) {
            select(nextIndex);
          }
          e.preventDefault();
          return false;
        },
        "Shift-ArrowDown": () => {
          if (anchor.current === -1) {
            anchor.current = cursor.current;
            if (anchor.current >= 0 && anchor.current < length) {
              select(anchor.current);
            }
          }

          if (
            direction() === DIRECTION.UP &&
            cursor.current >= 0 &&
            cursor.current < length
          ) {
            deselect(cursor.current);
          }

          let nextIndex = moveDown(cursor.current, max);
          if (skip && skip(nextIndex)) nextIndex = moveDown(nextIndex, max);
          if (nextIndex === cursor.current) return false;

          focusItemAt(nextIndex);
          cursor.current = nextIndex;
          if (direction() === DIRECTION.DOWN) {
            select(nextIndex);
          }
          e.preventDefault();
          return false;
        },
        Escape: () => {
          resetSelection();
          return true;
        }
      })(e);
    },
    [
      length,
      onItemAction,
      openActiveItem,
      resetSelection,
      skip,
      focusItemAt,
      bulkSelect,
      direction,
      select,
      deselect
    ]
  );

  return { onMouseUp, onKeyDown };
}

const moveDownCyclic = (i: number, max: number) => (i < max ? ++i : 0);
const moveUpCyclic = (i: number, max: number) => (i > 0 ? --i : max);
const moveDown = (i: number, max: number) => (i < max ? ++i : max);
const moveUp = (i: number) => (i > 0 ? --i : 0);
