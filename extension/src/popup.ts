import { api, CompanionResponse, displayModel, EngineStatus, PageMessage } from "./types";
import { mountEnginePicker } from "./enginePicker";

function send<T = CompanionResponse & { excluded?: boolean }>(msg: PageMessage): Promise<T> {
  return api.runtime.sendMessage(msg) as Promise<T>;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const statusEl = $("status");
const cleanBtn = $<HTMLButtonElement>("clean");
const exploreBtn = $<HTMLButtonElement>("explore");
const excludeBox = $<HTMLInputElement>("exclude");
const engineList = $("engines");
const modelSel = $<HTMLSelectElement>("model");
const messageEl = $("message");

cleanBtn.addEventListener("click", async () => {
  cleanBtn.disabled = true;
  cleanBtn.textContent = "Cleaning...";
  const resp = await send<{ ok?: boolean; error?: string }>({ kind: "clean" });
  if (resp && resp.error) {
    messageEl.textContent = resp.error;
    messageEl.className = "error";
    cleanBtn.disabled = false;
    cleanBtn.textContent = "Clean all tabs";
  } else {
    window.close(); // receipt tab takes over
  }
});

exploreBtn.addEventListener("click", async () => {
  await send({ kind: "openExplore" });
  window.close();
});

async function init() {
  // Per-tab exclude toggle + permanent domain ignore for the active tab.
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== undefined) {
    const tabId = tab.id;
    const state = await send<{ excluded?: boolean }>({ kind: "isExcluded", tabId });
    excludeBox.checked = !!state.excluded;
    excludeBox.addEventListener("change", () => void send({ kind: "toggleExclude", tabId }));

    const ignoreBtn = $<HTMLButtonElement>("ignoreDomain");
    const ignoreNote = $("ignoreNote");
    let host = "";
    try {
      if (tab.url && /^https?:/i.test(tab.url)) host = new URL(tab.url).hostname;
    } catch { /* ignore */ }
    if (host && tab.url) {
      const bare = host.replace(/^www\./, "");
      const showExcluded = (pattern: string) => {
        ignoreBtn.classList.add("hidden");
        ignoreNote.textContent =
          pattern === bare
            ? `✓ ${bare} is permanently excluded`
            : `✓ ${bare} is permanently excluded (tabignore: "${pattern}")`;
        ignoreNote.classList.remove("hidden");
      };

      const status = await send<{ ok: boolean; pattern?: string | null }>({
        kind: "ignoreStatus",
        url: tab.url,
      });
      if (status.ok && status.pattern) {
        showExcluded(status.pattern);
      } else {
        ignoreBtn.textContent = `Always exclude ${bare}`;
        ignoreBtn.classList.remove("hidden");
        ignoreBtn.addEventListener("click", async () => {
          ignoreBtn.disabled = true;
          const r = await send({ kind: "addIgnoreDomain", domain: bare });
          if (r.ok) {
            showExcluded(bare);
          } else {
            ignoreBtn.textContent = r.error ?? "Failed";
          }
        });
      }
    }
  } else {
    excludeBox.disabled = true;
  }

  const picker = await mountEnginePicker(engineList, modelSel, (engine, model) => {
    messageEl.textContent = `Set: ${engine} / ${displayModel(model)}`;
    messageEl.className = "ok";
  });
  const status = picker.status;
  if (!status.ok) {
    statusEl.textContent = status.error ?? "Companion unreachable";
    statusEl.className = "error";
    return;
  }
  statusEl.textContent = `Archive: ${status.archivePath}`;
  cleanBtn.disabled = false;

  const active = (status.engines ?? []).find((e: EngineStatus) => e.name === status.activeEngine);
  if (active && !active.available) {
    messageEl.textContent = `⚠ ${active.name} is not on PATH - a Clean will save tabs to the Inbox without notes. Pick an installed engine, or run install/install.sh.`;
    messageEl.className = "warn";
  }
}

void init().catch((e: Error) => {
  statusEl.textContent = e.message;
  statusEl.className = "error";
});
