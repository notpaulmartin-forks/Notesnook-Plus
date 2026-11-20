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
 * Fork: which swipe actions note rows show, as configured under
 * Settings → Behaviour → Swipe.
 */

import { strings } from "@notesnook/intl";
import {
  Archive,
  Icon,
  MoreHorizontal,
  NotebookAdd,
  Pin,
  StarFilled,
  Trash
} from "../components/icons";

export const SWIPE_ACTION_IDS = [
  "pin",
  "favorite",
  "archive",
  "trash",
  "notebook",
  "more"
] as const;
export type SwipeActionId = (typeof SWIPE_ACTION_IDS)[number];

export type SwipeSettings = {
  enabled: boolean;
  /** revealed by swiping right, outermost (full-swipe) first */
  leading: SwipeActionId[];
  /** revealed by swiping left, outermost (full-swipe) first */
  trailing: SwipeActionId[];
};

export const MAX_SWIPE_ACTIONS = 4;

export const DEFAULT_SWIPE_SETTINGS: SwipeSettings = {
  enabled: true,
  leading: ["pin", "favorite"],
  trailing: ["archive", "trash", "notebook", "more"]
};

export const SWIPE_ACTIONS: Record<
  SwipeActionId,
  { title: () => string; icon: Icon; color: string }
> = {
  pin: { title: () => strings.pin(), icon: Pin, color: "#0A84FF" },
  favorite: {
    title: () => strings.favorite(),
    icon: StarFilled,
    color: "#FF9F0A"
  },
  archive: { title: () => strings.archive(), icon: Archive, color: "#AF52DE" },
  trash: { title: () => strings.delete(), icon: Trash, color: "#FF453A" },
  notebook: {
    title: () => strings.notebooks(),
    icon: NotebookAdd,
    color: "#30B0C7"
  },
  more: { title: () => strings.more(), icon: MoreHorizontal, color: "#8E8E93" }
};

export function isSwipeActionId(value: unknown): value is SwipeActionId {
  return SWIPE_ACTION_IDS.includes(value as SwipeActionId);
}

/** whatever is stored, return valid settings (no duplicates, at most 4) */
export function sanitizeSwipeSettings(value: unknown): SwipeSettings {
  const stored = (
    value && typeof value === "object" ? value : {}
  ) as Partial<Record<keyof SwipeSettings, unknown>>;
  const list = (ids: unknown, fallback: SwipeActionId[]) => {
    if (!Array.isArray(ids)) return fallback.slice();
    const result: SwipeActionId[] = [];
    for (const id of ids)
      if (isSwipeActionId(id) && !result.includes(id)) result.push(id);
    return result.slice(0, MAX_SWIPE_ACTIONS);
  };
  return {
    enabled:
      typeof stored.enabled === "boolean"
        ? stored.enabled
        : DEFAULT_SWIPE_SETTINGS.enabled,
    leading: list(stored.leading, DEFAULT_SWIPE_SETTINGS.leading),
    trailing: list(stored.trailing, DEFAULT_SWIPE_SETTINGS.trailing)
  };
}
