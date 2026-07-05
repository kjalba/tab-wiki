import { api, PageMessage, StoredReceipt } from "./types";

function send<T>(msg: PageMessage): Promise<T> {
  return api.runtime.sendMessage(msg) as Promise<T>;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const cleanId = new URLSearchParams(location.search).get("id") ?? "";

function stat(num: number | string, label: string): string {
  return `<div class="stat"><div class="num">${num}</div><div class="label">${label}</div></div>`;
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
  $("stats").innerHTML =
    stat(receipt.total, "captured") +
    stat(receipt.filed, "filed") +
    stat(receipt.refreshed, "refreshed") +
    stat(receipt.inboxed, "inbox") +
    stat(excludedTotal, "excluded");

  if (excludedTotal > 0) {
    $("stats").innerHTML += `<div class="stat"><div class="label" style="margin-top:16px">
      (${receipt.excluded.byFile} by ignore file, ${receipt.excluded.byToggle} by checkmark, ${receipt.excluded.pinned} pinned)
    </div></div>`;
  }

  if (receipt.engineError) {
    $("engineError").innerHTML =
      `<p class="warn">Engine unavailable - tabs were saved to the Inbox without Notes. ` +
      `Run Refile from Explore once the engine works.<br><span class="dim">${escapeHtml(receipt.engineError)}</span></p>`;
  }
  if (receipt.gitWarning) {
    $("gitWarning").innerHTML = `<p class="warn">${escapeHtml(receipt.gitWarning)}</p>`;
  }

  const topics = $("topics");
  topics.innerHTML = "";
  for (const t of receipt.topics) {
    const li = document.createElement("li");
    li.innerHTML =
      `<span class="grow">${escapeHtml(t.name)}${t.new ? ' <span class="badge new">new topic</span>' : ""}</span>` +
      `<span class="meta">${t.count} ${t.count === 1 ? "entry" : "entries"}</span>`;
    topics.appendChild(li);
  }
  if (receipt.topics.length === 0) {
    topics.innerHTML = '<li><span class="dim">Nothing new was filed (all tabs were refreshes or excluded).</span></li>';
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

void init().catch((e: Error) => {
  $("summary").textContent = e.message;
  $("summary").className = "error";
});
