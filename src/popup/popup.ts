import type { TabStatus } from "../types";

const pausedToggle = document.getElementById("paused-toggle") as HTMLInputElement;
const pausedLabel = document.getElementById("paused-label")!;
const statusText = document.getElementById("status-text")!;
const urlText = document.getElementById("url-text")!;
const openOriginalBtn = document.getElementById("open-original") as HTMLButtonElement;
const openOptionsBtn = document.getElementById("open-options")!;
const ruleList = document.getElementById("rule-list")!;
const noRules = document.getElementById("no-rules")!;
const addRuleCta = document.getElementById("add-rule-cta")!;

function statusLabel(status: TabStatus): string {
  if (status.paused) return "Redirects paused globally";
  switch (status.status) {
    case "no_rule":
      return "No matching rule for this page";
    case "would_redirect":
      return "Would redirect on entry";
    case "bypassed":
      return "Bypassed for this tab — original page allowed";
    case "on_destination":
      return "Already on your default destination";
    case "permission_missing":
      return "Permission missing for this site";
    default:
      return "Unknown status";
  }
}

async function refresh(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  const settings = (await chrome.runtime.sendMessage({ type: "GET_SETTINGS" })) as {
    paused: boolean;
    rules: Array<{ id: string; name: string; enabled: boolean }>;
  };

  pausedToggle.checked = !settings.paused;
  pausedLabel.textContent = settings.paused ? "Redirects paused" : "Redirects active";

  const status = (await chrome.runtime.sendMessage({
    type: "GET_STATUS",
    tabId: tab.id,
  })) as TabStatus;

  statusText.textContent = statusLabel(status);
  urlText.textContent = status.url || "No URL";

  openOriginalBtn.disabled = !status.matchingRule || status.paused;
  if (status.matchingRule) {
    openOriginalBtn.title = `Open ${status.matchingRule.source}`;
  }

  ruleList.innerHTML = "";
  const rules = settings.rules ?? [];
  if (rules.length === 0) {
    noRules.classList.remove("hidden");
  } else {
    noRules.classList.add("hidden");
    for (const rule of rules) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "rule-name";
      name.textContent = rule.name;
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = rule.enabled;
      toggle.title = "Enable rule";
      toggle.addEventListener("change", async () => {
        await chrome.runtime.sendMessage({
          type: "TOGGLE_RULE",
          id: rule.id,
          enabled: toggle.checked,
        });
        await refresh();
      });
      li.append(name, toggle);
      ruleList.appendChild(li);
    }
  }
}

pausedToggle.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({
    type: "SET_PAUSED",
    paused: !pausedToggle.checked,
  });
  await refresh();
});

openOriginalBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  await chrome.runtime.sendMessage({ type: "OPEN_ORIGINAL", tabId: tab.id });
  window.close();
});

openOptionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

addRuleCta.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

refresh();
