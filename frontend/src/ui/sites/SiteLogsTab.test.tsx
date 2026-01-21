import type { BuildLogEntry, BuildStreamState } from "../../hooks/useBuildStream";
import { createMockIntlayerValue, renderWithProviders } from "../../test/TestUtils";
import { SiteLogsTab } from "./SiteLogsTab";
import { fireEvent, screen } from "@testing-library/preact";
import type { SiteMetadata, SiteWithUpdate } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		AlertCircle: () => <div data-testid="alert-circle-icon" />,
		AlertTriangle: () => <div data-testid="alert-triangle-icon" />,
		CheckCircle: () => <div data-testid="check-circle-icon" />,
		ChevronDown: () => <div data-testid="chevron-down-icon" />,
		ChevronUp: () => <div data-testid="chevron-up-icon" />,
		Loader2: () => <div data-testid="loader-icon" />,
		Terminal: () => <div data-testid="terminal-icon" />,
		Radio: () => <div data-testid="radio-icon" />,
	};
});

describe("SiteLogsTab", () => {
	const defaultMetadata = {
		githubRepo: "test-repo",
		githubUrl: "https://github.com/test/repo",
		framework: "nextra",
		articleCount: 5,
	};

	function createMockDocsite(
		overrides: Omit<Partial<SiteWithUpdate>, "metadata"> & { metadata?: Partial<SiteMetadata> } = {},
	): SiteWithUpdate {
		const { metadata: metadataOverrides, ...rest } = overrides;
		return {
			id: 1,
			name: "test-site",
			displayName: "Test Site",
			status: "active",
			visibility: "external",
			framework: "nextra",
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-02T00:00:00Z",
			metadata: { ...defaultMetadata, ...metadataOverrides },
			...rest,
		} as SiteWithUpdate;
	}

	function createMockBuildStream(overrides: Partial<BuildStreamState> = {}): BuildStreamState {
		return {
			connected: false,
			mode: null,
			logs: [],
			currentStep: 0,
			totalSteps: 0,
			currentMessage: "",
			completed: false,
			failed: false,
			finalUrl: null,
			errorMessage: null,
			...overrides,
		};
	}

	function createLogEntry(type: BuildLogEntry["type"], overrides: Partial<BuildLogEntry> = {}): BuildLogEntry {
		return {
			type,
			timestamp: new Date("2024-01-01T10:00:00Z"),
			...overrides,
		} as BuildLogEntry;
	}

	beforeEach(() => {
		vi.clearAllMocks();
	});

	function renderLogsTab(docsite: SiteWithUpdate, buildStream?: BuildStreamState) {
		const props = buildStream ? { docsite, buildStream } : { docsite };
		return renderWithProviders(<SiteLogsTab {...props} />, {
			initialPath: createMockIntlayerValue("/sites/1"),
		});
	}

	describe("build status display", () => {
		it("should show building status when site is building", () => {
			const docsite = createMockDocsite({ status: "building" });
			renderLogsTab(docsite);

			expect(screen.getAllByTestId("loader-icon").length).toBeGreaterThan(0);
			expect(screen.getByText("Build in Progress")).toBeDefined();
		});

		it("should show pending status", () => {
			const docsite = createMockDocsite({ status: "pending" });
			renderLogsTab(docsite);

			expect(screen.getAllByTestId("loader-icon").length).toBeGreaterThan(0);
		});

		it("should show error status when site has error", () => {
			const docsite = createMockDocsite({ status: "error" });
			renderLogsTab(docsite);

			expect(screen.getByTestId("alert-circle-icon")).toBeDefined();
			expect(screen.getByText("Build Failed")).toBeDefined();
		});

		it("should show complete status when site is active", () => {
			const docsite = createMockDocsite({ status: "active" });
			renderLogsTab(docsite);

			expect(screen.getByTestId("check-circle-icon")).toBeDefined();
			expect(screen.getByText("Build Complete")).toBeDefined();
		});

		it("should show current build message when building", () => {
			const docsite = createMockDocsite({ status: "building" });
			const buildStream = createMockBuildStream({
				currentStep: 2,
				totalSteps: 5,
				currentMessage: "Installing dependencies...",
			});
			renderLogsTab(docsite, buildStream);

			expect(screen.getByText("Installing dependencies...")).toBeDefined();
		});
	});

	describe("live indicator", () => {
		it("should show live indicator when connected", () => {
			const docsite = createMockDocsite({ status: "building" });
			const buildStream = createMockBuildStream({ connected: true });
			renderLogsTab(docsite, buildStream);

			expect(screen.getByTestId("live-indicator")).toBeDefined();
			expect(screen.getByText("Live")).toBeDefined();
		});

		it("should not show live indicator when not connected", () => {
			const docsite = createMockDocsite({ status: "building" });
			const buildStream = createMockBuildStream({ connected: false });
			renderLogsTab(docsite, buildStream);

			expect(screen.queryByTestId("live-indicator")).toBeNull();
		});
	});

	describe("progress bar", () => {
		it("should show progress bar when building with steps", () => {
			const docsite = createMockDocsite({ status: "building" });
			const buildStream = createMockBuildStream({
				currentStep: 3,
				totalSteps: 10,
			});
			renderLogsTab(docsite, buildStream);

			expect(screen.getByTestId("build-progress")).toBeDefined();
			expect(screen.getByText("3 / 10")).toBeDefined();
		});

		it("should not show progress bar when no steps", () => {
			const docsite = createMockDocsite({ status: "building" });
			const buildStream = createMockBuildStream({
				currentStep: 0,
				totalSteps: 0,
			});
			renderLogsTab(docsite, buildStream);

			expect(screen.queryByTestId("build-progress")).toBeNull();
		});

		it("should not show progress bar when not building", () => {
			const docsite = createMockDocsite({ status: "active" });
			const buildStream = createMockBuildStream({
				currentStep: 5,
				totalSteps: 10,
			});
			renderLogsTab(docsite, buildStream);

			expect(screen.queryByTestId("build-progress")).toBeNull();
		});
	});

	describe("expand/collapse functionality", () => {
		it("should toggle expand button", () => {
			const docsite = createMockDocsite({ status: "active" });
			const buildStream = createMockBuildStream({
				logs: [createLogEntry("build:step", { message: "Test log" })],
			});
			renderLogsTab(docsite, buildStream);

			const toggleButton = screen.getByTestId("logs-expand-toggle");
			expect(toggleButton).toBeDefined();

			// Click to expand
			fireEvent.click(toggleButton);
			expect(screen.getByTestId("log-output")).toBeDefined();

			// Click to collapse
			fireEvent.click(toggleButton);
			expect(screen.queryByTestId("log-output")).toBeNull();
		});

		it("should auto-expand when building starts", () => {
			const docsite = createMockDocsite({ status: "building" });
			const buildStream = createMockBuildStream({
				logs: [createLogEntry("build:step", { message: "Building..." })],
			});
			renderLogsTab(docsite, buildStream);

			// Should be expanded automatically
			expect(screen.getByTestId("log-output")).toBeDefined();
		});

		it("should show empty state when expanded with no logs", () => {
			const docsite = createMockDocsite({ status: "active" });
			renderLogsTab(docsite);

			fireEvent.click(screen.getByTestId("logs-expand-toggle"));

			expect(screen.getByText("No build history available")).toBeDefined();
		});

		it("should show waiting state when building with no logs yet", () => {
			const docsite = createMockDocsite({ status: "building" });
			const buildStream = createMockBuildStream({ logs: [] });
			renderLogsTab(docsite, buildStream);

			// Auto-expanded due to building
			expect(screen.getByText("Waiting for build to start...")).toBeDefined();
		});
	});

	describe("log entries", () => {
		it("should render build:step entries", () => {
			const docsite = createMockDocsite({ status: "active" });
			const buildStream = createMockBuildStream({
				logs: [createLogEntry("build:step", { message: "Step 1: Initialize" })],
			});
			renderLogsTab(docsite, buildStream);

			fireEvent.click(screen.getByTestId("logs-expand-toggle"));

			expect(screen.getByText("Step 1: Initialize")).toBeDefined();
		});

		it("should render build:mode entries", () => {
			const docsite = createMockDocsite({ status: "active" });
			const buildStream = createMockBuildStream({
				logs: [createLogEntry("build:mode", { mode: "create" })],
			});
			renderLogsTab(docsite, buildStream);

			fireEvent.click(screen.getByTestId("logs-expand-toggle"));

			expect(screen.getByText(/Starting create build.../)).toBeDefined();
		});

		it("should render build:command entries", () => {
			const docsite = createMockDocsite({ status: "active" });
			const buildStream = createMockBuildStream({
				logs: [createLogEntry("build:command", { command: "npm install" })],
			});
			renderLogsTab(docsite, buildStream);

			fireEvent.click(screen.getByTestId("logs-expand-toggle"));

			expect(screen.getByText(/\$ npm install/)).toBeDefined();
		});

		it("should render build:stdout entries", () => {
			const docsite = createMockDocsite({ status: "active" });
			const buildStream = createMockBuildStream({
				logs: [createLogEntry("build:stdout", { output: "stdout output line" })],
			});
			renderLogsTab(docsite, buildStream);

			fireEvent.click(screen.getByTestId("logs-expand-toggle"));

			expect(screen.getByText("stdout output line")).toBeDefined();
		});

		it("should render build:stderr entries", () => {
			const docsite = createMockDocsite({ status: "active" });
			const buildStream = createMockBuildStream({
				logs: [createLogEntry("build:stderr", { output: "stderr warning" })],
			});
			renderLogsTab(docsite, buildStream);

			fireEvent.click(screen.getByTestId("logs-expand-toggle"));

			expect(screen.getByText("stderr warning")).toBeDefined();
		});

		it("should render build:state entries", () => {
			const docsite = createMockDocsite({ status: "active" });
			const buildStream = createMockBuildStream({
				logs: [createLogEntry("build:state", { state: "deploying" })],
			});
			renderLogsTab(docsite, buildStream);

			fireEvent.click(screen.getByTestId("logs-expand-toggle"));

			expect(screen.getByText(/Deployment state: deploying/)).toBeDefined();
		});

		it("should render build:completed entries", () => {
			const docsite = createMockDocsite({ status: "active" });
			const buildStream = createMockBuildStream({
				logs: [createLogEntry("build:completed")],
			});
			renderLogsTab(docsite, buildStream);

			fireEvent.click(screen.getByTestId("logs-expand-toggle"));

			expect(screen.getByText("Build completed successfully!")).toBeDefined();
		});

		it("should render build:failed entries", () => {
			const docsite = createMockDocsite({ status: "error" });
			const buildStream = createMockBuildStream({
				logs: [createLogEntry("build:failed", { error: "Something went wrong" })],
			});
			renderLogsTab(docsite, buildStream);

			// Need to expand logs section first (error status doesn't auto-expand)
			fireEvent.click(screen.getByTestId("logs-expand-toggle"));

			expect(screen.getByText(/Build failed: Something went wrong/)).toBeDefined();
		});
	});

	describe("build errors section", () => {
		it("should show validation errors when present", () => {
			const docsite = createMockDocsite({
				status: "error",
				metadata: {
					validationErrors: "Error: Missing required field",
				},
			});
			renderLogsTab(docsite);

			expect(screen.getByTestId("build-errors-section")).toBeDefined();
			expect(screen.getByTestId("validation-errors-content")).toBeDefined();
			expect(screen.getByText("Error: Missing required field")).toBeDefined();
		});

		it("should show last build error when no validation errors", () => {
			const docsite = createMockDocsite({
				status: "error",
				metadata: {
					lastBuildError: "Build timeout exceeded",
				},
			});
			renderLogsTab(docsite);

			expect(screen.getByTestId("last-build-error-section")).toBeDefined();
			expect(screen.getByText("Build timeout exceeded")).toBeDefined();
		});

		it("should not show errors section when status is not error", () => {
			const docsite = createMockDocsite({
				status: "active",
				metadata: {
					validationErrors: "Some error",
				},
			});
			renderLogsTab(docsite);

			expect(screen.queryByTestId("build-errors-section")).toBeNull();
		});

		it("should prefer validation errors over last build error", () => {
			const docsite = createMockDocsite({
				status: "error",
				metadata: {
					validationErrors: "Validation error",
					lastBuildError: "Build error",
				},
			});
			renderLogsTab(docsite);

			expect(screen.getByTestId("validation-errors-content")).toBeDefined();
			expect(screen.queryByTestId("last-build-error-section")).toBeNull();
		});
	});
});
