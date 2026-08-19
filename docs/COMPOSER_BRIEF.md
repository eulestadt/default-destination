# Composer brief — implement Default Destination

Read [`SPEC.md`](./SPEC.md) first. It wins if anything here is thinner.

**This brief is for the implementation run.** The spec-only run must not create `src/`, `package.json`, or a manifest.

---

## Mission

Build a Manifest V3 Chrome extension named **Default Destination** that:

1. Auto-navigates configured “entry” URLs to a destination.
2. Does **not** trap the user: Back, account switcher, and “open original” reach the source page.
3. Ships a seed rule: `https://calendar.google.com/` → account `u/1` via the Google Calendar rewriter (path-preserving).
4. Lets the user add more site pairs (including future first-party sites).

## Hard constraints

- No `declarativeNetRequest` redirects in v1.
- No `location.replace` as the primary redirect.
- Main frame only.
- Tab bypass lives in `chrome.storage.session`, not a service-worker global.
- Pure match/rewrite/intent functions + Vitest fixtures.
- Vanilla TS/CSS for popup and options (no Next.js, no shadcn).

## Build order (do not skip tests until the end)

### 1. Scaffold

- Vite + TypeScript + MV3 (`@crxjs/vite-plugin` or equivalent).
- Output an unpacked `dist/` Chrome can load.
- Icons: simple two-arrow / “detour” mark, 16/32/48/128.
- `npm run build`, `npm test`, `npm run dev` (watch).

### 2. Schema and settings

- Implement `RuleV1` / `SettingsV1` from the spec.
- Validate with `docs/rules.schema.json`.
- First-install seed rule only when no `settings` key exists. Copy `docs/seed-rule.json` (fill `createdAt` / `updatedAt` at install).
- Sync storage with local fallback.

### 3. Pure libraries + tests

- `canonicalize`, `match`, `rewrite`, `googleAccount`.
- Port every case in `docs/fixtures/url-rewrite.json` and `docs/fixtures/intent.json`.
- `npm test` must be green before Chrome APIs.

### 4. Engine

- `classifyIntent` + `shouldRedirect` as pure functions over DTOs.
- Background worker: `webNavigation` + `tabs.update` + session `tabState`.
- Loop guard, paused flag, permission check, `tabs.onRemoved` GC.
- `tabs.onReplaced` id remap.

### 5. UI

- Popup: pause, status, open original, per-rule toggles, link to options.
- Options: rule list, add/edit/delete/reorder, recipe picker (Calendar + empty generic), permission request, import/export JSON, empty/error states, privacy note.
- Context menu + `Alt+Shift+O`.

### 6. Docs for humans

- Replace README with: what it does, load unpacked, Calendar example, bypass behavior, limitation of `/u/N`, how to add rules.
- Keep `docs/SPEC.md` as the technical contract.

### 7. Manual pass

Walk SPEC §13.2. Fix issues. Do not call done if Back from Calendar re-enters `u/1`.

## Definition of done

- [ ] Unpacked extension loads without errors in `chrome://extensions`.
- [ ] Seed Calendar rule works for omnibox `calendar.google.com`.
- [ ] Back stays on original; avatar switch to the other user stays.
- [ ] Event/deep links keep path/query under `/u/1`.
- [ ] Typed `/calendar/u/0/...` does not bounce to `u/1`.
- [ ] User can add a second generic rule (with permission prompt).
- [ ] `npm test` covers fixtures.
- [ ] README is enough to load and configure without reading the spec.
- [ ] No network calls, no analytics, no extra permissions.

## Suggested commit order

1. `chore: scaffold MV3 extension`
2. `feat: settings, schema, seed calendar rule`
3. `feat: url match and google account rewriter`
4. `feat: navigation intent engine`
5. `feat: popup, options, bypass actions`
6. `docs: load unpacked and usage`

## If you get stuck

Priority: **correct bypass** over **zero flash**. A 100ms glimpse of `calendar.google.com` is fine. A Back-button trap is a ship blocker.
