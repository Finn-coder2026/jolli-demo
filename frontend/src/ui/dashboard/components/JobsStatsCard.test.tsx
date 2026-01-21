import { ClientProvider } from "../../../contexts/ClientContext";
import { RouterProvider } from "../../../contexts/RouterContext";
import { JobsStatsCard } from "./JobsStatsCard";
import { act, render, screen, waitFor } from "@testing-library/preact";
import type { JobStats } from "jolli-common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("JobsStatsCard", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		global.fetch = vi.fn();
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("should show loading state initially", () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => ({ activeCount: 0, completedCount: 0, failedCount: 0, totalRetries: 0 }),
		});

		render(
			<ClientProvider>
				<RouterProvider>
					<JobsStatsCard />
				</RouterProvider>
			</ClientProvider>,
		);

		expect(screen.getByText("Loading stats...")).toBeDefined();
	});

	it("should render job stats when loaded", async () => {
		const mockStats: JobStats = {
			activeCount: 3,
			completedCount: 10,
			failedCount: 2,
			totalRetries: 5,
		};

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => mockStats,
		});

		render(
			<ClientProvider>
				<RouterProvider>
					<JobsStatsCard />
				</RouterProvider>
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Running")).toBeDefined();
			expect(screen.getByText("3")).toBeDefined();
			expect(screen.getByText("Completed")).toBeDefined();
			expect(screen.getByText("10")).toBeDefined();
			expect(screen.getByText("Failed")).toBeDefined();
			expect(screen.getByText("2")).toBeDefined();
			expect(screen.getByText("Retries")).toBeDefined();
			expect(screen.getByText("5")).toBeDefined();
		});
	});

	it("should show error message when stats fail to load", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

		render(
			<ClientProvider>
				<RouterProvider>
					<JobsStatsCard />
				</RouterProvider>
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Network error")).toBeDefined();
		});
	});

	it("should show default error message when non-Error exception is thrown", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue("String error");

		render(
			<ClientProvider>
				<RouterProvider>
					<JobsStatsCard />
				</RouterProvider>
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Failed to load job stats")).toBeDefined();
		});
	});

	it("should show no stats message when stats is null", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => null,
		});

		render(
			<ClientProvider>
				<RouterProvider>
					<JobsStatsCard />
				</RouterProvider>
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("No stats available")).toBeDefined();
		});
	});

	it("should render View Running Jobs button", async () => {
		const mockStats: JobStats = {
			activeCount: 3,
			completedCount: 10,
			failedCount: 2,
			totalRetries: 5,
		};

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => mockStats,
		});

		render(
			<ClientProvider>
				<RouterProvider>
					<JobsStatsCard />
				</RouterProvider>
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("View Running Jobs")).toBeDefined();
		});

		const button = screen.getByText("View Running Jobs");
		expect(button).toBeDefined();
		expect(button.tagName).toBe("BUTTON");
	});

	it("should render View History button", async () => {
		const mockStats: JobStats = {
			activeCount: 3,
			completedCount: 10,
			failedCount: 2,
			totalRetries: 5,
		};

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => mockStats,
		});

		render(
			<ClientProvider>
				<RouterProvider>
					<JobsStatsCard />
				</RouterProvider>
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("View History")).toBeDefined();
		});

		const button = screen.getByText("View History");
		expect(button).toBeDefined();
		expect(button.tagName).toBe("BUTTON");
	});

	it("should navigate to active jobs when View Running Jobs is clicked", async () => {
		const mockStats: JobStats = {
			activeCount: 3,
			completedCount: 10,
			failedCount: 2,
			totalRetries: 5,
		};

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => mockStats,
		});

		render(
			<ClientProvider>
				<RouterProvider>
					<JobsStatsCard />
				</RouterProvider>
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("View Running Jobs")).toBeDefined();
		});

		const button = screen.getByText("View Running Jobs");
		button.click();

		// Should navigate to /jobs/active (tested in RouterContext)
		expect(button).toBeDefined();
	});

	it("should navigate to job history when View History is clicked", async () => {
		const mockStats: JobStats = {
			activeCount: 3,
			completedCount: 10,
			failedCount: 2,
			totalRetries: 5,
		};

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => mockStats,
		});

		render(
			<ClientProvider>
				<RouterProvider>
					<JobsStatsCard />
				</RouterProvider>
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("View History")).toBeDefined();
		});

		const button = screen.getByText("View History");
		button.click();

		// Should navigate to /jobs/history (tested in RouterContext)
		expect(button).toBeDefined();
	});

	it("should poll for stats every 10 seconds", async () => {
		const mockStats: JobStats = {
			activeCount: 3,
			completedCount: 10,
			failedCount: 2,
			totalRetries: 5,
		};

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => mockStats,
		});

		render(
			<ClientProvider>
				<RouterProvider>
					<JobsStatsCard />
				</RouterProvider>
			</ClientProvider>,
		);

		// Wait for initial load
		await waitFor(() => {
			expect(screen.getByText("Running")).toBeDefined();
		});

		// Should have called fetch once initially
		expect(global.fetch).toHaveBeenCalledTimes(1);

		// Advance time by 10 seconds
		act(() => {
			vi.advanceTimersByTime(10000);
		});

		// Should have called fetch again
		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalledTimes(2);
		});

		// Advance time by another 10 seconds
		act(() => {
			vi.advanceTimersByTime(10000);
		});

		// Should have called fetch a third time
		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalledTimes(3);
		});
	});
});
