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

- macOS or Linux
- At least one agent CLI on PATH: `claude` (default), `codex`, or `opencode`
- git (for Archive history; optional but recommended)

## Quick start (no toolchain needed)

Tab Wiki is two pieces: a browser extension and a small native Companion app that
stores your wiki and calls your AI CLI. Both steps take about a minute.

### 1. Install the Companion

```sh
curl -fsSL https://raw.githubusercontent.com/kjalba/tab-wiki/main/install/get.sh | bash
```

This downloads the prebuilt binary from the latest
[GitHub release](https://github.com/kjalba/tab-wiki/releases) into
`~/.local/bin` and registers it with your browsers (Zen, Firefox, Helium,
Chrome, Chromium, Arc). Nothing runs in the background - browsers start it on
demand.

### 2. Install the extension

**From the stores** (easiest, once review completes):

- Firefox / Zen: *link pending AMO review*
- Chrome / Helium: *link pending Chrome Web Store review*

**From a GitHub release** (available now):

- **Firefox / Zen:** download `tab-wiki.xpi` from the
  [latest release](https://github.com/kjalba/tab-wiki/releases/latest).
  Until the AMO-signed version is out, set `xpinstall.signatures.required`
  to `false` in `about:config`, then open `about:addons` > gear icon >
  "Install Add-on From File" and pick the `.xpi`.
- **Chrome / Helium:** download and unzip `tab-wiki-chromium.zip`, open
  `chrome://extensions`, enable Developer mode, "Load unpacked", select the
  unzipped folder. The extension ID is pinned in the manifest, so the
  Companion recognizes it with no extra configuration.

### 3. Verify

Click the Tab Wiki toolbar icon (pin it via the puzzle-piece extensions menu).
The popup should read `Archive: ~/tab-wiki` with your installed engines
selectable. Press `Alt+Shift+C` to run your first Clean.

## Building from source

Requires Go 1.22+ and Node 20+:

```sh
git clone https://github.com/kjalba/tab-wiki && cd tab-wiki
cd extension && npm install && cd ..
./install/install.sh   # builds Companion + extension, registers native hosts, packages the .xpi
```

Then load the extension from `extension/dist/<browser>/` as in Quick start step 2.

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
| Reorganize topics | "Reorganize..." in Explore's toolbar - describe the regrouping, the Engine moves entries |
| Standing grouping rules | Edit `~/tab-wiki/guidelines.md` - read by the Engine on every Clean/Refile/Reorganize |

## The Archive

```
~/tab-wiki/
├── topics/*.md      # the wiki: one file per Topic, one line per Entry
├── cleans/*.json    # machine-owned log per Clean (receipts + undo)
├── config.json      # engines, models, staleness threshold, auto-push
├── guidelines.md    # standing grouping guidance, injected into every filing prompt
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
