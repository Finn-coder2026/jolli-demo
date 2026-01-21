import { ClientProvider } from "../contexts/ClientContext";
import { DevToolsProvider } from "../contexts/DevToolsContext";
import { NavigationProvider } from "../contexts/NavigationContext";
import { RouterProvider } from "../contexts/RouterContext";
import { Dashboard } from "./Dashboard";
import { render, screen } from "@testing-library/preact";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Mock EventSource which is not available in JSDOM
class MockEventSource {
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: ((event: Event) => void) | null = null;
	close() {
		// Mock implementation - no cleanup needed
	}
}

describe("Dashboard", () => {
	beforeAll(() => {
		// Mock EventSource globally for SSE in JobsRunningList
		global.EventSource = MockEventSource as never;
		// Mock fetch for the client
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ activeCount: 0, completedCount: 0, failedCount: 0, totalRetries: 0 }),
		});
	});

	beforeEach(() => {
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
	});

	it("should render dashboard heading", () => {
		render(
			<ClientProvider>
				<RouterProvider>
					<DevToolsProvider>
						<NavigationProvider pathname="/dashboard">
							<Dashboard />
						</NavigationProvider>
					</DevToolsProvider>
				</RouterProvider>
			</ClientProvider>,
		);

		expect(screen.getByText("Dashboard")).toBeDefined();
	});

	it("should render job stats card", () => {
		render(
			<ClientProvider>
				<RouterProvider>
					<DevToolsProvider>
						<NavigationProvider pathname="/dashboard">
							<Dashboard />
						</NavigationProvider>
					</DevToolsProvider>
				</RouterProvider>
			</ClientProvider>,
		);

		expect(screen.getByText("Jobs")).toBeDefined();
	});

	it("should render ActiveJobs when on /jobs/active route", () => {
		render(
			<ClientProvider>
				<RouterProvider initialPath="/jobs/active">
					<Dashboard />
				</RouterProvider>
			</ClientProvider>,
		);

		// Should show ActiveJobs heading instead of Dashboard
		expect(screen.queryByText("Dashboard")).toBeNull();
	});

	it("should render JobHistory when on /jobs/history route", () => {
		render(
			<ClientProvider>
				<RouterProvider initialPath="/jobs/history">
					<Dashboard />
				</RouterProvider>
			</ClientProvider>,
		);

		// Should show JobHistory heading instead of Dashboard
		expect(screen.queryByText("Dashboard")).toBeNull();
	});
});
