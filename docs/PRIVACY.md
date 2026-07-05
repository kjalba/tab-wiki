# Tab Wiki Privacy Policy

Tab Wiki does not collect, transmit, store, or sell any user data.

**Everything is local.**
When you run Clean, the extension reads the titles, URLs, and a short text snippet of your open tabs and passes them to a companion program running on your own computer.
The companion writes them to plain Markdown files in a folder you own (`~/tab-wiki/` by default).

**AI processing uses your own accounts.**
To group tabs, the companion invokes an AI command-line tool that you installed and authenticated yourself (such as Claude Code or Codex).
Tab titles, URLs, and page snippets are sent to that AI provider under your own account and their terms.
You choose which provider, which model, and can exclude any site (per-tab or per-domain) so it is never read at all.

**No servers.**
Tab Wiki has no backend, no analytics, no telemetry, and no accounts.
The developers never see your data.

**Network access.**
The extension itself makes no network requests.
The only outbound traffic is from the AI CLI you configured, to your chosen AI provider.

Questions: open an issue at https://github.com/kjalba/tab-wiki/issues
