/**
 * Registry of all known preferences with their definitions.
 *
 * This file centralizes all preference definitions, making it easy to:
 * - See all available preferences in one place
 * - Ensure consistent serialization/deserialization
 * - Provide type safety for preference access
 */

import { createDynamicPreference, definePreference, Serializers } from "./PreferencesTypes";
import type { DraftListFilter, ThemePreset } from "jolli-common";

/**
 * Valid draft filter values for validation.
 */
const VALID_DRAFT_FILTERS: Array<DraftListFilter> = ["all", "my-new-drafts", "shared-with-me", "suggested-updates"];

/**
 * All preference definitions for the application.
 */
export const PREFERENCES = {
	/**
	 * Theme preference - system, light, or dark mode.
	 * Per-tenant scope (same theme across all orgs in a tenant).
	 */
	theme: definePreference<"system" | "light" | "dark">({
		key: "theme",
		scope: "tenant",
		defaultValue: "system",
		serialize: (value: "system" | "light" | "dark") => value,
		deserialize: (value: string) => value as "system" | "light" | "dark",
		validate: value => value === "system" || value === "light" || value === "dark",
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
	 * Whether to use the new unified sidebar instead of the legacy two-tier navigation.
	 * Per-tenant scope (same sidebar preference across all orgs in a tenant).
	 * The unified sidebar is now enabled by default. Users can temporarily switch back to
	 * the legacy navigation via localStorage.setItem('tenant:useUnifiedSidebar', 'false').
	 */
	useUnifiedSidebar: definePreference<boolean>({
		key: "useUnifiedSidebar",
		scope: "tenant",
		defaultValue: true,
		...Serializers.boolean,
	}),

	/**
	 * Whether the Spaces section in the unified sidebar is expanded.
	 * Per-tenant scope (same state across all orgs in a tenant).
	 */
	sidebarSpacesExpanded: definePreference<boolean>({
		key: "sidebar.spacesExpanded",
		scope: "tenant",
		defaultValue: true,
		...Serializers.boolean,
	}),

	/**
	 * Whether the Sites section in the unified sidebar is expanded.
	 * Per-tenant scope (same state across all orgs in a tenant).
	 */
	sidebarSitesExpanded: definePreference<boolean>({
		key: "sidebar.sitesExpanded",
		scope: "tenant",
		defaultValue: true,
		...Serializers.boolean,
	}),

	/**
	 * Whether the space tree panel is pinned in edit mode.
	 * Per-tenant scope (same state across all orgs in a tenant).
	 */
	spacesTreePanelPinned: definePreference<boolean>({
		key: "spaces.treePanelPinned",
		scope: "tenant",
		defaultValue: true,
		...Serializers.boolean,
	}),

	/**
	 * Whether the site tree navigation panel is pinned (visible).
	 * Per-tenant scope (same state across all orgs in a tenant).
	 */
	sitesTreePanelPinned: definePreference<boolean>({
		key: "sites.treePanelPinned",
		scope: "tenant",
		defaultValue: true,
		...Serializers.boolean,
	}),

	/**
	 * Whether the site build logs panel is expanded.
	 * Per-tenant scope (same state across all orgs in a tenant).
	 */
	siteBuildLogsPanelExpanded: definePreference<boolean>({
		key: "sites.buildLogsPanelExpanded",
		scope: "tenant",
		defaultValue: false,
		...Serializers.boolean,
	}),

	/**
	 * Array of favorite space IDs for the unified sidebar.
	 * Per-tenant-org scope (different favorites per org).
	 */
	favoriteSpaces: definePreference<Array<number>>({
		key: "sidebar.favoriteSpaces",
		scope: "tenant-org",
		defaultValue: [],
		...Serializers.numberArray,
	}),

	/**
	 * Array of favorite site IDs for the unified sidebar.
	 * Per-tenant-org scope (different favorites per org).
	 */
	favoriteSites: definePreference<Array<number>>({
		key: "sidebar.favoriteSites",
		scope: "tenant-org",
		defaultValue: [],
		...Serializers.numberArray,
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
	 * Position of the chatbot panel - left or right side.
	 * Per-tenant scope (same position across all orgs in a tenant).
	 */
	chatbotPosition: definePreference<"left" | "right">({
		key: "chatbot.position",
		scope: "tenant",
		defaultValue: "right",
		serialize: (value: "left" | "right") => value,
		deserialize: (value: string) => value as "left" | "right",
		validate: value => value === "left" || value === "right",
	}),

	/**
	 * Width of the article draft chat pane in pixels.
	 * Per-tenant scope (same pane width across all orgs in a tenant).
	 */
	articleDraftChatPaneWidth: definePreference<number>({
		key: "articleDraft.chatPaneWidth",
		scope: "tenant",
		defaultValue: 320,
		...Serializers.number,
		validate: value => value >= 200 && value <= 600,
	}),

	/**
	 * Whether the article list panel is collapsed.
	 * Per-tenant scope (same panel state across all orgs in a tenant).
	 */
	articleListPanelCollapsed: definePreference<boolean>({
		key: "articles.listPanelCollapsed",
		scope: "tenant",
		defaultValue: false,
		...Serializers.boolean,
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
	 * Current space ID for the space switcher.
	 * Per-tenant-org scope (different space per org).
	 * Stores the ID of the currently selected space, or null for default space.
	 */
	currentSpaceId: definePreference<number | null>({
		key: "spaces.currentSpaceId",
		scope: "tenant-org",
		defaultValue: null,
		...Serializers.nullableNumber,
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
	 * Dynamic preference for the last-viewed article ID per space.
	 * Used to auto-select the article when entering a space.
	 * Per-tenant-org scope (different last-viewed article per org).
	 */
	lastViewedArticle: createDynamicPreference((spaceId: number) =>
		definePreference<number | null>({
			key: `spaces.lastViewedArticle.${spaceId}`,
			scope: "tenant-org",
			defaultValue: null,
			...Serializers.nullableNumber,
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
	/* v8 ignore next 8 - dynamic preference factory, tested via useGitHubRepoList usage */
	githubWelcomeDismissed: createDynamicPreference((containerName: string) =>
		definePreference<boolean>({
			key: `github:welcome-dismissed:${containerName}`,
			scope: "tenant-org",
			defaultValue: false,
			...Serializers.boolean,
		}),
	),

	/**
	 * Whether the editor toolbar is collapsed in the Spaces article editor.
	 * Per-tenant scope (same state across all orgs in a tenant).
	 */
	editorToolbarCollapsed: definePreference<boolean>({
		key: "editor.toolbarCollapsed",
		scope: "tenant",
		defaultValue: false,
		...Serializers.boolean,
	}),

	/**
	 * Remembered theme preset for the Create Site wizard.
	 * Per-tenant scope (same wizard defaults across all orgs in a tenant).
	 */
	wizardThemePreset: definePreference<Exclude<ThemePreset, "custom"> | null>({
		key: "wizard.themePreset",
		scope: "tenant",
		defaultValue: null,
		serialize: (value: Exclude<ThemePreset, "custom"> | null): string => value ?? "",
		deserialize: (value: string): Exclude<ThemePreset, "custom"> | null =>
			(value || null) as Exclude<ThemePreset, "custom"> | null,
		validate: value =>
			value === null ||
			value === "minimal" ||
			value === "vibrant" ||
			value === "terminal" ||
			value === "friendly" ||
			value === "noir",
	}),

	/**
	 * Remembered JWT auth setting for the Create Site wizard.
	 * Per-tenant scope (same wizard defaults across all orgs in a tenant).
	 */
	wizardJwtAuthEnabled: definePreference<boolean | null>({
		key: "wizard.jwtAuthEnabled",
		scope: "tenant",
		defaultValue: null,
		serialize: (value: boolean | null): string => (value === null ? "" : String(value)),
		deserialize: (value: string): boolean | null => (value === "" ? null : value === "true"),
		validate: value => value === null || value === true || value === false,
	}),
} as const;

/**
 * Type helper to get the value type of a preference.
 */
export type PreferenceValue<T> = T extends { defaultValue: infer V } ? V : never;
