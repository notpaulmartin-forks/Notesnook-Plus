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

// Fork: builds the macOS trackpad addon (native/trackpad.mm) as a universal
// Node-API module. Node-API is ABI stable, so the headers of the Node running
// this script work for Electron too. Usage: node scripts/build-native.mjs
// [--outdir=build]

import { execFileSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outArg = process.argv.find((arg) => arg.startsWith("--outdir="));
const outDir = path.resolve(
  root,
  outArg ? outArg.slice("--outdir=".length) : "build"
);

if (process.platform !== "darwin") {
  console.log("build-native: skipped (macOS only)");
  process.exit(0);
}

const includeDir = path.resolve(
  path.dirname(process.execPath),
  "..",
  "include",
  "node"
);
if (!existsSync(path.join(includeDir, "node_api.h"))) {
  console.error(`build-native: node_api.h not found in ${includeDir}`);
  process.exit(1);
}

mkdirSync(path.join(outDir, "native"), { recursive: true });
const output = path.join(outDir, "native", "trackpad.node");

execFileSync(
  "xcrun",
  [
    "clang++",
    "-std=c++17",
    "-ObjC++",
    "-fobjc-arc",
    "-O2",
    "-arch",
    "arm64",
    "-arch",
    "x86_64",
    "-mmacosx-version-min=11.0",
    "-DNAPI_VERSION=8",
    "-I",
    includeDir,
    "-bundle",
    "-undefined",
    "dynamic_lookup",
    "-framework",
    "AppKit",
    "-o",
    output,
    path.join(root, "native", "trackpad.mm")
  ],
  { stdio: "inherit" }
);
console.log(`build-native: ${path.relative(root, output)}`);
