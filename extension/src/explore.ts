import { api, CompanionResponse, Entry, ExploreTopic, PageMessage } from "./types";

function send<T = CompanionResponse>(msg: PageMessage): Promise<T> {
  return api.runtime.sendMessage(msg) as Promise<T>;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let topics: ExploreTopic[] = [];

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

function matches(e: Entry, topicName: string, q: string): boolean {
  if (!q) return true;
  const hay = `${e.title} ${e.url} ${e.note} ${topicName}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).every((term) => hay.includes(term));
}

function entryRow(topicName: string, e: Entry): HTMLLIElement {
  const li = document.createElement("li");
  const meta = e.opened
    ? `captured ${e.captured} - opened ${e.opened}`
    : `captured ${e.captured}`;
  li.innerHTML =
    `<div class="grow">` +
    `<a href="#" class="open">${escapeHtml(e.title)}</a>` +
    (e.stale ? ' <span class="badge stale">stale</span>' : "") +
    (e.note ? `<div class="note">${escapeHtml(e.note)}</div>` : "") +
    `</div>` +
    `<span class="meta">${meta}</span>` +
    `<button class="danger-ghost delete" title="Delete entry">delete</button>`;

  li.querySelector<HTMLAnchorElement>("a.open")!.addEventListener("click", (ev) => {
    ev.preventDefault();
    void send({ kind: "openEntry", url: e.url }).then(load);
  });
  li.querySelector<HTMLButtonElement>("button.delete")!.addEventListener("click", async () => {
    if (!confirm(`Delete "${e.title}" from ${topicName}?`)) return;
    await send({ kind: "deleteEntry", topic: topicName, url: e.url });
    await load();
  });
  return li;
}

function topicCard(t: ExploreTopic, q: string): HTMLElement | null {
  const entries = (t.entries ?? []).filter((e) => matches(e, t.name, q));
  if (entries.length === 0 && q) return null;

  const card = document.createElement("div");
  card.className = "card";

  const header = document.createElement("div");
  header.className = "topic-header";
  const staleCount = entries.filter((e) => e.stale).length;
  header.innerHTML =
    `<h2>${escapeHtml(t.name)}</h2>` +
    `<span class="badge">${entries.length}</span>` +
    (staleCount ? `<span class="badge stale">${staleCount} stale</span>` : "") +
    `<span class="spacer"></span>`;

  if (entries.length > 0) {
    const openAll = document.createElement("button");
    openAll.textContent = "Open all";
    openAll.addEventListener("click", () => {
      void send({ kind: "openAll", urls: entries.map((e) => e.url) }).then(load);
    });
    header.appendChild(openAll);
  }

  if (t.name === "inbox") {
    if ((t.entries ?? []).length > 0) {
      const refile = document.createElement("button");
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
    const del = document.createElement("button");
    del.className = "danger-ghost";
    del.textContent = "delete topic";
    del.addEventListener("click", async () => {
      if (!confirm(`Delete the whole topic "${t.name}" and all its entries?`)) return;
      await send({ kind: "deleteTopic", topic: t.name });
      await load();
    });
    header.appendChild(del);
  }

  card.appendChild(header);

  const ul = document.createElement("ul");
  ul.className = "entries";
  for (const e of entries) ul.appendChild(entryRow(t.name, e));
  if (entries.length === 0) {
    ul.innerHTML = '<li><span class="dim">Empty.</span></li>';
  }
  card.appendChild(ul);
  return card;
}

function render() {
  const q = $<HTMLInputElement>("filter").value.trim();
  const container = $("topics");
  container.innerHTML = "";

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
$("reorganize").addEventListener("click", async () => {
  const instruction = prompt(
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
  btn.textContent = "Reorganize...";
  alert(r.ok ? `Moved ${r.moved ?? 0} entries.` : `Reorganize failed: ${r.error}`);
  await load();
});
void load().catch((e: Error) => {
  $("subtitle").textContent = e.message;
  $("subtitle").className = "error";
});
