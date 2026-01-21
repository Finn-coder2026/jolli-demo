/**
 * Registry of all known preferences with their definitions.
 *
 * This file centralizes all preference definitions, making it easy to:
 * - See all available preferences in one place
 * - Ensure consistent serialization/deserialization
 * - Provide type safety for preference access
 */

import { createDynamicPreference, definePreference, Serializers } from "./PreferencesTypes";
import type { DraftListFilter } from "jolli-common";
import { ACTIVE_CONVO_KEY } from "jolli-common";

/**
 * Valid draft filter values for validation.
 */
const VALID_DRAFT_FILTERS: Array<DraftListFilter> = ["all", "my-new-drafts", "shared-with-me", "suggested-updates"];

/**
 * All preference definitions for the application.
 */
export const PREFERENCES = {
	/**
	 * Theme preference - light or dark mode.
	 * Per-tenant scope (same theme across all orgs in a tenant).
	 */
	theme: definePreference<"light" | "dark">({
		key: "theme",
		scope: "tenant",
		defaultValue: "light",
		serialize: (value: "light" | "dark") => value,
		deserialize: (value: string) => value as "light" | "dark",
		validate: value => value === "light" || value === "dark",
	}),

	/**
	 * Whether the sidebar is collapsed by default.
	 * Per-tenant scope (same sidebar state across all orgs in a tenant).
	 */
	sidebarCollapsed: definePreference<boolean>({
		key: "sidebarCollapsed",
		scope: "tenant",
		defaultValue: false,
		...Serializers.boolean,
	}),

	/**
	 * Width of the chat panel in pixels.
	 * Per-tenant scope (same chat width across all orgs in a tenant).
	 */
	chatWidth: definePreference<number>({
		key: "chatWidth",
		scope: "tenant",
		defaultValue: 600,
		...Serializers.number,
		validate: value => value >= 300 && value <= 800,
	}),

	/**
	 * Default filter for the articles/drafts list.
	 * Per-tenant-org scope (different filter per org).
	 */
	articlesDraftFilter: definePreference<DraftListFilter>({
		key: "articles.draftFilter",
		scope: "tenant-org",
		defaultValue: "all",
		serialize: (value: DraftListFilter) => value,
		deserialize: (value: string) => value as DraftListFilter,
		validate: value => VALID_DRAFT_FILTERS.includes(value as DraftListFilter),
	}),

	/**
	 * Whether to show AI tool details in the article draft view.
	 * Per-tenant scope.
	 */
	articleDraftShowToolDetails: definePreference<boolean>({
		key: "articleDraft.showToolDetails",
		scope: "tenant",
		defaultValue: false,
		...Serializers.boolean,
	}),

	/**
	 * Active conversation ID for the chatbot.
	 * Per-tenant-org scope (different active conversation per org).
	 */
	activeConvoId: definePreference<string | null>({
		key: ACTIVE_CONVO_KEY,
		scope: "tenant-org",
		defaultValue: null,
		...Serializers.nullableString,
	}),

	/**
	 * Last activity timestamp for session timeout tracking.
	 * Global scope (session tracking is cross-tenant).
	 */
	lastActivityTime: definePreference<number>({
		key: "jolli_lastActivityTime",
		scope: "global",
		defaultValue: 0,
		...Serializers.number,
	}),

	/**
	 * Whether logging is disabled (developer setting).
	 * Global scope.
	 */
	disableLogging: definePreference<boolean>({
		key: "DISABLE_LOGGING",
		scope: "global",
		defaultValue: false,
		...Serializers.boolean,
	}),

	/**
	 * Log level (developer setting).
	 * Global scope.
	 */
	logLevel: definePreference<string>({
		key: "LOG_LEVEL",
		scope: "global",
		defaultValue: "info",
		...Serializers.string,
	}),

	/**
	 * Whether to pretty-print logs (developer setting).
	 * Global scope.
	 */
	logPretty: definePreference<boolean>({
		key: "LOG_PRETTY",
		scope: "global",
		defaultValue: true,
		...Serializers.boolean,
	}),

	/**
	 * Module-specific log level overrides (developer setting).
	 * Global scope.
	 */
	logLevelOverrides: definePreference<string>({
		key: "LOG_LEVEL_OVERRIDES",
		scope: "global",
		defaultValue: "",
		...Serializers.string,
	}),

	/**
	 * Dynamic preference for resizable panel widths.
	 * Uses the storageKey provided by the component.
	 * Per-tenant scope.
	 */
	panelWidth: createDynamicPreference((storageKey: string) =>
		definePreference<number>({
			key: storageKey,
			scope: "tenant",
			defaultValue: 50,
			...Serializers.number,
			validate: value => value >= 0 && value <= 100,
		}),
	),

	/**
	 * Dynamic preference for GitHub welcome banner dismissal.
	 * Uses the container name as part of the key.
	 * Per-tenant-org scope.
	 *
	 * Note: This is kept for compatibility with the existing pattern in useGitHubRepoList.
	 * The key format already includes tenant/org info in multi-tenant mode.
	 */
	githubWelcomeDismissed: createDynamicPreference((containerName: string) =>
		definePreference<boolean>({
			key: `github:welcome-dismissed:${containerName}`,
			scope: "tenant-org",
			defaultValue: false,
			...Serializers.boolean,
		}),
	),
} as const;

/**
 * Type helper to get the value type of a preference.
 */
export type PreferenceValue<T> = T extends { defaultValue: infer V } ? V : never;
