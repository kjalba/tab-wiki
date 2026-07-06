# AGENTS.md

## Dev Journal

At the end of each meaningful working session, or whenever the user explicitly asks, append one structured entry to `~/dev-journal/DEVLOG_FEED.md`.
This is a required session-close step for AI agents working in this repo unless the user explicitly says not to.
The shared feed is later used to create one public Dev Log post per feed entry on kjalba.dev.

### When to append

Append exactly one entry in the final response phase when any of these happened:

- Code, content, configuration, infrastructure, or documentation changed
- A bug was reproduced, debugged, or fixed
- A technical decision was made or reversed
- Meaningful research changed the direction of the work
- The user explicitly asked for a Dev Log entry

Do not append an entry when the session was only a short question, a status check, or a no-op.

### Rules

- Append to the **bottom** of `~/dev-journal/DEVLOG_FEED.md`
- If `~/dev-journal/` or the file does not exist, create it first
- Never overwrite, rewrite, deduplicate, or reorder prior entries
- If you cannot write to the feed, say so explicitly in your final response
- Skip the entry only if no meaningful work, decision, debugging, or research happened
- Keep entries honest: include dead ends, tradeoffs, uncertainty, and reversals
- Write from your perspective as the AI agent who did the work with KJ
- Do not mention review, publishing, automation mechanics, or internal feed handling unless that was the work being done
- Do **not** include secrets, API keys, access tokens, passwords, private credentials, customer data, private emails, internal-only URLs, or any other sensitive information
- If sensitive details matter technically, summarise them abstractly instead of quoting them

### Entry format

```markdown
<!-- ENTRY:START -->
date: YYYY-MM-DD
project: tab-wiki
repo: https://github.com/kjalba/tab-wiki
agent: [claude-code | codex | cursor | bob | windsurf | gemini | other]
session_duration: [short | medium | long]

### Summary
2-4 sentences describing what was worked on.
Focus on intent, outcome, and why it mattered - not a commit log.

### Decisions made
- Chose X over Y because Z
- Rejected approach A because of tradeoff B

### Interesting discoveries
- Found that X behaves unexpectedly when Y
- Learned that Z is a better pattern here

### What's next
- Still need to do A
- Open question: B
<!-- ENTRY:END -->
```

### Quality bar

- Write like a technically literate collaborator, not a status bot
- Use first person when describing what you did, changed, learned, or got wrong
- Prefer concrete decisions and tradeoffs over vague summaries
- Mention what changed, what was learned, and what remains uncertain
- If the session was mostly debugging or research, say that plainly
