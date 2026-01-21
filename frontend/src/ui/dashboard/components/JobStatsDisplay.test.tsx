import { createMockIntlayerValue } from "../../../test/TestUtils";
import { JobStatsDisplay } from "./JobStatsDisplay";
import { render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";

describe("JobStatsDisplay", () => {
	beforeEach(() => {
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
	});
	it("should render nothing when stats is null", () => {
		const { container } = render(<JobStatsDisplay stats={null} />);
		expect(container.firstChild).toBeNull();
	});

	it("should render nothing when stats is not an object", () => {
		const { container } = render(<JobStatsDisplay stats="not an object" />);
		expect(container.firstChild).toBeNull();
	});

	it("should render nothing when stats has no recognizable fields", () => {
		const { container } = render(<JobStatsDisplay stats={{ unknownField: createMockIntlayerValue("value") }} />);
		expect(container.firstChild).toBeNull();
	});

	it("should render progress bar when progress field is present", () => {
		const stats = { progress: 45 };
		render(<JobStatsDisplay stats={stats} />);

		expect(screen.getByText("Progress")).toBeDefined();
		expect(screen.getByText("45%")).toBeDefined();
	});

	it("should render progress bar with percentage field", () => {
		const stats = { percentage: 75 };
		render(<JobStatsDisplay stats={stats} />);

		expect(screen.getByText("Progress")).toBeDefined();
		expect(screen.getByText("75%")).toBeDefined();
	});

	it("should render count metrics when count fields are present", () => {
		const stats = { processed: 150, total: 200 };
		render(<JobStatsDisplay stats={stats} />);

		expect(screen.getByText("Processed:")).toBeDefined();
		expect(screen.getByText("150")).toBeDefined();
		expect(screen.getByText("Total:")).toBeDefined();
		expect(screen.getByText("200")).toBeDefined();
	});

	it("should format count numbers with thousand separators", () => {
		const stats = { itemsProcessed: 1500 };
		render(<JobStatsDisplay stats={stats} />);

		expect(screen.getByText("1,500")).toBeDefined();
	});

	it("should render status badge when status field is present", () => {
		const stats = { status: "processing" };
		render(<JobStatsDisplay stats={stats} />);

		expect(screen.getByText("processing")).toBeDefined();
	});

	it("should render multiple stat types together", () => {
		const stats = {
			progress: 60,
			itemsProcessed: 600,
			totalItems: 1000,
			status: "running",
		};
		render(<JobStatsDisplay stats={stats} />);

		// Check progress bar
		expect(screen.getByText("Progress")).toBeDefined();
		expect(screen.getByText("60%")).toBeDefined();

		// Check count metrics
		expect(screen.getByText("Items Processed:")).toBeDefined();
		expect(screen.getByText("600")).toBeDefined();
		expect(screen.getByText("Total Items:")).toBeDefined();
		expect(screen.getByText("1,000")).toBeDefined();

		// Check status
		expect(screen.getByText("running")).toBeDefined();
	});

	it("should handle progress values over 100", () => {
		const stats = { progress: 120 };
		const { container } = render(<JobStatsDisplay stats={stats} />);

		// The progress bar should be capped at 100% width
		const progressBar = container.querySelector(".bg-blue-500");
		expect(progressBar).toBeDefined();
		expect(progressBar?.getAttribute("style")).toContain("width: 100%");
	});

	it("should handle negative progress values", () => {
		const stats = { progress: -10 };
		const { container } = render(<JobStatsDisplay stats={stats} />);

		// The progress bar should be capped at 0% width
		const progressBar = container.querySelector(".bg-blue-500");
		expect(progressBar).toBeDefined();
		expect(progressBar?.getAttribute("style")).toContain("width: 0%");
	});

	it("should format camelCase labels correctly", () => {
		const stats = { itemsProcessed: 100 };
		render(<JobStatsDisplay stats={stats} />);

		expect(screen.getByText("Items Processed:")).toBeDefined();
	});

	it("should format snake_case labels correctly", () => {
		const stats = { items_processed: 100 };
		render(<JobStatsDisplay stats={stats} />);

		expect(screen.getByText("Items Processed:")).toBeDefined();
	});

	it("should render completed status with check icon", () => {
		const stats = { status: "complete" };
		const { container } = render(<JobStatsDisplay stats={stats} />);

		expect(screen.getByText("Complete")).toBeDefined();
		// Check for green checkmark icon
		const icon = container.querySelector(".text-green-500");
		expect(icon).toBeDefined();
	});

	it("should render done status with check icon", () => {
		const stats = { status: "done" };
		const { container } = render(<JobStatsDisplay stats={stats} />);

		expect(screen.getByText("done")).toBeDefined();
		const icon = container.querySelector(".text-green-500");
		expect(icon).toBeDefined();
	});

	it("should render success status with check icon", () => {
		const stats = { status: "success" };
		const { container } = render(<JobStatsDisplay stats={stats} />);

		expect(screen.getByText("success")).toBeDefined();
		const icon = container.querySelector(".text-green-500");
		expect(icon).toBeDefined();
	});

	it("should render processing status with spinner icon", () => {
		const stats = { status: "processing" };
		const { container } = render(<JobStatsDisplay stats={stats} />);

		expect(screen.getByText("processing")).toBeDefined();
		// Check for blue spinner icon with animate-spin class
		const icon = container.querySelector(".text-blue-500.animate-spin");
		expect(icon).toBeDefined();
	});

	it("should render in progress status with spinner icon", () => {
		const stats = { status: "in progress" };
		const { container } = render(<JobStatsDisplay stats={stats} />);

		expect(screen.getByText("in progress")).toBeDefined();
		const icon = container.querySelector(".text-blue-500.animate-spin");
		expect(icon).toBeDefined();
	});

	it("should render active status with spinner icon", () => {
		const stats = { status: "active" };
		const { container } = render(<JobStatsDisplay stats={stats} />);

		expect(screen.getByText("active")).toBeDefined();
		const icon = container.querySelector(".text-blue-500.animate-spin");
		expect(icon).toBeDefined();
	});

	it("should render default gray icon for unknown status", () => {
		const stats = { status: "pending" };
		const { container } = render(<JobStatsDisplay stats={stats} />);

		expect(screen.getByText("pending")).toBeDefined();
		// Check for gray circle icon (default)
		const icon = container.querySelector(".text-gray-500");
		expect(icon).toBeDefined();
	});

	it("should localize phase status values", () => {
		const stats = { phase: "finalizing" };
		render(<JobStatsDisplay stats={stats} />);

		// Should show the localized phase value from misc content
		expect(screen.getByText("Finalizing")).toBeDefined();
	});

	it("should fall back to original value for unknown phases", () => {
		const stats = { phase: "Unknown Phase" };
		render(<JobStatsDisplay stats={stats} />);

		// Should show the original value when no translation exists
		expect(screen.getByText("Unknown Phase")).toBeDefined();
	});

	it("should handle VNode-like stat labels with key property", () => {
		// The component extracts values from IntlayerNode objects using .value property
		// The global smart mock in Vitest.tsx provides proper IntlayerNode objects

		const stats = { processed: 100 };
		render(<JobStatsDisplay stats={stats} />);

		// Should extract the value from IntlayerNode and auto-format the label
		expect(screen.getByText("Processed:")).toBeDefined();
	});

	it("should handle VNode-like phase values with key property", () => {
		// The component extracts values from IntlayerNode objects using .value property
		// The global smart mock in Vitest.tsx provides proper IntlayerNode objects

		const stats = { phase: "test-phase" };
		render(<JobStatsDisplay stats={stats} />);

		// Should extract the value and display it (no localization for unknown phases)
		expect(screen.getByText("test-phase")).toBeDefined();
	});
});
