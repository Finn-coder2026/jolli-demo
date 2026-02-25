/**
 * IntentClassifier - Classifies user messages into onboarding intents.
 *
 * Uses a two-layer approach:
 * 1. Pattern matching (covers ~90% of cases, zero latency)
 * 2. LLM fallback for ambiguous messages
 */

import { getLog } from "../util/Logger";
import Anthropic from "@anthropic-ai/sdk";

const log = getLog(import.meta);

/**
 * Possible user intents during onboarding.
 */
export type OnboardingIntent =
	| "confirm"
	| "skip"
	| "check"
	| "goodbye"
	| "github_done"
	| "import"
	| "generate"
	| "both"
	| "change_github"
	| "reimport"
	| "status"
	| "off_topic"
	| "help";

/**
 * Pattern definitions for each intent.
 * Patterns are tested case-insensitively against the normalized message.
 */
const INTENT_PATTERNS: Array<{ intent: OnboardingIntent; patterns: Array<RegExp> }> = [
	{
		// Must be checked before "both" since "all done" and "that's all" would match both's /\ball\b/
		// Must be checked before "github_done" since "I'm done" could match github_done's patterns.
		// Note: standalone "done" is NOT matched here to avoid conflicts with github_done in
		// earlier onboarding states. Only qualified forms like "I'm done" are matched.
		intent: "goodbye",
		patterns: [
			/\b(?:bye|goodbye|good\s*bye)\b/i,
			/\bi'?m\s+(?:done|finished)\b/i,
			/\ball\s+done\b/i,
			/\bthat'?s?\s+(?:all|it|everything)\b/i,
			/\b(?:exit|quit)\b/i,
			/\bsee\s+(?:you|ya)\b/i,
			/\bthanks?\s+bye\b/i,
			/\bthanks?\s*!/i,
			/\bno\s+more\s+questions?\b/i,
		],
	},
	{
		// Must be checked before "import" and "generate" since "both" could match those too
		intent: "both",
		patterns: [/\bboth\b/i, /\ball\b/i, /\beverything\b/i, /\bimport\s+and\s+generate\b/i, /\bdo\s+both\b/i],
	},
	{
		// Must be checked before "import" since patterns like "import again" would match "import"
		intent: "reimport",
		patterns: [/\bre-?import\b/i, /\bimport\s+again\b/i, /\bimport\s+more\b/i, /\brun\s+import\s+again\b/i],
	},
	{
		intent: "import",
		patterns: [/\bimport\b/i, /\bbring\s+in\b/i, /\bpull\s+in\b/i, /\bimport\s+(?:existing|docs|documents)\b/i],
	},
	{
		intent: "generate",
		patterns: [
			/\bgenerate\b/i,
			/\bcreate\s+(?:new\s+)?docs\b/i,
			/\bwrite\s+docs\b/i,
			/\bgenerate\s+(?:new\s+)?(?:docs|documentation|articles)\b/i,
		],
	},
	{
		intent: "github_done",
		patterns: [
			/\bi'?ve?\s+(?:connected|installed|done|set\s+up|linked)\b/i,
			/\bconnected\s+(?:my\s+)?(?:github|repo|repository)\b/i,
			/\binstalled\s+(?:the\s+)?(?:github|app)\b/i,
			/\bgithub\s+is\s+(?:connected|installed|done|ready)\b/i,
			/\bdone\s+(?:connecting|installing)\b/i,
			/\bjust\s+(?:connected|installed)\b/i,
		],
	},
	{
		intent: "change_github",
		patterns: [
			/\bchange\s+(?:repo|repository)\b/i,
			/\b(?:different|another|switch)\s+repo\b/i,
			/\breconnect\s+github\b/i,
			/\badd\s+(?:more\s+)?(?:apps?|github)\b/i,
			/\breinstall\b/i,
			/\bswitch\s+(?:to\s+)?(?:a\s+)?(?:different|another)\b/i,
		],
	},
	{
		intent: "skip",
		patterns: [
			/\bskip\b/i,
			/\bno\s+thanks?\b/i,
			/\blater\b/i,
			/\bnot\s+now\b/i,
			/\bpass\b/i,
			/\bdon'?t\s+want\b/i,
			/\bnot\s+interested\b/i,
			/\bmaybe\s+later\b/i,
		],
	},
	{
		intent: "check",
		patterns: [
			/\bcheck\b/i,
			/\bdid\s+it\s+work\b/i,
			/\bis\s+it\s+done\b/i,
			/\bverify\b/i,
			/\btest\b/i,
			/\bdid\s+(?:the\s+)?sync\s+work\b/i,
			/\bhas\s+it\s+synced\b/i,
		],
	},
	{
		// Must be checked before "help" since "what github" could match help's "^what" pattern
		intent: "status",
		patterns: [
			/\bwhat\s+(?:github|repo|repository|app)\b/i,
			/\bwhat(?:'s| is)\s+(?:connected|installed|my\s+status|the\s+status)\b/i,
			/\bshow\s+(?:me\s+)?(?:status|info|progress)\b/i,
			/\bstatus\b/i,
			/\bcurrent\s+(?:status|state|progress)\b/i,
			/\bwhat\s+(?:have\s+)?(?:i|we)\s+(?:done|set\s+up|connected|imported)\b/i,
			/\bwhich\s+(?:repo|repository|app)\b/i,
		],
	},
	{
		intent: "help",
		patterns: [
			/^(?:how|what|why|help|explain)\b/i,
			/\bwhat\s+(?:do|should|can)\s+i\b/i,
			/\bhow\s+(?:do|does|should)\b/i,
			/\bexplain\b/i,
			/\btell\s+me\s+(?:about|more)\b/i,
		],
	},
	{
		intent: "confirm",
		patterns: [
			/^yes\b/i,
			/^yeah?\b/i,
			/^yep\b/i,
			/^sure\b/i,
			/^ok(?:ay)?\b/i,
			/\blet'?s?\s+(?:go|do\s+it|start|begin|continue|proceed)\b/i,
			/\bready\b/i,
			/\bsounds?\s+good\b/i,
			/\bgo\s+(?:ahead|for\s+it)\b/i,
			/\bdo\s+it\b/i,
			/\bcontinue\b/i,
			/\bproceed\b/i,
			/\bnext\b/i,
			/\bstart\b/i,
			/\bplease\b/i,
			/\babsolutely\b/i,
			/\bdefinitely\b/i,
			/\bof\s+course\b/i,
		],
	},
];

/**
 * Classify a message using pattern matching.
 * Returns the intent if a pattern matches, or null for LLM fallback.
 */
export function classifyByPattern(message: string): OnboardingIntent | null {
	const normalized = message.trim();
	if (!normalized) {
		return "off_topic";
	}

	for (const { intent, patterns } of INTENT_PATTERNS) {
		for (const pattern of patterns) {
			if (pattern.test(normalized)) {
				return intent;
			}
		}
	}

	return null;
}

/**
 * LLM classification prompt for when pattern matching fails.
 */
const LLM_CLASSIFICATION_PROMPT = `You are an intent classifier for an onboarding flow. Classify the user's message into exactly ONE of these categories:

- confirm: User agrees, wants to proceed (e.g., "yes", "sure", "sounds good")
- skip: User wants to skip the current step (e.g., "skip", "not now", "later")
- check: User wants to check/verify something (e.g., "did it work?", "check")
- goodbye: User wants to end the conversation or is saying goodbye (e.g., "bye", "I'm done", "that's all", "thanks bye", "no more questions")
- github_done: User says they completed GitHub setup (e.g., "I connected it", "done installing")
- import: User wants to import existing docs (e.g., "import my docs")
- generate: User wants to generate new docs (e.g., "generate from code")
- both: User wants both import and generate (e.g., "do everything")
- change_github: User wants to change their repo, add more apps, or reconnect GitHub (e.g., "change repo", "switch to another repo", "reinstall")
- reimport: User wants to re-import or import again (e.g., "import again", "re-import", "import more")
- status: User is asking about the current status, what's connected, or what has been done (e.g., "what github app", "what's connected", "show status", "which repo")
- help: User is asking a how-to question about the onboarding process (e.g., "how do I connect", "what should I do next")
- off_topic: Message is unrelated to onboarding

Respond with ONLY the category name, nothing else.`;

/**
 * Classify a message using LLM as a fallback.
 */
async function classifyByLlm(message: string, apiKey: string, model?: string): Promise<OnboardingIntent> {
	try {
		const anthropic = new Anthropic({ apiKey });
		const response = await anthropic.messages.create({
			model: model ?? "claude-haiku-4-5-20251001",
			max_tokens: 20,
			system: LLM_CLASSIFICATION_PROMPT,
			messages: [{ role: "user", content: message }],
		});

		const text = response.content[0]?.type === "text" ? response.content[0].text.trim().toLowerCase() : "off_topic";

		// Validate the response is a known intent
		const validIntents: Array<OnboardingIntent> = [
			"confirm",
			"skip",
			"check",
			"goodbye",
			"github_done",
			"import",
			"generate",
			"both",
			"change_github",
			"reimport",
			"status",
			"off_topic",
			"help",
		];

		if (validIntents.includes(text as OnboardingIntent)) {
			return text as OnboardingIntent;
		}

		log.warn("LLM returned unexpected intent '%s', defaulting to off_topic", text);
		return "off_topic";
	} catch (error) {
		log.error(error, "LLM intent classification failed, defaulting to off_topic");
		return "off_topic";
	}
}

/**
 * Configuration for the intent classifier.
 */
export interface IntentClassifierConfig {
	/** Anthropic API key for LLM fallback (optional — pattern matching works without it) */
	apiKey?: string;
	/** Optional model override for LLM classification */
	model?: string;
}

/**
 * Classify a user message into an onboarding intent.
 *
 * First attempts pattern matching (fast, no API call).
 * Falls back to LLM classification for ambiguous messages.
 */
export async function classifyIntent(message: string, config: IntentClassifierConfig): Promise<OnboardingIntent> {
	// Layer 1: Pattern matching
	const patternResult = classifyByPattern(message);
	if (patternResult !== null) {
		return patternResult;
	}

	// Layer 2: LLM fallback (requires API key)
	if (!config.apiKey) {
		log.debug("No API key configured, skipping LLM fallback — defaulting to off_topic");
		return "off_topic";
	}

	return await classifyByLlm(message, config.apiKey, config.model);
}
