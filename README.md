# Default Destination

A Chrome extension that sends you to the page you actually use when you enter a site — and still lets you open the original when you mean to.

## Example

When you type `calendar.google.com`, you land on `https://calendar.google.com/calendar/u/1` (Google account index 1). Deep links keep their path and query on that account.

You can still reach the default Calendar account:

- Press **Back** after an auto-redirect
- Switch accounts in Google’s avatar menu
- Type an explicit `/u/0` URL in the address bar
- Click **Open original this tab** in the popup, or press **Alt+Shift+O**

## Build and load (unpacked)

```bash
npm install
npm run icons   # first time only
npm run build
```

In Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder

For development with auto-rebuild:

```bash
npm run dev
```

Then click **Reload** on the extension card after changes.

## Add more site pairs

1. Open the extension **Options** page (from the popup or extension details).
2. Click **Add rule** and set source → destination.
3. Chrome will ask for permission for that host when you save.
4. Use **Google Calendar account** recipe for Calendar-style `/u/N` rewriting, or **Generic** for prefix/host rules.

Export and import JSON to copy rules between profiles.

## Google `/u/N` limitation

`/calendar/u/1` is the **second signed-in account in this Chrome profile**, not a fixed email. If account order changes, edit the rule’s account index in Options.

## Privacy

Rules are stored in Chrome sync (or local storage if sync quota is exceeded). Tab bypass flags use session storage. No page content is read and nothing is sent to a server.

## Tests

```bash
npm test
```

## Technical spec

See [docs/SPEC.md](docs/SPEC.md) for the full navigation engine and data model.
