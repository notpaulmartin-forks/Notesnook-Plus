# Notesnook Plus

> [!IMPORTANT]
> Notesnook Plus is an independent, unofficial fork. It is **not affiliated with, endorsed by or supported by** Streetwriters (Private) Limited or the Notesnook team. The name "Notesnook" is used only to identify the project this fork is based on. Please don't report problems with this fork to the Notesnook team.
>
> This is a personal project: a few small features added for my own use. It's shared as-is, without support, and may fall behind Notesnook's own releases.

Forked from [Notesnook](https://github.com/streetwriters/notesnook)

- **macOS desktop app only.** The mobile apps, Monograph, theme builder, Vericrypt, docs and their build pipelines are removed.
- **Runs alongside the official app.** Renamed to Notesnook Plus with its own app ID, data folder and keychain entry. Your Notesnook account and sync work as usual (log in once).
- **No auto-updates or in-app announcements.**
- **Tab switching:** ⌘⌥← / ⌘⌥→ move between open tabs (across panes too).
- **Side-by-side panes:** ⌘D splits right and ⌘⇧D splits down. Drag the divider to resize, or double-click it to make panes equal.
- **Drag and drop for tabs and panes:** drag a tab to reorder it, onto a pane edge to make a new pane, or onto another tab strip to merge it back. Panes can be dragged by their grip, and notes from the list can be dropped into any pane.
- **⌘, opens Settings** from anywhere. Subscript moves to ⌘⇧,.
- **Mail-style swipe actions on notes** (two-finger swipe on the trackpad):
  - Swipe right for Pin and Favourite, left for Archive, Delete, Notebooks and More.
  - Choose the buttons for each side, or turn swiping off, in Settings → Behaviour → Swipe.
  - A full swipe runs the outermost action when you lift, with a haptic click on Force Touch trackpads. Archive and Delete can be undone.
- **Note list keyboard shortcuts:** with a note highlighted, Enter renames it, Delete offers to archive it and ⌘Delete offers to move it to the trash.

**Install instructions**

There are no prebuilt downloads; build it on your Mac. You need macOS 11 or later, [Node.js](https://nodejs.org/) 22 and the Xcode Command Line Tools (`xcode-select --install`).

```bash
git clone https://github.com/notpaulmartin-forks/Notesnook-Plus.git
cd Notesnook-Plus
npm install

# build the app's interface and its dependencies
node scripts/execute.mjs @notesnook/web:build:desktop

# package the macOS app (use --x64 instead of --arm64 on an Intel Mac)
cd apps/desktop
rm -rf build && cp -R ../web/build build
npm run bundle -- --outdir=build
npm run build:native
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --dir --arm64 \
  --config=electron-builder.config.js -c.mac.notarize=false

# install (Intel Macs: output/mac/ instead of output/mac-arm64/)
ditto "output/mac-arm64/Notesnook Plus.app" "/Applications/Notesnook Plus.app"
codesign --force --deep --sign - "/Applications/Notesnook Plus.app"
```

The app is signed only for your own Mac. Built this way, it opens normally. To update, pull the latest changes, run the build steps again and quit Notesnook Plus before replacing it.

# Original Notesnook README

<p align="center">
<img style="align:center;" src="./resources/icon.png" alt="Notesnook Logo" width="100" />
</p>

<h1 align="center">Notesnook</h1>
<h3 align="center">An end-to-end encrypted note taking alternative to Evernote.</h3>
<p align="center">
<a href="https://notesnook.com/">Website</a> | <a href="https://notesnook.com/about">About us</a> | <a href="https://notesnook.com/roadmap">Roadmap</a> | <a href="https://notesnook.com/downloads">Downloads</a> | <a href="https://twitter.com/@notesnook">Twitter</a> | <a href="https://discord.gg/5davZnhw3V">Discord</a>
</p>

## Overview

Notesnook is a free (as in speech) & open-source note-taking app focused on user privacy & ease of use. To ensure zero knowledge principles, Notesnook encrypts everything on your device using `XChaCha20-Poly1305` & `Argon2`.

Notesnook is our **proof** that privacy does _not_ (always) have to come at the cost of convenience. We aim to provide users peace of mind & 100% confidence that their notes are safe and secure. The decision to go fully open source is one of the most crucial steps towards that.

This repository contains all the code required to build & use the Notesnook web, desktop & mobile clients. If you are looking for a full feature list or screenshots, please check the [website](https://notesnook.com/).

## Developer guide

### Technologies & languages

Notesnook is built using the following technologies:

1. JavaScript/Typescript — this repo is in a hybrid state. A lot of the newer code is being written in Typescript & the old code is slowly being ported over.
2. React — the whole front-end across all platforms is built using React.
3. React Native — For mobile apps we are using React Native
4. Electron — For desktop app
5. NPM — listed here because we **don't** use Yarn or PNPM or XYZ across any of our projects.

> **Note: Each project in the monorepo contains its own architecture details which you can refer to.**

### Monorepo structure

| Name                       | Path                                               | Description                                                          |
| -------------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| `@notesnook/web`           | [/apps/web](/apps/web)                             | Web client                                                           |
| `@notesnook/desktop`       | [/apps/desktop](/apps/desktop)                     | Desktop client                                                       |
| `@notesnook/mobile`        | [/apps/mobile](/apps/mobile)                       | Android/iOS clients                                                  |
| `@notesnook/web-clipper`   | [/extensions/web-clipper](/extensions/web-clipper) | Web clipper                                                          |
| `@notesnook/core`          | [/packages/core](/packages/core)                   | Shared core between all platforms                                    |
| `@notesnook/crypto`        | [/packages/crypto](/packages/crypto)               | Cryptography library wrapper around libsodium                        |
| `@notesnook/clipper`       | [/packages/clipper](/packages/clipper)             | Web clipper core handling everything related to actual page clipping |
| `@notesnook/editor`        | [/packages/editor](/packages/editor)               | Notesnook editor + all extensions                                    |
| `@notesnook/editor-mobile` | [/packages/editor-mobile](/packages/editor-mobile) | A very thin wrapper around `@notesnook/editor` for mobile clients    |
| `@notesnook/logger`        | [/packages/logger](/packages/logger)               | Simple & pluggable logger                                            |
| `@notesnook/sodium`        | [/packages/sodium](/packages/sodium)               | Wrapper around libsodium to support Node.js & Browser                |
| `@notesnook/streamable-fs` | [/packages/streamable-fs](/packages/streamable-fs) | Streaming interface around an IndexedDB based file system            |
| `@notesnook/theme`         | [/packages/theme](/packages/theme)                 | The core theme used in web & desktop clients                         |

### Contributing guidelines

If you are interested in contributing to Notesnook, I highly recommend checking out the [contributing guidelines](/CONTRIBUTING.md). You'll find all the relevant information such as [style guideline](/CONTRIBUTING.md#style-guidelines), [how to make a PR](/CONTRIBUTING.md#opening--submitting-a-pull-request), [how to commit](/CONTRIBUTING.md#commit-guidelines) etc., there.

### Support & help

You can reach out to us via:

1. [Email](mailto:support@streetwriters.co)
2. [Discord](https://discord.gg/5davZnhw3V)
3. [Twitter](https://twitter.com/notesnook)
4. [Create an issue](https://github.com/streetwriters/notesnook/issues/new)

We take all queries, issues and bug reports that you might have. Feel free to ask.

## Additional Resources

- [Migrating & Importing your data from other apps — Importer](https://notesnook.com/help/importing-notes)
- [Privacy policy](https://notesnook.com/privacy) & [Terms of service](https://notesnook.com/terms)
- [Verify Notesnook encryption claims yourself — Vericrypt](https://vericrypt.notesnook.com/)
- [Why Notesnook requires an email address?](https://blog.notesnook.com/why-notesnook-requires-an-email-address/)
