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
  DEFAULT_SWIPE_SETTINGS,
  sanitizeSwipeSettings
} from "../src/common/swipe-actions";

describe("swipe settings", () => {
  test("missing or broken settings fall back to the defaults", () => {
    expect(sanitizeSwipeSettings(undefined)).toEqual(DEFAULT_SWIPE_SETTINGS);
    expect(sanitizeSwipeSettings("junk")).toEqual(DEFAULT_SWIPE_SETTINGS);
    expect(sanitizeSwipeSettings({ leading: "pin" })).toEqual(
      DEFAULT_SWIPE_SETTINGS
    );
  });

  test("unknown actions and duplicates are dropped, at most 4 kept", () => {
    expect(
      sanitizeSwipeSettings({
        enabled: false,
        leading: ["pin", "pin", "explode", "archive"],
        trailing: ["trash", "more", "notebook", "favorite", "pin"]
      })
    ).toEqual({
      enabled: false,
      leading: ["pin", "archive"],
      trailing: ["trash", "more", "notebook", "favorite"]
    });
  });

  test("an emptied side stays empty", () => {
    expect(sanitizeSwipeSettings({ leading: [] }).leading).toEqual([]);
  });
});
