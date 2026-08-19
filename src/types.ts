export type MatchMode = "prefix" | "exact" | "host" | "wildcard" | "regex";
export type DestMode = "rewrite" | "fixed";
export type BypassDuration = "navigation" | "tab" | "session";

export type Intent =
  | "enter"
  | "back_forward"
  | "same_origin_nav"
  | "chooser"
  | "explicit_source"
  | "our_redirect"
  | "reload"
  | "unknown";

export interface RuleV1 {
  id: string;
  name: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  source: string;
  destination: string;
  matchMode: MatchMode;
  destMode: DestMode;
  preserveQuery: boolean;
  preserveHash: boolean;
  recipeId?: "google-calendar-account" | "google-workspace-account";
  googleAccountIndex?: number;
  includeDefaultGoogleAccount?: boolean;
  chooserOrigins?: string[];
  excludePatterns: string[];
  bypass: {
    onBackForward: boolean;
    onSameOriginLink: boolean;
    onExplicitSourceTyped: boolean;
    onChooser: boolean;
    duration: BypassDuration;
  };
}

export interface SettingsV1 {
  schemaVersion: 1;
  paused: boolean;
  debugLogging: boolean;
  rules: RuleV1[];
  storageArea?: "sync" | "local";
}

export interface TabState {
  tabId: number;
  history: string[];
  lastTransition?: {
    type: string;
    qualifiers: string[];
    at: number;
  };
  bypassRuleIds: string[];
  lastRedirect?: { ruleId: string; from: string; to: string; at: number };
  entryChain?: { ruleId: string; startedAt: number; entryUrl: string };
  leftHostsAt?: number;
}

export interface SessionStore {
  tabStates: Record<number, TabState>;
  pendingBypass: Array<{
    tabId?: number;
    url: string;
    openerTabId?: number;
    ruleIds: string[];
    at: number;
  }>;
}

export type Msg =
  | { type: "GET_STATUS"; tabId: number }
  | { type: "SET_PAUSED"; paused: boolean }
  | { type: "TOGGLE_RULE"; id: string; enabled: boolean }
  | { type: "OPEN_ORIGINAL"; tabId: number }
  | { type: "SAVE_SETTINGS"; settings: SettingsV1 }
  | { type: "REQUEST_HOST"; origin: string }
  | { type: "GET_SETTINGS" };

export interface TabStatus {
  url: string;
  paused: boolean;
  permissionGranted: boolean;
  matchingRule: RuleV1 | null;
  status:
    | "no_rule"
    | "would_redirect"
    | "bypassed"
    | "on_destination"
    | "permission_missing";
  bypassed: boolean;
}

export interface ClassifyIntentInput {
  previousUrl: string | null;
  url: string;
  transitionType: string;
  transitionQualifiers: string[];
  lastRedirect: { from: string; to: string; at?: number } | null;
  entryChain?: { entryUrl: string; startedAt: number; ruleId?: string };
  chooserOrigins?: string[];
  recipeId?: RuleV1["recipeId"];
  sourceUrl?: string;
  now?: number;
  withinMs?: number;
}

export interface ShouldRedirectInput {
  paused: boolean;
  rule: RuleV1;
  url: string;
  intent: Intent;
  bypassRuleIds: string[];
  lastRedirect?: { ruleId: string; from: string; to: string; at: number };
  allRules: RuleV1[];
  now?: number;
}

export const DEFAULT_CHOOSER_ORIGINS = ["https://accounts.google.com"];
export const HISTORY_CAP = 20;
export const LOOP_GUARD_MS = 1000;
export const OUR_REDIRECT_MS = 2000;
export const PENDING_BYPASS_TTL_MS = 5000;
export const LEFT_HOSTS_CLEAR_MS = 30000;
