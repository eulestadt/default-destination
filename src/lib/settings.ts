import Ajv from "ajv";
import addFormats from "ajv-formats";
import schema from "../../docs/rules.schema.json";
import type { RuleV1, SettingsV1 } from "../types";
import { DEFAULT_CHOOSER_ORIGINS } from "../types";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validateSettings = ajv.compile(schema);

const SETTINGS_KEY = "settings";
const SYNC_QUOTA = 8192;

const defaultBypass = () => ({
  onBackForward: true,
  onSameOriginLink: true,
  onExplicitSourceTyped: true,
  onChooser: true,
  duration: "tab" as const,
});

function createSeedRule(): RuleV1 {
  const now = new Date().toISOString();
  return {
    id: "seed-google-calendar-u1",
    name: "Work Google Calendar",
    enabled: true,
    createdAt: now,
    updatedAt: now,
    source: "https://calendar.google.com/",
    destination: "https://calendar.google.com/calendar/u/1",
    matchMode: "host",
    destMode: "rewrite",
    preserveQuery: true,
    preserveHash: true,
    recipeId: "google-calendar-account",
    googleAccountIndex: 1,
    includeDefaultGoogleAccount: true,
    chooserOrigins: [...DEFAULT_CHOOSER_ORIGINS],
    excludePatterns: [],
    bypass: defaultBypass(),
  };
}

export function defaultSettings(): SettingsV1 {
  return {
    schemaVersion: 1,
    paused: false,
    debugLogging: false,
    rules: [createSeedRule()],
    storageArea: "sync",
  };
}

export function validateSettingsObject(data: unknown): { valid: boolean; errors: string[] } {
  const valid = validateSettings(data);
  if (valid) return { valid: true, errors: [] };
  const errors = (validateSettings.errors ?? []).map(
    (e) => `${e.instancePath || "settings"} ${e.message ?? "invalid"}`,
  );
  return { valid: false, errors };
}

async function getStorageArea(settings?: SettingsV1): Promise<"sync" | "local"> {
  if (settings?.storageArea === "local") return "local";
  const sync = await chrome.storage.sync.get(SETTINGS_KEY);
  if (sync[SETTINGS_KEY]) return "sync";
  const local = await chrome.storage.local.get(SETTINGS_KEY);
  if (local[SETTINGS_KEY]?.storageArea === "local") return "local";
  return "sync";
}

export async function loadSettings(): Promise<SettingsV1> {
  let area: chrome.storage.AreaName = "sync";
  const syncResult = await chrome.storage.sync.get(SETTINGS_KEY);
  let raw = syncResult[SETTINGS_KEY];

  if (!raw) {
    const localResult = await chrome.storage.local.get(SETTINGS_KEY);
    raw = localResult[SETTINGS_KEY];
    if (raw) area = "local";
  }

  if (!raw) {
    const defaults = defaultSettings();
    await saveSettings(defaults);
    return defaults;
  }

  const parsed = raw as SettingsV1;
  const { valid } = validateSettingsObject(parsed);
  if (!valid) {
    const defaults = defaultSettings();
    await saveSettings(defaults);
    return defaults;
  }

  parsed.storageArea = area === "local" ? "local" : "sync";
  return parsed;
}

export async function saveSettings(settings: SettingsV1): Promise<void> {
  const { valid, errors } = validateSettingsObject(settings);
  if (!valid) {
    throw new Error(errors.join("; "));
  }

  const json = JSON.stringify(settings);
  const useSync = json.length < SYNC_QUOTA && settings.storageArea !== "local";

  try {
    if (useSync) {
      await chrome.storage.sync.set({ [SETTINGS_KEY]: { ...settings, storageArea: "sync" } });
      await chrome.storage.local.remove(SETTINGS_KEY);
      return;
    }
  } catch {
    /* fall through to local */
  }

  settings.storageArea = "local";
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function ensureSeedOnInstall(): Promise<void> {
  const sync = await chrome.storage.sync.get(SETTINGS_KEY);
  const local = await chrome.storage.local.get(SETTINGS_KEY);
  if (!sync[SETTINGS_KEY] && !local[SETTINGS_KEY]) {
    await saveSettings(defaultSettings());
  }
}

export function createEmptyRule(): RuleV1 {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: "New rule",
    enabled: true,
    createdAt: now,
    updatedAt: now,
    source: "https://example.com/",
    destination: "https://example.com/",
    matchMode: "prefix",
    destMode: "rewrite",
    preserveQuery: true,
    preserveHash: true,
    excludePatterns: [],
    bypass: defaultBypass(),
  };
}

export function recipeTemplate(recipeId: RuleV1["recipeId"], host: string, index = 1): RuleV1 {
  const rule = createEmptyRule();
  rule.recipeId = recipeId;
  rule.googleAccountIndex = index;
  rule.includeDefaultGoogleAccount = true;
  rule.chooserOrigins = [...DEFAULT_CHOOSER_ORIGINS];
  rule.matchMode = "host";
  rule.destMode = "rewrite";

  if (recipeId === "google-calendar-account") {
    rule.name = "Google Calendar";
    rule.source = "https://calendar.google.com/";
    rule.destination = `https://calendar.google.com/calendar/u/${index}`;
  } else {
    rule.name = `Google ${host}`;
    rule.source = `https://${host}/`;
    rule.destination = `https://${host}/u/${index}`;
  }

  return rule;
}
