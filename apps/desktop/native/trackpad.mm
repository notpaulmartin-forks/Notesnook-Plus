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

// Fork: reports trackpad scroll gesture phases (fingers down, lifted,
// momentum) and plays haptic feedback. Web pages only see wheel deltas, so
// without this a swipe can't tell "fingers resting" from "fingers lifted".

#import <AppKit/AppKit.h>
#include <node_api.h>

enum PhaseCode : intptr_t {
  kMayBegin = 1,
  kBegan = 2,
  kEnded = 3,
  kCancelled = 4,
  kMomentumBegan = 5,
  kMomentumEnded = 6
};
// added to the phase code when the event's deltas are inverted relative to
// the fingers ("natural scrolling")
static const intptr_t kInvertedFlag = 16;

static napi_threadsafe_function g_tsfn = nullptr;
static id g_monitor = nil;

static void CallJs(napi_env env, napi_value callback, void*, void* data) {
  if (env == nullptr || callback == nullptr) return;
  napi_value undefined, code;
  napi_get_undefined(env, &undefined);
  napi_create_int32(env, (int32_t)(intptr_t)data, &code);
  napi_call_function(env, undefined, callback, 1, &code, nullptr);
}

static intptr_t PhaseOf(NSEvent* event) {
  NSEventPhase phase = event.phase;
  NSEventPhase momentum = event.momentumPhase;
  if (phase & NSEventPhaseMayBegin) return kMayBegin;
  if (phase & NSEventPhaseBegan) return kBegan;
  if (phase & NSEventPhaseEnded) return kEnded;
  if (phase & NSEventPhaseCancelled) return kCancelled;
  if (momentum & NSEventPhaseBegan) return kMomentumBegan;
  if (momentum & (NSEventPhaseEnded | NSEventPhaseCancelled))
    return kMomentumEnded;
  return 0;
}

static napi_value Start(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  napi_value result;
  napi_get_boolean(env, false, &result);
  if (argc < 1 || g_monitor != nil) return result;

  napi_valuetype type;
  napi_typeof(env, argv[0], &type);
  if (type != napi_function) return result;

  napi_value name;
  napi_create_string_utf8(env, "trackpadPhase", NAPI_AUTO_LENGTH, &name);
  if (napi_create_threadsafe_function(env, argv[0], nullptr, name, 0, 1,
                                      nullptr, nullptr, nullptr, CallJs,
                                      &g_tsfn) != napi_ok)
    return result;
  // don't keep the process alive just for this
  napi_unref_threadsafe_function(env, g_tsfn);

  g_monitor = [NSEvent
      addLocalMonitorForEventsMatchingMask:NSEventMaskScrollWheel
                                   handler:^NSEvent*(NSEvent* event) {
                                     // only trackpads (and Magic Mice) have
                                     // gesture phases
                                     if (!event.hasPreciseScrollingDeltas)
                                       return event;
                                     intptr_t code = PhaseOf(event);
                                     if (code != 0 &&
                                         event.isDirectionInvertedFromDevice)
                                       code |= kInvertedFlag;
                                     if (code != 0 && g_tsfn != nullptr)
                                       napi_call_threadsafe_function(
                                           g_tsfn, (void*)code,
                                           napi_tsfn_nonblocking);
                                     return event;
                                   }];

  napi_get_boolean(env, g_monitor != nil, &result);
  return result;
}

static napi_value Haptic(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  int32_t pattern = 0;
  if (argc > 0) napi_get_value_int32(env, argv[0], &pattern);
  if (pattern < 0 || pattern > 2) pattern = 0;
  // 0 = generic, 1 = alignment, 2 = level change
  [[NSHapticFeedbackManager defaultPerformer]
      performFeedbackPattern:(NSHapticFeedbackPattern)pattern
             performanceTime:NSHapticFeedbackPerformanceTimeNow];
  return nullptr;
}

NAPI_MODULE_INIT() {
  napi_property_descriptor props[] = {
      {"start", nullptr, Start, nullptr, nullptr, nullptr, napi_default,
       nullptr},
      {"haptic", nullptr, Haptic, nullptr, nullptr, nullptr, napi_default,
       nullptr}};
  napi_define_properties(env, exports, sizeof(props) / sizeof(props[0]),
                         props);
  return exports;
}
