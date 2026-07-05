import { api, CompanionResponse, displayModel, EngineStatus, ENGINE_LOGOS, PageMessage } from "./types";

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

let engines: EngineStatus[] = [];
let activeEngine = "";

function renderEngines(active: string, activeModel: string) {
  activeEngine = active;
  engineList.innerHTML = "";
  for (const e of engines) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "engine-row" + (e.name === active ? " active" : "");
    row.disabled = !e.available || !e.enabled;

    const logo = ENGINE_LOGOS[e.name];
    if (logo) {
      const img = document.createElement("img");
      img.src = logo;
      row.appendChild(img);
    }

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = e.name;
    row.appendChild(name);

    if (!e.available) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "not installed";
      row.appendChild(tag);
    }

    const check = document.createElement("span");
    check.className = "check";
    check.textContent = "✓";
    row.appendChild(check);

    row.addEventListener("click", () => {
      if (row.disabled) return;
      activeEngine = e.name;
      renderEngines(e.name, e.models?.[0] ?? "");
      void applyEngineSelection();
    });
    engineList.appendChild(row);
  }
  renderModels(active, activeModel);
}

function renderModels(engineName: string, activeModel: string) {
  const eng = engines.find((e) => e.name === engineName);
  modelSel.innerHTML = "";
  const models = eng?.models ?? [];
  for (const m of models) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = displayModel(m);
    opt.selected = m === activeModel;
    modelSel.appendChild(opt);
  }
  if (models.length === 0) {
    const opt = document.createElement("option");
    opt.textContent = "(no models listed - edit config.json)";
    opt.disabled = true;
    modelSel.appendChild(opt);
  }
}

async function applyEngineSelection() {
  const resp = await send({ kind: "setEngine", engine: activeEngine, model: modelSel.value });
  messageEl.textContent = resp.ok
    ? `Set: ${activeEngine} / ${displayModel(resp.activeModel ?? modelSel.value)}`
    : resp.error ?? "Failed to set engine";
  messageEl.className = resp.ok ? "ok" : "error";
}

modelSel.addEventListener("change", () => void applyEngineSelection());

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

  const status = await send({ kind: "status" });
  if (!status.ok) {
    statusEl.textContent = status.error ?? "Companion unreachable";
    statusEl.className = "error";
    return;
  }
  statusEl.textContent = `Archive: ${status.archivePath}`;
  engines = status.engines ?? [];
  renderEngines(status.activeEngine ?? "", status.activeModel ?? "");
  cleanBtn.disabled = false;

  const active = engines.find((e) => e.name === status.activeEngine);
  if (active && !active.available) {
    messageEl.textContent = `⚠ ${active.name} is not on PATH - a Clean will save tabs to the Inbox without notes. Pick an installed engine, or run install/install.sh.`;
    messageEl.className = "warn";
  }
}

void init().catch((e: Error) => {
  statusEl.textContent = e.message;
  statusEl.className = "error";
});
