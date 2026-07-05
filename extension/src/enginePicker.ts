// Shared engine/model picker used by both the popup and the Explore page, so
// the active Engine is one setting selected the same way everywhere. It fetches
// status, renders the engine rows + model dropdown, and persists changes to the
// Companion's config via setEngine.
import { api, CompanionResponse, displayModel, EngineStatus, ENGINE_LOGOS, PageMessage } from "./types";

function send<T = CompanionResponse>(msg: PageMessage): Promise<T> {
  return api.runtime.sendMessage(msg) as Promise<T>;
}

export interface EnginePicker {
  status: CompanionResponse;
  activeEngine: string;
  activeModel: string;
}

// Mounts the picker into the given elements. onChange fires after a selection
// is persisted, with the new engine/model.
export async function mountEnginePicker(
  listEl: HTMLElement,
  modelSel: HTMLSelectElement,
  onChange?: (engine: string, model: string) => void
): Promise<EnginePicker> {
  const status = await send({ kind: "status" });
  const engines: EngineStatus[] = status.engines ?? [];
  let activeEngine = status.activeEngine ?? "";
  let activeModel = status.activeModel ?? "";

  function renderModels(engineName: string, model: string) {
    const eng = engines.find((e) => e.name === engineName);
    const models = eng?.models ?? [];
    modelSel.replaceChildren();
    for (const m of models) {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = displayModel(m);
      opt.selected = m === model;
      modelSel.appendChild(opt);
    }
    if (models.length === 0) {
      const opt = document.createElement("option");
      opt.textContent = "(no models listed - edit config.json)";
      opt.disabled = true;
      modelSel.appendChild(opt);
    }
    activeModel = modelSel.value;
  }

  function renderEngines() {
    listEl.replaceChildren();
    for (const e of engines) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "engine-row" + (e.name === activeEngine ? " active" : "");
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
        renderEngines();
        renderModels(e.name, e.models?.[0] ?? "");
        void persist();
      });
      listEl.appendChild(row);
    }
  }

  async function persist() {
    const resp = await send({ kind: "setEngine", engine: activeEngine, model: modelSel.value });
    if (resp.ok) {
      activeModel = resp.activeModel ?? modelSel.value;
      onChange?.(activeEngine, activeModel);
    }
  }

  modelSel.addEventListener("change", () => void persist());

  renderEngines();
  renderModels(activeEngine, activeModel);

  return { status, activeEngine, activeModel };
}
