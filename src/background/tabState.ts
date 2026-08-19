import type { SessionStore, TabState } from "../types";
import { HISTORY_CAP, PENDING_BYPASS_TTL_MS } from "../types";

const SESSION_KEY = "sessionStore";

export async function loadSessionStore(): Promise<SessionStore> {
  const result = await chrome.storage.session.get(SESSION_KEY);
  const store = result[SESSION_KEY] as SessionStore | undefined;
  return store ?? { tabStates: {}, pendingBypass: [] };
}

export async function saveSessionStore(store: SessionStore): Promise<void> {
  await chrome.storage.session.set({ [SESSION_KEY]: store });
}

export async function getTabState(tabId: number): Promise<TabState> {
  const store = await loadSessionStore();
  const existing = store.tabStates[tabId];
  if (existing) return existing;
  return {
    tabId,
    history: [],
    bypassRuleIds: [],
  };
}

export async function setTabState(state: TabState): Promise<void> {
  const store = await loadSessionStore();
  store.tabStates[state.tabId] = state;
  await saveSessionStore(store);
}

export async function deleteTabState(tabId: number): Promise<void> {
  const store = await loadSessionStore();
  delete store.tabStates[tabId];
  await saveSessionStore(store);
}

export async function replaceTabId(oldId: number, newId: number): Promise<void> {
  const store = await loadSessionStore();
  if (store.tabStates[oldId]) {
    const state = { ...store.tabStates[oldId], tabId: newId };
    store.tabStates[newId] = state;
    delete store.tabStates[oldId];
    await saveSessionStore(store);
  }
}

export function pushHistory(state: TabState, url: string): TabState {
  const history = [...state.history];
  if (history.length > 0 && history[history.length - 1] === url) {
    return state;
  }
  history.push(url);
  if (history.length > HISTORY_CAP) {
    history.splice(0, history.length - HISTORY_CAP);
  }
  return { ...state, history };
}

export function addBypass(state: TabState, ruleId: string): TabState {
  if (state.bypassRuleIds.includes(ruleId)) return state;
  return { ...state, bypassRuleIds: [...state.bypassRuleIds, ruleId] };
}

export async function addPendingBypass(
  entry: Omit<SessionStore["pendingBypass"][0], "at">,
): Promise<void> {
  const store = await loadSessionStore();
  store.pendingBypass.push({ ...entry, at: Date.now() });
  store.pendingBypass = store.pendingBypass.filter(
    (p) => Date.now() - p.at < PENDING_BYPASS_TTL_MS,
  );
  await saveSessionStore(store);
}

export async function consumePendingBypass(
  tabId: number,
  url: string,
  openerTabId?: number,
): Promise<string[]> {
  const store = await loadSessionStore();
  const now = Date.now();
  store.pendingBypass = store.pendingBypass.filter((p) => now - p.at < PENDING_BYPASS_TTL_MS);

  const match = store.pendingBypass.find(
    (p) =>
      p.url === url ||
      (p.tabId === tabId) ||
      (p.openerTabId !== undefined && p.openerTabId === openerTabId && p.url === url),
  );

  if (!match) return [];

  store.pendingBypass = store.pendingBypass.filter((p) => p !== match);
  await saveSessionStore(store);
  return match.ruleIds;
}

export async function clearBypassForRule(ruleId: string): Promise<void> {
  const store = await loadSessionStore();
  for (const tabId of Object.keys(store.tabStates)) {
    const state = store.tabStates[Number(tabId)];
    state.bypassRuleIds = state.bypassRuleIds.filter((id) => id !== ruleId);
  }
  await saveSessionStore(store);
}
