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
 * Fork: turns trackpad wheel events into swipe gestures for list rows.
 *
 * Wheel events alone can't tell "fingers resting" from "fingers lifted", and
 * after a flick macOS keeps sending momentum events that look like real
 * movement. The desktop app reports the real gesture phases from AppKit, so:
 *
 * - a swipe only ends (and only ever completes an action) when the fingers
 *   actually lift; pausing mid-swipe does nothing,
 * - momentum after the lift is ignored,
 * - a swipe has to start out clearly horizontal and travel a little before
 *   the row moves, so scrolling the list never drags rows sideways.
 *
 * Without phase information (browsers) the end of a gesture falls back to a
 * pause in wheel events.
 */

export type HapticPattern = "generic" | "alignment" | "levelChange";

type TrackpadPhase =
  | "mayBegin"
  | "began"
  | "ended"
  | "cancelled"
  | "momentumBegan"
  | "momentumEnded";

type TrackpadBridge = {
  isSupported(): boolean;
  onPhase(
    callback: (phase: TrackpadPhase, inverted: boolean) => void
  ): () => void;
  haptic(pattern: HapticPattern): void;
};

declare global {
  interface Window {
    trackpad?: TrackpadBridge;
  }
}

export interface SwipeTarget {
  /** a horizontal swipe on this row was recognised */
  begin(): void;
  /** finger travel in px since the last call; positive = to the right */
  move(delta: number, timeStamp: number): void;
  /** the fingers lifted; `cancelled` if the system cancelled the gesture */
  end(cancelled: boolean): void;
  /**
   * macOS started momentum right after the lift, i.e. the swipe ended in a
   * flick. `direction` is +1/-1 like `move`, or 0 if unknown.
   */
  momentum(direction: number): void;
  canSwipe(): boolean;
}

/** px the fingers travel before a swipe is recognised */
export const SWIPE_SLOP = 10;
/** horizontal travel must exceed vertical travel by this factor */
export const SWIPE_AXIS_RATIO = 1.6;
/** row px per px of wheel delta: a little resistance */
export const SWIPE_GAIN = 0.85;
/** fallback (no phase info): gap between wheel events that starts a gesture */
const FALLBACK_GAP_MS = 200;
/** fallback (no phase info): pause that counts as the end of a gesture */
const FALLBACK_IDLE_MS = 300;

type Gesture = {
  target?: SwipeTarget;
  axis?: "x" | "y";
  sumX: number;
  sumY: number;
};

class SwipeGestureEngine {
  private initialized = false;
  private bridge?: TrackpadBridge;
  private native = false;
  private touching = false;
  /** wheel deltas run opposite to the fingers (natural scrolling) */
  private inverted = true;
  private gesture?: Gesture;
  /** the row the last swipe ended on, for momentum hints */
  private released?: SwipeTarget;
  private lastWheelAt = 0;
  private fallbackTimer?: ReturnType<typeof setTimeout>;
  private onCloseOthers?: () => void;

  init(onCloseOthers: () => void) {
    this.onCloseOthers = onCloseOthers;
    if (this.initialized) return;
    this.initialized = true;
    this.bridge = typeof window !== "undefined" ? window.trackpad : undefined;
    try {
      this.native = !!this.bridge?.isSupported();
    } catch {
      this.native = false;
    }
    if (this.native)
      this.bridge?.onPhase((phase, inverted) => this.onPhase(phase, inverted));
    window.addEventListener("blur", () => this.finish(true));
  }

  haptic(pattern: HapticPattern) {
    if (!this.native) return;
    try {
      this.bridge?.haptic(pattern);
    } catch {
      // haptics are a nicety
    }
  }

  private onPhase(phase: TrackpadPhase, inverted: boolean) {
    switch (phase) {
      case "mayBegin":
      case "began":
        this.inverted = inverted;
        this.released = undefined;
        if (!this.touching) {
          this.touching = true;
          this.gesture = { sumX: 0, sumY: 0 };
        }
        break;
      case "ended":
      case "cancelled":
        if (this.touching) this.finish(phase === "cancelled");
        break;
      case "momentumBegan":
        this.released?.momentum(0);
        break;
      // otherwise momentum needs no handling: wheel events that arrive while
      // the fingers are up never move a row.
    }
  }

  private finish(cancelled: boolean) {
    clearTimeout(this.fallbackTimer);
    const gesture = this.gesture;
    this.touching = false;
    this.gesture = undefined;
    if (gesture?.axis === "x" && gesture.target) {
      gesture.target.end(cancelled);
      this.released = cancelled ? undefined : gesture.target;
    }
  }

  /** wheel delta → finger movement (positive = to the right) */
  private toFingers(dx: number) {
    return this.native && !this.inverted ? dx : -dx;
  }

  handleWheel(event: WheelEvent, target: SwipeTarget) {
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    const dx = event.deltaX * scale;
    const dy = event.deltaY * scale;
    const horizontal = Math.abs(dx) > Math.abs(dy);

    if (this.native) {
      if (!this.touching) {
        // momentum after a lift (or a mouse wheel) never swipes, and rows
        // have nothing else to do with horizontal scrolling.
        if (horizontal) {
          event.preventDefault();
          this.released?.momentum(Math.sign(this.toFingers(dx)));
        }
        return;
      }
    } else {
      const now = performance.now();
      if (now - this.lastWheelAt > FALLBACK_GAP_MS || !this.gesture) {
        this.finish(false);
        this.gesture = { sumX: 0, sumY: 0 };
      }
      this.lastWheelAt = now;
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = setTimeout(
        () => this.finish(false),
        FALLBACK_IDLE_MS
      );
    }

    const gesture = this.gesture;
    if (!gesture) return;
    if (!gesture.target) {
      if (!target.canSwipe()) {
        gesture.axis = "y";
        return;
      }
      gesture.target = target;
    }
    if (gesture.target !== target) return;
    if (gesture.axis === "y") return;

    if (!gesture.axis) {
      gesture.sumX += dx;
      gesture.sumY += dy;
      // keep the gesture cancelable: Chromium makes the rest of a scroll
      // sequence passive when its first event isn't prevented.
      if (Math.abs(dx) >= Math.abs(dy)) event.preventDefault();
      if (Math.hypot(gesture.sumX, gesture.sumY) < SWIPE_SLOP) return;
      if (Math.abs(gesture.sumX) > Math.abs(gesture.sumY) * SWIPE_AXIS_RATIO) {
        gesture.axis = "x";
        target.begin();
      } else {
        gesture.axis = "y";
        this.onCloseOthers?.();
      }
      return;
    }

    event.preventDefault();
    const fingers = this.toFingers(dx);
    // sampled on our own clock: synthetic and native event timestamps differ
    target.move(fingers * SWIPE_GAIN, performance.now());
  }
}

export const swipeGestures = new SwipeGestureEngine();
