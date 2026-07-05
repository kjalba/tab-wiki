# Browser extension plus local Companion, not a pure extension

A pure WebExtension would be simpler to install and could store the Archive in extension storage, but that storage is opaque to everything outside the browser.
A core requirement of this project is that the Archive be plain files on disk that the user and external AI agents (Claude Code, Codex, etc.) can read and manipulate directly.
We therefore split the system: a thin Extension per browser (Zen/Firefox and Helium/Chromium) that enumerates, closes, and reopens tabs, and a local Companion process that owns the Archive, performs Engine invocations, and does all file I/O.

## Consequences

- Installation has two steps (extension plus Companion binary) instead of one.
- The Archive is fully usable without the browser: any editor, git, or agent can curate it.
