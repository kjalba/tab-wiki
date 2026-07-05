# tab-wiki

Clean all your open browser tabs into a local Markdown wiki, grouped by AI, and explore them later.
One keystroke puts every tab away into `~/tab-wiki/`; another brings the wiki up to restore, review, and prune.

The vocabulary (Clean, Topic, Entry, Engine, Receipt, ...) is defined in [CONTEXT.md](CONTEXT.md).
Architecture decisions are recorded in [docs/adr/](docs/adr/).

## How it works

```
Zen / Helium                     native messaging              plain files
┌───────────────┐   stdio JSON   ┌────────────────┐   writes   ┌──────────────────┐
│ WebExtension  │ ─────────────▶ │ Go Companion   │ ─────────▶ │ ~/tab-wiki/       │
│ (TypeScript)  │ ◀───────────── │ (single binary)│            │  topics/*.md      │
└───────────────┘                └───────┬────────┘            │  cleans/*.json    │
                                         │ headless CLI        │  config.json      │
                                         ▼                     │  tabignore        │
                                 claude / codex / opencode     └──────────────────┘
```

- **Clean** captures every tab in every window (except pinned and Excluded ones), files them into persistent Topics via a headless agent CLI, closes them, and leaves a Receipt tab with undo.
- **Explore** browses the wiki: filter, open, open-all, delete, staleness flags, and Refile for the Inbox.
- The Archive is plain Markdown in a git repo. Edit it in any editor, or point Claude Code / Codex at it to curate.

## Requirements

- macOS, Go 1.22+, Node 20+ (build only)
- At least one agent CLI on PATH: `claude` (default), `codex`, or `opencode`
- git (for Archive history; optional but recommended)

## Install

### 1. Build everything

```sh
cd extension && npm install && npm run build && cd ..
./install/install.sh        # builds the Companion, registers Firefox-family manifests
```

### 2. Load the extension in Zen (Firefox-family)

Temporary (resets on browser restart):

1. Open `about:debugging#/runtime/this-firefox`.
2. "Load Temporary Add-on" and pick `extension/dist/firefox/manifest.json`.

Permanent: set `xpinstall.signatures.required` to `false` in `about:config`,
then open `about:addons`, click the gear icon, choose "Install Add-on From File",
and pick `extension/dist/tab-wiki.xpi` (built by `install/install.sh`).

**Pin the toolbar button:** click the puzzle-piece Extensions icon near the address bar,
find "Tab Wiki", click the gear next to it, and choose "Pin to Toolbar".
If there's no puzzle-piece icon, right-click the top toolbar, choose "Customize Toolbar…",
and drag the Tab Wiki icon onto the bar.
You can also skip the button entirely: `Alt+Shift+C` cleans and `Alt+Shift+E` opens Explore.

### 3. Load the extension in Helium / Chrome (Chromium-family)

1. Open `chrome://extensions`, enable Developer mode.
2. "Load unpacked" and pick `extension/dist/chromium/`.

That's it - the manifest embeds a public `key`, so the extension ID is the same
on every machine (`dekbipliihgnonlenepdooagogfibkgo`) and `install.sh` registers
the native host for it automatically. No ID copying needed.

## Use

| Action | How |
|---|---|
| Clean | Toolbar popup button, or `Alt+Shift+C` |
| Explore | Popup button, or `Alt+Shift+E` |
| Exclude a tab | Checkmark in the popup (per-tab) |
| Exclude a domain | "Always exclude <domain>" button in the popup, or edit `~/tab-wiki/tabignore` |
| Switch Engine/model | Dropdowns in the popup |
| Undo a Clean | Button on the Receipt (latest Clean only, while the Receipt is open) |
| Refile the Inbox | Button on the Inbox card in Explore, with optional guidance |

## The Archive

```
~/tab-wiki/
├── topics/*.md      # the wiki: one file per Topic, one line per Entry
├── cleans/*.json    # machine-owned log per Clean (receipts + undo)
├── config.json      # engines, models, staleness threshold, auto-push
└── tabignore        # excluded domains: "x.com" = domain+subdomains, bare word = substring
```

Entry format:

```
- [Title](url) - one-line AI note (captured 2026-07-04, opened 2026-08-01)
```

Every mutation is auto-committed to git.
Pushing to a remote is opt-in (`"autoPush": true` in config.json) because the Archive is effectively browsing history.

Set `TAB_WIKI_DIR` to relocate the Archive.

## Engines

`config.json` registers each Engine with an argv template (`{MODEL}` and `{PROMPT}` placeholders; no `{PROMPT}` means stdin).
The popup greys out engines whose binary is not on PATH.
Model lists are static config per engine (edit freely, or have an agent update them); an engine may also set `modelsCommand` to merge in a dynamically discovered list.

Filing runs on your existing subscriptions via headless CLI calls - no API key needed.
The Engine's output is schema-validated; anything malformed lands in the Inbox instead of corrupting the wiki.

## Development

```sh
cd companion && go build && go vet ./...   # Companion
cd extension && npm run typecheck          # Extension
echo '{"cmd":"status"}' | ./companion/tab-wiki-companion -lines   # poke the protocol
```
