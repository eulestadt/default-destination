import {
  buildTabStatus,
  getSettings,
  handleNavigation,
  handleMessage,
  invalidateSettingsCache,
  openOriginalInTab,
  trackHostLeave,
  updatePausedBadge,
} from "./engineRunner";
import { hasHostPermission } from "./permissions";
import { deleteTabState, replaceTabId, addPendingBypass } from "./tabState";
import { ensureSeedOnInstall } from "../lib/settings";
import { findMatchingRule } from "../lib/match";

chrome.runtime.onInstalled.addListener(async () => {
  await ensureSeedOnInstall();
  invalidateSettingsCache();
  const settings = await getSettings();
  await updatePausedBadge(settings.paused);

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "open-original-tab",
      title: "Reload original page in this tab",
      contexts: ["page"],
    });
    chrome.contextMenus.create({
      id: "open-link-no-redirect",
      title: "Open link without redirect",
      contexts: ["link"],
    });
  });
});

chrome.runtime.onStartup.addListener(async () => {
  invalidateSettingsCache();
  const settings = await getSettings();
  await updatePausedBadge(settings.paused);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: String(err) }));
  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "open-original") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await openOriginalInTab(tab.id);
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "open-original-tab" && tab?.id) {
    await openOriginalInTab(tab.id);
  }
  if (info.menuItemId === "open-link-no-redirect" && info.linkUrl) {
    const settings = await getSettings();
    const rule = findMatchingRule(settings.rules, info.linkUrl);
    const ruleIds = rule ? [rule.id] : [];
    await addPendingBypass({
      url: info.linkUrl,
      openerTabId: tab?.id,
      ruleIds,
    });
    await chrome.tabs.create({ url: info.linkUrl });
  }
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  handleNavigation(details, "before");
});

chrome.webNavigation.onCommitted.addListener((details) => {
  handleNavigation(details, "committed");
  trackHostLeave(details.tabId, details.url);
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  handleNavigation(details, "history");
});

chrome.tabs.onRemoved.addListener((tabId) => {
  deleteTabState(tabId);
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  replaceTabId(removedTabId, addedTabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.url) {
    trackHostLeave(tabId, tab.url);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" || area === "local") {
    if (changes.settings) invalidateSettingsCache();
  }
});

export { hasHostPermission, buildTabStatus, getSettings };
