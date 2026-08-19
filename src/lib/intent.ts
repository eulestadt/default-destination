import type { ClassifyIntentInput, Intent, RuleV1 } from "../types";
import { DEFAULT_CHOOSER_ORIGINS, OUR_REDIRECT_MS } from "../types";
import { isRootEnter } from "./canonicalize";
import { isExplicitGoogleSourcePath } from "./googleAccount";
import { originMatchesChooser, sameOrigin } from "./urlUtils";

const TYPED_TYPES = new Set([
  "typed",
  "generated",
  "auto_bookmark",
  "keyword",
  "keyword_generated",
]);

const LINK_TYPES = new Set(["link", "form_submit"]);

export function classifyIntent(input: ClassifyIntentInput): Intent {
  const now = input.now ?? Date.now();
  const chooserOrigins = input.chooserOrigins ?? DEFAULT_CHOOSER_ORIGINS;
  const withinMs = input.withinMs ?? OUR_REDIRECT_MS;

  if (input.lastRedirect) {
    const lr = input.lastRedirect;
    const at = lr.at ?? 0;
    if (lr.to === input.url && now - at < withinMs) {
      return "our_redirect";
    }
  }

  const quals = input.transitionQualifiers ?? [];
  const type = input.transitionType;

  if (quals.includes("forward_back") || type === "back_forward") {
    return "back_forward";
  }

  if (type === "reload") {
    return "reload";
  }

  if (TYPED_TYPES.has(type)) {
    if (isExplicitSourceTyped(input)) {
      return "explicit_source";
    }
    return "enter";
  }

  if (LINK_TYPES.has(type)) {
    if (
      (quals.includes("client_redirect") || quals.includes("server_redirect")) &&
      input.entryChain
    ) {
      return "enter";
    }
    if (input.previousUrl && sameOrigin(input.previousUrl, input.url)) {
      return "same_origin_nav";
    }
    if (input.previousUrl && originMatchesChooser(input.previousUrl, chooserOrigins)) {
      return "chooser";
    }
    return "enter";
  }

  return "unknown";
}

function isExplicitSourceTyped(input: ClassifyIntentInput): boolean {
  const typedLike = ["typed", "generated", "auto_bookmark"].includes(input.transitionType);

  if (!typedLike) return false;

  if (
    input.recipeId === "google-calendar-account" ||
    input.recipeId === "google-workspace-account"
  ) {
    try {
      return isExplicitGoogleSourcePath(new URL(input.url).pathname);
    } catch {
      return false;
    }
  }

  if (input.sourceUrl) {
    try {
      const canonical = input.url.split("#")[0];
      const source = input.sourceUrl.split("#")[0];
      if (canonical === source || input.url === input.sourceUrl) {
        return !isRootEnter(input.url, input.sourceUrl);
      }
    } catch {
      return false;
    }
  }

  return false;
}

export function shouldSetBypassForIntent(
  intent: Intent,
  rule: Pick<RuleV1, "bypass">,
  landedOnSource: boolean,
  hadLastRedirectForRule: boolean,
): boolean {
  if (!landedOnSource) return false;

  switch (intent) {
    case "back_forward":
      return rule.bypass.onBackForward && hadLastRedirectForRule;
    case "same_origin_nav":
      return rule.bypass.onSameOriginLink;
    case "chooser":
      return rule.bypass.onChooser;
    case "explicit_source":
      return rule.bypass.onExplicitSourceTyped;
    default:
      return false;
  }
}
