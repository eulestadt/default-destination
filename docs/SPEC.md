# Default Destination — Product & Technical Spec

**Status:** Spec only. Do **not** implement the Chrome extension in the spec pass.  
**Audience:** Composer (or any implementer) building the extension in a follow-up run.  
**Primary example:** `https://calendar.google.com/` → `https://calendar.google.com/calendar/u/1`

This document is the source of truth. If a later brief disagrees with this file, **this file wins**.

---

## 1. Problem

The user often types or otherwise *enters* a URL they do not actually want as the landing page. They want a **default destination** instead.

Canonical case: Google Calendar.

- They enter `https://calendar.google.com/` (Google’s default account slot, usually `/u/0`).
- They actually want `https://calendar.google.com/calendar/u/1` (account index 1 — for them, the real primary).
- They still need a way to use the original URL / original account when they **mean** to: Back button, account switcher, or an explicit “open original” action.

This must be a **generic redirect-rule engine**, not a Calendar-only hack. The same machinery will later map other sites (including first-party properties).

---

## 2. Goals

1. When the user **enters** a configured source URL, automatically send them to the configured destination (no extra click).
2. When the user **intentionally** returns to the source (Back, in-page account switch, “open original”), **do not** bounce them again.
3. Users can add, edit, disable, and delete multiple rules for arbitrary http(s) sites.
4. Deep links survive: a Calendar event URL should land on account `u/1` **without** dropping path/query.
5. Manifest V3, loadable as unpacked for development. No backend, no account system, no analytics.

## 3. Non-goals (this version)

- Syncing rules across browsers via a vendor account.
- Stable Google account identity (email / GAIA id). Google’s `/u/N` index is session order, not a stable user id. Document that limitation in the Options UI.
- Muting other extensions’ redirects.
- Firefox / Safari.
- Blocking ads, cookies, or trackers.
- A public Web Store listing (code should not make listing *impossible*, but store assets and a privacy-policy host are out of scope).

---

## 4. Design principles

1. **Intent over URL.** The same URL can mean “send me to my default” or “I want this exact page.” Classify the navigation, then decide.
2. **Do not use `declarativeNetRequest` as the redirect engine.** DNR cannot see Back vs typed vs account-switcher. It will trap the user on the destination. See §8.1.
3. **Service worker memory is not storage.** Chrome MV3 workers die. All bypass/history state that must survive a worker restart goes in `chrome.storage.session` (tab-scoped flags) or `chrome.storage.local` / `sync` (rules).
4. **Main frame only.** Never redirect iframes (`frameId === 0` only).
5. **Loop-proof.** Destination URLs that also match a source must not redirect. A redirect the extension just performed must not retrigger.
6. **Optional hosts.** Do not ship `<all_urls>` as a required permission. Use optional host permissions granted when a rule is saved.

---

## 5. User stories

| ID | Story | Acceptance sketch |
|----|--------|-------------------|
| S1 | As a user, I type `calendar.google.com` and land on `/calendar/u/1` without clicking anything. | Omnibox / typed entry on the seed rule redirects before I work on the wrong account. |
| S2 | As a user, I hit Back after an auto-redirect and remain on the original Calendar (account 0 / default). | Back does not immediately send me to `u/1` again. |
| S3 | As a user, I am on `u/1` and switch to the other Google account in the avatar picker. I stay on `u/0`. | Same-origin (or Google account-chooser) navigation is treated as intent. |
| S4 | As a user, I open a Calendar event link from mail/chat. I get that event on `u/1`, not the Calendar home. | Rewrite, don’t replace with a bare destination URL. |
| S5 | As a user, I add a rule `https://app.example.com/` → `https://app.example.com/team/acme`. | Saving the rule requests host permission and the engine honors it. |
| S6 | As a user, I can pause all redirects, or open the original once from the toolbar. | Escape hatches work even if intent detection is wrong. |
| S7 | As a user, I type `calendar.google.com/calendar/u/0` on purpose. | Explicit `/u/0` from the address bar is original-intent; do **not** rewrite. (See §9.3.) |

---

## 6. UX

### 6.1 Surfaces

| Surface | Role |
|---------|------|
| Toolbar icon | Pause/resume, “open original this tab”, whether the current tab matches a rule, last redirect (if any). |
| Popup | Compact controls. Not the rule editor. |
| Options page | Full rule CRUD, advanced match/rewrite, recipes, import/export JSON, diagnostics toggle. |
| Context menu | “Open link without redirect” (links) and “Reload original this tab”. |
| Command | Keyboard shortcut: **Open original in this tab** (suggested default: `Alt+Shift+O`). |

Copy must be real and specific. No lorem. Empty / loading / error states are required on Options (no rules; permission denied; invalid URL).

### 6.2 Popup contents

- Global toggle: **Redirects active** / **Paused**.
- Current tab status: `No matching rule` | `Would redirect` | `Bypassed this tab` | `Already on destination` | `Permission missing`.
- Primary button: **Open original this tab** (enabled only if a rule matches this tab’s site). Sets bypass, then navigates to the rule’s **original entry URL** (the configured source, not a guessed `/u/0` unless the source is that URL).
- Secondary: **Open Options**.
- List of enabled rule names with per-rule on/off switches (small). If there are zero rules, CTA to Options: “Add a site pair”.

### 6.3 Options — rule editor fields

Required:

- Name
- Enabled
- Source URL (what they “enter”)
- Destination URL (where they should land)

Advanced (collapsed by default):

- Match mode: `prefix` (default) | `exact` | `host` | `wildcard` (`*` in path) | `regex` (trusted users only; validate compile)
- Destination mode: `rewrite` (default for Calendar recipe) | `fixed`
- Preserve query string (default on)
- Preserve hash (default on)
- Also treat `/u/0` as source (Google recipe only — see §9)
- Bypass policy: see §8.4
- Notes (optional, user text)

Validation errors inline: invalid URL, source equals destination, destination still matches source, regex that doesn’t compile, missing host permission.

### 6.4 Default seed rule

On first install, insert one enabled rule (do not overwrite if the user already has rules):

- **Name:** Work Google Calendar  
- **Source:** `https://calendar.google.com/`  
- **Destination:** `https://calendar.google.com/calendar/u/1`  
- **Match mode:** `host` on `calendar.google.com` with the Google Calendar rewriter in §9  
- **Destination mode:** `rewrite`  
- **Recipe id:** `google-calendar-account`

### 6.5 Visual language

Keep the UI small and native-adjacent (system font stack, light + dark via `prefers-color-scheme`). Do **not** pull Next.js, shadcn, or a marketing landing page. This is an extension, not a web app.

Toolbar badge: show `⏸` or `P` when globally paused. Briefly show `→` after a successful auto-redirect (clear after ~2s).

---

## 7. Data model

### 7.1 Rule (`RuleV1`)

```ts
type MatchMode = "prefix" | "exact" | "host" | "wildcard" | "regex";
type DestMode = "rewrite" | "fixed";
type BypassDuration = "navigation" | "tab" | "session";

interface RuleV1 {
  id: string;                 // crypto.randomUUID()
  name: string;
  enabled: boolean;
  createdAt: string;          // ISO
  updatedAt: string;

  source: string;             // canonical absolute URL the user typed in the form
  destination: string;        // canonical absolute URL

  matchMode: MatchMode;
  destMode: DestMode;

  preserveQuery: boolean;     // default true
  preserveHash: boolean;      // default true

  /** If set, use a built-in rewriter instead of naive prefix replace. */
  recipeId?: "google-calendar-account" | "google-workspace-account";

  /**
   * For google-* recipes: which /u/N to land on.
   * Parsed from destination when possible; default 1.
   */
  googleAccountIndex?: number;

  /**
   * Extra match: treat this host’s /u/0 (and missing /u/N) as the source.
   * Default true for google-* recipes.
   */
  includeDefaultGoogleAccount?: boolean;

  /** Origins that count as “user is choosing an account” — never rewrite. */
  chooserOrigins?: string[];  // default ["https://accounts.google.com"]

  bypass: {
    onBackForward: boolean;          // default true
    onSameOriginLink: boolean;       // default true
    onExplicitSourceTyped: boolean;  // default true — address bar exact original /u/0
    onChooser: boolean;              // default true
    duration: BypassDuration;        // default "tab"
  };

  /** Optional regex or wildcard exclude, e.g. already on dest. */
  excludePatterns: string[];
}
```

JSON Schema: [`rules.schema.json`](./rules.schema.json). Implementers MUST validate on read and on save.

### 7.2 Settings

```ts
interface SettingsV1 {
  schemaVersion: 1;
  paused: boolean;             // global kill switch
  debugLogging: boolean;
  rules: RuleV1[];
}
```

Storage:

| Key | Area | Contents |
|-----|------|----------|
| `settings` | `chrome.storage.sync` if it fits (~100KB); else `local` with a one-time migrate | `SettingsV1` |
| `tabState` | `chrome.storage.session` | map of `tabId` → `TabState` |
| `pendingPermission` | `session` | rule draft waiting on `request()` |

If `sync` write fails (`QUOTA_BYTES_PER_ITEM`), fall back to `local` and show a non-blocking Options note: “Rules are stored only on this computer.”

### 7.3 Tab state

```ts
interface TabState {
  tabId: number;
  history: string[];          // last N main-frame URLs, cap 20
  lastTransition?: {
    type: string;
    qualifiers: string[];
    at: number;
  };
  /** Rule ids that must not auto-redirect this tab until duration expires. */
  bypassRuleIds: string[];
  /** Prevent redirect loops in one chain. */
  lastRedirect?: { ruleId: string; from: string; to: string; at: number };
  /** The current chain started with a user “entry” navigation. */
  entryChain?: { ruleId: string; startedAt: number; entryUrl: string };
}
```

Drop `tabState[tabId]` on `tabs.onRemoved`. Cap `history` at 20.

---

## 8. Navigation engine (core)

This is the hard part. Get this wrong and the extension is useless.

### 8.1 Why not `declarativeNetRequest`

DNR redirects run **before** Chrome exposes `transitionType`. Effects:

- Back from destination → source is immediately redirected again (trap).
- Avatar account switch to `/u/0` is immediately redirected again.
- The user cannot “enter” the original page without a separate DNR exception, which cannot be inferred from Back.

DNR is allowed only as a **future optional “instant mode”** per rule, documented as breaking Back/switcher. **Do not implement instant mode in v1.**

v1 engine: `chrome.webNavigation` + `chrome.tabs.update`.

### 8.2 Events to subscribe to

| Event | Use |
|-------|-----|
| `webNavigation.onBeforeNavigate` | Early redirect when intent is already known (typed/bookmark/entry chain, not bypassed). Main frame only. |
| `webNavigation.onCommitted` | Authoritative `transitionType` + `transitionQualifiers`. Correct bypass for Back. Catch Google’s follow-up `/u/0` redirect in an entry chain. |
| `webNavigation.onHistoryStateUpdated` | SPA URL changes (rare for Calendar, required for generic sites). |
| `tabs.onRemoved` | GC session state. |
| `tabs.onReplaced` | Adopt tab id (prerender / instant). |
| `webNavigation.onCreatedNavigationTarget` | New tab/window from a link: inherit *no* bypass from opener (new tab is a fresh entry), unless the context-menu bypass flag is set. |

Ignore `frameId !== 0`. Ignore `chrome://`, `edge://`, `devtools://`, `about:`.

### 8.3 Intent classification

Compute `Intent` for each main-frame navigation:

```ts
type Intent =
  | "enter"             // user is arriving at the site from outside / omnibox / bookmark
  | "back_forward"      // history Back or Forward
  | "same_origin_nav"   // in-app link, account switcher, SPA
  | "chooser"           // came from accounts.google.com (or rule.chooserOrigins)
  | "explicit_source"   // typed/bookmarked the original URL in a way that means “I want this”
  | "our_redirect"      // we just issued tabs.update to the destination
  | "reload"            // reload of current page
  | "unknown";
```

**Authoritative signals (onCommitted):**

- `transitionQualifiers` contains `forward_back` → `back_forward`
- `transitionType` is `back_forward` → `back_forward`
- `transitionType` is `typed` | `generated` | `auto_bookmark` | `keyword` | `keyword_generated` → start with `enter`, then maybe upgrade to `explicit_source` (§8.3.1)
- `transitionType` is `reload` → `reload`
- `transitionType` is `link` or `form_submit`:
  - previous main-frame URL (from `TabState.history`) is same origin as the new URL → `same_origin_nav`
  - previous origin is in `chooserOrigins` → `chooser`
  - otherwise → `enter`
- `transitionQualifiers` contains `client_redirect` or `server_redirect`:
  - if `entryChain` is active for a matching rule and the new URL still matches that rule’s source → treat as **continuation of `enter`**
  - else do not start a new redirect (follow the site)

**Early signals (onBeforeNavigate):** `onBeforeNavigate` has **no** transition type. Infer:

1. If `tabState.lastRedirect.to === details.url` and `now - lastRedirect.at < 2000ms` → `our_redirect` (no-op).
2. If `details.url === history[history.length - 2]` (going to the previous URL) → tentatively `back_forward`. Prefer not to redirect; let `onCommitted` confirm.
3. If `bypassRuleIds` includes the matching rule → no redirect.
4. If global `paused` → no redirect.
5. Otherwise, if the URL matches a source and does **not** match destination, **redirect immediately** only when the previous committed transition for this tab was an `enter` that has not completed, **or** when there is no history (new tab) and the URL looks like a source entry (new tab with source URL is `enter`).

New tab + source URL: **always `enter`** unless the open came from the extension’s own “open original” API (pass a bypass token in session keyed by tabId, set in `tabs.onCreated`).

#### 8.3.1 `explicit_source`

The user typed or bookmarked a URL that is **more specific than the site root** and identifies the original account/page:

- For the Calendar recipe: path contains `/u/0` (with `/u/0` as a path segment, not a substring of something else) **and** `transitionType` is `typed` | `auto_bookmark` | `generated`.
- For generic `prefix` rules: the URL equals the configured `source` (after canonicalization) **and** it is not a mere host/root enter. Root enter (`https://calendar.google.com/` or `https://calendar.google.com`) is **not** explicit_source; it is `enter`.

This is how “I entered `https://calendar.google.com/`” still redirects, while “I entered `https://calendar.google.com/calendar/u/0/r`” does not.

### 8.4 When to redirect

Redirect iff all of:

1. Extension not paused.
2. Matching enabled rule exists (first match in list order; user-reorderable).
3. Host permission granted for that URL.
4. URL is main frame, http(s).
5. Computed destination ≠ current URL (canonicalize before compare).
6. Intent is `enter` (including Google’s follow-up redirect inside an `entryChain`).
7. Intent is **not** `back_forward`, `same_origin_nav`, `chooser`, `explicit_source`, `our_redirect`.
8. Rule is not in `bypassRuleIds` for this tab.
9. Loop guard: this tab has not redirected this URL→dest pair in the last 1000ms.

**Reload:** If the user reloads the **destination**, stay. If they reload a **source** URL in a tab that is not bypassed:

- If the tab already has bypass → stay (they are working on original).
- Else → treat as `enter` and redirect (reload of a freshly typed `calendar.google.com` should still go to `u/1`).

**Bypass duration:**

| Value | Behavior |
|-------|----------|
| `navigation` | Skip one source hit, then auto-redirects resume. |
| `tab` (default) | No auto-redirects for that rule in that tab until the tab closes **or** the tab leaves both source and destination hosts for 30s. |
| `session` | No auto-redirects for that rule until the browser session ends (or user clears bypass in the popup). |

Set bypass when:

- Intent is `back_forward` onto a source URL after `lastRedirect` for that rule.
- Intent is `same_origin_nav` onto a source URL (account switcher).
- Intent is `chooser` onto a source URL.
- Intent is `explicit_source`.
- User clicks **Open original this tab** or the context-menu equivalent.

### 8.5 How to redirect

```ts
await chrome.tabs.update(tabId, { url: destinationUrl });
```

Do **not** use `location.replace` via a content script as the primary method (it removes the original from history and breaks the requested Back behavior).

Do **not** use `window.location.href` in a content script as the primary method (late, flashes, races).

After calling `tabs.update`, write `lastRedirect` immediately so the destination’s `onBeforeNavigate` is classified as `our_redirect`.

Record `entryChain` when intent is `enter` and a rewrite is issued, so a subsequent Google `server_redirect` to `/u/0` still rewrites to `/u/1` if we lost the race on the first hop.

### 8.6 Flash of the original page

A brief flash is acceptable in v1 if Back works. Reduce it:

1. Redirect in `onBeforeNavigate` for new-tab `enter` and for known entry chains.
2. Redirect in `onCommitted` as a backstop (Google hop to `/u/0`, missed early path).
3. Do **not** inject overlay CSS into Google Calendar (fragile, account-switcher risk).

If both `onBeforeNavigate` and `onCommitted` would redirect the same navigation, the loop guard must collapse them to one `tabs.update`.

### 8.7 Per-tab history heuristic

On every committed main-frame URL, push onto `history` (dedupe consecutive duplicates).

Back detection before `onCommitted`: if `onBeforeNavigate.url === history.at(-2)`, tentatively bypass. If `onCommitted` later says it was **not** `forward_back`, and intent is `enter`, perform the redirect (correction). This may flash; that is OK.

### 8.8 Order of rules

Walk `settings.rules` in array order. First enabled match whose `matches(url)` is true **and** whose rewriter would change the URL wins. Provide move up/down in Options.

If rule A’s destination is rule B’s source, that is allowed only if B does not match the URL after A’s rewrite. On save, warn: “This destination matches another rule’s source. Check for loops.” At runtime, after computing dest, if dest still matches any rule including self, **abort redirect** and log.

---

## 9. URL matching and rewriting

### 9.1 Canonicalization

Before match/compare:

- Lowercase scheme and host.
- Drop default ports (`:443`, `:80`).
- Drop trailing slash on origin-only URLs for equality, but **keep** path slashes that are meaningful.
- Decode `%7E` etc. only as needed; do not decode `/` or `?`.
- Reject non-`http:`/`https:`.

### 9.2 Match modes

| Mode | Source field means | Matches when |
|------|--------------------|--------------|
| `prefix` | `https://example.com/app` | URL starts with that string (path prefix). |
| `exact` | full URL without hash | Canonical URL equals source (query: follow `preserveQuery` only for dest, not match — exact includes query if the user entered one). |
| `host` | `https://calendar.google.com/` | `url.host === source.host`. |
| `wildcard` | `https://calendar.google.com/calendar/*` | Chrome-like `*` in path/query. |
| `regex` | full-URL regex | `new RegExp(source)` (no `g` flag). Must compile on save. |

Always apply `excludePatterns` after a positive match. Implicit exclude: the computed destination URL.

### 9.3 Google Calendar recipe (`google-calendar-account`)

Host: `calendar.google.com` (also treat `www.google.com/calendar` as **non-match** in v1; too many false positives).

Let `N = rule.googleAccountIndex ?? parseIndex(destination) ?? 1`.

**Do not rewrite** if any of:

- Path already has `/u/N` as a segment.
- Path has `/u/M` where `M !== 0` and `M !== N` (user is on another explicit account).
- Intent is `explicit_source`, `back_forward`, `same_origin_nav`, `chooser`, or bypass is on.

**Rewrite map** (path only; then reattach query/hash per flags):

| Incoming path | Outgoing path |
|---------------|----------------|
| `/` or empty | `/calendar/u/N/` |
| `/calendar` or `/calendar/` | `/calendar/u/N/` |
| `/calendar/r` + rest | `/calendar/u/N/r` + rest |
| `/calendar/u/0` + rest | `/calendar/u/N` + rest |
| `/calendar/` + rest with no `/u/\d+` | `/calendar/u/N/` + rest |

Examples:

| Input | Intent | Output |
|-------|--------|--------|
| `https://calendar.google.com/` | enter | `https://calendar.google.com/calendar/u/1/` |
| `https://calendar.google.com/calendar/u/0/r` | enter (Google hop) | `https://calendar.google.com/calendar/u/1/r` |
| `https://calendar.google.com/calendar/r/eventedit/abc?eid=x` | enter | `https://calendar.google.com/calendar/u/1/r/eventedit/abc?eid=x` |
| `https://calendar.google.com/calendar/u/1/r` | any | unchanged |
| `https://calendar.google.com/calendar/u/2/r` | any | unchanged |
| `https://calendar.google.com/calendar/u/0/r` | back_forward | unchanged |
| `https://calendar.google.com/calendar/u/0/r` | same_origin_nav from u/1 | unchanged |
| `https://calendar.google.com/calendar/u/0/r` | typed explicit | unchanged |

`google-workspace-account` (same rewriter, different host): `mail.google.com`, `drive.google.com`, `chat.google.com`, `docs.google.com`, `meet.google.com`. Implement the rewriter as a shared function parameterized by host + index. **Ship Calendar only as the seed rule**; the Options recipe picker may offer Gmail/Drive as templates (same engine).

Segment test for `/u/N`: use a path-segment regex, e.g. `/(?:^|\/)u\/(\d+)(?:\/|$)/`, not `String.includes("u/1")`.

### 9.4 Generic rewrite vs fixed

**`fixed`:** Navigate to `rule.destination`. If `preserveQuery` and the destination has no query, copy the source query. Same for hash.

**`rewrite` without recipe:** If the current URL is a prefix of `source`, replace that prefix with `destination` (string prefix). If the match was `host`, replace `origin` with destination origin and keep path — unless destination has a path other than `/`, in which case follow the recipe-less rule: destination path is a **replacement root** only for path `/`; deeper paths are preserved under destination origin.

Write unit tests for these cases; do not improvise at implementation time.

---

## 10. Permissions and privacy

### 10.1 Manifest (v1)

```json
{
  "manifest_version": 3,
  "name": "Default Destination",
  "version": "0.1.0",
  "description": "When you enter a site, land on the page you actually use. Go back to the original whenever you mean to.",
  "permissions": [
    "storage",
    "webNavigation",
    "tabs",
    "contextMenus",
    "commands"
  ],
  "optional_host_permissions": ["*://*/*"],
  "host_permissions": [
    "https://calendar.google.com/*"
  ],
  "background": { "service_worker": "src/background/index.ts", "type": "module" },
  "action": { "default_popup": "src/popup/index.html", "default_title": "Default Destination" },
  "options_ui": { "page": "src/options/index.html", "open_in_tab": true },
  "commands": {
    "open-original": {
      "suggested_key": { "default": "Alt+Shift+O" },
      "description": "Open the original page in this tab (bypass redirect)"
    }
  }
}
```

`host_permissions` includes Calendar because of the seed rule. Any other host is requested via `chrome.permissions.request` when the user saves a rule. If they deny, save the rule as **disabled** with status `needs_permission`.

Do **not** request `webRequest`, `webRequestBlocking`, `<all_urls>` required, `scripting` (v1), or `history`.

### 10.2 Privacy

- No network calls to first-party servers.
- No capture of page content.
- URLs exist only in local/sync extension storage as rule config and short-lived tab history (session).
- Include a short privacy note on the Options page.

---

## 11. Architecture and files

Recommended stack: **Vite + TypeScript + Manifest V3**. Popup and Options: lightweight TS + CSS (no React/Next unless the implementer strongly prefers; vanilla is enough).

```
/
  README.md
  docs/SPEC.md                 (this file)
  docs/COMPOSER_BRIEF.md
  docs/rules.schema.json
  docs/fixtures/url-rewrite.json
  package.json
  tsconfig.json
  vite.config.ts
  manifest.config.ts           // @crxjs/vite-plugin or equivalent
  src/
    background/
      index.ts                 // listeners only
      engine.ts                // classifyIntent, shouldRedirect
      tabState.ts              // session storage helpers
      permissions.ts
    lib/
      canonicalize.ts
      match.ts
      rewrite.ts
      googleAccount.ts         // /u/N rewriter
      settings.ts
    popup/
      index.html
      popup.ts
      popup.css
    options/
      index.html
      options.ts
      options.css
    types.ts
  tests/
    match.test.ts
    rewrite.test.ts
    intent.test.ts             // pure functions, no chrome
    googleAccount.test.ts
  public/
    icons/                     // 16, 32, 48, 128
```

**Pure functions** (`match`, `rewrite`, `classifyIntent` given a DTO) must be unit-tested without Chrome. The background file only wires events.

Use `@crxjs/vite-plugin` **or** a well-known MV3 Vite template. Do not hand-roll a broken service-worker URL.

### 11.1 Message API (popup ↔ worker)

```ts
type Msg =
  | { type: "GET_STATUS"; tabId: number }
  | { type: "SET_PAUSED"; paused: boolean }
  | { type: "TOGGLE_RULE"; id: string; enabled: boolean }
  | { type: "OPEN_ORIGINAL"; tabId: number }
  | { type: "SAVE_SETTINGS"; settings: SettingsV1 }
  | { type: "REQUEST_HOST"; origin: string };
```

`GET_STATUS` returns current URL, matching rule, intent that would apply, bypass, permission, paused.

---

## 12. Edge cases (must handle)

| Case | Expected |
|------|----------|
| Service worker slept mid-navigation | `tabState` in `storage.session` still has bypass/history. |
| User opens Calendar in 12 tabs | State is per tabId; no cross-talk except `paused` and rules. |
| Destination matches source (bad rule) | No redirect; Options shows error. |
| Redirect to `u/1` then Google 302 to login | Do not fight login; `accounts.google.com` is chooser/login, never rewritten. |
| Incognito | `"incognito": "spanning"` is OK; if omitted, extension is off in incognito (acceptable). Prefer spanning so work/personal profiles in the same window still work. |
| Prerender / `tabs.onReplaced` | Copy session state from old tab id to new. |
| `calendar.google.com` vs `google.com/calendar` | v1 only first host. |
| Trailing slash differences | Canonicalize so we don’t redirect in a loop. |
| User disables seed rule | Stay disabled across updates. Never re-seed if `settings.schemaVersion` exists. |
| Context menu “Open link without redirect” | `chrome.tabs.create` + set bypass for the new tabId in `tabs.onCreated` before navigation commits. Race: set a `pendingBypass` keyed by URL+openerTabId with 5s TTL. |

---

## 13. Testing

### 13.1 Automated (required before calling v1 done)

Run with Vitest (or Node test runner) on pure modules:

- All rows in [`fixtures/url-rewrite.json`](./fixtures/url-rewrite.json)
- Intent matrix: typed root → enter; typed `/u/0` → explicit_source; `forward_back` → back_forward; link from same host → same_origin_nav; referrer accounts.google.com → chooser; our own dest URL → our_redirect
- Loop: dest URL matching source must `shouldRedirect === false`
- Rule order: first matching enabled rule wins

### 13.2 Manual (required)

Load unpacked in Chrome. Use a throwaway profile.

1. Install → seed rule present, Calendar host permitted.
2. New tab, type `calendar.google.com` → address bar ends on `/calendar/u/1`.
3. Back → original Calendar (default/`u/0`), **stays**.
4. From `u/1`, open the Google account switcher and pick the other account → `u/0` **stays**.
5. New tab, paste a Calendar **event** URL without `/u/N` → event opens under `/u/1`, path preserved.
6. Pause in popup → `calendar.google.com` no longer redirects.
7. Unpause. Popup **Open original this tab** while on `u/1` → lands on source, no bounce.
8. Add a generic prefix rule on `example.com` (permission prompt). Confirm deny path (rule saved disabled) and allow path (redirect works).
9. Keyboard `Alt+Shift+O` sets bypass and opens original.
10. Service worker: in `chrome://extensions` click **service worker** inspect, terminate worker, repeat step 2. Still works.

---

## 14. Implementation constraints for Composer

MUST:

- Manifest V3 + TypeScript.
- Seed Calendar rule using the recipe rewriter, not a single fixed URL replace.
- Persist tab bypass in `chrome.storage.session`.
- Unit tests for match/rewrite/intent.
- Replace this repo’s README with how to build and load unpacked.

MUST NOT:

- Ship application code in a spec-only git pass (this pass).
- Use DNR to perform the Calendar redirect.
- Use `location.replace` as the only navigation method.
- Redirect iframes or `accounts.google.com`.
- Add auth, analytics, crash reporting, or a website.
- Add React/Next/Tailwind/shadcn unless popup/options become unwieldy; prefer vanilla.
- Force-update or reset user rules on extension update.

---

## 15. Future (do not build now)

- Instant DNR mode for rules that don’t need Back-to-original.
- Match Google account by email (`authuser=` + cookie is unreliable; would need identity API).
- Sync via a file the user copies.
- Firefox MV3 port.
- Per-profile rule sets (work Chrome profile vs personal).
- Import from a shared team JSON for first-party sites.

---

## 16. Decision log

| Decision | Choice | Why |
|----------|--------|-----|
| Engine | webNavigation + tabs.update | Only way to honor Back and account switcher |
| History | Keep original in tab history | User asked to go back to original |
| Calendar dest | Rewrite `/u/N`, don’t always load dest home | Deep links |
| Typed `/u/0` | Bypass | User asked to reach the original page on purpose |
| Typed site root | Redirect | The actual pain point |
| Permissions | Optional hosts + Calendar required | Store-safe; seed works out of the box |
| UI kit | Vanilla TS/CSS | Extension chrome, not a web app |
| Recipes | Calendar seed + shared Google rewriter | “Our websites” later without a rewrite |
