// Native messaging port to the Companion, with a sequential request queue:
// the Companion answers requests in order, so we correlate by order.
import { api, CompanionResponse } from "./types";

const HOST = "com.kjalba.tabwiki";

let port: chrome.runtime.Port | null = null;
let pending: Array<{
  resolve: (r: CompanionResponse) => void;
  reject: (e: Error) => void;
}> = [];

function connect(): chrome.runtime.Port {
  if (port) return port;
  port = api.runtime.connectNative(HOST);
  port.onMessage.addListener((msg: CompanionResponse) => {
    pending.shift()?.resolve(msg);
  });
  port.onDisconnect.addListener(() => {
    const err = new Error(
      api.runtime.lastError?.message ??
        "Companion disconnected - is tab-wiki-companion installed? (run install/install.sh)"
    );
    for (const p of pending) p.reject(err);
    pending = [];
    port = null;
  });
  return port;
}

export function companion(request: Record<string, unknown>): Promise<CompanionResponse> {
  return new Promise((resolve, reject) => {
    try {
      const p = connect();
      pending.push({ resolve, reject });
      p.postMessage(request);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

export async function companionOk(request: Record<string, unknown>): Promise<CompanionResponse> {
  const resp = await companion(request);
  if (!resp.ok) throw new Error(resp.error ?? "Companion reported an unknown error");
  return resp;
}
