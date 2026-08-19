import type { RuleV1, SettingsV1 } from "../types";
import { validateRuleUrls } from "../lib/match";
import { wouldCauseRedirectLoop } from "../lib/engine";
import { requestHostPermissionForRule } from "../background/permissions";
import { recipeTemplate } from "../lib/settings";

let settings: SettingsV1;
let editingId: string | null = null;

const globalPaused = document.getElementById("global-paused") as HTMLInputElement;
const debugLogging = document.getElementById("debug-logging") as HTMLInputElement;
const storageNotice = document.getElementById("storage-notice")!;
const errorBanner = document.getElementById("error-banner")!;
const emptyState = document.getElementById("empty-state")!;
const rulesOverview = document.getElementById("rules-overview")!;
const editorPanel = document.getElementById("editor-panel")!;
const editorTitle = document.getElementById("editor-title")!;
const ruleForm = document.getElementById("rule-form") as HTMLFormElement;
const formErrors = document.getElementById("form-errors")!;
const deleteRuleBtn = document.getElementById("delete-rule-btn")!;
const importFile = document.getElementById("import-file") as HTMLInputElement;

const fields = {
  name: document.getElementById("rule-name") as HTMLInputElement,
  source: document.getElementById("rule-source") as HTMLInputElement,
  destination: document.getElementById("rule-destination") as HTMLInputElement,
  recipe: document.getElementById("recipe-select") as HTMLSelectElement,
  googleIndex: document.getElementById("google-index") as HTMLInputElement,
  matchMode: document.getElementById("match-mode") as HTMLSelectElement,
  destMode: document.getElementById("dest-mode") as HTMLSelectElement,
  preserveQuery: document.getElementById("preserve-query") as HTMLInputElement,
  preserveHash: document.getElementById("preserve-hash") as HTMLInputElement,
  enabled: document.getElementById("rule-enabled") as HTMLInputElement,
};

function showError(msg: string): void {
  errorBanner.textContent = msg;
  errorBanner.classList.remove("hidden");
}

function hideError(): void {
  errorBanner.classList.add("hidden");
}

function showFormErrors(errors: string[]): void {
  if (errors.length === 0) {
    formErrors.classList.add("hidden");
    return;
  }
  formErrors.innerHTML = errors.map((e) => `<div>${e}</div>`).join("");
  formErrors.classList.remove("hidden");
}

async function load(): Promise<void> {
  settings = (await chrome.runtime.sendMessage({ type: "GET_SETTINGS" })) as SettingsV1;
  globalPaused.checked = settings.paused;
  debugLogging.checked = settings.debugLogging;

  if (settings.storageArea === "local") {
    storageNotice.textContent =
      "Rules are stored only on this computer (sync quota exceeded or unavailable).";
    storageNotice.classList.remove("hidden");
  }

  renderRuleList();
}

function renderRuleList(): void {
  rulesOverview.innerHTML = "";
  const rules = settings.rules;

  if (rules.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const li = document.createElement("li");
    li.className = "rule-card";

    const head = document.createElement("div");
    head.className = "rule-card-head";

    const info = document.createElement("div");
    const h3 = document.createElement("h3");
    h3.textContent = rule.name;
    const pair = document.createElement("div");
    pair.className = "pair";
    pair.textContent = `${rule.source} → ${rule.destination}`;
    info.append(h3, pair);

    const badge = document.createElement("span");
    badge.className = `badge${rule.enabled ? "" : " off"}`;
    badge.textContent = rule.enabled ? "Enabled" : "Disabled";

    head.append(info, badge);
    li.appendChild(head);

    const actions = document.createElement("div");
    actions.className = "rule-card-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "secondary";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => openEditor(rule.id));

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "secondary";
    upBtn.textContent = "↑";
    upBtn.disabled = i === 0;
    upBtn.addEventListener("click", async () => {
      const r = settings.rules.splice(i, 1)[0];
      settings.rules.splice(i - 1, 0, r);
      await persistSettings();
    });

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "secondary";
    downBtn.textContent = "↓";
    downBtn.disabled = i === rules.length - 1;
    downBtn.addEventListener("click", async () => {
      const r = settings.rules.splice(i, 1)[0];
      settings.rules.splice(i + 1, 0, r);
      await persistSettings();
    });

    actions.append(editBtn, upBtn, downBtn);
    li.appendChild(actions);
    rulesOverview.appendChild(li);
  }
}

function openEditor(id: string | null, template?: RuleV1): void {
  editingId = id;
  editorPanel.classList.remove("hidden");
  showFormErrors([]);

  const rule =
    template ??
  (id ? settings.rules.find((r) => r.id === id) : null);

  if (!rule) {
    editorTitle.textContent = "New rule";
    deleteRuleBtn.classList.add("hidden");
    fields.name.value = "";
    fields.source.value = "https://example.com/";
    fields.destination.value = "https://example.com/";
    fields.recipe.value = "";
    fields.googleIndex.value = "1";
    fields.matchMode.value = "prefix";
    fields.destMode.value = "rewrite";
    fields.preserveQuery.checked = true;
    fields.preserveHash.checked = true;
    fields.enabled.checked = true;
    return;
  }

  editorTitle.textContent = id ? "Edit rule" : "New rule";
  deleteRuleBtn.classList.toggle("hidden", !id);

  fields.name.value = rule.name;
  fields.source.value = rule.source;
  fields.destination.value = rule.destination;
  fields.recipe.value = rule.recipeId ?? "";
  fields.googleIndex.value = String(rule.googleAccountIndex ?? 1);
  fields.matchMode.value = rule.matchMode;
  fields.destMode.value = rule.destMode;
  fields.preserveQuery.checked = rule.preserveQuery;
  fields.preserveHash.checked = rule.preserveHash;
  fields.enabled.checked = rule.enabled;
}

async function persistSettings(): Promise<void> {
  await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings });
  await load();
}

function buildRuleFromForm(): RuleV1 {
  const now = new Date().toISOString();
  const existing = editingId ? settings.rules.find((r) => r.id === editingId) : null;

  const recipeId = fields.recipe.value as RuleV1["recipeId"] | "";
  const rule: RuleV1 = {
    id: existing?.id ?? crypto.randomUUID(),
    name: fields.name.value.trim(),
    enabled: fields.enabled.checked,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    source: fields.source.value.trim(),
    destination: fields.destination.value.trim(),
    matchMode: fields.matchMode.value as RuleV1["matchMode"],
    destMode: fields.destMode.value as RuleV1["destMode"],
    preserveQuery: fields.preserveQuery.checked,
    preserveHash: fields.preserveHash.checked,
    excludePatterns: existing?.excludePatterns ?? [],
    bypass: existing?.bypass ?? {
      onBackForward: true,
      onSameOriginLink: true,
      onExplicitSourceTyped: true,
      onChooser: true,
      duration: "tab",
    },
  };

  if (recipeId) {
    rule.recipeId = recipeId;
    rule.googleAccountIndex = parseInt(fields.googleIndex.value, 10) || 1;
    rule.includeDefaultGoogleAccount = true;
    rule.chooserOrigins = ["https://accounts.google.com"];
    if (recipeId === "google-calendar-account") {
      rule.matchMode = "host";
      rule.destMode = "rewrite";
    }
  }

  return rule;
}

function validateBeforeSave(rule: RuleV1): string[] {
  const errors = validateRuleUrls(rule);
  if (!rule.name) errors.push("Name is required.");

  if (wouldCauseRedirectLoop([rule], rule.destination)) {
    errors.push("Destination would trigger another redirect — possible loop.");
  }

  return errors;
}

ruleForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError();
  const rule = buildRuleFromForm();
  const errors = validateBeforeSave(rule);
  if (errors.length) {
    showFormErrors(errors);
    return;
  }

  const granted = await requestHostPermissionForRule(rule);
  if (!granted) {
    rule.enabled = false;
    showError("Host permission denied. Rule saved as disabled.");
  }

  if (editingId) {
    const idx = settings.rules.findIndex((r) => r.id === editingId);
    if (idx >= 0) settings.rules[idx] = rule;
  } else {
    settings.rules.push(rule);
  }

  settings.paused = globalPaused.checked;
  settings.debugLogging = debugLogging.checked;
  await persistSettings();
  editorPanel.classList.add("hidden");
  editingId = null;
});

document.getElementById("add-rule-btn")!.addEventListener("click", () => openEditor(null));
document.getElementById("empty-add-btn")!.addEventListener("click", () => openEditor(null));
document.getElementById("cancel-edit-btn")!.addEventListener("click", () => {
  editorPanel.classList.add("hidden");
  editingId = null;
});

deleteRuleBtn.addEventListener("click", async () => {
  if (!editingId) return;
  settings.rules = settings.rules.filter((r) => r.id !== editingId);
  await persistSettings();
  editorPanel.classList.add("hidden");
  editingId = null;
});

globalPaused.addEventListener("change", async () => {
  settings.paused = globalPaused.checked;
  await persistSettings();
});

debugLogging.addEventListener("change", async () => {
  settings.debugLogging = debugLogging.checked;
  await persistSettings();
});

fields.recipe.addEventListener("change", () => {
  const v = fields.recipe.value;
  if (v === "google-calendar-account") {
    const t = recipeTemplate("google-calendar-account", "calendar.google.com", 1);
    fields.source.value = t.source;
    fields.destination.value = t.destination;
    fields.matchMode.value = "host";
    fields.destMode.value = "rewrite";
  }
});

document.getElementById("export-btn")!.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "default-destination-rules.json";
  a.click();
});

document.getElementById("import-btn")!.addEventListener("click", () => {
  importFile.click();
});

importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const imported = JSON.parse(text) as SettingsV1;
    if (!imported.rules) throw new Error("Invalid file");
    settings = { ...settings, rules: imported.rules };
    await persistSettings();
  } catch (err) {
    showError(`Import failed: ${err}`);
  }
  importFile.value = "";
});

load();
