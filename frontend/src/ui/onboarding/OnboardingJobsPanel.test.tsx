import { wrapIntlayerMock } from "../../test/TestUtils";
import { OnboardingJobsPanel } from "./OnboardingJobsPanel";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { OnboardingJob } from "jolli-common";
import { describe, expect, it, vi } from "vitest";

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		FileText: ({ className, "data-testid": testId }: { className?: string; "data-testid"?: string }) => (
			<div className={className} data-testid={testId} />
		),
		GitBranch: ({ className, "data-testid": testId }: { className?: string; "data-testid"?: string }) => (
			<div className={className} data-testid={testId} />
		),
		Search: ({ className, "data-testid": testId }: { className?: string; "data-testid"?: string }) => (
			<div className={className} data-testid={testId} />
		),
		Upload: ({ className, "data-testid": testId }: { className?: string; "data-testid"?: string }) => (
			<div className={className} data-testid={testId} />
		),
		Minus: ({ className }: { className?: string }) => <div className={className} data-testid="minus-icon" />,
	};
});

vi.mock("react-intlayer", () => ({
	useIntlayer: () =>
		wrapIntlayerMock({
			jobsPanelTitle: "Jobs",
			jobsRunning: "running",
			jobsQueued: "queued",
			noJobs: "No jobs yet",
			jobStatusRunning: "Running",
			jobStatusQueued: "Queued",
			jobStatusCompleted: "Completed",
			jobStatusFailed: "Failed",
			minimizePanel: "Minimize",
		}),
}));

describe("OnboardingJobsPanel", () => {
	it("should render panel with title", () => {
		render(<OnboardingJobsPanel jobs={[]} />);

		expect(screen.getByTestId("onboarding-jobs-panel")).toBeDefined();
		expect(screen.getByText("Jobs")).toBeDefined();
	});

	it("should render empty state when no jobs", () => {
		render(<OnboardingJobsPanel jobs={[]} />);

		expect(screen.getByTestId("no-jobs-message")).toBeDefined();
		expect(screen.getByTestId("no-jobs-message").textContent).toBe("No jobs yet");
	});

	it("should render job items when jobs provided", () => {
		const jobs: Array<OnboardingJob> = [
			{
				id: "job-1",
				title: "Job 1",
				status: "running",
			},
			{
				id: "job-2",
				title: "Job 2",
				status: "queued",
			},
		];

		render(<OnboardingJobsPanel jobs={jobs} />);

		expect(screen.getByTestId("onboarding-job-item-job-1")).toBeDefined();
		expect(screen.getByTestId("onboarding-job-item-job-2")).toBeDefined();
	});

	it("should display summary with running count only", () => {
		const jobs: Array<OnboardingJob> = [
			{
				id: "job-1",
				title: "Job 1",
				status: "running",
			},
		];

		render(<OnboardingJobsPanel jobs={jobs} />);

		expect(screen.getByTestId("jobs-summary").textContent).toBe("1 running");
	});

	it("should display summary with queued count only", () => {
		const jobs: Array<OnboardingJob> = [
			{
				id: "job-1",
				title: "Job 1",
				status: "queued",
			},
			{
				id: "job-2",
				title: "Job 2",
				status: "queued",
			},
		];

		render(<OnboardingJobsPanel jobs={jobs} />);

		expect(screen.getByTestId("jobs-summary").textContent).toBe("2 queued");
	});

	it("should display summary with both running and queued counts", () => {
		const jobs: Array<OnboardingJob> = [
			{
				id: "job-1",
				title: "Job 1",
				status: "running",
			},
			{
				id: "job-2",
				title: "Job 2",
				status: "queued",
			},
			{
				id: "job-3",
				title: "Job 3",
				status: "queued",
			},
		];

		render(<OnboardingJobsPanel jobs={jobs} />);

		expect(screen.getByTestId("jobs-summary").textContent).toBe("1 running, 2 queued");
	});

	it("should not display summary when only completed/failed jobs", () => {
		const jobs: Array<OnboardingJob> = [
			{
				id: "job-1",
				title: "Job 1",
				status: "completed",
			},
			{
				id: "job-2",
				title: "Job 2",
				status: "failed",
			},
		];

		render(<OnboardingJobsPanel jobs={jobs} />);

		expect(screen.queryByTestId("jobs-summary")).toBe(null);
	});

	it("should not show empty state when jobs are present", () => {
		const jobs: Array<OnboardingJob> = [
			{
				id: "job-1",
				title: "Job 1",
				status: "completed",
			},
		];

		render(<OnboardingJobsPanel jobs={jobs} />);

		expect(screen.queryByTestId("no-jobs-message")).toBe(null);
	});

	it("should render minimize button when onMinimize is provided", () => {
		const onMinimize = vi.fn();
		render(<OnboardingJobsPanel jobs={[]} onMinimize={onMinimize} />);

		expect(screen.getByTestId("minimize-jobs-panel-button")).toBeDefined();
	});

	it("should not render minimize button when onMinimize is not provided", () => {
		render(<OnboardingJobsPanel jobs={[]} />);

		expect(screen.queryByTestId("minimize-jobs-panel-button")).toBe(null);
	});

	it("should call onMinimize when minimize button is clicked", () => {
		const onMinimize = vi.fn();
		render(<OnboardingJobsPanel jobs={[]} onMinimize={onMinimize} />);

		fireEvent.click(screen.getByTestId("minimize-jobs-panel-button"));

		expect(onMinimize).toHaveBeenCalledTimes(1);
	});
});
