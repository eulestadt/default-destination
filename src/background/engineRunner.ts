import type { Intent, Msg, RuleV1, SettingsV1, TabStatus } from "../types";
import { LEFT_HOSTS_CLEAR_MS } from "../types";
import { intentForEarlyNavigate, shouldRedirect, shouldRedirectOnReload } from "../lib/engine";
import { classifyIntent, shouldSetBypassForIntent } from "../lib/intent";
import { findMatchingRule, ruleMatchesUrl } from "../lib/match";
import { computeDestination } from "../lib/rewrite";
import { loadSettings, saveSettings } from "../lib/settings";
import { getOrigin, isNavigableHttpUrl } from "../lib/urlUtils";
import { hasHostPermission } from "./permissions";
import {
  addBypass,
  addPendingBypass,
  consumePendingBypass,
  getTabState,
  pushHistory,
  setTabState,
} from "./tabState";

let settingsCache: SettingsV1 | null = null;

export async function getSettings(): Promise<SettingsV1> {
  if (!settingsCache) settingsCache = await loadSettings();
  return settingsCache;
}

export function invalidateSettingsCache(): void {
  settingsCache = null;
}

function log(...args: unknown[]): void {
  getSettings().then((s) => {
    if (s.debugLogging) console.log("[Default Destination]", ...args);
  });
}

async function performRedirect(
  tabId: number,
  rule: RuleV1,
  fromUrl: string,
  toUrl: string,
  state: Awaited<ReturnType<typeof getTabState>>,
): Promise<void> {
  const now = Date.now();
  const newState = {
    ...state,
    lastRedirect: { ruleId: rule.id, from: fromUrl, to: toUrl, at: now },
    entryChain: { ruleId: rule.id, startedAt: now, entryUrl: fromUrl },
  };
  await setTabState(newState);
  log("redirect", tabId, fromUrl, "→", toUrl);
  await chrome.tabs.update(tabId, { url: toUrl });
  await showRedirectBadge();
}

async function showRedirectBadge(): Promise<void> {
  try {
    await chrome.action.setBadgeText({ text: "→" });
    await chrome.action.setBadgeBackgroundColor({ color: "#4285F4" });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: "" });
    }, 2000);
  } catch {
    /* ignore */
  }
}

export async function updatePausedBadge(paused: boolean): Promise<void> {
  try {
    if (paused) {
      await chrome.action.setBadgeText({ text: "P" });
      await chrome.action.setBadgeBackgroundColor({ color: "#9AA0A6" });
    } else {
      const s = await getSettings();
      if (!s.paused) await chrome.action.setBadgeText({ text: "" });
    }
  } catch {
    /* ignore */
  }
}

export async function handleNavigation(
  details: chrome.webNavigation.WebNavigationParentedCallbackDetails,
  phase: "before" | "committed" | "history",
): Promise<void> {
  if (details.frameId !== 0) return;
  if (!isNavigableHttpUrl(details.url)) return;

  const settings = await getSettings();
  let state = await getTabState(details.tabId);

  const pendingBypass = await consumePendingBypass(details.tabId, details.url);
  if (pendingBypass.length > 0) {
    for (const id of pendingBypass) {
      state = addBypass(state, id);
    }
    await setTabState(state);
  }

  const rule = findMatchingRule(settings.rules, details.url);

  if (phase === "committed" || phase === "history") {
    state = pushHistory(state, details.url);
    if (details.transitionType) {
      state = {
        ...state,
        lastTransition: {
          type: details.transitionType,
          qualifiers: details.transitionQualifiers ?? [],
          at: Date.now(),
        },
      };
    }
    await setTabState(state);
  }

  if (!rule) return;

  const permitted = await hasHostPermission(details.url);
  if (!permitted) return;

  const previousUrl = state.history.length >= 2 ? state.history[state.history.length - 2] : null;

  let intent: Intent;
  if (phase === "before") {
    const early = intentForEarlyNavigate(
      state.history,
      details.url,
      state.lastRedirect,
    );
    if (early === "our_redirect") return;
    if (early === "tentative_back") {
      state = addBypass(state, rule.id);
      await setTabState(state);
      return;
    }
    if (state.bypassRuleIds.includes(rule.id) || settings.paused) return;
    if (early === "enter" && state.history.length <= 1) {
      const dest = computeDestination(rule, details.url, "enter");
      if (dest) {
        const check = shouldRedirect({
          paused: settings.paused,
          rule,
          url: details.url,
          intent: "enter",
          bypassRuleIds: state.bypassRuleIds,
          lastRedirect: state.lastRedirect,
          allRules: settings.rules,
        });
        if (check.redirect && check.destination) {
          await performRedirect(details.tabId, rule, details.url, check.destination, state);
        }
      }
    }
    return;
  }

  intent = classifyIntent({
    previousUrl,
    url: details.url,
    transitionType: details.transitionType ?? "unknown",
    transitionQualifiers: details.transitionQualifiers ?? [],
    lastRedirect: state.lastRedirect
      ? { from: state.lastRedirect.from, to: state.lastRedirect.to, at: state.lastRedirect.at }
      : null,
    entryChain: state.entryChain
      ? {
          entryUrl: state.entryChain.entryUrl,
          startedAt: state.entryChain.startedAt,
          ruleId: state.entryChain.ruleId,
        }
      : undefined,
    chooserOrigins: rule.chooserOrigins,
    recipeId: rule.recipeId,
    sourceUrl: rule.source,
  });

  log("intent", details.tabId, intent, details.url);

  const hadLastRedirect =
    state.lastRedirect?.ruleId === rule.id &&
    Date.now() - state.lastRedirect.at < 60000;

  if (
    shouldSetBypassForIntent(
      intent,
      rule,
      ruleMatchesUrl(rule, details.url),
      hadLastRedirect,
    )
  ) {
    state = addBypass(state, rule.id);
    await setTabState(state);
    return;
  }

  if (intent === "reload") {
    const reloadCheck = shouldRedirectOnReload(
      settings.paused,
      rule,
      details.url,
      state.bypassRuleIds,
      settings.rules,
    );
    if (reloadCheck.redirect && reloadCheck.destination) {
      await performRedirect(details.tabId, rule, details.url, reloadCheck.destination, state);
    }
    return;
  }

  if (intent === "our_redirect") return;

  const check = shouldRedirect({
    paused: settings.paused,
    rule,
    url: details.url,
    intent,
    bypassRuleIds: state.bypassRuleIds,
    lastRedirect: state.lastRedirect,
    allRules: settings.rules,
  });

  if (check.redirect && check.destination) {
    await performRedirect(details.tabId, rule, details.url, check.destination, state);
  }
}

export async function openOriginalInTab(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  const url = tab.url;
  if (!url || !isNavigableHttpUrl(url)) return;

  const settings = await getSettings();
  const rule = findMatchingRule(settings.rules, url);
  if (!rule) return;

  let state = await getTabState(tabId);
  state = addBypass(state, rule.id);
  await setTabState(state);

  const target = rule.source;
  await chrome.tabs.update(tabId, { url: target });
}

export async function buildTabStatus(tabId: number): Promise<TabStatus> {
  const settings = await getSettings();
  const tab = await chrome.tabs.get(tabId);
  const url = tab.url ?? "";
  const state = await getTabState(tabId);

  if (!url || !isNavigableHttpUrl(url)) {
    return {
      url,
      paused: settings.paused,
      permissionGranted: true,
      matchingRule: null,
      status: "no_rule",
      bypassed: false,
    };
  }

  const rule = findMatchingRule(settings.rules, url);
  if (!rule) {
    return {
      url,
      paused: settings.paused,
      permissionGranted: true,
      matchingRule: null,
      status: "no_rule",
      bypassed: false,
    };
  }

  const permitted = await hasHostPermission(url);
  if (!permitted) {
    return {
      url,
      paused: settings.paused,
      permissionGranted: false,
      matchingRule: rule,
      status: "permission_missing",
      bypassed: state.bypassRuleIds.includes(rule.id),
    };
  }

  const bypassed = state.bypassRuleIds.includes(rule.id);
  const dest = computeDestination(rule, url, "enter");

  let status: TabStatus["status"] = "no_rule";
  if (bypassed) status = "bypassed";
  else if (!dest) status = "on_destination";
  else if (!settings.paused && rule.enabled) status = "would_redirect";
  else status = "on_destination";

  return {
    url,
    paused: settings.paused,
    permissionGranted: true,
    matchingRule: rule,
    status,
    bypassed,
  };
}

export async function handleMessage(msg: Msg): Promise<unknown> {
  switch (msg.type) {
    case "GET_SETTINGS":
      return await getSettings();
    case "GET_STATUS":
      return await buildTabStatus(msg.tabId);
    case "SET_PAUSED": {
      const settings = await getSettings();
      settings.paused = msg.paused;
      await saveSettings(settings);
      invalidateSettingsCache();
      await updatePausedBadge(msg.paused);
      return { ok: true };
    }
    case "TOGGLE_RULE": {
      const settings = await getSettings();
      const rule = settings.rules.find((r) => r.id === msg.id);
      if (rule) {
        rule.enabled = msg.enabled;
        rule.updatedAt = new Date().toISOString();
        await saveSettings(settings);
        invalidateSettingsCache();
      }
      return { ok: true };
    }
    case "OPEN_ORIGINAL":
      await openOriginalInTab(msg.tabId);
      return { ok: true };
    case "SAVE_SETTINGS": {
      await saveSettings(msg.settings);
      invalidateSettingsCache();
      await updatePausedBadge(msg.settings.paused);
      return { ok: true };
    }
    case "REQUEST_HOST":
      return { granted: await hasHostPermission(msg.origin) };
    default:
      return { ok: false };
  }
}

export async function trackHostLeave(tabId: number, url: string): Promise<void> {
  const settings = await getSettings();
  const state = await getTabState(tabId);
  const origin = getOrigin(url);
  if (!origin) return;

  const ruleHosts = new Set<string>();
  for (const rule of settings.rules) {
    try {
      ruleHosts.add(new URL(rule.source).origin);
      ruleHosts.add(new URL(rule.destination).origin);
    } catch {
      /* skip */
    }
  }

  const onRuleHost = ruleHosts.has(origin);
  if (!onRuleHost) {
    const updated = { ...state, leftHostsAt: Date.now() };
    await setTabState(updated);

    if (state.leftHostsAt && Date.now() - state.leftHostsAt > LEFT_HOSTS_CLEAR_MS) {
      await setTabState({ ...updated, bypassRuleIds: [] });
    }
  }
}
