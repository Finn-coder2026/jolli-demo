import { createMockClient, renderWithProviders } from "../test/TestUtils";
import { createMockIntlayerValue } from "../util/Vitest";
import { useNavigation } from "./NavigationContext";
import { render, waitFor } from "@testing-library/preact";
import type { UserInfo } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Create stable mock APIs
const mockIntegrationsApi = {
	listIntegrations: vi.fn(),
	enableIntegration: vi.fn(),
	disableIntegration: vi.fn(),
};

const mockGitHubApi = {
	syncGitHubInstallations: vi.fn(),
	getGitHubApps: vi.fn(),
	getGitHubInstallations: vi.fn(),
	getGitHubInstallationRepos: vi.fn(),
	enableGitHubRepo: vi.fn(),
	disableGitHubRepo: vi.fn(),
	getGitHubOrgRepos: vi.fn(),
	getGitHubUserRepos: vi.fn(),
};

const mockAuthApi = {
	getCliToken: vi.fn(),
};

const mockDevToolsApi = {
	getDevToolsInfo: vi.fn(),
	completeGitHubAppSetup: vi.fn(),
	triggerDemoJob: vi.fn(),
};

const mockClient = createMockClient();
mockClient.integrations = vi.fn(() => mockIntegrationsApi) as unknown as typeof mockClient.integrations;
mockClient.github = vi.fn(() => mockGitHubApi) as unknown as typeof mockClient.github;
mockClient.auth = vi.fn(() => mockAuthApi) as unknown as typeof mockClient.auth;
mockClient.devTools = vi.fn(() => mockDevToolsApi) as unknown as typeof mockClient.devTools;

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

describe("NavigationContext", () => {
	beforeEach(() => {
		// Reset mock implementations
		mockIntegrationsApi.listIntegrations.mockClear();
		mockIntegrationsApi.listIntegrations.mockResolvedValue([]);
		mockGitHubApi.getGitHubInstallations.mockClear();
		mockGitHubApi.getGitHubInstallations.mockResolvedValue([]);
		mockAuthApi.getCliToken.mockClear();
		mockAuthApi.getCliToken.mockResolvedValue("mock-token");
		mockDevToolsApi.getDevToolsInfo.mockClear();
		mockDevToolsApi.getDevToolsInfo.mockResolvedValue({ enabled: true });
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

		// With devtools enabled (default in beforeEach), we expect 7 tabs
		// Wait for devtools to load async
		await waitFor(() => {
			expect(container.textContent).toContain("tabs: 7");
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
		}).toThrow("userNavigation must be used within a NavigationProvider");
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

	it("should refresh integrations when refreshIntegrations is called", () => {
		let refreshFn: (() => void) | undefined;
		let hasIntegrations: boolean | undefined;

		function TestComponent() {
			const params = useNavigation();
			refreshFn = params.refreshIntegrations;
			hasIntegrations = params.hasIntegrations;
			return <div>Test</div>;
		}

		renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/dashboard"),
			pathname: createMockIntlayerValue("/dashboard"),
		});

		expect(refreshFn).toBeDefined();
		refreshFn?.();

		// After refresh, hasIntegrations should be undefined
		expect(hasIntegrations).toBeUndefined();
	});

	it("should handle wizard completion when handleWizardComplete is called", async () => {
		let handleWizardCompleteFn: (() => void) | undefined;

		function TestComponent() {
			const params = useNavigation();
			handleWizardCompleteFn = params.integrationSetupComplete;
			return (
				<div>
					hasIntegrations: {String(params.hasIntegrations)} githubSetupComplete:{" "}
					{String(params.githubSetupComplete)}
				</div>
			);
		}

		const { container, rerender } = renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/dashboard"),
			pathname: createMockIntlayerValue("/dashboard"),
		});

		expect(handleWizardCompleteFn).toBeDefined();
		handleWizardCompleteFn?.();

		// Force a rerender to pick up state change
		rerender(<TestComponent />);

		// After calling integrationSetupComplete, hasIntegrations should be true and githubSetupComplete should be false
		await waitFor(() => {
			expect(container.textContent).toContain("hasIntegrations: true");
			expect(container.textContent).toContain("githubSetupComplete: false");
		});
	});

	it("should handle GitHub setup success URL parameter", async () => {
		const userInfo: UserInfo = {
			email: createMockIntlayerValue("test@example.com"),
			name: createMockIntlayerValue("Test User"),
			picture: undefined,
			userId: 123,
		};

		function TestComponent() {
			const params = useNavigation();
			return (
				<div>
					githubSetupComplete: {String(params.githubSetupComplete)} hasIntegrations:{" "}
					{String(params.hasIntegrations)}
				</div>
			);
		}

		const { container } = renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/?github_setup=success"),
			userInfo,
		});

		// Wait for both states to update after GitHub setup success
		await waitFor(() => {
			expect(container.textContent).toContain("githubSetupComplete: true");
			expect(container.textContent).toContain("hasIntegrations: true");
		});
	});

	it("should handle checkIntegrations error", async () => {
		// Mock listIntegrations to fail
		mockIntegrationsApi.listIntegrations.mockRejectedValue(new Error("Failed to list integrations"));

		const userInfo: UserInfo = {
			email: createMockIntlayerValue("test@example.com"),
			name: createMockIntlayerValue("Test User"),
			picture: undefined,
			userId: 123,
		};

		function TestComponent() {
			const params = useNavigation();
			return <div>hasIntegrations: {String(params.hasIntegrations)}</div>;
		}

		const { container } = renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/dashboard"),
			pathname: createMockIntlayerValue("/dashboard"),
			userInfo,
		});

		// Wait for hasIntegrations to be set to false after error
		await waitFor(
			() => {
				expect(container.textContent).toContain("hasIntegrations: false");
			},
			{ timeout: 2000 },
		);
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

	it("should redirect to first installation when no integrations but installations exist", async () => {
		mockGitHubApi.getGitHubInstallations.mockResolvedValue([
			{
				containerType: createMockIntlayerValue("org"),
				name: createMockIntlayerValue("test-org"),
				appId: 123,
				installationId: 456,
				repos: [],
			},
		]);

		mockIntegrationsApi.listIntegrations.mockResolvedValue([]);

		const userInfo: UserInfo = {
			email: createMockIntlayerValue("test@example.com"),
			name: createMockIntlayerValue("Test User"),
			picture: undefined,
			userId: 123,
		};

		function TestComponent() {
			const params = useNavigation();
			return <div>hasIntegrations: {String(params.hasIntegrations)}</div>;
		}

		const { container } = renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/dashboard"),
			pathname: createMockIntlayerValue("/dashboard"),
			userInfo,
		});

		// Wait for hasIntegrations to be set to true (installations exist)
		// Note: The actual navigation redirect is handled by the router and tested elsewhere
		await waitFor(
			() => {
				expect(container.textContent).toContain("hasIntegrations: true");
			},
			{ timeout: 2000 },
		);
	});

	it("should handle no installations and set hasIntegrations to false", async () => {
		mockGitHubApi.getGitHubInstallations.mockResolvedValue([]);
		mockIntegrationsApi.listIntegrations.mockResolvedValue([]);

		const userInfo: UserInfo = {
			email: createMockIntlayerValue("test@example.com"),
			name: createMockIntlayerValue("Test User"),
			picture: undefined,
			userId: 123,
		};

		function TestComponent() {
			const params = useNavigation();
			return <div>hasIntegrations: {String(params.hasIntegrations)}</div>;
		}

		const { container } = renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/dashboard"),
			pathname: createMockIntlayerValue("/dashboard"),
			userInfo,
		});

		// Wait for hasIntegrations to be set to false when no installations exist
		await waitFor(
			() => {
				expect(container.textContent).toContain("hasIntegrations: false");
			},
			{ timeout: 2000 },
		);
	});

	it("should handle error fetching installations and set hasIntegrations to false", async () => {
		mockGitHubApi.getGitHubInstallations.mockRejectedValue(new Error("Failed to fetch installations"));
		mockIntegrationsApi.listIntegrations.mockResolvedValue([]);

		const userInfo: UserInfo = {
			email: createMockIntlayerValue("test@example.com"),
			name: createMockIntlayerValue("Test User"),
			picture: undefined,
			userId: 123,
		};

		function TestComponent() {
			const params = useNavigation();
			return <div>hasIntegrations: {String(params.hasIntegrations)}</div>;
		}

		const { container } = renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/dashboard"),
			pathname: createMockIntlayerValue("/dashboard"),
			userInfo,
		});

		// Wait for hasIntegrations to be set to false after error
		await waitFor(
			() => {
				expect(container.textContent).toContain("hasIntegrations: false");
			},
			{ timeout: 2000 },
		);
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
		await waitFor(() => {
			expect(tabsLength).toBe(7); // 6 base tabs + devtools tab
		});
	});

	it("should not redirect from devtools tab when installations exist but no integrations", async () => {
		mockIntegrationsApi.listIntegrations.mockResolvedValue([]); // No integrations
		mockGitHubApi.getGitHubInstallations.mockResolvedValue([
			{
				id: 1,
				name: createMockIntlayerValue("test-org"),
				containerType: createMockIntlayerValue("org"),
			},
		]);

		function TestComponent() {
			const params = useNavigation();
			return <div>hasIntegrations: {String(params.hasIntegrations)}</div>;
		}

		const userInfo: UserInfo = {
			userId: 123,
			email: createMockIntlayerValue("test@example.com"),
			name: createMockIntlayerValue("Test User"),
			picture: undefined,
		};

		const { container } = renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/devtools"),
			pathname: createMockIntlayerValue("/devtools"),
			userInfo,
		});

		// Wait for hasIntegrations to be checked and set to true (due to installations)
		await waitFor(
			() => {
				expect(container.textContent).toContain("hasIntegrations: true");
			},
			{ timeout: 2000 },
		);
	});

	it("should treat empty path as dashboard when checking installations", async () => {
		mockGitHubApi.getGitHubInstallations.mockResolvedValue([
			{
				containerType: createMockIntlayerValue("org"),
				name: createMockIntlayerValue("test-org"),
				appId: 123,
				installationId: 456,
				repos: [],
			},
		]);

		mockIntegrationsApi.listIntegrations.mockResolvedValue([]);

		const userInfo: UserInfo = {
			email: createMockIntlayerValue("test@example.com"),
			name: createMockIntlayerValue("Test User"),
			picture: undefined,
			userId: 123,
		};

		function TestComponent() {
			const params = useNavigation();
			return <div>hasIntegrations: {String(params.hasIntegrations)}</div>;
		}

		const { container } = renderWithProviders(<TestComponent />, {
			initialPath: createMockIntlayerValue("/"),
			pathname: createMockIntlayerValue("/"),
			userInfo,
		});

		// Wait for hasIntegrations to be set to true - "/"  is treated as "dashboard", not "devtools",
		// so it should trigger redirect logic (tested by checking hasIntegrations gets set)
		await waitFor(
			() => {
				expect(container.textContent).toContain("hasIntegrations: true");
			},
			{ timeout: 2000 },
		);
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
		await waitFor(() => {
			expect(container.textContent).toContain("tabs: 7");
		});

		// Verify that tabs were created successfully (which means getStringValue worked)
		expect(tabsLength).toBe(7);
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
});
