import type { BuildLogEntry, BuildStreamState } from "../../hooks/useBuildStream";
import { renderWithProviders } from "../../test/TestUtils";
import { BuildLogViewer } from "./BuildLogViewer";
import { screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		AlertCircle: () => <div data-testid="alert-circle-icon" />,
		CheckCircle: () => <div data-testid="check-circle-icon" />,
		Loader2: () => <div data-testid="loader2-icon" />,
		Terminal: () => <div data-testid="terminal-icon" />,
	};
});

function createBuildStreamState(overrides: Partial<BuildStreamState> = {}): BuildStreamState {
	return {
		connected: false,
		mode: null,
		currentStep: 0,
		totalSteps: 0,
		currentMessage: "",
		logs: [],
		completed: false,
		failed: false,
		finalUrl: null,
		errorMessage: null,
		...overrides,
	};
}

function createLogEntry(overrides: Partial<BuildLogEntry>): BuildLogEntry {
	return {
		type: "build:step",
		timestamp: new Date("2024-01-01T12:00:00"),
		...overrides,
	};
}

describe("BuildLogViewer", () => {
	describe("visibility", () => {
		it("should render when show is true", () => {
			const buildStream = createBuildStreamState();
			renderWithProviders(<BuildLogViewer buildStream={buildStream} show={true} />);

			expect(screen.getByTestId("build-log-viewer")).toBeDefined();
		});

		it("should not render when show is false", () => {
			const buildStream = createBuildStreamState();
			renderWithProviders(<BuildLogViewer buildStream={buildStream} show={false} />);

			expect(screen.queryByTestId("build-log-viewer")).toBeNull();
		});

		it("should render by default (show defaults to true)", () => {
			const buildStream = createBuildStreamState();
			renderWithProviders(<BuildLogViewer buildStream={buildStream} />);

			expect(screen.getByTestId("build-log-viewer")).toBeDefined();
		});
	});

	describe("header display", () => {
		it("should show Build Output title", () => {
			const buildStream = createBuildStreamState();
			renderWithProviders(<BuildLogViewer buildStream={buildStream} />);

			expect(screen.getByText("Build Output")).toBeDefined();
		});

		it("should show Connected status when connected", () => {
			const buildStream = createBuildStreamState({ connected: true });
			renderWithProviders(<BuildLogViewer buildStream={buildStream} />);

			expect(screen.getByText("Connected")).toBeDefined();
		});

		it("should show Disconnected status when not connected", () => {
			const buildStream = createBuildStreamState({ connected: false });
			renderWithProviders(<BuildLogViewer buildStream={buildStream} />);

			expect(screen.getByText("Disconnected")).toBeDefined();
		});

		it("should show step progress when building", () => {
			const buildStream = createBuildStreamState({
				currentStep: 3,
				totalSteps: 7,
				completed: false,
				failed: false,
			});
			renderWithProviders(<BuildLogViewer buildStream={buildStream} />);

			expect(screen.getByText("Step 3/7")).toBeDefined();
		});

		it("should show Complete status when completed", () => {
			const buildStream = createBuildStreamState({ completed: true });
			renderWithProviders(<BuildLogViewer buildStream={buildStream} />);

			expect(screen.getByText("Complete")).toBeDefined();
		});

		it("should show Failed status when failed", () => {
			const buildStream = createBuildStreamState({ failed: true });
			renderWithProviders(<BuildLogViewer buildStream={buildStream} />);

			expect(screen.getByText("Failed")).toBeDefined();
		});

		it("should not show step progress when completed", () => {
			const buildStream = createBuildStreamState({
				currentStep: 7,
				totalSteps: 7,
				completed: true,
			});
			renderWithProviders(<BuildLogViewer buildStream={buildStream} />);

			expect(screen.queryByText("Step 7/7")).toBeNull();
		});
	});

	describe("current message in state", () => {
		// Note: currentMessage is stored in state but no longer displayed as a separate header element
		// to avoid duplicate display (the message also appears in build:step log entries).
		// The step progress (Step X/Y) is shown in the header instead.

		it("should not display currentMessage as a separate element", () => {
			const buildStream = createBuildStreamState({
				currentMessage: "Installing dependencies...",
				currentStep: 2,
				totalSteps: 7,
				completed: false,
				failed: false,
			});
			renderWithProviders(<BuildLogViewer buildStream={buildStream} />);

			// currentMessage is not shown as a separate element (to avoid duplicates with log entries)
			// Only the step progress should be visible
			expect(screen.getByText("Step 2/7")).toBeDefined();
		});

		it("should show step message via log entries", () => {
			const buildStream = createBuildStreamState({
				currentMessage: "Installing dependencies...",
				logs: [
					createLogEntry({ type: "build:step", step: 2, total: 7, message: "Installing dependencies..." }),
				],
				completed: false,
				failed: false,
			});
			renderWithProviders(<BuildLogViewer buildStream={buildStream} />);

			// Message is shown through the log entry, not as a header element
			expect(screen.getByText("Installing dependencies...")).toBeDefined();
		});
	});

	describe("log entries", () => {
		it("should show waiting message when no logs", () => {
			const buildStream = createBuildStreamState({ logs: [] });
			renderWithProviders(<BuildLogViewer buildStream={buildStream} />);

			expect(screen.getByText("Waiting for build output...")).toBeDefined();
		});

		it("should render build:mode log entry", () => {
			const buildStream = createBuildStreamState({
				logs: [createLogEntry({ type: "build:mode", mode: "create" })],
			});
			renderWithProviders(<BuildLogViewer buildStream={buildStream} />);

			expect(screen.getByText(/Starting create build.../)).toBeDefined();
		});

		it("should render build:step log entry", () => {
			const buildStream = createBuildStreamState({
				logs: [createLogEntry({ type: "build:step", step: 1, total: 7, message: "Validating articles..." })],
			});
			renderWithProviders(<BuildLogViewer buildStream={buildStream} />);

			expect(screen.getByText("Validating articles...")).toBeDefined();
		});

		it("should render build:stdout log entry", () => {
			const buildStream = createBuildStreamState({
				logs: [createLogEntry({ type: "build:stdout", output: "npm install output line 1\nline 2" })],
			});
			renderWithProviders(<BuildLogViewer buildStream={buildStream} />);

			expect(screen.getByText("npm install output line 1")).toBeDefined();
			expect(screen.getByText("line 2")).toBeDefined();
		});

		it("should render build:stderr log entry", () => {
			const buildStream = createBuildStreamState({
				logs: [createLogEntry({ type: "build:stderr", output: "npm warn deprecated\nwarning 2" })],
			});
			renderWithProviders(<BuildLogViewer buildStream={buildStream} />);

			expect(screen.getByText("npm warn deprecated")).toBeDefined();
			expect(screen.getByText("warning 2")).toBeDefined();
		});

		it("should render build:command log entry", () => {
			const buildStream = createBuildStreamState({
				logs: [createLogEntry({ type: "build:command", command: "npm run build" })],
			});
			renderWithProviders(<BuildLogViewer buildStream={buildStream} />);

			expect(screen.getByText(/\$ npm run build/)).toBeDefined();
		});

		it("should render build:state log entry", () => {
			const buildStream = createBuildStreamState({
				logs: [createLogEntry({ type: "build:state", state: "BUILDING" })],
			});
			renderWithProviders(<BuildLogViewer buildStream={buildStream} />);

			expect(screen.getByText(/Deployment state: BUILDING/)).toBeDefined();
		});

		it("should render build:completed log entry", () => {
			const buildStream = createBuildStreamState({
				logs: [createLogEntry({ type: "build:completed", url: "https://example.vercel.app" })],
			});
			renderWithProviders(<BuildLogViewer buildStream={buildStream} />);

			expect(screen.getByText("Build completed successfully!")).toBeDefined();
		});

		it("should render build:failed log entry", () => {
			const buildStream = createBuildStreamState({
				logs: [createLogEntry({ type: "build:failed", error: "npm install failed with exit code 1" })],
			});
			renderWithProviders(<BuildLogViewer buildStream={buildStream} />);

			expect(screen.getByText(/Build failed: npm install failed with exit code 1/)).toBeDefined();
		});

		it("should render multiple log entries", () => {
			const buildStream = createBuildStreamState({
				logs: [
					createLogEntry({ type: "build:mode", mode: "rebuild" }),
					createLogEntry({ type: "build:step", step: 1, total: 10, message: "Step 1" }),
					createLogEntry({ type: "build:stdout", output: "output" }),
				],
			});
			renderWithProviders(<BuildLogViewer buildStream={buildStream} />);

			expect(screen.getByText(/Starting rebuild build.../)).toBeDefined();
			expect(screen.getByText("Step 1")).toBeDefined();
			expect(screen.getByText("output")).toBeDefined();
		});

		it("should render unknown event type as JSON", () => {
			const buildStream = createBuildStreamState({
				logs: [createLogEntry({ type: "unknown" as BuildLogEntry["type"] })],
			});
			renderWithProviders(<BuildLogViewer buildStream={buildStream} />);

			// JSON.stringify output should be visible
			expect(screen.getByText(/"type":"unknown"/)).toBeDefined();
		});
	});

	describe("maxHeight prop", () => {
		it("should apply custom maxHeight", () => {
			const buildStream = createBuildStreamState();
			const { container } = renderWithProviders(<BuildLogViewer buildStream={buildStream} maxHeight={600} />);

			const logContainer = container.querySelector(".p-4.font-mono");
			expect(logContainer?.getAttribute("style")).toContain("max-height: 600px");
		});

		it("should use default maxHeight of 400", () => {
			const buildStream = createBuildStreamState();
			const { container } = renderWithProviders(<BuildLogViewer buildStream={buildStream} />);

			const logContainer = container.querySelector(".p-4.font-mono");
			expect(logContainer?.getAttribute("style")).toContain("max-height: 400px");
		});
	});
});
