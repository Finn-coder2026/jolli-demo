import type { BuildLogEntry, BuildStreamState } from "../../hooks/useBuildStream";
import { renderWithProviders } from "../../test/TestUtils";
import { createMockSite } from "./__testUtils__/SiteTestFactory";
import { SiteBuildLogsPanel } from "./SiteBuildLogsPanel";
import { fireEvent, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted so the mock setter is available inside the vi.mock factory
const { mockSetExpanded } = vi.hoisted(() => ({
	mockSetExpanded: vi.fn(),
}));

// Mock usePreference hook to control expanded state
vi.mock("../../hooks/usePreference", () => ({
	usePreference: vi.fn().mockReturnValue([false, mockSetExpanded]),
}));

import { usePreference } from "../../hooks/usePreference";

// Mock lucide-react icons with data-testid for assertion
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
		Radio: () => <div data-testid="radio-icon" />,
		Terminal: () => <div data-testid="terminal-icon" />,
	};
});

/** Creates a mock BuildStreamState with sensible defaults. */
function createBuildStream(overrides: Partial<BuildStreamState> = {}): BuildStreamState {
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

/** Creates a mock BuildLogEntry for the given type. */
function createLogEntry(type: BuildLogEntry["type"], overrides: Partial<BuildLogEntry> = {}): BuildLogEntry {
	return {
		type,
		timestamp: new Date("2024-01-01T12:00:00Z"),
		...overrides,
	} as BuildLogEntry;
}

describe("SiteBuildLogsPanel", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset to default collapsed state
		vi.mocked(usePreference).mockReturnValue([false, mockSetExpanded]);
	});

	// -- Rendering and panel structure --

	describe("panel structure", () => {
		it("should render the build logs panel", () => {
			const site = createMockSite();
			const buildStream = createBuildStream();
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.getByTestId("build-logs-panel")).toBeDefined();
		});

		it("should render the toggle button", () => {
			const site = createMockSite();
			const buildStream = createBuildStream();
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.getByTestId("logs-panel-toggle")).toBeDefined();
		});

		it("should render terminal icon in the header bar", () => {
			const site = createMockSite();
			const buildStream = createBuildStream();
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.getByTestId("terminal-icon")).toBeDefined();
		});
	});

	// -- Status icon --

	describe("status icon", () => {
		it("should show Loader2 icon when site status is building", () => {
			const site = createMockSite({ status: "building" });
			const buildStream = createBuildStream();
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.getAllByTestId("loader-icon").length).toBeGreaterThan(0);
		});

		it("should show Loader2 icon when site status is pending", () => {
			const site = createMockSite({ status: "pending" });
			const buildStream = createBuildStream();
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.getAllByTestId("loader-icon").length).toBeGreaterThan(0);
		});

		it("should show AlertCircle icon when site status is error", () => {
			const site = createMockSite({ status: "error" });
			const buildStream = createBuildStream();
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.getByTestId("alert-circle-icon")).toBeDefined();
		});

		it("should show CheckCircle icon when site status is active", () => {
			const site = createMockSite({ status: "active" });
			const buildStream = createBuildStream();
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.getByTestId("check-circle-icon")).toBeDefined();
		});
	});

	// -- Status text --

	describe("status text", () => {
		it("should display 'Build in Progress' when building", () => {
			const site = createMockSite({ status: "building" });
			const buildStream = createBuildStream();
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.getByTestId("build-status-text").textContent).toContain("Build in Progress");
		});

		it("should display 'Build in Progress' when pending", () => {
			const site = createMockSite({ status: "pending" });
			const buildStream = createBuildStream();
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.getByTestId("build-status-text").textContent).toContain("Build in Progress");
		});

		it("should display 'Build Failed' when error", () => {
			const site = createMockSite({ status: "error" });
			const buildStream = createBuildStream();
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.getByTestId("build-status-text").textContent).toContain("Build Failed");
		});

		it("should display 'Build Complete' when active", () => {
			const site = createMockSite({ status: "active" });
			const buildStream = createBuildStream();
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.getByTestId("build-status-text").textContent).toContain("Build Complete");
		});
	});

	// -- Live indicator --

	describe("live indicator", () => {
		it("should show live indicator when buildStream.connected is true", () => {
			const site = createMockSite({ status: "building" });
			const buildStream = createBuildStream({ connected: true });
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.getByTestId("live-indicator")).toBeDefined();
			expect(screen.getByTestId("radio-icon")).toBeDefined();
		});

		it("should not show live indicator when buildStream.connected is false", () => {
			const site = createMockSite({ status: "building" });
			const buildStream = createBuildStream({ connected: false });
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.queryByTestId("live-indicator")).toBeNull();
		});
	});

	// -- Expand / collapse toggle --

	describe("expand/collapse toggle", () => {
		it("should show ChevronUp icon when collapsed", () => {
			vi.mocked(usePreference).mockReturnValue([false, mockSetExpanded]);
			const site = createMockSite();
			const buildStream = createBuildStream();
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.getByTestId("chevron-up-icon")).toBeDefined();
		});

		it("should show ChevronDown icon when expanded", () => {
			vi.mocked(usePreference).mockReturnValue([true, mockSetExpanded]);
			const site = createMockSite();
			const buildStream = createBuildStream();
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.getByTestId("chevron-down-icon")).toBeDefined();
		});

		it("should call setExpanded with true when clicking toggle while collapsed", () => {
			vi.mocked(usePreference).mockReturnValue([false, mockSetExpanded]);
			const site = createMockSite();
			const buildStream = createBuildStream();
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			fireEvent.click(screen.getByTestId("logs-panel-toggle"));

			expect(mockSetExpanded).toHaveBeenCalledWith(true);
		});

		it("should call setExpanded with false when clicking toggle while expanded", () => {
			vi.mocked(usePreference).mockReturnValue([true, mockSetExpanded]);
			const site = createMockSite();
			const buildStream = createBuildStream();
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			fireEvent.click(screen.getByTestId("logs-panel-toggle"));

			expect(mockSetExpanded).toHaveBeenCalledWith(false);
		});
	});

	// -- Progress indicator in header --

	describe("progress indicator in header", () => {
		it("should show step progress when building with currentStep and totalSteps", () => {
			const site = createMockSite({ status: "building" });
			const buildStream = createBuildStream({ currentStep: 3, totalSteps: 10 });
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.getByTestId("build-step-progress")).toBeDefined();
			expect(screen.getByTestId("build-step-progress").textContent).toContain("(3/10)");
		});

		it("should not show step progress when totalSteps is 0", () => {
			const site = createMockSite({ status: "building" });
			const buildStream = createBuildStream({ currentStep: 0, totalSteps: 0 });
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.queryByTestId("build-step-progress")).toBeNull();
		});

		it("should not show step progress when currentStep is 0", () => {
			const site = createMockSite({ status: "building" });
			const buildStream = createBuildStream({ currentStep: 0, totalSteps: 5 });
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.queryByTestId("build-step-progress")).toBeNull();
		});

		it("should not show step progress when not building", () => {
			const site = createMockSite({ status: "active" });
			const buildStream = createBuildStream({ currentStep: 3, totalSteps: 10 });
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.queryByTestId("build-step-progress")).toBeNull();
		});
	});

	// -- Progress bar (expanded) --

	describe("progress bar", () => {
		it("should show progress bar when expanded, building, and totalSteps > 0", () => {
			vi.mocked(usePreference).mockReturnValue([true, mockSetExpanded]);
			const site = createMockSite({ status: "building" });
			const buildStream = createBuildStream({ currentStep: 3, totalSteps: 10 });
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.getByTestId("build-progress")).toBeDefined();
		});

		it("should not show progress bar when collapsed", () => {
			vi.mocked(usePreference).mockReturnValue([false, mockSetExpanded]);
			const site = createMockSite({ status: "building" });
			const buildStream = createBuildStream({ currentStep: 3, totalSteps: 10 });
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.queryByTestId("build-progress")).toBeNull();
		});

		it("should not show progress bar when not building", () => {
			vi.mocked(usePreference).mockReturnValue([true, mockSetExpanded]);
			const site = createMockSite({ status: "active" });
			const buildStream = createBuildStream({ currentStep: 5, totalSteps: 10 });
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.queryByTestId("build-progress")).toBeNull();
		});

		it("should not show progress bar when totalSteps is 0", () => {
			vi.mocked(usePreference).mockReturnValue([true, mockSetExpanded]);
			const site = createMockSite({ status: "building" });
			const buildStream = createBuildStream({ currentStep: 0, totalSteps: 0 });
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.queryByTestId("build-progress")).toBeNull();
		});
	});

	// -- Empty and waiting states (expanded) --

	describe("empty and waiting states", () => {
		it("should show empty state when expanded, no logs, and not building", () => {
			vi.mocked(usePreference).mockReturnValue([true, mockSetExpanded]);
			const site = createMockSite({ status: "active" });
			const buildStream = createBuildStream({ logs: [] });
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.getByTestId("no-build-history")).toBeDefined();
			expect(screen.getByTestId("no-build-history").textContent).toContain("No build history available");
		});

		it("should show waiting state when expanded, no logs, and building", () => {
			vi.mocked(usePreference).mockReturnValue([true, mockSetExpanded]);
			const site = createMockSite({ status: "building" });
			const buildStream = createBuildStream({ logs: [] });
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.getByTestId("waiting-for-build")).toBeDefined();
			expect(screen.getByTestId("waiting-for-build").textContent).toContain("Waiting for build to start...");
		});

		it("should not show empty state when there are logs", () => {
			vi.mocked(usePreference).mockReturnValue([true, mockSetExpanded]);
			const site = createMockSite({ status: "active" });
			const buildStream = createBuildStream({
				logs: [createLogEntry("build:step", { message: "Step 1" })],
			});
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.queryByTestId("no-build-history")).toBeNull();
		});

		it("should not show waiting state when there are logs", () => {
			vi.mocked(usePreference).mockReturnValue([true, mockSetExpanded]);
			const site = createMockSite({ status: "building" });
			const buildStream = createBuildStream({
				logs: [createLogEntry("build:step", { message: "Step 1" })],
			});
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.queryByTestId("waiting-for-build")).toBeNull();
		});
	});

	// -- Log output rendering --

	describe("log output", () => {
		it("should show log-output container when expanded and has logs", () => {
			vi.mocked(usePreference).mockReturnValue([true, mockSetExpanded]);
			const site = createMockSite({ status: "active" });
			const buildStream = createBuildStream({
				logs: [createLogEntry("build:step", { message: "Installing..." })],
			});
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.getByTestId("log-output")).toBeDefined();
		});

		it("should not show log-output when collapsed", () => {
			vi.mocked(usePreference).mockReturnValue([false, mockSetExpanded]);
			const site = createMockSite({ status: "active" });
			const buildStream = createBuildStream({
				logs: [createLogEntry("build:step", { message: "Installing..." })],
			});
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.queryByTestId("log-output")).toBeNull();
		});
	});

	// -- Build error section --

	describe("build error section", () => {
		it("should show lastBuildError when expanded, status is error, and lastBuildError exists", () => {
			vi.mocked(usePreference).mockReturnValue([true, mockSetExpanded]);
			const site = createMockSite({
				status: "error",
				metadata: { lastBuildError: "Build timeout exceeded" },
			});
			const buildStream = createBuildStream();
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.getByTestId("alert-triangle-icon")).toBeDefined();
			expect(screen.getByTestId("build-error-message")).toBeDefined();
			expect(screen.getByTestId("build-error-message").textContent).toContain("Build timeout exceeded");
		});

		it("should not show build error when status is not error", () => {
			vi.mocked(usePreference).mockReturnValue([true, mockSetExpanded]);
			const site = createMockSite({
				status: "active",
				metadata: { lastBuildError: "Some error" },
			});
			const buildStream = createBuildStream();
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.queryByTestId("build-error-section")).toBeNull();
		});

		it("should not show build error when lastBuildError is not set", () => {
			vi.mocked(usePreference).mockReturnValue([true, mockSetExpanded]);
			const site = createMockSite({ status: "error" });
			const buildStream = createBuildStream();
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(screen.queryByTestId("alert-triangle-icon")).toBeNull();
		});
	});

	// -- Auto-expand on build start --

	describe("auto-expand on build start", () => {
		it("should call setExpanded(true) when site is building and panel is collapsed", () => {
			vi.mocked(usePreference).mockReturnValue([false, mockSetExpanded]);
			const site = createMockSite({ status: "building" });
			const buildStream = createBuildStream();
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(mockSetExpanded).toHaveBeenCalledWith(true);
		});

		it("should call setExpanded(true) when site is pending and panel is collapsed", () => {
			vi.mocked(usePreference).mockReturnValue([false, mockSetExpanded]);
			const site = createMockSite({ status: "pending" });
			const buildStream = createBuildStream();
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(mockSetExpanded).toHaveBeenCalledWith(true);
		});

		it("should not call setExpanded when site is not building", () => {
			vi.mocked(usePreference).mockReturnValue([false, mockSetExpanded]);
			const site = createMockSite({ status: "active" });
			const buildStream = createBuildStream();
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			expect(mockSetExpanded).not.toHaveBeenCalled();
		});
	});

	// -- formatLogEntry rendering --

	describe("formatLogEntry", () => {
		// All formatLogEntry tests render with expanded=true so log entries are visible
		beforeEach(() => {
			vi.mocked(usePreference).mockReturnValue([true, mockSetExpanded]);
		});

		it("should render build:mode entry with mode name", () => {
			const site = createMockSite({ status: "active" });
			const buildStream = createBuildStream({
				logs: [createLogEntry("build:mode", { mode: "create" })],
			});
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			const logOutput = screen.getByTestId("log-output");
			expect(logOutput.textContent).toContain("Starting create build...");
		});

		it("should render build:step entry with message", () => {
			const site = createMockSite({ status: "active" });
			const buildStream = createBuildStream({
				logs: [createLogEntry("build:step", { message: "Installing dependencies" })],
			});
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			const logOutput = screen.getByTestId("log-output");
			expect(logOutput.textContent).toContain("Installing dependencies");
		});

		it("should render build:stdout entry, splitting output by newlines", () => {
			const site = createMockSite({ status: "active" });
			const buildStream = createBuildStream({
				logs: [createLogEntry("build:stdout", { output: "line one\nline two" })],
			});
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			const logOutput = screen.getByTestId("log-output");
			expect(logOutput.textContent).toContain("line one");
			expect(logOutput.textContent).toContain("line two");
		});

		it("should render build:stderr entry, splitting output by newlines", () => {
			const site = createMockSite({ status: "active" });
			const buildStream = createBuildStream({
				logs: [createLogEntry("build:stderr", { output: "warn line 1\nwarn line 2" })],
			});
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			const logOutput = screen.getByTestId("log-output");
			expect(logOutput.textContent).toContain("warn line 1");
			expect(logOutput.textContent).toContain("warn line 2");
		});

		it("should render build:command entry with dollar sign prefix", () => {
			const site = createMockSite({ status: "active" });
			const buildStream = createBuildStream({
				logs: [createLogEntry("build:command", { command: "npm install" })],
			});
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			const logOutput = screen.getByTestId("log-output");
			expect(logOutput.textContent).toContain("$ npm install");
		});

		it("should render build:state entry with deployment state", () => {
			const site = createMockSite({ status: "active" });
			const buildStream = createBuildStream({
				logs: [createLogEntry("build:state", { state: "deploying" })],
			});
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			const logOutput = screen.getByTestId("log-output");
			expect(logOutput.textContent).toContain("Deployment state: deploying");
		});

		it("should render build:completed entry with success message", () => {
			const site = createMockSite({ status: "active" });
			const buildStream = createBuildStream({
				logs: [createLogEntry("build:completed")],
			});
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			const logOutput = screen.getByTestId("log-output");
			expect(logOutput.textContent).toContain("Build completed successfully!");
		});

		it("should render build:failed entry with error message", () => {
			const site = createMockSite({ status: "error" });
			const buildStream = createBuildStream({
				logs: [createLogEntry("build:failed", { error: "Something went wrong" })],
			});
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			const logOutput = screen.getByTestId("log-output");
			expect(logOutput.textContent).toContain("Build failed: Something went wrong");
		});

		it("should render unknown log entry type as JSON", () => {
			const site = createMockSite({ status: "active" });
			const unknownEntry = createLogEntry("build:unknown" as BuildLogEntry["type"]);
			const buildStream = createBuildStream({ logs: [unknownEntry] });
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			const logOutput = screen.getByTestId("log-output");
			expect(logOutput.textContent).toContain("build:unknown");
		});

		it("should render multiple log entries in order", () => {
			const site = createMockSite({ status: "active" });
			const buildStream = createBuildStream({
				logs: [
					createLogEntry("build:mode", { mode: "rebuild" }),
					createLogEntry("build:step", { message: "Step 1: Validate" }),
					createLogEntry("build:stdout", { output: "output line" }),
				],
			});
			renderWithProviders(<SiteBuildLogsPanel site={site} buildStream={buildStream} />);

			const logOutput = screen.getByTestId("log-output");
			expect(logOutput.textContent).toContain("Starting rebuild build...");
			expect(logOutput.textContent).toContain("Step 1: Validate");
			expect(logOutput.textContent).toContain("output line");
		});
	});
});
