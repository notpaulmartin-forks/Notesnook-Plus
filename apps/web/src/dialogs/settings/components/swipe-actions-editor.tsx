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
 * Fork: Settings → Behaviour → Swipe. Shows each side's buttons the way they
 * appear when swiping a note; click one to replace, move or remove it.
 */

import { useRef } from "react";
import { Box, Button, Flex, Text } from "@theme-ui/components";
import { MenuItem } from "@notesnook/ui";
import { strings } from "@notesnook/intl";
import { useStore as useSettingStore } from "../../../stores/setting-store";
import {
  MAX_SWIPE_ACTIONS,
  SWIPE_ACTION_IDS,
  SWIPE_ACTIONS,
  SwipeActionId
} from "../../../common/swipe-actions";
import { Menu } from "../../../hooks/use-menu";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  SwapHorizontal,
  Trash
} from "../../../components/icons";

type Side = "leading" | "trailing";

export function SwipeRightActions() {
  return <SwipeActionsEditor side="leading" />;
}

export function SwipeLeftActions() {
  return <SwipeActionsEditor side="trailing" />;
}

const TILE_WIDTH = 64;
const ROW_HEIGHT = 54;

function SwipeActionsEditor({ side }: { side: Side }) {
  const actions = useSettingStore((store) => store.swipeSettings[side]);
  const stripRef = useRef<HTMLDivElement>(null);
  const update = (next: SwipeActionId[]) => {
    useSettingStore.getState().setSwipeSettings({ [side]: next });
    // the clicked button may be gone now; keep focus inside the dialog so
    // Escape still closes it
    requestAnimationFrame(() => {
      const strip = stripRef.current;
      if (strip && !strip.contains(document.activeElement))
        strip.focus({ preventScroll: true });
    });
  };

  const available = SWIPE_ACTION_IDS.filter((id) => !actions.includes(id));
  const canAdd = actions.length < MAX_SWIPE_ACTIONS && available.length > 0;
  // outermost first in settings; on screen the outermost sits at the edge
  const onScreen = side === "leading" ? actions : [...actions].reverse();
  // moving left on screen: outward when swiping right, inward when left
  const leftStep = side === "leading" ? -1 : 1;

  function editMenu(id: SwipeActionId): MenuItem[] {
    const index = actions.indexOf(id);
    const canMove = (step: number) =>
      index + step >= 0 && index + step < actions.length;
    const move = (step: number) => {
      const next = actions.slice();
      [next[index], next[index + step]] = [next[index + step], next[index]];
      update(next);
    };
    return [
      {
        type: "button",
        key: "replace",
        title: strings.replaceWith(),
        icon: SwapHorizontal.path,
        isDisabled: available.length === 0,
        menu: {
          items: available.map((other) => ({
            type: "button",
            key: other,
            title: SWIPE_ACTIONS[other].title(),
            icon: SWIPE_ACTIONS[other].icon.path,
            onClick: () => {
              const next = actions.slice();
              next[index] = other;
              update(next);
            }
          }))
        }
      },
      {
        type: "button",
        key: "move-left",
        title: strings.moveLeft(),
        icon: ArrowLeft.path,
        isDisabled: !canMove(leftStep),
        onClick: () => move(leftStep)
      },
      {
        type: "button",
        key: "move-right",
        title: strings.moveRight(),
        icon: ArrowRight.path,
        isDisabled: !canMove(-leftStep),
        onClick: () => move(-leftStep)
      },
      { type: "separator", key: "sep" },
      {
        type: "button",
        key: "remove",
        title: strings.remove(),
        icon: Trash.path,
        variant: "dangerous",
        onClick: () => update(actions.filter((action) => action !== id))
      }
    ];
  }

  function addMenu(): MenuItem[] {
    return available.map((id) => ({
      type: "button",
      key: id,
      title: SWIPE_ACTIONS[id].title(),
      icon: SWIPE_ACTIONS[id].icon.path,
      // new buttons go next to the note, the outermost stays put
      onClick: () => update([...actions, id])
    }));
  }

  const open = (target: HTMLElement, items: MenuItem[]) =>
    Menu.openMenu(items, {
      position: { target, location: "below", align: "center" }
    });

  const tiles = onScreen.map((id) => {
    const { title, icon: ActionIcon, color } = SWIPE_ACTIONS[id];
    return (
      <Button
        key={id}
        variant="secondary"
        data-test-id={`swipe-setting-${side}-${id}`}
        title={title()}
        onClick={(e) => open(e.currentTarget, editMenu(id))}
        sx={{
          width: TILE_WIDTH,
          flexShrink: 0,
          height: "100%",
          p: 0,
          borderRadius: 0,
          bg: color,
          color: "white",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "3px",
          // match the theme's selectors so the action colour wins
          ":hover:not(:disabled):not(:active)": {
            bg: color,
            filter: "brightness(1.1)"
          },
          ":active:not(:disabled)": { bg: color, filter: "brightness(0.95)" }
        }}
      >
        <ActionIcon size={18} color="white" />
        <Text sx={{ fontSize: "11px", fontWeight: 500, color: "white" }}>
          {title()}
        </Text>
      </Button>
    );
  });

  const add = canAdd ? (
    <Button
      key="add"
      variant="secondary"
      title={strings.addSwipeAction()}
      data-test-id={`swipe-setting-${side}-add`}
      onClick={(e) => open(e.currentTarget, addMenu())}
      sx={{
        width: 44,
        flexShrink: 0,
        height: "100%",
        p: 0,
        borderRadius: 0,
        bg: "transparent",
        border: "1px dashed var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <Plus size={16} />
    </Button>
  ) : null;

  // a sketch of the note the buttons slide out from
  const note = (
    <Flex
      key="note"
      sx={{
        flex: 1,
        minWidth: 60,
        flexDirection: "column",
        justifyContent: "center",
        gap: 1,
        px: 2
      }}
    >
      <Box
        sx={{ height: 7, width: "45%", bg: "border", borderRadius: "2px" }}
      />
      <Box
        sx={{ height: 6, width: "75%", bg: "border", borderRadius: "2px" }}
      />
    </Flex>
  );

  const outermost = actions[0];
  return (
    <Flex sx={{ flexDirection: "column", gap: 1, mt: 2, mb: 1 }}>
      <Flex
        ref={stripRef}
        tabIndex={-1}
        data-test-id={`swipe-setting-${side}`}
        sx={{
          outline: "none",
          height: ROW_HEIGHT,
          border: "1px solid var(--border)",
          borderRadius: "default",
          overflow: "hidden",
          bg: "background"
        }}
      >
        {side === "leading" ? (
          <>
            {tiles}
            {add}
            {note}
          </>
        ) : (
          <>
            {note}
            {add}
            {tiles}
          </>
        )}
      </Flex>
      <Text
        variant="subBody"
        sx={{ textAlign: side === "leading" ? "left" : "right" }}
      >
        {outermost
          ? strings.fullSwipeAction(SWIPE_ACTIONS[outermost].title())
          : strings.noSwipeActions()}
      </Text>
    </Flex>
  );
}
