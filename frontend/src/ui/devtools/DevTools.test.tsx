import { renderWithProviders } from "../../test/TestUtils";
import { DevTools } from "./DevTools";
import { screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockClient = {
	devTools: vi.fn(() => ({
		getDevToolsInfo: vi.fn().mockResolvedValue({
			enabled: true,
			githubAppCreatorEnabled: true,
			jobTesterEnabled: true,
			dataClearerEnabled: true,
			githubApp: {
				defaultOrg: "jolliai",
				defaultManifest: {
					name: "jolli-local",
					url: "http://localhost:8034",
					public: false,
				},
			},
		}),
	})),
};

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

describe("DevTools", () => {
	beforeEach(() => {
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
	});

	it("should render DevTools heading and description", async () => {
		renderWithProviders(<DevTools />, {
			initialPath: "/devtools",
		});

		expect(await screen.findByText("Developer Tools")).toBeDefined();
		expect(screen.getByText("Tools for local development and testing")).toBeDefined();
	});

	it("should render GitHubAppCreator component", async () => {
		renderWithProviders(<DevTools />, {
			initialPath: "/devtools",
		});

		expect(await screen.findByText("Create a GitHub App")).toBeDefined();
	});

	it("should render DataClearer component", async () => {
		renderWithProviders(<DevTools />, {
			initialPath: "/devtools",
		});

		expect(await screen.findByText("Data Clearer")).toBeDefined();
		expect(screen.getByText("Clear various types of data for development and testing purposes")).toBeDefined();
	});

	it("should render DraftGenerator component when only draftGeneratorEnabled is true", async () => {
		mockClient.devTools.mockReturnValue({
			getDevToolsInfo: vi.fn().mockResolvedValue({
				enabled: true,
				githubAppCreatorEnabled: false,
				jobTesterEnabled: false,
				dataClearerEnabled: false,
				draftGeneratorEnabled: true,
				githubApp: {
					defaultOrg: "jolliai",
					defaultManifest: {
						name: "jolli-local",
						url: "http://localhost:8034",
						public: false,
					},
				},
			}),
		});

		renderWithProviders(<DevTools />, {
			initialPath: "/devtools",
		});

		expect(await screen.findByText("Draft Generator")).toBeDefined();
		// Other components should not be rendered
		expect(screen.queryByText("Create a GitHub App")).toBeNull();
		expect(screen.queryByText("Data Clearer")).toBeNull();
	});
});
