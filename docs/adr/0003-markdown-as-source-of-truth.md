# Plain Markdown files are the source of truth for the Archive

The Archive's canonical store is one Markdown file per Topic (`topics/*.md`), with each Entry as a single line carrying title, URL, Note, capture date, and last-opened date.
The alternative was a structured store (SQLite or JSON) with Markdown rendered as a view.

We chose Markdown as the truth because human and agent editability is the point of the system: deleting an Entry is deleting a line, merging Topics is concatenating files, and bulk curation can be delegated to any coding agent with no API.
Machine-only state (per-Clean tab lists for Receipt undo and debugging) lives separately in `cleans/` as JSONL and is never hand-edited.
The Archive directory is a git repository; the Companion auto-commits after every mutating operation (Clean, Refile, undo, deletion), giving history and rollback beyond the Receipt's single-Clean undo.
Pushing to any remote is strictly opt-in, since the Archive is effectively browsing history.

## Consequences

- The Companion must parse and rewrite Markdown robustly, including files edited by hand or by agents in arbitrary but reasonable ways.
- There are no schema migrations; format evolution must stay line-compatible or be handled by a one-time rewrite commit.
