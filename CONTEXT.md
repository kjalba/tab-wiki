# Tab Wiki

A tool that reduces the mental load of open browser tabs.
On command, it captures all open tabs into a grouped, wiki-like local archive and closes them; later, the user explores the archive to restore, review, or prune what was saved.

## Language

**Extension**:
The thin WebExtension installed in each browser; it enumerates, closes, and reopens tabs.
_Avoid_: Plugin, add-on

**Companion**:
The local application that owns the Archive and performs grouping; the browser spawns it on demand and the Extension talks to it over native messaging.
_Avoid_: Backend, server, daemon

**Archive**:
The on-disk store of captured tabs, kept as plain files so external AI agents can read and edit it.
_Avoid_: Wiki (as a code identifier), database, storage

**Clean**:
The command that captures all open tabs into the Archive, files them into Topics, and closes them down to one tab (the Receipt).
_Avoid_: Sweep, stash, save-all

**Topic**:
A long-lived group in the Archive that accumulates related captured tabs across Cleans; the taxonomy emerges from use and is curated by the user (or their agents), not predefined.
_Avoid_: Group, cluster, category, folder, session

**Inbox**:
A special Topic holding Entries not yet filed properly: everything from a Clean whose Engine failed, plus individual tabs the Engine could not confidently classify.
_Avoid_: Unsorted, misc, uncategorized

**Refile**:
The command that re-runs the Engine over the Inbox, optionally guided by a user instruction, distributing Entries into real Topics.
_Avoid_: Reclassify, retry

**Reorganize**:
The command that runs the Engine over the whole Archive with a user instruction, moving Entries between Topics; Entries the Engine does not mention stay where they are, and existing Notes are preserved.
_Avoid_: Regroup, restructure

**Guidelines**:
The user's standing grouping guidance (guidelines.md), injected into every Engine invocation so unique or project-specific Topics are respected from the first Clean.
_Avoid_: Rules, preferences, config

**Entry**:
One captured tab recorded in a Topic: its title, URL, Note, capture date, and last-opened date.
Restoring an Entry through Explore opens the tab and updates last-opened; the Entry stays in the Archive until explicitly deleted (wiki semantics, not stack semantics).
_Avoid_: Bookmark, link, record

**Stale**:
An Entry whose capture and last-opened dates are old enough that Explore flags it for review ("still want this?").
_Avoid_: Expired, dead

**Note**:
The one-line description the AI writes for an Entry at filing time, derived from the tab's content snippet (which is itself discarded after filing).
_Avoid_: Summary, annotation, description

**Engine**:
A pluggable AI backend registered with the Companion and invoked headlessly for filing (Claude Code by default; Codex, OpenCode, and future additions selectable).
Each Engine can be enabled or disabled, is shown as unavailable when not installed, and exposes its own model selection.
_Avoid_: Model (for the backend as a whole), provider, AI

**Excluded**:
A tab that is invisible to the tool: its content is never read, nothing about it is archived, and Clean leaves it open.
Tabs are Excluded per-domain via the ignore file or per-tab via a checkmark in the Extension; the Receipt reports only a count of them.
_Avoid_: Ignored, skipped, private, shielded

**Receipt**:
The page left open after a Clean, summarizing what was captured into which groups, with an undo that reopens everything.
_Avoid_: Summary page, confirmation

**Explore**:
The command that browses the Archive to restore, review, or delete captured tabs.
_Avoid_: Search, browse
