/**
 * Test utilities for consistent test setup across the frontend test suite.
 * Provides reusable render functions with providers and mock factories.
 */

import { ClientProvider } from "../contexts/ClientContext";
import { CurrentUserProvider } from "../contexts/CurrentUserContext";
import { DevToolsProvider } from "../contexts/DevToolsContext";
import { NavigationProvider } from "../contexts/NavigationContext";
import { OrgProvider } from "../contexts/OrgContext";
import { PermissionProvider } from "../contexts/PermissionContext";
import { PreferencesProvider } from "../contexts/PreferencesContext";
import { RouterProvider } from "../contexts/RouterContext";
import { SitesProvider } from "../contexts/SitesContext";
import { SpaceProvider } from "../contexts/SpaceContext";
import { TenantProvider } from "../contexts/TenantContext";
import { ThemeProvider } from "../contexts/ThemeContext";
import type { RenderResult, RenderOptions as RTLRenderOptions } from "@testing-library/preact";
import { render, renderHook } from "@testing-library/preact";
import type { Client, DevToolsInfoResponse, GitHubClient, JobClient, UserInfo } from "jolli-common";
import type { ComponentType, ReactElement, ReactNode } from "react";
import { vi } from "vitest";

/**
 * Configuration options for rendering components with providers
 */
export interface RenderWithProvidersOptions extends Omit<RTLRenderOptions, "wrapper"> {
	/** Initial route path for RouterProvider */
	initialPath?: string;
	/** Pathname for NavigationProvider (defaults to initialPath) */
	pathname?: string;
	/** Include DevToolsProvider (default: true) */
	withDevTools?: boolean;
	/** Include NavigationProvider (default: true) */
	withNavigation?: boolean;
	/** Include OrgProvider (default: true) */
	withOrg?: boolean;
	/** Include PreferencesProvider (default: true) */
	withPreferences?: boolean;
	/** Include ThemeProvider (default: false) */
	withTheme?: boolean;
	/** Include SpaceProvider (default: true since unified sidebar is now default) */
	withSpace?: boolean;
	/** Include SitesProvider (default: true since unified sidebar is now default) */
	withSites?: boolean;
	/** User info for NavigationProvider */
	userInfo?: UserInfo;
	/** Custom wrapper component to use instead of providers */
	wrapper?: ComponentType<{ children: ReactNode }>;
	/** Custom client for testing (default: creates a new client) */
	client?: Client;
}

/**
 * Renders a component with all necessary providers for testing.
 * This eliminates the need to manually wrap components in test files.
 *
 * @example
 * ```tsx
 * renderWithProviders(<MyComponent />, {
 *   initialPath: "/dashboard",
 *   withDevTools: true,
 *   withNavigation: true,
 * });
 * ```
 */
export function renderWithProviders(
	ui: ReactElement,
	{
		initialPath = "/",
		pathname,
		withDevTools = true,
		withNavigation = true,
		withOrg = true,
		withPreferences = true,
		withTheme = false,
		withSpace = true,
		withSites = true,
		userInfo,
		client,
		wrapper,
		...renderOptions
	}: RenderWithProvidersOptions = {},
): RenderResult {
	const actualPathname = pathname ?? initialPath;

	function Wrapper({ children }: { children: ReactNode }): ReactElement {
		let content = children;

		// Apply wrappers in reverse order (innermost to outermost)
		if (withTheme) {
			content = <ThemeProvider>{content}</ThemeProvider>;
		}

		// SpaceProvider and SitesProvider must be inside PreferencesProvider
		// because they use the usePreference hook
		if (withSpace) {
			content = <SpaceProvider>{content}</SpaceProvider>;
		}

		if (withSites) {
			content = <SitesProvider>{content}</SitesProvider>;
		}

		if (withPreferences) {
			content = <PreferencesProvider>{content}</PreferencesProvider>;
		}

		if (withNavigation) {
			content = (
				<NavigationProvider pathname={actualPathname} userInfo={userInfo}>
					{content}
				</NavigationProvider>
			);
		}

		// CurrentUserProvider wraps NavigationProvider (after PermissionProvider)
		content = <CurrentUserProvider>{content}</CurrentUserProvider>;

		// PermissionProvider needs ClientProvider, so wrap it after navigation
		content = <PermissionProvider>{content}</PermissionProvider>;

		if (withDevTools) {
			content = <DevToolsProvider>{content}</DevToolsProvider>;
		}

		content = <RouterProvider initialPath={initialPath}>{content}</RouterProvider>;

		if (withOrg) {
			content = <OrgProvider>{content}</OrgProvider>;
		}

		// TenantProvider needs ClientProvider, so wrap inside
		content = <TenantProvider>{content}</TenantProvider>;

		content = client ? (
			<ClientProvider client={client}>{content}</ClientProvider>
		) : (
			<ClientProvider>{content}</ClientProvider>
		);

		return <>{content}</>;
	}

	const WrapperComponent = wrapper || Wrapper;

	return render(ui, { wrapper: WrapperComponent, ...renderOptions });
}

/**
 * Renders a hook with necessary providers for testing.
 *
 * @example
 * ```tsx
 * const { result } = renderHookWithProviders(() => useMyHook(), {
 *   initialPath: "/articles",
 * });
 * ```
 */
export function renderHookWithProviders<TResult>(
	hook: () => TResult,
	{
		initialPath = "/",
		pathname,
		withDevTools = true,
		withNavigation = true,
		withOrg = true,
		withPreferences = true,
		withTheme = false,
		userInfo,
		client,
		wrapper,
	}: RenderWithProvidersOptions = {},
) {
	const actualPathname = pathname ?? initialPath;

	function Wrapper({ children }: { children: ReactNode }): ReactElement {
		let content = children;

		if (withTheme) {
			content = <ThemeProvider>{content}</ThemeProvider>;
		}

		if (withPreferences) {
			content = <PreferencesProvider>{content}</PreferencesProvider>;
		}

		if (withNavigation) {
			content = (
				<NavigationProvider pathname={actualPathname} userInfo={userInfo}>
					{content}
				</NavigationProvider>
			);
		}

		// CurrentUserProvider wraps NavigationProvider (after PermissionProvider)
		content = <CurrentUserProvider>{content}</CurrentUserProvider>;

		// PermissionProvider needs ClientProvider, so wrap it after navigation
		content = <PermissionProvider>{content}</PermissionProvider>;

		if (withDevTools) {
			content = <DevToolsProvider>{content}</DevToolsProvider>;
		}

		content = <RouterProvider initialPath={initialPath}>{content}</RouterProvider>;

		if (withOrg) {
			content = <OrgProvider>{content}</OrgProvider>;
		}

		// TenantProvider needs ClientProvider, so wrap inside
		content = <TenantProvider>{content}</TenantProvider>;

		content = client ? (
			<ClientProvider client={client}>{content}</ClientProvider>
		) : (
			<ClientProvider>{content}</ClientProvider>
		);

		return <>{content}</>;
	}

	const WrapperComponent = (wrapper || Wrapper) as ComponentType<{ children: ReactNode }>;

	// Type assertion needed due to renderHook expecting Element children while we use ReactNode
	// biome-ignore lint/suspicious/noExplicitAny: renderHook type mismatch requires type override
	return renderHook(hook, { wrapper: WrapperComponent as any });
}

/**
 * Creates a mock DevToolsInfoResponse with sensible defaults.
 */
export function createMockDevToolsInfo(overrides: Partial<DevToolsInfoResponse> = {}): DevToolsInfoResponse {
	return {
		enabled: true,
		githubAppCreatorEnabled: true,
		jobTesterEnabled: true,
		dataClearerEnabled: true,
		draftGeneratorEnabled: true,
		githubApp: {
			defaultOrg: "jolliai",
			defaultManifest: {
				name: "jolli-local",
				url: "http://localhost:8034",
				public: false,
			},
		},
		...overrides,
	};
}

/**
 * Creates a mock GitHub API client with sensible defaults.
 */
export function createMockGitHubApi(overrides: Partial<GitHubClient> = {}): GitHubClient {
	return {
		syncGitHubInstallations: vi.fn().mockResolvedValue({}),
		getGitHubApps: vi.fn().mockResolvedValue([]),
		getGitHubInstallations: vi.fn().mockResolvedValue([]),
		getGitHubInstallationRepos: vi.fn().mockResolvedValue({ repositories: [] }),
		enableGitHubRepo: vi.fn().mockResolvedValue({}),
		disableGitHubRepo: vi.fn().mockResolvedValue({}),
		getGitHubOrgRepos: vi.fn().mockResolvedValue([]),
		getGitHubUserRepos: vi.fn().mockResolvedValue([]),
		...overrides,
	} as GitHubClient;
}

/**
 * Creates a mock Jobs API client with sensible defaults.
 */
export function createMockJobsApi(overrides: Partial<JobClient> = {}): JobClient {
	return {
		getJobHistory: vi.fn().mockResolvedValue([]),
		getDashboardActiveJobs: vi.fn().mockResolvedValue([]),
		getJobExecution: vi.fn().mockResolvedValue(null),
		subscribeToJobEvents: vi.fn().mockReturnValue(() => {
			// Return unsubscribe function
		}),
		...overrides,
	} as JobClient;
}

/**
 * Creates a complete mock Client with all API methods.
 */
export function createMockClient(
	overrides: {
		github?: Partial<GitHubClient>;
		jobs?: Partial<JobClient>;
		devTools?: {
			getDevToolsInfo?: () => Promise<DevToolsInfoResponse>;
			completeGitHubAppSetup?: () => Promise<unknown>;
			triggerDemoJob?: () => Promise<unknown>;
		};
		[key: string]: unknown;
	} = {},
): Client {
	const mockGitHub = createMockGitHubApi(overrides.github || {});
	const mockJobs = createMockJobsApi(overrides.jobs || {});

	// Store the override functions to use in the factory
	const devToolsOverrides = overrides.devTools || {};

	// Exclude github, jobs, and devTools from the spread to prevent overriding the properly structured methods
	const { github: _github, jobs: _jobs, devTools: _devTools, ...otherOverrides } = overrides;

	return {
		github: vi.fn(() => mockGitHub),
		jobs: vi.fn(() => mockJobs),
		// Create fresh mock objects on each call to avoid vi.clearAllMocks() issues
		devTools: vi.fn(() => ({
			getDevToolsInfo: devToolsOverrides.getDevToolsInfo || vi.fn().mockResolvedValue(createMockDevToolsInfo()),
			completeGitHubAppSetup:
				devToolsOverrides.completeGitHubAppSetup ||
				vi.fn().mockResolvedValue({
					success: true,
					config: "{}",
					appInfo: { name: "Test App", htmlUrl: "https://github.com" },
				}),
			triggerDemoJob: devToolsOverrides.triggerDemoJob || vi.fn().mockResolvedValue({ jobId: "test-job-id" }),
		})),
		integrations: vi.fn(() => ({
			listIntegrations: vi.fn().mockResolvedValue([]),
			hasAnyIntegrations: vi.fn().mockResolvedValue(false),
			enableIntegration: vi.fn().mockResolvedValue({}),
			disableIntegration: vi.fn().mockResolvedValue({}),
		})),
		auth: vi.fn(() => ({
			getCliToken: vi.fn().mockResolvedValue({ token: "mock-token", space: "default" }),
			setAuthToken: vi.fn(),
			getSessionConfig: vi.fn().mockResolvedValue({ idleTimeoutMs: 3600000 }),
		})),
		docs: vi.fn(() => ({
			listDocs: vi.fn().mockResolvedValue([]),
			getDoc: vi.fn().mockResolvedValue(null),
			getDocById: vi.fn().mockResolvedValue(undefined),
			findDoc: vi.fn().mockResolvedValue(null),
			createDraftFromArticle: vi.fn().mockResolvedValue({ id: 1 }),
		})),
		docDrafts: vi.fn(() => ({
			listDocDrafts: vi.fn().mockResolvedValue([]),
			getDraftsWithPendingChanges: vi.fn().mockResolvedValue([]),
			getSectionChanges: vi.fn().mockResolvedValue({ changes: [], sections: [] }),
			applySectionChange: vi.fn().mockResolvedValue({}),
			dismissSectionChange: vi.fn().mockResolvedValue({}),
		})),
		userManagement: vi.fn(() => ({
			listActiveUsers: vi
				.fn()
				.mockResolvedValue({ data: [], total: 0, canEditRoles: false, canManageUsers: false }),
		})),
		docsites: vi.fn(() => ({
			listDocsites: vi.fn().mockResolvedValue([]),
			getDocsite: vi.fn().mockResolvedValue(null),
			deleteDocsite: vi.fn().mockResolvedValue({}),
			generateDocsite: vi.fn().mockResolvedValue({}),
		})),
		profile: vi.fn(() => ({
			getProfile: vi.fn().mockResolvedValue({
				id: 1,
				email: "test@example.com",
				name: "Test User",
				image: null,
			}),
			updateProfile: vi.fn().mockResolvedValue({
				id: 1,
				email: "test@example.com",
				name: "Test User",
				image: null,
			}),
			hasPassword: vi.fn().mockResolvedValue({ hasPassword: true }),
			setPassword: vi.fn().mockResolvedValue({ success: true }),
			changePassword: vi.fn().mockResolvedValue({ success: true }),
			logoutAllSessions: vi.fn().mockResolvedValue({ success: true }),
			getPreferences: vi.fn().mockResolvedValue({ favoriteSpaces: [], favoriteSites: [], hash: "EMPTY" }),
			updatePreferences: vi.fn().mockResolvedValue({ favoriteSpaces: [], favoriteSites: [], hash: "newhash" }),
		})),
		orgs: vi.fn(() => ({
			getCurrent: vi.fn().mockResolvedValue({
				tenant: null,
				org: null,
				availableOrgs: [],
				favoritesHash: "EMPTY",
			}),
			listOrgs: vi.fn().mockResolvedValue({ orgs: [] }),
		})),
		tenants: vi.fn(() => ({
			listTenants: vi.fn().mockResolvedValue({
				useTenantSwitcher: false,
				currentTenantId: null,
				baseDomain: null,
				tenants: [],
			}),
		})),
		roles: vi.fn(() => ({
			listRoles: vi.fn().mockResolvedValue([]),
			getRole: vi.fn().mockResolvedValue(null),
			cloneRole: vi.fn().mockResolvedValue(null),
			updateRole: vi.fn().mockResolvedValue(null),
			deleteRole: vi.fn().mockResolvedValue(undefined),
			setRolePermissions: vi.fn().mockResolvedValue(null),
			listPermissions: vi.fn().mockResolvedValue([]),
			listPermissionsGrouped: vi.fn().mockResolvedValue({
				sites: [],
				users: [],
				profile: [],
				tenant: [],
				spaces: [],
				integrations: [],
				roles: [],
				dashboard: [],
				articles: [],
				analytics: [],
				devtools: [],
			}),
			getCurrentUserPermissions: vi.fn().mockResolvedValue({
				role: {
					id: 1,
					name: "Owner",
					slug: "owner",
					description: null,
					isBuiltIn: true,
					isDefault: false,
					priority: 100,
					clonedFrom: null,
					createdAt: "2024-01-01T00:00:00.000Z",
					updatedAt: "2024-01-01T00:00:00.000Z",
					permissions: [],
				},
				permissions: [
					// All owner permissions for full access in tests
					"users.view",
					"users.edit",
					"spaces.view",
					"spaces.edit",
					"integrations.view",
					"integrations.edit",
					"sites.view",
					"sites.edit",
					"roles.view",
					"roles.edit",
					"dashboard.view",
					"articles.view",
					"articles.edit",
				],
			}),
		})),
		spaces: vi.fn(() => ({
			listSpaces: vi.fn().mockResolvedValue([
				{
					id: 1,
					name: "Default Space",
					slug: "default",
					jrn: "space:default",
					description: undefined,
					ownerId: 1,
					isPersonal: false,
					defaultSort: "default",
					defaultFilters: { updated: "any_time", creator: "" },
					createdAt: "2024-01-01T00:00:00Z",
					updatedAt: "2024-01-01T00:00:00Z",
				},
			]),
			getDefaultSpace: vi.fn().mockResolvedValue({
				id: 1,
				name: "Default Space",
				slug: "default",
				jrn: "space:default",
				description: undefined,
				ownerId: 1,
				isPersonal: false,
				defaultSort: "default",
				defaultFilters: { updated: "any_time", creator: "" },
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-01T00:00:00Z",
			}),
			getSpace: vi.fn().mockResolvedValue(null),
			getPersonalSpace: vi.fn().mockResolvedValue(null),
			createSpace: vi.fn().mockResolvedValue({}),
			updateSpace: vi.fn().mockResolvedValue({}),
			deleteSpace: vi.fn().mockResolvedValue({}),
			getTreeContent: vi.fn().mockResolvedValue([]),
			getTrashContent: vi.fn().mockResolvedValue([]),
			hasTrash: vi.fn().mockResolvedValue({ hasTrash: false }),
			updatePreferences: vi.fn().mockResolvedValue({}),
			getPreferences: vi.fn().mockResolvedValue(null),
		})),
		syncChangesets: vi.fn(() => ({
			listChangesets: vi.fn().mockResolvedValue([]),
			listChangesetsPage: vi.fn().mockResolvedValue({ changesets: [], hasMore: false }),
			getChangeset: vi.fn().mockResolvedValue(undefined),
			getChangesetFiles: vi.fn().mockResolvedValue([]),
			reviewChangesetFile: vi.fn().mockResolvedValue({}),
			publishChangeset: vi.fn().mockResolvedValue({}),
		})),
		onboarding: vi.fn(() => ({
			getState: vi.fn().mockResolvedValue({
				state: undefined,
				needsOnboarding: false,
			}),
			// biome-ignore lint/suspicious/useAwait: Mock async generator doesn't need real async operations
			chat: vi.fn().mockImplementation(async function* () {
				yield { type: "content", content: "Mock response" };
				yield { type: "done", state: undefined };
			}),
			skip: vi.fn().mockResolvedValue({ success: true, state: {} }),
			complete: vi.fn().mockResolvedValue({ success: true, state: {} }),
			restart: vi.fn().mockResolvedValue({ success: true, state: {} }),
		})),
		getUserInfo: vi.fn().mockResolvedValue(null),
		login: vi.fn().mockResolvedValue({ user: undefined }),
		logout: vi.fn().mockResolvedValue({}),
		...otherOverrides,
	} as unknown as Client;
}

/**
 * Common mock data fixtures
 */
export const mockUserInfo: UserInfo = {
	userId: 123,
	email: "test@example.com",
	name: "Test User",
	picture: undefined,
};

/**
 * Helper to wait for loading states to finish in tests
 */
export async function waitForLoadingToFinish(): Promise<void> {
	// Wait for next tick
	await new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Creates an Intlayer-like Proxy object for testing defensive code paths.
 * This simulates the behavior of Intlayer's Proxy objects that have a .value property.
 *
 * @param value - The string value to wrap
 * @returns An object that mimics Intlayer's Proxy structure while being testable
 *
 * @example
 * ```tsx
 * vi.mocked(useIntlayer).mockReturnValue({
 *   title: createMockIntlayerValue("Dashboard"),
 *   subtitle: createMockIntlayerValue("Overview"),
 * });
 * ```
 */
export function createMockIntlayerValue(value: string) {
	// Create a String object that can be used directly in JSX
	// This mimics how IntlayerNode behaves - it can be rendered directly
	// biome-ignore lint/style/useConsistentBuiltinInstantiation: Need String object (not primitive) for .value property
	// biome-ignore lint/suspicious/noExplicitAny: Mock helper returns any to match Intlayer's flexible types
	const str = new String(value) as any;
	str.value = value;
	return str;
}

/**
 * Recursively wraps all string values in an object with Intlayer-like .value properties.
 * This is used to convert plain mock objects to match the structure returned by useIntlayer.
 *
 * @param obj - The object with plain string values
 * @returns The same object structure but with strings wrapped in {value: string} objects
 *
 * @example
 * ```tsx
 * vi.mocked(useIntlayer).mockReturnValue(wrapIntlayerMock({
 *   title: "Dashboard",
 *   nested: {
 *     subtitle: "Overview"
 *   }
 * }));
 * // Returns: { title: { value: "Dashboard" }, nested: { subtitle: { value: "Overview" } } }
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: Test helper needs to return any to bypass Intlayer's strict union types
export function wrapIntlayerMock<T>(obj: T): any {
	if (typeof obj === "string") {
		return createMockIntlayerValue(obj);
	}

	if (Array.isArray(obj)) {
		return obj.map(item => wrapIntlayerMock(item));
	}

	if (obj !== null && typeof obj === "object") {
		const wrapped: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(obj)) {
			wrapped[key] = wrapIntlayerMock(value);
		}
		return wrapped;
	}

	return obj;
}

/**
 * Maps of intlayer dictionary keys to their English content.
 * This is used by setupIntlayerMock to provide realistic mock data.
 */
const INTLAYER_CONTENT_MAP: Record<string, Record<string, string>> = {
	analytics: {
		title: "Analytics",
		subtitle: "View your documentation analytics",
	},
	articles: {
		title: "Articles",
		subtitle: "Manage and review your documentation",
		noArticles: "No articles yet",
		loadMore: "Load more",
		articlesFound: "{count} articles found",
		selectedArticles: "{count} selected",
		search: "Search articles",
	},
	"app-layout": {
		tabDashboard: "Dashboard",
		tabArticles: "Articles",
		tabDocsites: "Docs Sites",
		tabAnalytics: "Analytics",
		tabIntegrations: "Sources",
		tabSettings: "Settings",
		tabDevTools: "Dev Tools",
		search: "Search",
		toggleSidebar: "Toggle sidebar",
		toggleChatbot: "Toggle AI assistant",
	},
	dashboard: {
		title: "Dashboard",
		subtitle: "Monitor your documentation",
		jobsTitle: "Recent Jobs",
		loadingStats: "Loading stats...",
		noStats: "No stats available",
		statRunning: "Running",
		statCompleted: "Completed",
		statFailed: "Failed",
		statRetries: "Retries",
		viewRunningJobs: "View Running Jobs",
		viewHistory: "View History",
	},
	integrations: {
		title: "Integrations",
		subtitle: "Connect your repositories",
		noIntegrations: "No integrations yet",
		addIntegration: "Add Integration",
		loading: "Loading integrations...",
	},
	"integration-setup": {
		welcomeTitle: "Welcome to Jolli!",
		welcomeSubtitle: "Let's get you started by connecting your first repository",
		addIntegrationTitle: "Add an Integration",
		addIntegrationSubtitle: "Connect another repository to expand your documentation",
		getStarted: "Get Started",
		addIntegration: "Add Integration",
		skip: "Skip for now",
		successTitle: "All Set!",
		successSubtitle: "Your integration has been successfully configured",
		goToDashboard: "Go to Dashboard",
		redirecting: "Redirecting to GitHub...",
		goBack: "Go Back",
	},
};

/**
 * Sets up a mock implementation of useIntlayer that returns actual English content
 * based on the dictionary key. This allows tests to use getByText with real content
 * while gradually migrating to data-testid.
 *
 * @example
 * ```tsx
 * import { setupIntlayerMock } from "../test/TestUtils";
 * import { useIntlayer } from "react-intlayer";
 *
 * beforeEach(() => {
 *   setupIntlayerMock(vi.mocked(useIntlayer));
 * });
 * ```
 */
export function setupIntlayerMock(mockedUseIntlayer: ReturnType<typeof vi.fn>) {
	mockedUseIntlayer.mockImplementation((key: string) => {
		const content = INTLAYER_CONTENT_MAP[key];
		if (!content) {
			// Fall back to smart mock if key not found
			const smartMock: Record<string, unknown> = {};
			return new Proxy(smartMock, {
				get(_target, prop) {
					return createMockIntlayerValue(String(prop));
				},
			});
		}
		return wrapIntlayerMock(content);
	});
}
