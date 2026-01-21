import {
	createGetLatestLinearTicketsToolDefinition,
	executeGetLatestLinearTicketsTool,
} from "./GetLatestLinearTicketsTool";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("GetLatestLinearTicketsTool", () => {
	const originalEnv = process.env.LINEAR_API_TOKEN;
	const mockFetch = vi.fn();

	beforeEach(() => {
		mockFetch.mockReset();
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- assigning test double
		globalThis.fetch = mockFetch as unknown as typeof fetch;
	});

	afterEach(() => {
		if (originalEnv !== undefined) {
			process.env.LINEAR_API_TOKEN = originalEnv;
		} else {
			delete process.env.LINEAR_API_TOKEN;
		}
		mockFetch.mockReset();
	});

	it("creates the correct tool definition", () => {
		const def = createGetLatestLinearTicketsToolDefinition();
		expect(def.name).toBe("get_latest_linear_tickets");
		expect(def.parameters?.type).toBe("object");
		const props = def.parameters as { properties?: Record<string, unknown> };
		expect(props.properties?.limit).toBeDefined();
		expect(props.properties?.teamKey).toBeDefined();
		expect(def.description).toContain("LINEAR_API_TOKEN");
	});

	it("returns an error when LINEAR_API_TOKEN is missing", async () => {
		delete process.env.LINEAR_API_TOKEN;
		const result = await executeGetLatestLinearTicketsTool();
		expect(result).toContain("LINEAR_API_TOKEN is not configured");
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("fetches and formats latest tickets", async () => {
		process.env.LINEAR_API_TOKEN = "test-linear-token";
		let capturedInit: RequestInit | undefined;
		mockFetch.mockImplementation((_input, init) => {
			capturedInit = init;
			return Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						data: {
							issues: {
								nodes: [
									{
										id: "1",
										identifier: "DOC-101",
										title: "Polish docs",
										url: "https://linear.app/example/DOC-101",
										updatedAt: "2024-10-20T12:00:00Z",
										priority: 2,
										priorityLabel: "Medium",
										state: { name: "In Progress" },
										assignee: { name: "Alex" },
										team: { name: "Docs", key: "DOC" },
										estimate: 3,
									},
								],
							},
						},
					}),
			} as unknown as Response);
		});

		const result = await executeGetLatestLinearTicketsTool({ limit: 40, teamKey: "DOC" });
		const parsedBody = JSON.parse((capturedInit?.body as string) ?? "{}");
		expect(parsedBody.variables.first).toBe(25);
		expect(parsedBody.variables.filter).toEqual({ team: { key: { eq: "DOC" } } });
		expect(capturedInit?.headers).toMatchObject({ Authorization: "test-linear-token" });
		expect(result).toContain("DOC-101");
		expect(result).toContain("Latest 1 Linear ticket");
	});

	it("surfaces Linear API errors", async () => {
		process.env.LINEAR_API_TOKEN = "test-linear-token";
		mockFetch.mockResolvedValue({
			ok: true,
			json: async () => ({ errors: [{ message: "Some GraphQL error" }] }),
		} as unknown as Response);

		const result = await executeGetLatestLinearTicketsTool();
		expect(result).toContain("Linear API returned errors");
	});

	it("handles HTTP failures", async () => {
		process.env.LINEAR_API_TOKEN = "test-linear-token";
		mockFetch.mockResolvedValue({
			ok: false,
			status: 502,
			statusText: "Bad Gateway",
			text: async () => "upstream error",
		} as unknown as Response);

		const result = await executeGetLatestLinearTicketsTool();
		expect(result).toContain("Failed to fetch Linear tickets: 502 Bad Gateway");
	});

	it("handles invalid date format", async () => {
		process.env.LINEAR_API_TOKEN = "test-linear-token";
		mockFetch.mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					data: {
						issues: {
							nodes: [
								{
									id: "1",
									identifier: "TEST-1",
									title: "Test ticket",
									url: "https://linear.app/example/TEST-1",
									updatedAt: "invalid-date-string",
									priority: 1,
									priorityLabel: "High",
									state: { name: "Done" },
									assignee: { name: "John" },
									team: { name: "Test", key: "TEST" },
								},
							],
						},
					},
				}),
		} as unknown as Response);

		const result = await executeGetLatestLinearTicketsTool();
		expect(result).toContain("TEST-1");
		expect(result).toContain("invalid-date-string");
	});

	it("handles HTTP failure with unreadable response body", async () => {
		process.env.LINEAR_API_TOKEN = "test-linear-token";
		mockFetch.mockResolvedValue({
			ok: false,
			status: 500,
			statusText: "Internal Server Error",
			text: () => {
				throw new Error("Cannot read body");
			},
		} as unknown as Response);

		const result = await executeGetLatestLinearTicketsTool();
		expect(result).toContain("Failed to fetch Linear tickets: 500 Internal Server Error");
	});

	it("handles network errors", async () => {
		process.env.LINEAR_API_TOKEN = "test-linear-token";
		mockFetch.mockRejectedValue(new Error("Network error"));

		const result = await executeGetLatestLinearTicketsTool();
		expect(result).toContain("Failed to fetch Linear tickets: Network error");
	});

	it("returns no tickets found message with team filter", async () => {
		process.env.LINEAR_API_TOKEN = "test-linear-token";
		mockFetch.mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					data: {
						issues: {
							nodes: [],
						},
					},
				}),
		} as unknown as Response);

		const result = await executeGetLatestLinearTicketsTool({ teamKey: "NONEXISTENT" });
		expect(result).toBe("No Linear tickets found for team NONEXISTENT.");
	});

	it("returns no tickets found message without team filter", async () => {
		process.env.LINEAR_API_TOKEN = "test-linear-token";
		mockFetch.mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					data: {
						issues: {
							nodes: [],
						},
					},
				}),
		} as unknown as Response);

		const result = await executeGetLatestLinearTicketsTool();
		expect(result).toBe("No Linear tickets found.");
	});

	it("handles normalizeLimit edge cases", async () => {
		process.env.LINEAR_API_TOKEN = "test-linear-token";
		let capturedLimit = 0;
		mockFetch.mockImplementation((_input, init) => {
			const body = JSON.parse((init?.body as string) ?? "{}");
			capturedLimit = body.variables.first;
			return Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						data: {
							issues: {
								nodes: [],
							},
						},
					}),
			} as unknown as Response);
		});

		await executeGetLatestLinearTicketsTool({ limit: 0 });
		expect(capturedLimit).toBe(1);

		await executeGetLatestLinearTicketsTool({ limit: -5 });
		expect(capturedLimit).toBe(1);

		await executeGetLatestLinearTicketsTool({ limit: 100 });
		expect(capturedLimit).toBe(25);

		await executeGetLatestLinearTicketsTool({ limit: 2.7 });
		expect(capturedLimit).toBe(2);
	});

	it("handles team without key", async () => {
		process.env.LINEAR_API_TOKEN = "test-linear-token";
		mockFetch.mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					data: {
						issues: {
							nodes: [
								{
									id: "1",
									identifier: "TEST-1",
									title: "Test ticket",
									url: "https://linear.app/example/TEST-1",
									updatedAt: "2024-10-20T12:00:00Z",
									priority: 1,
									priorityLabel: "High",
									state: { name: "Done" },
									assignee: { name: "John" },
									team: { name: "Test Team", key: null },
								},
							],
						},
					},
				}),
		} as unknown as Response);

		const result = await executeGetLatestLinearTicketsTool();
		expect(result).toContain("TEST-1");
		expect(result).toContain("Team: Test Team");
		expect(result).not.toContain("(null)");
	});

	it("handles ticket without team", async () => {
		process.env.LINEAR_API_TOKEN = "test-linear-token";
		mockFetch.mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					data: {
						issues: {
							nodes: [
								{
									id: "1",
									identifier: "TEST-1",
									title: "Test ticket",
									url: null,
									updatedAt: "2024-10-20T12:00:00Z",
									priority: null,
									priorityLabel: null,
									state: null,
									assignee: null,
									team: null,
									estimate: null,
								},
							],
						},
					},
				}),
		} as unknown as Response);

		const result = await executeGetLatestLinearTicketsTool();
		expect(result).toContain("TEST-1");
		expect(result).toContain("Unknown");
		expect(result).toContain("Unassigned");
		expect(result).toContain("No priority");
	});
});
