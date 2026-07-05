import { api, PageMessage, StoredReceipt } from "./types";

function send<T>(msg: PageMessage): Promise<T> {
  return api.runtime.sendMessage(msg) as Promise<T>;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const cleanId = new URLSearchParams(location.search).get("id") ?? "";

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function stat(num: number | string, label: string): HTMLElement {
  const wrap = el("div", "stat");
  wrap.appendChild(el("div", "num", String(num)));
  wrap.appendChild(el("div", "label", label));
  return wrap;
}

async function init() {
  const resp = await send<{ ok: boolean; error?: string; stored?: StoredReceipt }>({
    kind: "getReceipt",
    cleanId,
  });
  if (!resp.ok || !resp.stored) {
    $("summary").textContent = resp.error ?? "Receipt unavailable";
    $("summary").className = "error";
    return;
  }
  const { receipt, undone, isLatest } = resp.stored;

  const excludedTotal =
    receipt.excluded.byFile + receipt.excluded.byToggle + receipt.excluded.pinned;
  $("summary").textContent = `Clean ${receipt.cleanId}`;
  const stats = $("stats");
  stats.replaceChildren(
    stat(receipt.total, "captured"),
    stat(receipt.filed, "filed"),
    stat(receipt.refreshed, "refreshed"),
    stat(receipt.inboxed, "inbox"),
    stat(excludedTotal, "excluded")
  );

  if (excludedTotal > 0) {
    const breakdown = el("div", "stat");
    const label = el(
      "div",
      "label",
      `(${receipt.excluded.byFile} by ignore file, ${receipt.excluded.byToggle} by checkmark, ${receipt.excluded.pinned} pinned)`
    );
    label.style.marginTop = "16px";
    breakdown.appendChild(label);
    stats.appendChild(breakdown);
  }

  if (receipt.engineError) {
    const p = el(
      "p",
      "warn",
      "Engine unavailable - tabs were saved to the Inbox without Notes. Run Refile from Explore once the engine works."
    );
    p.appendChild(document.createElement("br"));
    p.appendChild(el("span", "dim", receipt.engineError));
    $("engineError").replaceChildren(p);
  }
  if (receipt.gitWarning) {
    $("gitWarning").replaceChildren(el("p", "warn", receipt.gitWarning));
  }

  const topics = $("topics");
  topics.replaceChildren();
  for (const t of receipt.topics) {
    const li = document.createElement("li");
    const name = el("span", "grow", t.name);
    if (t.new) {
      name.appendChild(document.createTextNode(" "));
      name.appendChild(el("span", "badge new", "new topic"));
    }
    li.appendChild(name);
    li.appendChild(el("span", "meta", `${t.count} ${t.count === 1 ? "entry" : "entries"}`));
    topics.appendChild(li);
  }
  if (receipt.topics.length === 0) {
    const li = document.createElement("li");
    li.appendChild(el("span", "dim", "Nothing new was filed (all tabs were refreshes or excluded)."));
    topics.appendChild(li);
  }

  const undoBtn = $<HTMLButtonElement>("undo");
  if (undone) {
    undoBtn.textContent = "Undone";
  } else if (!isLatest) {
    undoBtn.textContent = "Undo unavailable (a newer Clean exists)";
  } else {
    undoBtn.disabled = false;
    undoBtn.addEventListener("click", async () => {
      undoBtn.disabled = true;
      undoBtn.textContent = "Reopening...";
      const r = await send<{ ok: boolean; error?: string }>({ kind: "undo", cleanId });
      if (r.ok) {
        undoBtn.textContent = "Undone - tabs reopened";
        $("message").textContent = "The Archive writes from this Clean were reverted.";
      } else {
        undoBtn.textContent = "Undo failed";
        $("message").textContent = r.error ?? "";
        $("message").className = "error";
      }
    });
  }

  $("explore").addEventListener("click", () => void send({ kind: "openExplore" }));
}

void init().catch((e: Error) => {
  $("summary").textContent = e.message;
  $("summary").className = "error";
});
