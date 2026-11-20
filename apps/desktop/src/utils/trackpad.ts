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
 * Fork: forwards macOS trackpad gesture phases to the renderer (used by the
 * note list's swipe actions) and plays haptic feedback on request.
 */

import { BrowserWindow, ipcMain } from "electron";
import path from "path";

type TrackpadAddon = {
  start(callback: (code: number) => void): boolean;
  haptic(pattern: number): void;
};

const PHASES = [
  undefined,
  "mayBegin",
  "began",
  "ended",
  "cancelled",
  "momentumBegan",
  "momentumEnded"
] as const;

const HAPTICS: Record<string, number> = {
  generic: 0,
  alignment: 1,
  levelChange: 2
};

let started = false;

function loadAddon(): TrackpadAddon | undefined {
  if (process.platform !== "darwin") return;
  try {
    const file = path
      .join(__dirname, "native", "trackpad.node")
      .replace(`.asar${path.sep}`, `.asar.unpacked${path.sep}`);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(file);
  } catch (e) {
    console.error("trackpad: native module unavailable", e);
  }
}

export function setupTrackpad() {
  if (started) return;
  started = true;

  const addon = loadAddon();
  const supported = !!addon?.start((code) => {
    const phase = PHASES[code & 15];
    if (!phase) return;
    // whether wheel deltas run opposite to the fingers (natural scrolling)
    const inverted = (code & 16) !== 0;
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed())
        window.webContents.send("trackpad-phase", phase, inverted);
    }
  });

  ipcMain.on("trackpad-supported", (event) => {
    event.returnValue = supported;
  });
  ipcMain.on("trackpad-haptic", (_event, pattern: unknown) => {
    if (!addon || typeof pattern !== "string" || !(pattern in HAPTICS)) return;
    addon.haptic(HAPTICS[pattern]);
  });
}
