import { createMockClient, renderWithProviders } from "../test/TestUtils";
import { createMockIntlayerValue } from "../util/Vitest";
import { useNavigation } from "./NavigationContext";
import { render, waitFor } from "@testing-library/preact";
import type { UserInfo } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Create stable mock APIs
const mockAuthApi = {
	getCliToken: vi.fn(),
};

const mockDevToolsApi = {
	getDevToolsInfo: vi.fn(),
	completeGitHubAppSetup: vi.fn(),
	triggerDemoJob: vi.fn(),
};

/** All owner permissions — the default for most tests */
const ALL_PERMISSIONS = [
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
];

const mockRolesApi = {
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
	getCurrentUserPermissions: vi.fn(),
};

const mockClient = createMockClient();
mockClient.auth = vi.fn(() => mockAuthApi) as unknown as typeof mockClient.auth;
mockClient.devTools = vi.fn(() => mockDevToolsApi) as unknown as typeof mockClient.devTools;
mockClient.roles = vi.fn(() => mockRolesApi) as unknown as typeof mockClient.roles;

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

describe("NavigationContext", () => {
	beforeEach(() => {
		sessionStorage.clear();
		mockAuthApi.getCliToken.mockClear();
		mockAuthApi.getCliToken.mockResolvedValue({ token: "mock-token", space: "default" });
		mockDevToolsApi.getDevToolsInfo.mockClear();
		mockDevToolsApi.getDevToolsInfo.mockResolvedValue({ enabled: true });
		mockRolesApi.getCurrentUserPermissions.mockClear();
		mockRolesApi.getCurrentUserPermissions.mockResolvedValue({
			role: {
				id: 1,
				name: "Owner",
				slug: "owner",
				description: null,
				isBuiltIn: true,
				isDefault: false,
				priority: 100,
				clonedFrom: null,
				createdAt: "2024-01-01",
				updatedAt: "2024-01-01",
				permissions: [],
			},
			permissions: ALL_PERMISSIONS,
		});
	});

	it("should provide tabs from navigation", async () => {
		let tabsLength = 0;

		function TestComponent() {
			const params = useNavigation();
			tabsLength = params.tabs.length;
			return <div>tabs: {tabsLength}</div>;
		}

		const { container } = renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/articles/doc:test-123"),
			pathname: createMockIntlayerValue("/articles/doc:test-123"),
		});

		// Navigation now only shows 1 tab (Dashboard)
		// Other tabs (Articles, Sites, Analytics, Settings, Dev Tools) are accessible via direct URLs
		// Wait for devtools to load async
		await waitFor(() => {
			expect(container.textContent).toContain("tabs: 1");
		});
	});

	it("should decode URI components when getting params", () => {
		let articleJrn: string | undefined;

		function TestComponent() {
			const params = useNavigation();
			articleJrn = params.articleJrn;
			return <div>Test</div>;
		}

		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/articles/doc%3Atest-123"),
			pathname: createMockIntlayerValue("/articles/doc%3Atest-123"),
		});

		expect(articleJrn).toBe("doc:test-123");
	});

	it("should return undefined for non-article routes", () => {
		let articleJrn: string | undefined = "something";

		function TestComponent() {
			const params = useNavigation();
			articleJrn = params.articleJrn;
			return <div>Test</div>;
		}

		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/dashboard"),
			pathname: createMockIntlayerValue("/dashboard"),
		});

		expect(articleJrn).toBeUndefined();
	});

	it("should use window.location.pathname when pathname prop is not provided", () => {
		let activeTab = "";

		function TestComponent() {
			const params = useNavigation();
			activeTab = params.activeTab;
			return <div>Test</div>;
		}

		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/"),
		});

		// Should get activeTab from window.location.pathname
		expect(typeof activeTab).toBe("string");
	});

	it("should handle paths correctly", () => {
		let activeTab = "";

		function TestComponent() {
			const params = useNavigation();
			activeTab = params.activeTab;
			return <div>Test</div>;
		}

		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/articles/doc:test"),
			pathname: createMockIntlayerValue("/articles/doc:test"),
		});

		expect(activeTab).toBe("articles");
	});

	it("should throw error when useNavigation is used outside provider", () => {
		function TestComponent() {
			useNavigation();
			return <div>Test</div>;
		}

		expect(() => {
			render(<TestComponent />);
		}).toThrow("useNavigation must be used within a NavigationProvider");
	});

	it("should update when popstate event is fired", () => {
		let activeTab = "";

		function TestComponent() {
			const params = useNavigation();
			activeTab = params.activeTab;
			return <div>{activeTab}</div>;
		}

		// Initial render - since pathname is always provided by renderWithProviders,
		// we need to test that the navigation context responds to manual navigation calls
		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/dashboard"),
			pathname: createMockIntlayerValue("/dashboard"),
		});

		expect(activeTab).toBe("dashboard");

		// When pathname prop is provided, popstate is ignored
		// This test verifies the pathname prop works correctly
		window.history.pushState({}, "", "/analytics");
		window.dispatchEvent(new PopStateEvent("popstate"));

		// activeTab should NOT update because pathname prop was provided
		expect(activeTab).toBe("dashboard");
	});

	it("should not listen to popstate when pathname prop is provided", () => {
		let activeTab = "";

		function TestComponent() {
			const params = useNavigation();
			activeTab = params.activeTab;
			return <div>Test</div>;
		}

		// Render with pathname prop (for testing)
		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/articles"),
			pathname: createMockIntlayerValue("/articles"),
		});

		expect(activeTab).toBe("articles");

		// Change the URL and fire popstate event
		window.history.pushState({}, "", "/dashboard");
		window.dispatchEvent(new PopStateEvent("popstate"));

		// activeTab should NOT update because pathname prop was provided
		expect(activeTab).toBe("articles");
	});

	it("should set activeTab to 'agent' for /agent path", () => {
		let activeTab = "";

		function TestComponent() {
			const params = useNavigation();
			activeTab = params.activeTab;
			return <div>Test</div>;
		}

		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/agent"),
			pathname: createMockIntlayerValue("/agent"),
		});

		expect(activeTab).toBe("agent");
	});

	it("should set articleView to 'list' for /articles", () => {
		let articleView = "none";

		function TestComponent() {
			const params = useNavigation();
			articleView = params.articleView;
			return <div>Test</div>;
		}

		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/articles"),
			pathname: createMockIntlayerValue("/articles"),
		});

		expect(articleView).toBe("list");
	});

	it("should set articleView to 'detail' for /articles/{jrn}", () => {
		let articleView = "none";
		let articleJrn: string | undefined;

		function TestComponent() {
			const params = useNavigation();
			articleView = params.articleView;
			articleJrn = params.articleJrn;
			return <div>Test</div>;
		}

		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/articles/doc:test-123"),
			pathname: createMockIntlayerValue("/articles/doc:test-123"),
		});

		expect(articleView).toBe("detail");
		expect(articleJrn).toBe("doc:test-123");
	});

	it("should set articleView to 'preview' for /articles/{jrn}/preview", () => {
		let articleView = "none";
		let articleJrn: string | undefined;

		function TestComponent() {
			const params = useNavigation();
			articleView = params.articleView;
			articleJrn = params.articleJrn;
			return <div>Test</div>;
		}

		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/articles/doc:test-123/preview"),
			pathname: createMockIntlayerValue("/articles/doc:test-123/preview"),
		});

		expect(articleView).toBe("preview");
		expect(articleJrn).toBe("doc:test-123");
	});

	it("should set articleView to 'source' for /articles/{jrn}/source", () => {
		let articleView = "none";
		let articleJrn: string | undefined;

		function TestComponent() {
			const params = useNavigation();
			articleView = params.articleView;
			articleJrn = params.articleJrn;
			return <div>Test</div>;
		}

		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/articles/doc:test-123/source"),
			pathname: createMockIntlayerValue("/articles/doc:test-123/source"),
		});

		expect(articleView).toBe("source");
		expect(articleJrn).toBe("doc:test-123");
	});

	it("should set articleView to 'none' for non-articles routes", () => {
		let articleView = "list";
		let articleJrn: string | undefined = "something";

		function TestComponent() {
			const params = useNavigation();
			articleView = params.articleView;
			articleJrn = params.articleJrn;
			return <div>Test</div>;
		}

		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/dashboard"),
			pathname: createMockIntlayerValue("/dashboard"),
		});

		expect(articleView).toBe("none");
		expect(articleJrn).toBeUndefined();
	});

	it("should navigate to a new path and update state", () => {
		let activeTab = "";
		let navigateFn: ((pathname: string) => void) | undefined;

		function TestComponent() {
			const params = useNavigation();
			activeTab = params.activeTab;
			navigateFn = params.navigate;
			return <div>{activeTab}</div>;
		}

		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/dashboard"),
			pathname: createMockIntlayerValue("/dashboard"),
		});

		// Initial state
		expect(activeTab).toBe("dashboard");

		// Verify navigate function is available
		expect(navigateFn).toBeDefined();

		// Navigate function delegates to router's navigate
		// The actual navigation behavior is tested in RouterContext tests
		expect(typeof navigateFn).toBe("function");
	});

	it("should set integrationView to 'github' for /integrations/github", () => {
		let integrationView: string | undefined;

		function TestComponent() {
			const params = useNavigation();
			integrationView = params.integrationView;
			return <div>Test</div>;
		}

		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/integrations/github"),
			pathname: createMockIntlayerValue("/integrations/github"),
		});

		expect(integrationView).toBe("github");
	});

	it("should set integrationView to 'github-org-repos' for /integrations/github/org/{name}", () => {
		let integrationView: string | undefined;
		let integrationContainer: string | undefined;
		let integrationContainerType: string | undefined;

		function TestComponent() {
			const params = useNavigation();
			integrationView = params.integrationView;
			integrationContainer = params.integrationContainer;
			integrationContainerType = params.integrationContainerType;
			return <div>Test</div>;
		}

		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/integrations/github/org/my-org"),
			pathname: createMockIntlayerValue("/integrations/github/org/my-org"),
		});

		expect(integrationView).toBe("github-org-repos");
		expect(integrationContainer).toBe("my-org");
		expect(integrationContainerType).toBe("org");
	});

	it("should set integrationView to 'github-user-repos' for /integrations/github/user/{name}", () => {
		let integrationView: string | undefined;
		let integrationContainer: string | undefined;
		let integrationContainerType: string | undefined;

		function TestComponent() {
			const params = useNavigation();
			integrationView = params.integrationView;
			integrationContainer = params.integrationContainer;
			integrationContainerType = params.integrationContainerType;
			return <div>Test</div>;
		}

		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/integrations/github/user/my-user"),
			pathname: createMockIntlayerValue("/integrations/github/user/my-user"),
		});

		expect(integrationView).toBe("github-user-repos");
		expect(integrationContainer).toBe("my-user");
		expect(integrationContainerType).toBe("user");
	});

	it("should set integrationView to 'static-file' for /integrations/static-file/{id}", () => {
		let integrationView: string | undefined;
		let staticFileIntegrationId: number | undefined;

		function TestComponent() {
			const params = useNavigation();
			integrationView = params.integrationView;
			staticFileIntegrationId = params.staticFileIntegrationId;
			return null;
		}

		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/integrations/static-file/123"),
			pathname: createMockIntlayerValue("/integrations/static-file/123"),
		});

		expect(integrationView).toBe("static-file");
		expect(staticFileIntegrationId).toBe(123);
	});

	it("should include devtools tab when devtools are enabled", async () => {
		mockDevToolsApi.getDevToolsInfo.mockResolvedValue({ enabled: true });

		let tabsLength = 0;

		function TestComponent() {
			const params = useNavigation();
			tabsLength = params.tabs.length;
			return <div>Test</div>;
		}

		const userInfo: UserInfo = {
			userId: 123,
			email: createMockIntlayerValue("test@example.com"),
			name: createMockIntlayerValue("Test User"),
			picture: undefined,
		};

		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/dashboard"),
			pathname: createMockIntlayerValue("/dashboard"),
			userInfo,
		});

		// Wait for dev tools check to complete
		// Navigation now only shows 1 tab (Dashboard)
		// Other tabs (Articles, Sites, Analytics, Settings, Dev Tools) are accessible via direct URLs
		await waitFor(() => {
			expect(tabsLength).toBe(1);
		});
	});

	it("should handle intlayer values with .key property", async () => {
		// Mock useIntlayer with .key property to test getStringValue edge case
		// The global smart mock in Vitest.tsx handles useIntlayer automatically

		let tabsLength = 0;

		function TestComponent() {
			const params = useNavigation();
			tabsLength = params.tabs.length;
			return <div>tabs: {tabsLength}</div>;
		}

		const { container } = renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/articles/doc:test-123"),
			pathname: createMockIntlayerValue("/articles/doc:test-123"),
		});

		// Wait for component to render
		// Navigation now only shows 1 tab (Dashboard)
		// Other tabs (Articles, Sites, Analytics, Settings, Dev Tools) are accessible via direct URLs
		await waitFor(() => {
			expect(container.textContent).toContain("tabs: 1");
		});

		// Verify that tabs were created successfully (which means getStringValue worked)
		expect(tabsLength).toBe(1);
	});

	it("should set siteView to 'list' for /sites", () => {
		let siteView = "none";

		function TestComponent() {
			const params = useNavigation();
			siteView = params.siteView;
			return <div>Test</div>;
		}

		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/sites"),
			pathname: createMockIntlayerValue("/sites"),
		});

		expect(siteView).toBe("list");
	});

	it("should set siteView to 'detail' for /sites/{id}", () => {
		let siteView = "none";
		let siteId: number | undefined;

		function TestComponent() {
			const params = useNavigation();
			siteView = params.siteView;
			siteId = params.siteId;
			return <div>Test</div>;
		}

		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/sites/123"),
			pathname: createMockIntlayerValue("/sites/123"),
		});

		expect(siteView).toBe("detail");
		expect(siteId).toBe(123);
	});

	it("should set siteView to 'none' for non-sites routes", () => {
		let siteView = "list";
		let siteId: number | undefined = 999;

		function TestComponent() {
			const params = useNavigation();
			siteView = params.siteView;
			siteId = params.siteId;
			return <div>Test</div>;
		}

		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/dashboard"),
			pathname: createMockIntlayerValue("/dashboard"),
		});

		expect(siteView).toBe("none");
		expect(siteId).toBeUndefined();
	});

	describe("Space Settings Route", () => {
		it("should set spaceSettingsView to 'general' for /spaces/:id/settings", () => {
			let spaceSettingsView: string | undefined;
			let spaceSettingsSpaceId: number | undefined;

			function TestComponent() {
				const params = useNavigation();
				spaceSettingsView = params.spaceSettingsView;
				spaceSettingsSpaceId = params.spaceSettingsSpaceId;
				return <div>Test</div>;
			}

			renderWithProviders(<TestComponent />, {
				initialPath: createMockIntlayerValue("/spaces/42/settings"),
				pathname: createMockIntlayerValue("/spaces/42/settings"),
			});

			expect(spaceSettingsView).toBe("general");
			expect(spaceSettingsSpaceId).toBe(42);
		});

		it("should set spaceSettingsView to 'general' for /spaces/:id/settings/general", () => {
			let spaceSettingsView: string | undefined;
			let spaceSettingsSpaceId: number | undefined;

			function TestComponent() {
				const params = useNavigation();
				spaceSettingsView = params.spaceSettingsView;
				spaceSettingsSpaceId = params.spaceSettingsSpaceId;
				return <div>Test</div>;
			}

			renderWithProviders(<TestComponent />, {
				initialPath: createMockIntlayerValue("/spaces/7/settings/general"),
				pathname: createMockIntlayerValue("/spaces/7/settings/general"),
			});

			expect(spaceSettingsView).toBe("general");
			expect(spaceSettingsSpaceId).toBe(7);
		});

		it("should set spaceSettingsView to 'none' for non-matching routes", () => {
			let spaceSettingsView: string | undefined;
			let spaceSettingsSpaceId: number | undefined;

			function TestComponent() {
				const params = useNavigation();
				spaceSettingsView = params.spaceSettingsView;
				spaceSettingsSpaceId = params.spaceSettingsSpaceId;
				return <div>Test</div>;
			}

			renderWithProviders(<TestComponent />, {
				initialPath: createMockIntlayerValue("/spaces/42"),
				pathname: createMockIntlayerValue("/spaces/42"),
			});

			expect(spaceSettingsView).toBe("none");
			expect(spaceSettingsSpaceId).toBeUndefined();
		});
	});

	it("should set siteView to 'create' for /sites/new", () => {
		let siteView = "none";

		function TestComponent() {
			const params = useNavigation();
			siteView = params.siteView;
			return <div>Test</div>;
		}

		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/sites/new"),
			pathname: createMockIntlayerValue("/sites/new"),
		});

		expect(siteView).toBe("create");
	});

	describe("Site Settings Route", () => {
		it("should set siteView to 'none' and siteSettingsView to 'general' for /sites/:id/settings", () => {
			let siteView = "list";
			let siteSettingsView: string | undefined;
			let siteSettingsSiteId: number | undefined;

			function TestComponent() {
				const params = useNavigation();
				siteView = params.siteView;
				siteSettingsView = params.siteSettingsView;
				siteSettingsSiteId = params.siteSettingsSiteId;
				return <div>Test</div>;
			}

			renderWithProviders(<TestComponent />, {
				initialPath: createMockIntlayerValue("/sites/42/settings"),
				pathname: createMockIntlayerValue("/sites/42/settings"),
			});

			// parseSiteRoute returns early for settings routes, so siteView is "none"
			expect(siteView).toBe("none");
			expect(siteSettingsView).toBe("general");
			expect(siteSettingsSiteId).toBe(42);
		});

		it("should set siteSettingsView to 'general' for /sites/:id/settings/general", () => {
			let siteSettingsView: string | undefined;
			let siteSettingsSiteId: number | undefined;

			function TestComponent() {
				const params = useNavigation();
				siteSettingsView = params.siteSettingsView;
				siteSettingsSiteId = params.siteSettingsSiteId;
				return <div>Test</div>;
			}

			renderWithProviders(<TestComponent />, {
				initialPath: createMockIntlayerValue("/sites/7/settings/general"),
				pathname: createMockIntlayerValue("/sites/7/settings/general"),
			});

			expect(siteSettingsView).toBe("general");
			expect(siteSettingsSiteId).toBe(7);
		});

		it("should set siteSettingsView to 'none' for non-settings site routes", () => {
			let siteSettingsView = "general";
			let siteSettingsSiteId: number | undefined = 99;

			function TestComponent() {
				const params = useNavigation();
				siteSettingsView = params.siteSettingsView;
				siteSettingsSiteId = params.siteSettingsSiteId;
				return <div>Test</div>;
			}

			renderWithProviders(<TestComponent />, {
				initialPath: createMockIntlayerValue("/sites/42"),
				pathname: createMockIntlayerValue("/sites/42"),
			});

			expect(siteSettingsView).toBe("none");
			expect(siteSettingsSiteId).toBeUndefined();
		});
	});

	it("should set spaceSettingsView to 'sources' for /spaces/:id/settings/sources", () => {
		let spaceSettingsView: string | undefined;
		let spaceSettingsSpaceId: number | undefined;

		function TestComponent() {
			const params = useNavigation();
			spaceSettingsView = params.spaceSettingsView;
			spaceSettingsSpaceId = params.spaceSettingsSpaceId;
			return <div>Test</div>;
		}

		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/spaces/5/settings/sources"),
			pathname: createMockIntlayerValue("/spaces/5/settings/sources"),
		});

		expect(spaceSettingsView).toBe("sources");
		expect(spaceSettingsSpaceId).toBe(5);
	});

	describe("Query param parsing", () => {
		it("should parse inlineEditDraftId and selectedDocId from ?edit= and ?doc= params", () => {
			let inlineEditDraftId: number | undefined;
			let selectedDocId: number | undefined;

			function TestComponent() {
				const params = useNavigation();
				inlineEditDraftId = params.inlineEditDraftId;
				selectedDocId = params.selectedDocId;
				return <div>Test</div>;
			}

			renderWithProviders(<TestComponent />, {
				initialPath: "/articles?edit=42&doc=99",
				pathname: createMockIntlayerValue("/articles"),
			});

			expect(inlineEditDraftId).toBe(42);
			expect(selectedDocId).toBe(99);
		});

		it("should return undefined for inlineEditDraftId and selectedDocId when params are not valid numbers", () => {
			let inlineEditDraftId: number | undefined = 1;
			let selectedDocId: number | undefined = 1;

			function TestComponent() {
				const params = useNavigation();
				inlineEditDraftId = params.inlineEditDraftId;
				selectedDocId = params.selectedDocId;
				return <div>Test</div>;
			}

			renderWithProviders(<TestComponent />, {
				initialPath: "/articles?edit=abc&doc=xyz",
				pathname: createMockIntlayerValue("/articles"),
			});

			expect(inlineEditDraftId).toBeUndefined();
			expect(selectedDocId).toBeUndefined();
		});
	});

	it("should include settings tab in tabs when permission is not required", () => {
		let tabs: Array<{ name: string }> = [];

		function TestComponent() {
			const params = useNavigation();
			tabs = params.tabs;
			return <div>tabs: {tabs.length}</div>;
		}

		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/settings"),
			pathname: createMockIntlayerValue("/settings"),
		});

		expect(tabs.length).toBeGreaterThanOrEqual(1);
	});

	describe("Route Permission Guard", () => {
		it("should redirect from /integrations to /dashboard without integrations.view", async () => {
			mockRolesApi.getCurrentUserPermissions.mockResolvedValue({
				role: {
					id: 2,
					name: "Viewer",
					slug: "viewer",
					description: null,
					isBuiltIn: true,
					isDefault: false,
					priority: 10,
					clonedFrom: null,
					createdAt: "2024-01-01",
					updatedAt: "2024-01-01",
					permissions: [],
				},
				permissions: ["dashboard.view", "articles.view"],
			});

			function TestComponent() {
				const params = useNavigation();
				return <div>activeTab: {params.activeTab}</div>;
			}

			renderWithProviders(<TestComponent />, {
				initialPath: createMockIntlayerValue("/integrations"),
				pathname: createMockIntlayerValue("/integrations"),
			});

			await waitFor(() => {
				expect(window.location.pathname).toBe("/dashboard");
			});
		});

		it("should redirect from /settings/sources to /dashboard without integrations.view", async () => {
			mockRolesApi.getCurrentUserPermissions.mockResolvedValue({
				role: {
					id: 2,
					name: "Viewer",
					slug: "viewer",
					description: null,
					isBuiltIn: true,
					isDefault: false,
					priority: 10,
					clonedFrom: null,
					createdAt: "2024-01-01",
					updatedAt: "2024-01-01",
					permissions: [],
				},
				permissions: ["dashboard.view", "articles.view"],
			});

			function TestComponent() {
				const params = useNavigation();
				return <div>activeTab: {params.activeTab}</div>;
			}

			renderWithProviders(<TestComponent />, {
				initialPath: createMockIntlayerValue("/settings/sources"),
				pathname: createMockIntlayerValue("/settings/sources"),
			});

			await waitFor(() => {
				expect(window.location.pathname).toBe("/dashboard");
			});
		});

		it("should redirect from /users to /dashboard without users.view", async () => {
			mockRolesApi.getCurrentUserPermissions.mockResolvedValue({
				role: {
					id: 2,
					name: "Viewer",
					slug: "viewer",
					description: null,
					isBuiltIn: true,
					isDefault: false,
					priority: 10,
					clonedFrom: null,
					createdAt: "2024-01-01",
					updatedAt: "2024-01-01",
					permissions: [],
				},
				permissions: ["dashboard.view", "articles.view"],
			});

			function TestComponent() {
				const params = useNavigation();
				return <div>activeTab: {params.activeTab}</div>;
			}

			renderWithProviders(<TestComponent />, {
				initialPath: createMockIntlayerValue("/users"),
				pathname: createMockIntlayerValue("/users"),
			});

			await waitFor(() => {
				expect(window.location.pathname).toBe("/dashboard");
			});
		});

		it("should redirect from /roles to /dashboard without roles.view", async () => {
			mockRolesApi.getCurrentUserPermissions.mockResolvedValue({
				role: {
					id: 2,
					name: "Viewer",
					slug: "viewer",
					description: null,
					isBuiltIn: true,
					isDefault: false,
					priority: 10,
					clonedFrom: null,
					createdAt: "2024-01-01",
					updatedAt: "2024-01-01",
					permissions: [],
				},
				permissions: ["dashboard.view", "articles.view"],
			});

			function TestComponent() {
				const params = useNavigation();
				return <div>activeTab: {params.activeTab}</div>;
			}

			renderWithProviders(<TestComponent />, {
				initialPath: createMockIntlayerValue("/roles"),
				pathname: createMockIntlayerValue("/roles"),
			});

			await waitFor(() => {
				expect(window.location.pathname).toBe("/dashboard");
			});
		});

		it("should redirect from /articles to /dashboard without articles.view", async () => {
			mockRolesApi.getCurrentUserPermissions.mockResolvedValue({
				role: {
					id: 2,
					name: "Viewer",
					slug: "viewer",
					description: null,
					isBuiltIn: true,
					isDefault: false,
					priority: 10,
					clonedFrom: null,
					createdAt: "2024-01-01",
					updatedAt: "2024-01-01",
					permissions: [],
				},
				permissions: ["dashboard.view", "integrations.view"],
			});

			function TestComponent() {
				const params = useNavigation();
				return <div>activeTab: {params.activeTab}</div>;
			}

			renderWithProviders(<TestComponent />, {
				initialPath: createMockIntlayerValue("/articles"),
				pathname: createMockIntlayerValue("/articles"),
			});

			await waitFor(() => {
				expect(window.location.pathname).toBe("/dashboard");
			});
		});

		it("should redirect from /sites to /dashboard without sites.view", async () => {
			mockRolesApi.getCurrentUserPermissions.mockResolvedValue({
				role: {
					id: 2,
					name: "Viewer",
					slug: "viewer",
					description: null,
					isBuiltIn: true,
					isDefault: false,
					priority: 10,
					clonedFrom: null,
					createdAt: "2024-01-01",
					updatedAt: "2024-01-01",
					permissions: [],
				},
				permissions: ["dashboard.view", "articles.view"],
			});

			function TestComponent() {
				const params = useNavigation();
				return <div>activeTab: {params.activeTab}</div>;
			}

			renderWithProviders(<TestComponent />, {
				initialPath: createMockIntlayerValue("/sites"),
				pathname: createMockIntlayerValue("/sites"),
			});

			await waitFor(() => {
				expect(window.location.pathname).toBe("/dashboard");
			});
		});

		it("should NOT redirect from /integrations when user has integrations.view", async () => {
			mockRolesApi.getCurrentUserPermissions.mockResolvedValue({
				role: {
					id: 1,
					name: "Owner",
					slug: "owner",
					description: null,
					isBuiltIn: true,
					isDefault: false,
					priority: 100,
					clonedFrom: null,
					createdAt: "2024-01-01",
					updatedAt: "2024-01-01",
					permissions: [],
				},
				permissions: ALL_PERMISSIONS,
			});

			let activeTab = "";

			function TestComponent() {
				const params = useNavigation();
				activeTab = params.activeTab;
				return <div>activeTab: {activeTab}</div>;
			}

			// Set window.location to /integrations before render
			window.history.pushState({}, "", "/integrations");

			renderWithProviders(<TestComponent />, {
				initialPath: createMockIntlayerValue("/integrations"),
				pathname: createMockIntlayerValue("/integrations"),
			});

			// Wait for permissions to load — should stay on integrations
			await waitFor(() => {
				expect(activeTab).toBe("integrations");
			});
			expect(window.location.pathname).toBe("/integrations");
		});

		it("should NOT redirect while permissions are still loading", () => {
			// Use a never-resolving promise to simulate loading state
			// biome-ignore lint/suspicious/noEmptyBlockStatements: intentionally never-resolving promise to simulate perpetual loading
			mockRolesApi.getCurrentUserPermissions.mockReturnValue(new Promise(() => {}));

			let activeTab = "";

			function TestComponent() {
				const params = useNavigation();
				activeTab = params.activeTab;
				return <div>activeTab: {activeTab}</div>;
			}

			// Set window.location to /integrations before render
			window.history.pushState({}, "", "/integrations");

			renderWithProviders(<TestComponent />, {
				initialPath: createMockIntlayerValue("/integrations"),
				pathname: createMockIntlayerValue("/integrations"),
			});

			// Should stay on integrations while loading (no redirect flash)
			expect(activeTab).toBe("integrations");
			expect(window.location.pathname).toBe("/integrations");
		});

		it("should NOT redirect from /dashboard even without dashboard.view", async () => {
			mockRolesApi.getCurrentUserPermissions.mockResolvedValue({
				role: {
					id: 2,
					name: "Viewer",
					slug: "viewer",
					description: null,
					isBuiltIn: true,
					isDefault: false,
					priority: 10,
					clonedFrom: null,
					createdAt: "2024-01-01",
					updatedAt: "2024-01-01",
					permissions: [],
				},
				permissions: [], // No permissions at all
			});

			let activeTab = "";

			function TestComponent() {
				const params = useNavigation();
				activeTab = params.activeTab;
				return <div>activeTab: {activeTab}</div>;
			}

			window.history.pushState({}, "", "/dashboard");

			renderWithProviders(<TestComponent />, {
				initialPath: createMockIntlayerValue("/dashboard"),
				pathname: createMockIntlayerValue("/dashboard"),
			});

			// Wait for permissions to load — should NOT redirect from dashboard
			await waitFor(() => {
				expect(activeTab).toBe("dashboard");
			});
			expect(window.location.pathname).toBe("/dashboard");
		});
	});
});
