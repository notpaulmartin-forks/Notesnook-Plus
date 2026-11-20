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
  EDGE_MARGIN,
  MAX_OVERPUSH,
  armOffset,
  maxTravel,
  armTravel,
  isSpringAtRest,
  nextArmed,
  offsetToTravel,
  restingOffset,
  stepSpring,
  travelToOffset,
  velocityFromSamples
} from "../src/components/list-item/swipe-physics";

const leading = { width: 380, reveal: 128 }; // 2 buttons
const trailing = { width: 380, reveal: 256 }; // 4 buttons

describe("swipe physics", () => {
  test("the row follows the fingers while revealing buttons", () => {
    expect(travelToOffset(0, trailing)).toBe(0);
    expect(travelToOffset(100, trailing)).toBe(100);
    expect(travelToOffset(256, trailing)).toBe(256);
  });

  test("past the buttons the row resists and never leaves", () => {
    const pushed = travelToOffset(256 + 100, trailing);
    expect(pushed - 256).toBeLessThan(100 * 0.6);
    expect(travelToOffset(10_000, trailing)).toBeLessThan(380 - EDGE_MARGIN);
    // monotonic
    expect(travelToOffset(400, trailing)).toBeGreaterThan(
      travelToOffset(380, trailing)
    );
  });

  test("offsetToTravel inverts travelToOffset", () => {
    for (const travel of [0, 50, 128, 200, 300, 500]) {
      const offset = travelToOffset(travel, leading);
      expect(offsetToTravel(offset, leading)).toBeCloseTo(travel, 3);
    }
  });

  test("full swipes take a deliberate push on both sides", () => {
    const a = armTravel(leading);
    const b = armTravel(trailing);
    expect(a).toBeGreaterThan(300);
    expect(b).toBeGreaterThan(300);
    expect(Math.abs(a - b) / Math.max(a, b)).toBeLessThan(0.15);
    // part of the row is still visible when armed
    expect(armOffset(trailing)).toBeLessThan(380 - 40);
    expect(armOffset(trailing)).toBeGreaterThan(256);
  });

  test("over-pushing is capped so backing off disarms promptly", () => {
    const cap = maxTravel(trailing);
    expect(cap - armTravel(trailing)).toBe(MAX_OVERPUSH);
    expect(nextArmed(true, cap - MAX_OVERPUSH - 30, trailing)).toBe(false);
  });

  test("arming has hysteresis", () => {
    const at = armTravel(leading);
    expect(nextArmed(false, at - 1, leading)).toBe(false);
    expect(nextArmed(false, at, leading)).toBe(true);
    expect(nextArmed(true, at - 10, leading)).toBe(true);
    expect(nextArmed(true, at - 40, leading)).toBe(false);
  });

  test("pausing before lifting means no flick", () => {
    const samples = [
      { t: 0, x: 0 },
      { t: 16, x: -20 },
      { t: 32, x: -45 }
    ];
    expect(velocityFromSamples(samples, 40)).toBeLessThan(-1000);
    expect(velocityFromSamples(samples, 400)).toBe(0);
  });

  test("one button's width (or a flick) opens a closed row", () => {
    // trailing side with 4 buttons opens after one button, not half of all
    expect(restingOffset(0, -70, 0, 128, 256)).toBe(-256);
    expect(restingOffset(0, -50, 0, 128, 256)).toBe(0);
    // leading side with 2 buttons: half its width
    expect(restingOffset(0, 70, 0, 128, 256)).toBe(128);
    // a quick short swipe opens thanks to its projected landing point
    expect(restingOffset(0, -40, -900, 128, 256)).toBe(-256);
    // a flick back the other way closes instead
    expect(restingOffset(0, -80, 1500, 128, 256)).toBe(0);
    // no actions on a side: never rests there
    expect(restingOffset(0, 200, 0, 0, 256)).toBe(0);
  });

  test("an open row closes after one button's width back", () => {
    expect(restingOffset(-256, -220, 0, 128, 256)).toBe(-256);
    expect(restingOffset(-256, -180, 0, 128, 256)).toBe(0);
    // or with a flick back
    expect(restingOffset(-256, -240, 1500, 128, 256)).toBe(0);
    // pushing further out keeps it open
    expect(restingOffset(-256, -300, -400, 128, 256)).toBe(-256);
  });

  test("springs settle on target without overshoot and keep velocity", () => {
    let state = { x: -200, v: -3000 };
    let min = state.x;
    let maxX = state.x;
    for (let i = 0; i < 120 && !isSpringAtRest(state, 0); i++) {
      state = stepSpring(state, 0, 1 / 60, { response: 0.32, damping: 1 });
      min = Math.min(min, state.x);
      maxX = Math.max(maxX, state.x);
    }
    expect(isSpringAtRest(state, 0)).toBe(true);
    // the release velocity carried it further out first
    expect(min).toBeLessThan(-200);
    expect(maxX).toBeLessThanOrEqual(0.5);
  });
});
