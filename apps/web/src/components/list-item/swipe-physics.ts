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
 * Fork: pure math behind the list's swipe actions.
 *
 * "travel" is how far the fingers have moved (in row pixels), "offset" is how
 * far the row has actually moved. They're equal while the action buttons are
 * being revealed; past that the row resists (Apple's rubber band) so going
 * for the full-swipe action takes a deliberate push.
 */

export type SwipeGeometry = {
  /** row width */
  width: number;
  /** width of the action buttons on the side being revealed */
  reveal: number;
};

/** UIScrollView's rubber band constant */
export const RUBBER_COEFFICIENT = 0.55;
/** the row never leaves completely while the fingers are down */
export const EDGE_MARGIN = 12;
/** the full-swipe action arms this far past the buttons... */
export const ARM_PAST_BUTTONS = 36;
/** ...but never before this fraction of the row width */
export const ARM_WIDTH_FRACTION = 0.55;
/** travel needed to back out of an armed full swipe */
export const ARM_HYSTERESIS = 28;

export function rubberBand(
  overflow: number,
  room: number,
  coefficient = RUBBER_COEFFICIENT
) {
  if (overflow <= 0) return 0;
  if (room <= 0) return 0;
  return (overflow * room * coefficient) / (room + coefficient * overflow);
}

export function inverseRubberBand(
  value: number,
  room: number,
  coefficient = RUBBER_COEFFICIENT
) {
  if (value <= 0) return 0;
  if (value >= room) return Infinity;
  return (value * room) / (coefficient * (room - value));
}

function roomPastButtons(geometry: SwipeGeometry) {
  return Math.max(1, geometry.width - EDGE_MARGIN - geometry.reveal);
}

/** row offset for a finger travel (magnitudes) */
export function travelToOffset(travel: number, geometry: SwipeGeometry) {
  if (travel <= geometry.reveal) return Math.max(0, travel);
  return (
    geometry.reveal +
    rubberBand(travel - geometry.reveal, roomPastButtons(geometry))
  );
}

/** finger travel that puts the row at an offset (magnitudes) */
export function offsetToTravel(offset: number, geometry: SwipeGeometry) {
  if (offset <= geometry.reveal) return Math.max(0, offset);
  const room = roomPastButtons(geometry);
  return (
    geometry.reveal +
    inverseRubberBand(Math.min(offset - geometry.reveal, room * 0.999), room)
  );
}

/** row offset at which the full-swipe action arms */
export function armOffset(geometry: SwipeGeometry) {
  const room = roomPastButtons(geometry);
  const wanted = Math.max(
    geometry.reveal + ARM_PAST_BUTTONS,
    geometry.width * ARM_WIDTH_FRACTION
  );
  // always reachable, however little room there is
  return Math.min(wanted, geometry.reveal + room * 0.7);
}

/** finger travel at which the full-swipe action arms */
export function armTravel(geometry: SwipeGeometry) {
  return offsetToTravel(armOffset(geometry), geometry);
}

/** finger travel counted past the arm point: backing off stays responsive */
export const MAX_OVERPUSH = 60;

export function maxTravel(geometry: SwipeGeometry) {
  return armTravel(geometry) + MAX_OVERPUSH;
}

export function nextArmed(
  armed: boolean,
  travel: number,
  geometry: SwipeGeometry
) {
  const threshold = armTravel(geometry);
  return armed ? travel >= threshold - ARM_HYSTERESIS : travel >= threshold;
}

/**
 * Where a release with this velocity (px/s) would naturally come to rest, as
 * in "Designing Fluid Interfaces" (WWDC 2018).
 */
export function project(velocity: number, decelerationRate = 0.99) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** lifting this far out (or flicking) leaves the buttons open: one button */
export const OPEN_DISTANCE = 64;

export function openThreshold(reveal: number) {
  return Math.min(reveal / 2, OPEN_DISTANCE);
}

/**
 * The resting offset after the fingers lift without running the full-swipe
 * action. A closed row opens once moved (or projected) one button's width
 * out; an open row closes once moved that far back in.
 */
export function restingOffset(
  start: number,
  offset: number,
  velocity: number,
  leadingReveal: number,
  trailingReveal: number
) {
  const projected = offset + project(velocity);
  const side = Math.sign(projected);
  if (side === 0) return 0;
  // a flick back across the middle closes; it never opens the other side
  if (offset !== 0 && side !== Math.sign(offset)) return 0;
  const reveal = side > 0 ? leadingReveal : trailingReveal;
  if (reveal <= 0) return 0;
  const distance = Math.abs(projected);
  const threshold = openThreshold(reveal);
  const startedOpen = Math.sign(start) === side && Math.abs(start) > reveal / 2;
  if (startedOpen) return reveal - distance >= threshold ? 0 : side * reveal;
  return distance >= threshold ? side * reveal : 0;
}

/**
 * Fast swipes are for opening the buttons. The full-swipe action only arms
 * once the fingers slow down below this speed (travel px/s) past the arm
 * point...
 */
export const ARM_MAX_SPEED = 600;
/** ...and only runs if it stayed armed this long before the lift. */
export const ARM_DWELL_MS = 120;
/** a release this fast (travel px/s) counts as a flick */
export const FLICK_SPEED = 900;

export type Sample = { t: number; x: number };

/**
 * Velocity (px/s) over the last `window` ms. A pause before lifting means no
 * flick at all.
 */
export function velocityFromSamples(
  samples: Sample[],
  now: number,
  window = 80,
  stale = 80
) {
  const last = samples[samples.length - 1];
  if (!last || now - last.t > stale) return 0;
  let first = last;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (last.t - samples[i].t > window) break;
    first = samples[i];
  }
  const dt = last.t - first.t;
  if (dt < 8) return 0;
  return ((last.x - first.x) / dt) * 1000;
}

export type SpringConfig = {
  /** seconds for one oscillation period, as in SwiftUI */
  response: number;
  /** 1 = critically damped (no overshoot) */
  damping: number;
};

export type SpringState = { x: number; v: number };

export function stepSpring(
  state: SpringState,
  target: number,
  dt: number,
  config: SpringConfig
): SpringState {
  const omega = (2 * Math.PI) / config.response;
  const stiffness = omega * omega;
  const friction = 2 * config.damping * omega;
  const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / steps;
  let { x, v } = state;
  for (let i = 0; i < steps; i++) {
    const a = -stiffness * (x - target) - friction * v;
    v += a * h;
    x += v * h;
  }
  return { x, v };
}

export function isSpringAtRest(state: SpringState, target: number) {
  return Math.abs(state.x - target) < 0.5 && Math.abs(state.v) < 20;
}
