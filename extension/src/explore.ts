import { api, CompanionResponse, displayModel, Entry, ExploreTopic, PageMessage } from "./types";
import { mountEnginePicker } from "./enginePicker";

function send<T = CompanionResponse>(msg: PageMessage): Promise<T> {
  return api.runtime.sendMessage(msg) as Promise<T>;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let topics: ExploreTopic[] = [];
let currentEngine = "";
let currentModel = "";

// Collapsed-topic names, persisted across sessions.
let collapsed = new Set<string>();

async function loadCollapsed(): Promise<void> {
  const data = await api.storage.local.get("collapsedTopics");
  collapsed = new Set((data.collapsedTopics as string[] | undefined) ?? []);
}

function saveCollapsed(): void {
  void api.storage.local.set({ collapsedTopics: [...collapsed] });
}

function setEngineSummary(engine: string, model: string) {
  currentEngine = engine;
  currentModel = model;
  $("engineSummary").textContent = `${engine} / ${displayModel(model)}`;
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function matches(e: Entry, topicName: string, q: string): boolean {
  if (!q) return true;
  const hay = `${e.title} ${e.url} ${e.note} ${topicName}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).every((term) => hay.includes(term));
}

function entryRow(topicName: string, e: Entry): HTMLLIElement {
  const li = document.createElement("li");

  const grow = el("div", "grow");
  const link = el("a", "open", e.title) as HTMLAnchorElement;
  link.href = "#";
  link.addEventListener("click", (ev) => {
    ev.preventDefault();
    void send({ kind: "openEntry", url: e.url }).then(load);
  });
  grow.appendChild(link);
  if (e.stale) {
    grow.appendChild(document.createTextNode(" "));
    grow.appendChild(el("span", "badge stale", "stale"));
  }
  if (e.note) grow.appendChild(el("div", "note", e.note));
  li.appendChild(grow);

  const meta = e.opened
    ? `captured ${e.captured} - opened ${e.opened}`
    : `captured ${e.captured}`;
  li.appendChild(el("span", "meta", meta));

  const del = el("button", "danger-ghost delete", "delete") as HTMLButtonElement;
  del.title = "Delete entry";
  del.addEventListener("click", async () => {
    if (!confirm(`Delete "${e.title}" from ${topicName}?`)) return;
    await send({ kind: "deleteEntry", topic: topicName, url: e.url });
    await load();
  });
  li.appendChild(del);
  return li;
}

// Buttons that live inside a <summary> must not toggle the card.
function summaryButton(btn: HTMLButtonElement): HTMLButtonElement {
  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
  });
  return btn;
}

function topicCard(t: ExploreTopic, q: string): HTMLElement | null {
  const entries = (t.entries ?? []).filter((e) => matches(e, t.name, q));
  if (entries.length === 0 && q) return null;

  const card = document.createElement("details");
  card.className = "card topic-card";
  // A filter overrides collapse state so matches are always visible.
  card.open = q ? true : !collapsed.has(t.name);
  card.addEventListener("toggle", () => {
    if ($<HTMLInputElement>("filter").value.trim()) return; // don't persist filter-forced state
    if (card.open) collapsed.delete(t.name);
    else collapsed.add(t.name);
    saveCollapsed();
  });

  const header = document.createElement("summary");
  header.className = "topic-header";
  const staleCount = entries.filter((e) => e.stale).length;
  header.appendChild(el("span", "chev", "▾"));
  header.appendChild(el("h2", "", t.name));
  header.appendChild(el("span", "badge", String(entries.length)));
  if (staleCount) header.appendChild(el("span", "badge stale", `${staleCount} stale`));
  header.appendChild(el("span", "spacer"));

  if (entries.length > 0) {
    const openAll = summaryButton(document.createElement("button"));
    openAll.textContent = "Open all";
    openAll.addEventListener("click", () => {
      void send({ kind: "openAll", urls: entries.map((e) => e.url) }).then(load);
    });
    header.appendChild(openAll);
  }

  if (t.name === "inbox") {
    if ((t.entries ?? []).length > 0) {
      const refile = summaryButton(document.createElement("button"));
      refile.textContent = "Refile";
      refile.title = "Re-run the Engine over the Inbox";
      refile.addEventListener("click", async () => {
        const instruction =
          prompt("Optional guidance for the Engine (leave empty for none):") ?? "";
        refile.disabled = true;
        refile.textContent = "Refiling...";
        const r = await send({ kind: "refile", instruction });
        alert(
          r.ok
            ? `Refiled ${r.moved ?? 0} entries; ${r.remaining ?? 0} still in the inbox.`
            : `Refile failed: ${r.error}`
        );
        await load();
      });
      header.appendChild(refile);
    }
  } else {
    const del = summaryButton(document.createElement("button"));
    del.className = "danger-ghost";
    del.textContent = "delete topic";
    del.addEventListener("click", async () => {
      if (!confirm(`Delete the whole topic "${t.name}" and all its entries?`)) return;
      await send({ kind: "deleteTopic", topic: t.name });
      collapsed.delete(t.name);
      saveCollapsed();
      await load();
    });
    header.appendChild(del);
  }

  card.appendChild(header);

  const ul = document.createElement("ul");
  ul.className = "entries";
  for (const e of entries) ul.appendChild(entryRow(t.name, e));
  if (entries.length === 0) {
    const li = document.createElement("li");
    li.appendChild(el("span", "dim", "Empty."));
    ul.appendChild(li);
  }
  card.appendChild(ul);
  return card;
}

function render() {
  const q = $<HTMLInputElement>("filter").value.trim();
  const container = $("topics");
  container.replaceChildren();

  // Inbox first when non-empty, then topics by size.
  const sorted = [...topics].sort((a, b) => {
    const an = a.entries?.length ?? 0;
    const bn = b.entries?.length ?? 0;
    if (a.name === "inbox" && an > 0) return -1;
    if (b.name === "inbox" && bn > 0) return 1;
    return bn - an;
  });

  let total = 0;
  let stale = 0;
  for (const t of sorted) {
    total += t.entries?.length ?? 0;
    stale += (t.entries ?? []).filter((e) => e.stale).length;
    const card = topicCard(t, q);
    if (card) container.appendChild(card);
  }
  $("subtitle").textContent =
    `${total} entries across ${topics.length} topics` +
    (stale ? ` - ${stale} stale (worth a review)` : "");
}

async function load() {
  const resp = await send({ kind: "explore" });
  if (!resp.ok) {
    $("subtitle").textContent = resp.error ?? "Could not load the Archive";
    $("subtitle").className = "error";
    return;
  }
  topics = resp.topics ?? [];
  render();
}

$("filter").addEventListener("input", render);
$("refresh").addEventListener("click", () => void load());
$("collapseAll").addEventListener("click", () => {
  collapsed = new Set(topics.map((t) => t.name));
  saveCollapsed();
  render();
});
$("expandAll").addEventListener("click", () => {
  collapsed.clear();
  saveCollapsed();
  render();
});
$("reorganize").addEventListener("click", async () => {
  const instruction = prompt(
    `Reorganize using ${currentEngine} / ${displayModel(currentModel)} ` +
      `(change it in the Engine panel above).\n\n` +
      'Describe how to regroup existing entries, e.g.\n' +
      '"merge clothes-shopping and tech-shopping into shopping" or\n' +
      '"everything about my foo project (repo, docs, issues) goes under foo-project"'
  );
  if (!instruction?.trim()) return;
  const btn = $<HTMLButtonElement>("reorganize");
  btn.disabled = true;
  btn.textContent = "Reorganizing...";
  const r = await send({ kind: "reorganize", instruction: instruction.trim() });
  btn.disabled = false;
  btn.textContent = "Reorganize entries...";
  alert(r.ok ? `Moved ${r.moved ?? 0} entries.` : `Reorganize failed: ${r.error}`);
  await load();
});

void mountEnginePicker($("engines"), $<HTMLSelectElement>("model"), setEngineSummary).then(
  (picker) => setEngineSummary(picker.activeEngine, picker.activeModel)
);
void loadCollapsed()
  .then(load)
  .catch((e: Error) => {
    $("subtitle").textContent = e.message;
    $("subtitle").className = "error";
  });
