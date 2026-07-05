// Shared protocol types: Extension <-> Companion and page <-> background.

export interface CapturedTab {
  url: string;
  title: string;
  snippet?: string;
  windowId: number;
  index: number;
}

export interface ExcludedCount {
  byFile: number;
  byToggle: number;
  pinned: number;
}

export interface EngineStatus {
  name: string;
  enabled: boolean;
  available: boolean;
  models: string[];
}

export interface TopicCount {
  name: string;
  count: number;
  new: boolean;
}

export interface Receipt {
  cleanId: string;
  total: number;
  filed: number;
  inboxed: number;
  refreshed: number;
  excluded: ExcludedCount;
  topics: TopicCount[];
  engineError?: string;
  gitWarning?: string;
}

export interface Entry {
  title: string;
  url: string;
  note: string;
  captured: string;
  opened?: string;
  stale: boolean;
}

export interface ExploreTopic {
  name: string;
  entries: Entry[] | null;
}

export interface CompanionResponse {
  ok: boolean;
  error?: string;
  archivePath?: string;
  engines?: EngineStatus[];
  activeEngine?: string;
  activeModel?: string;
  latestClean?: string;
  domains?: string[];
  receipt?: Receipt;
  tabs?: CapturedTab[];
  topics?: ExploreTopic[];
  moved?: number;
  remaining?: number;
}

// Messages the popup/receipt/explore pages send to the background.
export type PageMessage =
  | { kind: "status" }
  | { kind: "clean" }
  | { kind: "undo"; cleanId: string }
  | { kind: "getReceipt"; cleanId: string }
  | { kind: "explore" }
  | { kind: "openEntry"; url: string }
  | { kind: "openAll"; urls: string[] }
  | { kind: "deleteEntry"; topic: string; url: string }
  | { kind: "deleteTopic"; topic: string }
  | { kind: "refile"; instruction: string }
  | { kind: "setEngine"; engine: string; model: string }
  | { kind: "toggleExclude"; tabId: number }
  | { kind: "isExcluded"; tabId: number }
  | { kind: "addIgnoreDomain"; domain: string }
  | { kind: "openExplore" };

export interface StoredReceipt {
  receipt: Receipt;
  undone: boolean;
  isLatest: boolean;
}

export const api: typeof chrome =
  (globalThis as { browser?: typeof chrome }).browser ?? chrome;

// Logo shown next to each engine in the picker (packaged under icons/).
export const ENGINE_LOGOS: Record<string, string> = {
  claude: "icons/claude.svg",
  codex: "icons/openai.svg",
  opencode: "icons/opencode.svg",
};

// Human-facing model names. The code name is always what's sent to the CLI;
// this map only changes what the user reads. Unknown codes fall back to a
// light prettifier so dynamically-discovered models still look reasonable.
const MODEL_NAMES: Record<string, string> = {
  "claude-sonnet-5": "Sonnet 5",
  "claude-fable-5": "Fable 5",
  "claude-opus-4-8": "Opus 4.8",
  "claude-opus-4-7": "Opus 4.7",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-opus-4-6": "Opus 4.6",
  "claude-opus-4-5-20251101": "Opus 4.5",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
  "claude-sonnet-4-5-20250929": "Sonnet 4.5",
  "gpt-5.5": "GPT-5.5",
  "gpt-5.4": "GPT-5.4",
  "gpt-5.4-mini": "GPT-5.4 Mini",
  "gpt-5.3-codex-spark": "GPT-5.3 Codex Spark (preview)",
};

export function displayModel(code: string): string {
  if (MODEL_NAMES[code]) return MODEL_NAMES[code];
  // claude-<tier>-<major>-<minor>[-date] -> "Tier major.minor"
  const claude = code.match(/^claude-([a-z]+)-(\d+)-(\d+)/i);
  if (claude) {
    const tier = claude[1][0].toUpperCase() + claude[1].slice(1);
    return `${tier} ${claude[2]}.${claude[3]}`;
  }
  if (/^gpt-/i.test(code)) {
    return code.replace(/^gpt-/i, "GPT-").replace(/-mini\b/i, " Mini");
  }
  return code;
}
