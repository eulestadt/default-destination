import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Default Destination",
  version: "0.1.0",
  description:
    "When you enter a site, land on the page you actually use. Go back to the original whenever you mean to.",
  permissions: ["storage", "webNavigation", "tabs", "contextMenus", "commands"],
  optional_host_permissions: ["*://*/*"],
  host_permissions: ["https://calendar.google.com/*"],
  incognito: "spanning",
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  action: {
    default_popup: "src/popup/index.html",
    default_title: "Default Destination",
    default_icon: {
      16: "public/icons/icon-16.png",
      32: "public/icons/icon-32.png",
      48: "public/icons/icon-48.png",
      128: "public/icons/icon-128.png",
    },
  },
  icons: {
    16: "public/icons/icon-16.png",
    32: "public/icons/icon-32.png",
    48: "public/icons/icon-48.png",
    128: "public/icons/icon-128.png",
  },
  options_ui: {
    page: "src/options/index.html",
    open_in_tab: true,
  },
  commands: {
    "open-original": {
      suggested_key: { default: "Alt+Shift+O" },
      description: "Open the original page in this tab (bypass redirect)",
    },
  },
});
