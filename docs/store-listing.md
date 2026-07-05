# Store listing copy

Paste-ready text for the Chrome Web Store and Firefox AMO submissions.

## Name

Tab Wiki

## Summary (short description, <=132 chars for CWS)

One keystroke files all your open tabs into a local, AI-grouped Markdown wiki - and brings them back when you need them.

## Description

Too many tabs? Tab Wiki turns tab overload into a personal knowledge base.

Press one shortcut and every open tab is captured into a local Markdown wiki,
grouped into persistent topics by an AI you already use, and closed - leaving
you one tab and a clear head. Explore the wiki later to reopen, review, and
prune what you saved.

- CLEAN: archives and closes every tab (pinned and excluded tabs are untouched),
  with a receipt page and full undo.
- EXPLORE: browse topics, filter, reopen tabs, spot stale entries, delete.
- REORGANIZE and REFILE: tell the AI how to regroup in plain language.
- YOUR AI, YOUR RULES: filing runs through AI CLIs on your machine using your
  existing subscriptions (Claude Code, Codex, OpenCode) - no API keys, no
  third-party servers. Pick the engine and model in one click.
- PLAIN FILES: the wiki is Markdown in a git repo (~/tab-wiki). Edit it in any
  editor, sync it however you like, or point a coding agent at it.
- PRIVATE BY DESIGN: an ignore file plus a per-tab toggle keep sensitive sites
  completely invisible - never read, never archived.

REQUIRES A COMPANION APP: tab filing and storage run in a small native helper
(open source, same repo). Install it with one terminal command - see
https://github.com/kjalba/tab-wiki for setup. Without it the extension cannot
store anything.

Open source: https://github.com/kjalba/tab-wiki

## Category

Productivity (CWS: "Workflow & Planning"; AMO: "Tabs")

## Privacy policy URL

https://github.com/kjalba/tab-wiki/blob/main/docs/PRIVACY.md

## Permission justifications (paste into the CWS "Privacy practices" tab / AMO reviewer notes)

- tabs: Core function - enumerate open tabs (title/URL) to archive them, close
  them after archiving, and reopen them from the wiki or on undo.
- scripting + host_permissions (<all_urls>): At Clean time only, a content
  script reads the meta description and the first ~1.2KB of visible text of
  each tab so the AI can group pages whose titles are uninformative. Content
  is used for that one filing call and discarded; excluded domains are never
  touched. No background or persistent content scripts.
- nativeMessaging: All storage and AI invocation happen in the local companion
  app (open source, same repository). The extension is a thin UI over it.
- storage: Session-scoped UI state (per-tab exclude toggles, last receipt).

## Reviewer notes (both stores)

This extension requires a native companion (native messaging host) that the
user installs from https://github.com/kjalba/tab-wiki - the same pattern as
password managers (1Password, KeePassXC-Browser). Without the companion the
extension shows a clear error and does nothing. The companion source is in the
same repository (companion/, Go). The extension bundle is built with esbuild
from TypeScript sources in extension/src/ (no minification); a source zip can
be provided on request (AMO: attached at submission).

## Assets needed (create before submitting)

- Screenshots (1280x800 for CWS; AMO flexible): popup with engine picker,
  Receipt after a Clean, Explore page with topics.
- CWS promo tile 440x280 (optional but recommended).
- Icon: already in the package (128px).
