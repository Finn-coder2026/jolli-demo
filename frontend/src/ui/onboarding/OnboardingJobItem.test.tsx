import { wrapIntlayerMock } from "../../test/TestUtils";
import { OnboardingJobItem } from "./OnboardingJobItem";
import { render, screen } from "@testing-library/preact";
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
	};
});

vi.mock("react-intlayer", () => ({
	useIntlayer: () =>
		wrapIntlayerMock({
			jobStatusRunning: "Running",
			jobStatusQueued: "Queued",
			jobStatusCompleted: "Completed",
			jobStatusFailed: "Failed",
		}),
}));

describe("OnboardingJobItem", () => {
	it("should render job title and subtitle", () => {
		const job: OnboardingJob = {
			id: "job-1",
			title: "Importing documentation",
			subtitle: "Getting Started Guide.md",
			status: "running",
			progress: 65,
			icon: "document",
		};

		render(<OnboardingJobItem job={job} />);

		expect(screen.getByTestId("job-title").textContent).toBe("Importing documentation");
		expect(screen.getByTestId("job-subtitle").textContent).toBe("Getting Started Guide.md");
	});

	it("should render status badge with correct label", () => {
		const job: OnboardingJob = {
			id: "job-1",
			title: "Test Job",
			status: "running",
		};

		render(<OnboardingJobItem job={job} />);

		expect(screen.getByTestId("job-status-badge").textContent).toBe("Running");
	});

	it("should render progress bar for running jobs", () => {
		const job: OnboardingJob = {
			id: "job-1",
			title: "Test Job",
			status: "running",
			progress: 65,
		};

		render(<OnboardingJobItem job={job} />);

		expect(screen.getByTestId("job-progress-container")).toBeDefined();
		expect(screen.getByTestId("job-progress-bar")).toBeDefined();
		expect(screen.getByTestId("job-progress-text").textContent).toBe("65%");
	});

	it("should not render progress bar for non-running jobs", () => {
		const job: OnboardingJob = {
			id: "job-1",
			title: "Test Job",
			status: "completed",
			progress: 100,
		};

		render(<OnboardingJobItem job={job} />);

		expect(screen.queryByTestId("job-progress-container")).toBe(null);
	});

	it("should not render subtitle when not provided", () => {
		const job: OnboardingJob = {
			id: "job-1",
			title: "Test Job",
			status: "queued",
		};

		render(<OnboardingJobItem job={job} />);

		expect(screen.queryByTestId("job-subtitle")).toBe(null);
	});

	it("should render correct icon for document type", () => {
		const job: OnboardingJob = {
			id: "job-1",
			title: "Test Job",
			status: "running",
			icon: "document",
		};

		render(<OnboardingJobItem job={job} />);

		expect(screen.getByTestId("job-icon-document")).toBeDefined();
	});

	it("should render correct icon for sync type", () => {
		const job: OnboardingJob = {
			id: "job-1",
			title: "Test Job",
			status: "running",
			icon: "sync",
		};

		render(<OnboardingJobItem job={job} />);

		expect(screen.getByTestId("job-icon-sync")).toBeDefined();
	});

	it("should render correct icon for analysis type", () => {
		const job: OnboardingJob = {
			id: "job-1",
			title: "Test Job",
			status: "running",
			icon: "analysis",
		};

		render(<OnboardingJobItem job={job} />);

		expect(screen.getByTestId("job-icon-analysis")).toBeDefined();
	});

	it("should render correct icon for import type", () => {
		const job: OnboardingJob = {
			id: "job-1",
			title: "Test Job",
			status: "running",
			icon: "import",
		};

		render(<OnboardingJobItem job={job} />);

		expect(screen.getByTestId("job-icon-import")).toBeDefined();
	});

	it("should render default icon when no icon specified", () => {
		const job: OnboardingJob = {
			id: "job-1",
			title: "Test Job",
			status: "running",
		};

		render(<OnboardingJobItem job={job} />);

		expect(screen.getByTestId("job-icon-default")).toBeDefined();
	});

	it("should clamp progress between 0 and 100", () => {
		const job: OnboardingJob = {
			id: "job-1",
			title: "Test Job",
			status: "running",
			progress: 150,
		};

		render(<OnboardingJobItem job={job} />);

		const progressBar = screen.getByTestId("job-progress-bar");
		expect(progressBar.style.width).toBe("100%");
	});

	it("should display all status types correctly", () => {
		const statuses: Array<{ status: OnboardingJob["status"]; label: string }> = [
			{ status: "running", label: "Running" },
			{ status: "queued", label: "Queued" },
			{ status: "completed", label: "Completed" },
			{ status: "failed", label: "Failed" },
		];

		for (const { status, label } of statuses) {
			const { unmount } = render(
				<OnboardingJobItem
					job={{
						id: `job-${status}`,
						title: "Test Job",
						status,
					}}
				/>,
			);

			expect(screen.getByTestId("job-status-badge").textContent).toBe(label);
			unmount();
		}
	});
});
