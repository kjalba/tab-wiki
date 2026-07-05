// Background: owns the Clean/undo flows and relays page requests to the
// Companion. Pages (popup, receipt, explore) never talk to the native port
// directly - they message this hub.
import { companion, companionOk } from "./native";
import { api, CapturedTab, ExcludedCount, PageMessage, StoredReceipt } from "./types";

// ---- Excluded-tab toggles (per-tab checkmark; session-scoped) ----

async function getExcludedTabIds(): Promise<number[]> {
  const data = await api.storage.session.get("excludedTabIds");
  return (data.excludedTabIds as number[] | undefined) ?? [];
}

async function setExcludedTabIds(ids: number[]): Promise<void> {
  await api.storage.session.set({ excludedTabIds: ids });
}

api.tabs.onRemoved.addListener(async (tabId) => {
  const ids = await getExcludedTabIds();
  if (ids.includes(tabId)) await setExcludedTabIds(ids.filter((id) => id !== tabId));
});

// ---- Domain matching against the tabignore file ----

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

// Returns the tabignore pattern matching this URL's host, or null.
function matchingIgnorePattern(url: string, patterns: string[]): string | null {
  const host = hostOf(url);
  if (!host) return null;
  for (const raw of patterns) {
    const p = raw.toLowerCase().replace(/^\*\./, "");
    // A bare word ("capitalone") matches any hostname containing it;
    // a domain ("capitalone.com") matches that domain and its subdomains.
    if (!p.includes(".")) {
      if (host.includes(p)) return raw;
    } else if (host === p || host.endsWith("." + p)) {
      return raw;
    }
  }
  return null;
}

function domainExcluded(url: string, patterns: string[]): boolean {
  return matchingIgnorePattern(url, patterns) !== null;
}

// ---- Snippet capture (runs inside the page) ----

function grabSnippet(): string {
  const meta =
    document
      .querySelector('meta[name="description"], meta[property="og:description"]')
      ?.getAttribute("content") ?? "";
  const text = (document.body?.innerText ?? "").replace(/\s+/g, " ").slice(0, 1200);
  return (meta + " " + text).trim().slice(0, 1500);
}

async function snippetFor(tabId: number): Promise<string> {
  try {
    const results = await api.scripting.executeScript({
      target: { tabId },
      func: grabSnippet,
    });
    return (results?.[0]?.result as string | undefined) ?? "";
  } catch {
    return ""; // restricted page (about:, store, etc.) - title/URL only
  }
}

// ---- Clean ----

function isBlankTab(url: string): boolean {
  return (
    url === "about:blank" ||
    url.startsWith("about:newtab") ||
    url.startsWith("about:home") ||
    url.startsWith("chrome://newtab") ||
    url.startsWith("chrome://new-tab-page")
  );
}

function isOwnPage(url: string): boolean {
  return url.startsWith(api.runtime.getURL(""));
}

// Only http/https pages can be archived and later reopened. about:, chrome:,
// moz-extension:, file:, view-source: etc. are left open untouched.
function isArchivable(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

async function clean(): Promise<{ cleanId: string }> {
  const ignore = await companionOk({ cmd: "ignoreList" });
  const patterns = ignore.domains ?? [];
  const toggledIds = new Set(await getExcludedTabIds());

  const windows = await api.windows.getAll({ populate: true, windowTypes: ["normal"] });
  const excluded: ExcludedCount = { byFile: 0, byToggle: 0, pinned: 0 };
  const captured: CapturedTab[] = [];
  const capturedTabIds: number[] = [];
  const closeOnlyIds: number[] = []; // blank/new tabs and our own pages: close, never archive

  for (const win of windows) {
    if (win.incognito) continue;
    for (const tab of win.tabs ?? []) {
      if (tab.id === undefined || !tab.url) continue;
      if (tab.pinned) {
        excluded.pinned++;
        continue;
      }
      if (toggledIds.has(tab.id)) {
        excluded.byToggle++;
        continue;
      }
      if (domainExcluded(tab.url, patterns)) {
        excluded.byFile++;
        continue;
      }
      if (isBlankTab(tab.url) || isOwnPage(tab.url)) {
        closeOnlyIds.push(tab.id);
        continue;
      }
      if (!isArchivable(tab.url)) {
        continue; // privileged/local page: leave open, can't archive or reopen
      }
      captured.push({
        url: tab.url,
        title: tab.title ?? tab.url,
        windowId: win.id ?? 0,
        index: tab.index,
        snippet: await snippetFor(tab.id),
      });
      capturedTabIds.push(tab.id);
    }
  }

  const resp = await companionOk({ cmd: "clean", tabs: captured, excluded });
  const receipt = resp.receipt!;

  // Archive writes are confirmed - now (and only now) touch the browser:
  // open the Receipt first so one window survives, then close captured tabs.
  const stored: StoredReceipt = { receipt, undone: false, isLatest: true };
  await api.storage.session.set({ ["receipt:" + receipt.cleanId]: stored, latestCleanId: receipt.cleanId });
  await api.tabs.create({ url: api.runtime.getURL("receipt.html") + "?id=" + receipt.cleanId });
  await api.tabs.remove([...capturedTabIds, ...closeOnlyIds]);
  return { cleanId: receipt.cleanId };
}

// ---- Undo ----

async function undo(cleanId: string): Promise<void> {
  const resp = await companionOk({ cmd: "undo", cleanId });
  const tabs = resp.tabs ?? [];

  const key = "receipt:" + cleanId;
  const data = await api.storage.session.get(key);
  const stored = data[key] as StoredReceipt | undefined;
  if (stored) {
    stored.undone = true;
    await api.storage.session.set({ [key]: stored });
  }

  // Recreate tabs grouped by their original window.
  const byWindow = new Map<number, CapturedTab[]>();
  for (const t of tabs) {
    const list = byWindow.get(t.windowId) ?? [];
    list.push(t);
    byWindow.set(t.windowId, list);
  }
  // Reopen resiliently: one un-openable URL must not abort the rest.
  const openTab = async (opts: chrome.tabs.CreateProperties) => {
    try {
      await api.tabs.create(opts);
    } catch (e) {
      console.warn("tab-wiki: could not reopen", opts.url, e);
    }
  };

  let first = true;
  for (const [, list] of byWindow) {
    list.sort((a, b) => a.index - b.index);
    if (first) {
      first = false;
      for (const t of list) await openTab({ url: t.url, active: false });
    } else {
      let win: chrome.windows.Window | undefined;
      try {
        win = await api.windows.create({ url: list[0].url });
      } catch (e) {
        console.warn("tab-wiki: could not open window for", list[0].url, e);
      }
      const rest = win ? list.slice(1) : list;
      for (const t of rest) {
        await openTab(win ? { windowId: win.id, url: t.url, active: false } : { url: t.url, active: false });
      }
    }
  }
}

// ---- Explore helpers ----

async function openExplore(): Promise<void> {
  await api.tabs.create({ url: api.runtime.getURL("explore.html") });
}

async function openEntry(url: string): Promise<void> {
  await api.tabs.create({ url, active: false });
  await companion({ cmd: "opened", url }); // best-effort stamp
}

// ---- Message hub ----

api.runtime.onMessage.addListener((msg: PageMessage, _sender, sendResponse) => {
  (async () => {
    switch (msg.kind) {
      case "status":
        return companion({ cmd: "status" });
      case "clean":
        return clean();
      case "undo":
        await undo(msg.cleanId);
        return { ok: true };
      case "getReceipt": {
        const key = "receipt:" + msg.cleanId;
        const data = await api.storage.session.get([key, "latestCleanId"]);
        const stored = data[key] as StoredReceipt | undefined;
        if (!stored) return { ok: false, error: "Receipt not found (browser restarted?)" };
        stored.isLatest = data.latestCleanId === msg.cleanId;
        return { ok: true, stored };
      }
      case "explore":
        return companion({ cmd: "explore" });
      case "openEntry":
        await openEntry(msg.url);
        return { ok: true };
      case "openAll":
        for (const url of msg.urls) await openEntry(url);
        return { ok: true };
      case "deleteEntry":
        return companion({ cmd: "deleteEntry", topic: msg.topic, url: msg.url });
      case "deleteTopic":
        return companion({ cmd: "deleteTopic", topic: msg.topic });
      case "refile":
        return companion({ cmd: "refile", instruction: msg.instruction });
      case "reorganize":
        return companion({ cmd: "reorganize", instruction: msg.instruction });
      case "setEngine":
        return companion({ cmd: "setEngine", engine: msg.engine, model: msg.model });
      case "toggleExclude": {
        const ids = await getExcludedTabIds();
        const excluded = ids.includes(msg.tabId);
        await setExcludedTabIds(
          excluded ? ids.filter((id) => id !== msg.tabId) : [...ids, msg.tabId]
        );
        return { ok: true, excluded: !excluded };
      }
      case "isExcluded": {
        const ids = await getExcludedTabIds();
        return { ok: true, excluded: ids.includes(msg.tabId) };
      }
      case "addIgnoreDomain":
        return companion({ cmd: "addIgnore", domain: msg.domain });
      case "ignoreStatus": {
        const resp = await companionOk({ cmd: "ignoreList" });
        const pattern = matchingIgnorePattern(msg.url, resp.domains ?? []);
        return { ok: true, pattern };
      }
      case "openExplore":
        await openExplore();
        return { ok: true };
    }
  })()
    .then(sendResponse)
    .catch((e: Error) => sendResponse({ ok: false, error: e.message }));
  return true; // async response
});

// ---- Keyboard shortcuts ----

api.commands.onCommand.addListener((command) => {
  if (command === "clean") void clean().catch(console.error);
  if (command === "explore") void openExplore().catch(console.error);
});
