# Store listing copy

Paste-ready text for the Chrome Web Store and Firefox AMO submissions.
This is the canonical copy - the AMO listing was submitted with exactly these texts; reuse them verbatim for CWS.

## Name

Tab Wiki

## Summary (AMO summary / CWS short description, <=132 chars for CWS)

Clean all open tabs into a local Markdown wiki, grouped by AI, and explore them later.

## Description

The first paragraph is 233 chars - it carries the pitch for AMO's 250-char above-the-fold cutoff.

```
Too many tabs? One keystroke files every open tab into a local, AI-grouped Markdown wiki on your own machine, then closes them - leaving you one tab and a clear head. Explore the wiki later to reopen, review, and prune what you saved.

HOW IT WORKS
- Clean (Alt+Shift+C): archives and closes every tab in every window. Pinned tabs and excluded sites are untouched. You get a receipt page with a full undo.
- Explore (Alt+Shift+E): browse your topics, filter, reopen tabs, spot stale entries you haven't touched in months, and delete what you no longer need.
- Reorganize and Refile: describe how you want things regrouped in plain language and the AI moves entries between topics.

YOUR AI, YOUR RULES
Filing runs through AI command-line tools already on your machine (Claude Code, Codex, OpenCode) using your existing subscriptions - no API keys, no third-party servers. Switch engine and model in one click.

PLAIN FILES, FULLY YOURS
The wiki is Markdown files in a git repository (~/tab-wiki). Edit it in any editor, sync it however you like, or point a coding agent at it to curate for you.

PRIVATE BY DESIGN
An ignore file plus a per-tab toggle keep sensitive sites completely invisible: never read, never archived, never sent anywhere. The extension collects no data and makes no network requests itself.

REQUIRES A COMPANION APP
Storage and AI invocation run in a small open-source native helper installed with one terminal command (macOS/Linux). Without it, the extension cannot store anything. Setup takes about two minutes: https://github.com/kjalba/tab-wiki
```

## License

MIT License (matches the LICENSE file in the repository).

## Categories

- AMO: Tabs (primary), Bookmarks (secondary)
- CWS: Productivity > Workflow & Planning

## Privacy policy URL

https://github.com/kjalba/tab-wiki/blob/main/docs/PRIVACY.md

## Source code question (AMO)

Answer **yes** (esbuild bundles multiple TypeScript files into single JS files).
Attach a source zip generated from the repo root:

```sh
git archive -o source.zip HEAD
```

## Notes to Reviewer (AMO) / Reviewer notes (CWS)

```
ARCHITECTURE: This extension requires a native messaging companion app (same pattern as password managers like 1Password or KeePassXC-Browser). All storage and AI calls happen in that local companion; the extension is a thin UI. Without the companion installed, the extension shows a clear error and does nothing. The companion is open source in the same repository (companion/, written in Go): https://github.com/kjalba/tab-wiki

PERMISSIONS: "tabs" enumerates/closes/reopens tabs (the core function). "scripting" + <all_urls> run a one-shot content script at Clean time only, reading the meta description and ~1.2KB of visible text so the AI can group pages with uninformative titles; there are no persistent content scripts. "nativeMessaging" connects to the companion. "storage" holds session UI state. No data collection (declared via data_collection_permissions: none), no analytics, no remote code; the extension itself makes zero network requests.

BUILD INSTRUCTIONS (source zip attached): requires Node.js 20+.
  cd extension
  npm ci
  npm run build
Output in extension/dist/firefox/ is byte-identical to the uploaded package (esbuild bundling from TypeScript in extension/src/, no minification). The build entry point is extension/build.mjs.
```

For CWS, additionally paste the per-permission justifications into the Privacy
practices tab (one box per permission - split the PERMISSIONS paragraph above).

## Assets needed (create before submitting)

- Screenshots (1280x800 for CWS; AMO flexible): popup with engine picker,
  Receipt after a Clean, Explore page with topics.
- CWS promo tile 440x280 (optional but recommended).
- Icon: already in the package (128px).
