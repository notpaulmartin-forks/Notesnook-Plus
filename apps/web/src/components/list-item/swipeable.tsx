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
 * Fork: Mail-style swipe actions for list rows.
 *
 * A two-finger horizontal swipe (or a touch drag) slides the row aside and
 * reveals action buttons. Nothing is decided while the fingers are down:
 *
 * - lifting past halfway (or with a flick) leaves the buttons open,
 *   otherwise the row springs back,
 * - pushing on past the buttons, against some resistance, arms the outermost
 *   action (the button fills the row and the trackpad clicks); it runs on
 *   lift, and backing off disarms it,
 * - momentum after the lift is ignored.
 *
 * The row is moved directly (no React render per event) and animated with
 * springs that pick up the release velocity, so it can be grabbed again
 * mid-flight.
 */

import React, {
  PropsWithChildren,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { create } from "zustand";
import { Icon } from "../icons";
import { swipeGestures, SwipeTarget } from "./swipe-gesture";
import {
  ARM_DWELL_MS,
  ARM_MAX_SPEED,
  FLICK_SPEED,
  isSpringAtRest,
  maxTravel,
  nextArmed,
  offsetToTravel,
  restingOffset,
  Sample,
  SpringConfig,
  stepSpring,
  SwipeGeometry,
  travelToOffset,
  velocityFromSamples
} from "./swipe-physics";

export type SwipeAction = {
  key: string;
  title: string;
  icon: Icon;
  /** CSS color of the button */
  color: string;
  onAction: (anchor: HTMLElement) => void | Promise<void>;
  /** the row disappears from the list after this action */
  removesRow?: boolean;
};

type Side = "leading" | "trailing";

type SwipeableProps = PropsWithChildren<{
  id: string;
  /** revealed by swiping right; the first action is the full-swipe action */
  leading?: SwipeAction[];
  /** revealed by swiping left; the first action is the full-swipe action */
  trailing?: SwipeAction[];
  disabled?: boolean;
}>;

const BUTTON_WIDTH = 64;
const SETTLE: SpringConfig = { response: 0.32, damping: 1 };
const SLIDE_OUT: SpringConfig = { response: 0.26, damping: 1 };
const MAX_VELOCITY = 5000;
const TOUCH_SLOP = 8;
/** how long after a slow lift momentum still counts as a flick */
const MOMENTUM_GRACE_MS = 60;
const EASE = "cubic-bezier(0.2, 0.9, 0.25, 1)";

/** only one row is swiped open at a time */
const useOpenSwipeStore = create<{ openId?: string }>(() => ({}));

export function closeOpenSwipe() {
  useOpenSwipeStore.setState({ openId: undefined });
}

type LiveProps = {
  id: string;
  leading: SwipeAction[];
  trailing: SwipeAction[];
  disabled: boolean;
  collapsing: boolean;
};

type ControllerContext = {
  root: React.RefObject<HTMLDivElement>;
  content: React.RefObject<HTMLDivElement>;
  panel: React.RefObject<HTMLDivElement>;
  live: React.MutableRefObject<LiveProps>;
  setSide: (side: Side | undefined) => void;
  setArmed: (armed: boolean) => void;
  setCollapsing: (height: number | undefined) => void;
};

class SwipeController implements SwipeTarget {
  offset = 0;
  dragging = false;
  busy = false;
  unmounted = false;
  private travel = 0;
  private armed = false;
  private armedAt = 0;
  private armTimer?: ReturnType<typeof setTimeout>;
  private side?: Side;
  /** where the row was when the fingers went down */
  private start = 0;
  /** row offsets, for the release velocity of the spring */
  private samples: Sample[] = [];
  /** uncapped finger travel, for flicks and the arming speed limit */
  private fingers = 0;
  private fingerSamples: Sample[] = [];
  private lastDirection = 0;
  /** lifted slowly: briefly wait for macOS momentum, which means a flick */
  private pendingRelease?: {
    timer: ReturnType<typeof setTimeout>;
    velocity: number;
  };
  private stopAnimation?: () => void;

  constructor(private readonly ctx: ControllerContext) {}

  private actions(side: Side) {
    return this.ctx.live.current[side];
  }

  private geometry(side: Side): SwipeGeometry {
    return {
      width: this.ctx.root.current?.offsetWidth || 360,
      reveal: this.actions(side).length * BUTTON_WIDTH
    };
  }

  private sideOf(value: number): Side | undefined {
    return value > 0 ? "leading" : value < 0 ? "trailing" : undefined;
  }

  canSwipe() {
    const live = this.ctx.live.current;
    return (
      !live.disabled &&
      !live.collapsing &&
      !this.busy &&
      (live.leading.length > 0 || live.trailing.length > 0)
    );
  }

  begin() {
    this.stop();
    this.cancelPendingRelease();
    this.dragging = true;
    const side = this.sideOf(this.offset);
    // grab the row wherever it is (open, or mid-animation)
    this.travel = side
      ? Math.sign(this.offset) *
        offsetToTravel(Math.abs(this.offset), this.geometry(side))
      : 0;
    this.start = this.offset;
    this.samples = [];
    this.fingers = 0;
    this.fingerSamples = [];
    this.lastDirection = 0;
    const content = this.ctx.content.current;
    if (content) content.style.willChange = "transform";
    useOpenSwipeStore.setState({ openId: this.ctx.live.current.id });
  }

  move(delta: number, timeStamp: number) {
    if (!this.dragging) return;
    this.fingers += delta;
    if (delta) this.lastDirection = Math.sign(delta);
    pushSample(this.fingerSamples, { t: timeStamp, x: this.fingers });

    let travel = this.travel + delta;
    if (this.actions("leading").length === 0) travel = Math.min(travel, 0);
    if (this.actions("trailing").length === 0) travel = Math.max(travel, 0);
    const side = this.sideOf(travel);
    if (side)
      travel =
        Math.sign(travel) *
        Math.min(Math.abs(travel), maxTravel(this.geometry(side)));
    this.travel = travel;

    const offset = side
      ? Math.sign(travel) * travelToOffset(Math.abs(travel), this.geometry(side))
      : 0;
    this.render(offset);
    pushSample(this.samples, { t: timeStamp, x: offset });
    this.updateArmed(timeStamp);
  }

  /**
   * Arm once past the arm point, but only when the fingers have slowed down:
   * a fast swipe that overshoots is someone opening the buttons in a hurry.
   */
  private updateArmed(now: number) {
    clearTimeout(this.armTimer);
    const side = this.sideOf(this.travel);
    const wanted =
      !!side &&
      this.actions(side).length > 0 &&
      nextArmed(this.armed, Math.abs(this.travel), this.geometry(side));
    if (!wanted) return this.setArmed(false);
    if (this.armed) return;
    const speed = Math.abs(velocityFromSamples(this.fingerSamples, now, 50, 40));
    if (speed <= ARM_MAX_SPEED) {
      this.armedAt = now;
      this.setArmed(true);
      return;
    }
    // no wheel events arrive while the fingers rest: check again shortly
    this.armTimer = setTimeout(() => {
      if (this.dragging) this.updateArmed(performance.now());
    }, 60);
  }

  end(cancelled: boolean) {
    if (!this.dragging) return;
    this.dragging = false;
    clearTimeout(this.armTimer);
    const now = performance.now();
    const velocity = clamp(
      velocityFromSamples(this.samples, now),
      -MAX_VELOCITY,
      MAX_VELOCITY
    );
    const side = this.sideOf(this.offset);
    const primary = side ? this.actions(side)[0] : undefined;
    if (
      this.armed &&
      !cancelled &&
      side &&
      primary &&
      now - this.armedAt >= ARM_DWELL_MS
    ) {
      void this.commit(primary, side, velocity);
      return;
    }
    this.setArmed(false, false);

    const flick = clamp(
      velocityFromSamples(this.fingerSamples, now),
      -MAX_VELOCITY,
      MAX_VELOCITY
    );
    if (!cancelled && Math.abs(flick) < FLICK_SPEED) {
      // if macOS starts momentum right after the lift, it was a flick whose
      // last movement we didn't see
      this.pendingRelease = {
        velocity,
        timer: setTimeout(() => {
          this.pendingRelease = undefined;
          this.settle(velocity, flick);
        }, MOMENTUM_GRACE_MS)
      };
      return;
    }
    this.settle(velocity, flick);
  }

  /** momentum began after the fingers lifted (`direction` 0 if unknown) */
  momentum(direction: number) {
    const pending = this.pendingRelease;
    if (!pending) return;
    this.cancelPendingRelease();
    const dir = direction || this.lastDirection;
    this.settle(pending.velocity, dir * FLICK_SPEED * 1.5);
  }

  private cancelPendingRelease() {
    if (!this.pendingRelease) return;
    clearTimeout(this.pendingRelease.timer);
    this.pendingRelease = undefined;
  }

  private settle(velocity: number, flick: number) {
    const target = restingOffset(
      this.start,
      this.offset,
      flick,
      this.geometry("leading").reveal,
      this.geometry("trailing").reveal
    );
    void this.animateTo(target, velocity);
  }

  close() {
    if (this.dragging || this.busy) return;
    this.cancelPendingRelease();
    if (this.offset === 0 && !this.stopAnimation) return;
    this.setArmed(false, false);
    void this.animateTo(0, 0);
  }

  /** a click on one of the revealed buttons */
  runFromButton(action: SwipeAction) {
    if (this.busy || this.dragging || !this.side) return;
    if (action.removesRow) {
      void this.commit(action, this.side, 0);
      return;
    }
    const anchor = this.anchorFor(action);
    this.close();
    void action.onAction(anchor);
  }

  paintPanel() {
    const panel = this.ctx.panel.current;
    if (!panel || !this.side) return;
    const reveal = this.geometry(this.side).reveal || 1;
    panel.style.width = `${Math.abs(this.offset)}px`;
    panel.style.setProperty(
      "--reveal",
      Math.min(1, Math.abs(this.offset) / reveal).toFixed(3)
    );
  }

  stop() {
    this.stopAnimation?.();
  }

  dispose() {
    this.unmounted = true;
    clearTimeout(this.armTimer);
    this.cancelPendingRelease();
    this.stop();
  }

  private render(offset: number) {
    this.offset = offset;
    const content = this.ctx.content.current;
    if (content)
      content.style.transform = offset ? `translate3d(${offset}px, 0, 0)` : "";
    const side = this.sideOf(offset);
    if (side !== this.side) {
      this.side = side;
      this.ctx.setSide(side);
    }
    this.paintPanel();
  }

  private setArmed(armed: boolean, haptic = true) {
    if (armed === this.armed) return;
    this.armed = armed;
    this.ctx.setArmed(armed);
    if (haptic) swipeGestures.haptic(armed ? "levelChange" : "alignment");
  }

  private anchorFor(action: SwipeAction) {
    return (
      this.ctx.panel.current?.querySelector<HTMLElement>(
        `[data-swipe-action="${action.key}"]`
      ) ||
      this.ctx.root.current ||
      document.body
    );
  }

  private animateTo(
    target: number,
    velocity: number,
    config = SETTLE,
    until?: (x: number) => boolean
  ) {
    this.stop();
    return new Promise<void>((resolve) => {
      let state = { x: this.offset, v: velocity };
      let last = performance.now();
      let frame = 0;
      const finish = (x: number) => {
        this.stopAnimation = undefined;
        this.render(x);
        if (x === 0) this.settledClosed();
        resolve();
      };
      const tick = (now: number) => {
        const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
        last = now;
        state = stepSpring(state, target, dt, config);
        if (until?.(state.x)) return finish(state.x);
        if (isSpringAtRest(state, target)) return finish(target);
        this.render(state.x);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      this.stopAnimation = () => {
        cancelAnimationFrame(frame);
        this.stopAnimation = undefined;
        resolve();
      };
    });
  }

  private settledClosed() {
    const content = this.ctx.content.current;
    if (content) content.style.willChange = "";
    if (useOpenSwipeStore.getState().openId === this.ctx.live.current.id)
      closeOpenSwipe();
  }

  private async commit(action: SwipeAction, side: Side, velocity: number) {
    this.busy = true;
    const anchor = this.anchorFor(action);
    const direction = side === "leading" ? 1 : -1;

    if (!action.removesRow) {
      // like flagging in Mail: the row springs back while the action runs
      void this.animateTo(0, velocity).then(() => this.setArmed(false, false));
      try {
        await action.onAction(anchor);
      } finally {
        this.busy = false;
      }
      return;
    }

    // slide the row out, fold it away, then act
    const width = this.ctx.root.current?.offsetWidth || 360;
    await this.animateTo(
      direction * (width + 40),
      velocity,
      SLIDE_OUT,
      (x) => Math.abs(x) >= width
    );
    const height = this.ctx.root.current?.offsetHeight;
    if (height) {
      this.ctx.setCollapsing(height);
      // 1px, not 0: the virtualized list complains about zero-sized items
      requestAnimationFrame(() =>
        requestAnimationFrame(() => this.ctx.setCollapsing(1))
      );
    }
    await wait(200);
    try {
      await action.onAction(anchor);
    } finally {
      // if the row is still here (e.g. the action was cancelled), bring it
      // back.
      setTimeout(() => this.reset(), 400);
    }
  }

  private reset() {
    if (this.unmounted) return;
    this.stop();
    this.ctx.setCollapsing(undefined);
    this.render(0);
    this.setArmed(false, false);
    this.busy = false;
    this.settledClosed();
  }
}

export function Swipeable(props: SwipeableProps) {
  const { id, leading = [], trailing = [], disabled, children } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<Side>();
  const [armed, setArmed] = useState(false);
  const [collapsing, setCollapsing] = useState<number>();
  const isOpen = useOpenSwipeStore((store) => store.openId === id);

  const live = useRef<LiveProps>({
    id,
    leading,
    trailing,
    disabled: !!disabled,
    collapsing: false
  });
  live.current = {
    id,
    leading,
    trailing,
    disabled: !!disabled,
    collapsing: collapsing !== undefined
  };

  const controllerRef = useRef<SwipeController>();
  if (!controllerRef.current)
    controllerRef.current = new SwipeController({
      root: rootRef,
      content: contentRef,
      panel: panelRef,
      live,
      setSide,
      setArmed,
      setCollapsing
    });
  const controller = controllerRef.current;

  // the panel mounts after the row starts moving; size it before paint
  useLayoutEffect(() => {
    controller.paintPanel();
  });

  // close when another row opens (or the list scrolls)
  useEffect(() => {
    if (!isOpen && controller.offset !== 0) controller.close();
  }, [isOpen, controller]);

  // close when clicking elsewhere or pressing Escape
  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current?.contains(e.target as Node)) return;
      controller.close();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") controller.close();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, controller]);

  // trackpad swipes
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    swipeGestures.init(closeOpenSwipe);
    const onWheel = (e: WheelEvent) => swipeGestures.handleWheel(e, controller);
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [controller]);

  // touch screens
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    let start: { x: number; y: number } | undefined;
    let lastX = 0;
    let axis: "x" | "y" | undefined;

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType !== "touch" || !controller.canSwipe()) return;
      start = { x: e.clientX, y: e.clientY };
      axis = undefined;
    }
    function onPointerMove(e: PointerEvent) {
      if (!start || e.pointerType !== "touch") return;
      if (!axis) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) < TOUCH_SLOP) return;
        axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
        if (axis === "y") return;
        element?.setPointerCapture(e.pointerId);
        controller.begin();
        lastX = e.clientX;
        return;
      }
      if (axis !== "x") return;
      controller.move(e.clientX - lastX, performance.now());
      lastX = e.clientX;
    }
    function onPointerUp(e: PointerEvent) {
      if (!start || e.pointerType !== "touch") return;
      start = undefined;
      if (axis === "x") controller.end(e.type === "pointercancel");
      axis = undefined;
    }
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", onPointerUp);
    element.addEventListener("pointercancel", onPointerUp);
    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerUp);
      element.removeEventListener("pointercancel", onPointerUp);
    };
  }, [controller]);

  useEffect(
    () => () => controller.dispose(),
    [controller]
  );

  const actions = side === "leading" ? leading : side ? trailing : [];

  return (
    <div
      ref={rootRef}
      className="swipeable-row"
      style={{
        position: "relative",
        overflow: "hidden",
        ...(collapsing !== undefined
          ? {
              height: collapsing,
              transition: "height 180ms ease, opacity 180ms ease",
              opacity: collapsing <= 1 ? 0 : 1
            }
          : {})
      }}
    >
      {side && actions.length > 0 ? (
        <div
          ref={panelRef}
          aria-hidden={!isOpen}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            [side === "leading" ? "left" : "right"]: 0,
            display: "flex",
            flexDirection: side === "leading" ? "row" : "row-reverse",
            overflow: "hidden",
            background: actions[0].color
          }}
        >
          {actions.map((action, index) => {
            const primary = index === 0;
            const expanded = armed && primary;
            return (
              <button
                key={action.key}
                type="button"
                data-swipe-action={action.key}
                title={action.title}
                tabIndex={isOpen ? 0 : -1}
                onClick={(e) => {
                  e.stopPropagation();
                  controller.runFromButton(action);
                }}
                style={
                  {
                    flexGrow: armed ? (primary ? 1 : 0) : 1,
                    flexShrink: 1,
                    flexBasis: 0,
                    minWidth: 0,
                    overflow: "hidden",
                    border: "none",
                    margin: 0,
                    padding: 0,
                    cursor: "pointer",
                    color: "white",
                    background: action.color,
                    display: "flex",
                    alignItems: "center",
                    // once armed, the label rides along with the row's edge
                    justifyContent: expanded
                      ? side === "leading"
                        ? "flex-end"
                        : "flex-start"
                      : "center",
                    transition: `flex-grow 260ms ${EASE}, filter 120ms ease`,
                    WebkitAppRegion: "no-drag"
                  } as React.CSSProperties
                }
                onMouseEnter={(e) =>
                  (e.currentTarget.style.filter = "brightness(1.08)")
                }
                onMouseLeave={(e) => (e.currentTarget.style.filter = "")}
              >
                <span
                  style={{
                    width: BUTTON_WIDTH,
                    flexShrink: 0,
                    display: "flex",
                    justifyContent: "center",
                    transform: `scale(${expanded ? 1.1 : 1})`,
                    transition: `transform 260ms ${EASE}`
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 3,
                      // grow in as the buttons are revealed
                      opacity: "clamp(0, calc((var(--reveal, 1) - 0.3) * 2.5), 1)",
                      transform: "scale(calc(0.72 + 0.28 * var(--reveal, 1)))"
                    }}
                  >
                    <action.icon size={19} color="white" />
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        lineHeight: 1.1,
                        whiteSpace: "nowrap"
                      }}
                    >
                      {action.title}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      <div
        ref={contentRef}
        className="swipeable-row-content"
        style={{ position: "relative", zIndex: 1 }}
        onClickCapture={(e) => {
          // a click on an open row closes it instead of opening the note
          if (controller.offset === 0) return;
          e.preventDefault();
          e.stopPropagation();
          controller.close();
        }}
      >
        {children}
      </div>
    </div>
  );
}

function pushSample(samples: Sample[], sample: Sample) {
  samples.push(sample);
  if (samples.length > 32) samples.shift();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
