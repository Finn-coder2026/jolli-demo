import { createMockIntlayerValue } from "../test/TestUtils";
import { getCompletionMessage, getJobMessage, getLogMessage, type JobLog, useJobTitle } from "./JobLocalization";
import { describe, expect, it } from "vitest";

/**
 * Helper to create a mock intlayer insert() function for testing
 * Returns an object with a .value property containing the interpolated string
 */
function createMockInsertFunction(template: string): (context: Record<string, unknown>) => { value: string } {
	return (context: Record<string, unknown>) => {
		const interpolated = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
			const value = context[key];
			return value !== undefined ? String(value) : `{{${key}}}`;
		});
		return { value: interpolated };
	};
}

describe("getJobMessage", () => {
	it("should return localized log message with context", () => {
		const jobsContent = {
			"demo:quick-stats": {
				logs: {
					"processed-progress": createMockInsertFunction("Processed: {{processed}}%"),
				},
			},
		};

		const result = getJobMessage(jobsContent, "demo:quick-stats", "processed-progress", { processed: 50 });
		expect(result).toBe("Processed: 50%");
	});

	it("should return localized completion message", () => {
		const jobsContent = {
			"core:cleanup-old-jobs": {
				completion: {
					success: createMockIntlayerValue("Cleanup completed successfully"),
				},
			},
		};

		const result = getJobMessage(jobsContent, "core:cleanup-old-jobs", "success");
		expect(result).toBe("Cleanup completed successfully");
	});

	it("should handle integration job logs", () => {
		const jobsContent = {
			integration: {
				sync: {
					logs: {
						starting: createMockInsertFunction("Starting sync for {{integrationName}}"),
					},
				},
				process: {
					logs: {},
					completion: {},
				},
			},
		};

		const result = getJobMessage(jobsContent, "integration:github", "starting");
		expect(result).toBe("Starting sync for github");
	});

	it("should handle integration sync completion messages", () => {
		const jobsContent = {
			integration: {
				sync: {
					logs: {},
					completion: {
						success: createMockInsertFunction("Synchronized {{integrationName}} successfully"),
					},
				},
				process: {
					logs: {},
					completion: {},
				},
			},
		};

		const result = getJobMessage(jobsContent, "integration:slack", "success");
		expect(result).toBe("Synchronized slack successfully");
	});

	it("should handle integration process logs", () => {
		const jobsContent = {
			integration: {
				sync: {
					logs: {},
					completion: {},
				},
				process: {
					logs: {
						"processing-event": createMockInsertFunction("Processing {{integrationName}} event"),
					},
					completion: {},
				},
			},
		};

		const result = getJobMessage(jobsContent, "integration:github", "processing-event");
		expect(result).toBe("Processing github event");
	});

	it("should handle integration process completion messages", () => {
		const jobsContent = {
			integration: {
				sync: {
					logs: {},
					completion: {},
				},
				process: {
					logs: {},
					completion: {
						success: createMockInsertFunction("Processed {{integrationName}} successfully"),
					},
				},
			},
		};

		const result = getJobMessage(jobsContent, "integration:github", "success");
		expect(result).toBe("Processed github successfully");
	});

	it("should handle integration job when integration content is undefined", () => {
		const jobsContent = {};

		const result = getJobMessage(jobsContent, "integration:github", "starting");
		expect(result).toBe("starting");
	});

	it("should handle integration job when message key not found in integration content", () => {
		const jobsContent = {
			integration: {
				sync: {
					logs: {},
					completion: {},
				},
				process: {
					logs: {},
					completion: {},
				},
			},
		};

		const result = getJobMessage(jobsContent, "integration:github", "unknown-message");
		expect(result).toBe("unknown-message");
	});

	it("should fallback to common error messages", () => {
		const jobsContent = {
			errors: {
				"network-error": "Network connection failed",
			},
		};

		const result = getJobMessage(jobsContent, "any-job", "network-error");
		expect(result).toBe("Network connection failed");
	});

	it("should handle scheduler log messages", () => {
		const jobsContent = {
			scheduler: {
				logs: {
					"job-starting": createMockInsertFunction("Starting job: {{jobName}}"),
				},
			},
		};

		const result = getJobMessage(jobsContent, "any-job", "job-starting", { jobName: "test-job" });
		expect(result).toBe("Starting job: test-job");
	});

	it("should handle workflow log messages", () => {
		const jobsContent = {
			workflows: {
				logs: {
					"workflow-starting": createMockInsertFunction("Starting {{workflowType}} workflow"),
				},
			},
		};

		const result = getJobMessage(jobsContent, "knowledge-graph:code-docs", "workflow-starting", {
			workflowType: "code-docs",
		});
		expect(result).toBe("Starting code-docs workflow");
	});

	it("should fallback to message key when not found", () => {
		const jobsContent = {
			errors: {},
		};
		const result = getJobMessage(jobsContent, "unknown-job", "unknown-key");
		expect(result).toBe("unknown-key");
	});

	it("should fallback to message key when job exists but has no logs or completion", () => {
		const jobsContent = {
			"some-job": {
				title: "Some Job",
				description: "A job without logs or completion",
			},
		};
		const result = getJobMessage(jobsContent, "some-job", "some-message");
		expect(result).toBe("some-message");
	});
});

describe("getLogMessage", () => {
	it("should return plain message for legacy format", () => {
		const log: JobLog = {
			timestamp: new Date(),
			level: createMockIntlayerValue("info"),
			message: createMockIntlayerValue("Plain log message"),
		};

		const result = getLogMessage({}, "any-job", log);
		expect(result).toBe("Plain log message");
	});

	it("should resolve message key for new format", () => {
		const jobsContent = {
			"demo:quick-stats": {
				logs: {
					starting: createMockIntlayerValue("Starting quick stats demo"),
				},
			},
		};

		const log: JobLog = {
			timestamp: new Date(),
			level: createMockIntlayerValue("info"),
			messageKey: createMockIntlayerValue("starting"),
		};

		const result = getLogMessage(jobsContent, "demo:quick-stats", log);
		expect(result).toBe("Starting quick stats demo");
	});

	it("should interpolate context variables", () => {
		const jobsContent = {
			"demo:multi-stat-progress": {
				logs: {
					progress: createMockInsertFunction("Files: {{filesProcessed}}, Errors: {{errors}}"),
				},
			},
		};

		const log: JobLog = {
			timestamp: new Date(),
			level: createMockIntlayerValue("info"),
			messageKey: createMockIntlayerValue("progress"),
			context: { filesProcessed: 25, errors: 1 },
		};

		const result = getLogMessage(jobsContent, "demo:multi-stat-progress", log);
		expect(result).toBe("Files: 25, Errors: 1");
	});

	it("should return empty string when no message or key", () => {
		const log: JobLog = {
			timestamp: new Date(),
			level: createMockIntlayerValue("info"),
		};

		const result = getLogMessage({}, "any-job", log);
		expect(result).toBe("");
	});

	it("should handle VNode objects with children property", () => {
		const jobsContent = {
			"demo:quick-stats": {
				logs: {
					starting: createMockIntlayerValue("Starting quick stats demo"),
				},
			},
		};

		// Create a VNode-like object with props.children as a plain string
		const vnodeMessage = {
			props: {
				children: "VNode message content",
			},
		};

		const log: JobLog = {
			timestamp: new Date(),
			level: createMockIntlayerValue("info"),
			// biome-ignore lint/suspicious/noExplicitAny: Test mock needs flexible typing
			message: vnodeMessage as any,
		};

		const result = getLogMessage(jobsContent, "demo:quick-stats", log);
		expect(result).toBe("VNode message content");
	});
});

describe("getCompletionMessage", () => {
	it("should return plain message for legacy format", () => {
		const completionInfo = {
			message: createMockIntlayerValue("Job completed successfully"),
		};

		const result = getCompletionMessage({}, "any-job", completionInfo);
		expect(result).toBe("Job completed successfully");
	});

	it("should resolve message key for new format", () => {
		const jobsContent = {
			"core:cleanup-old-jobs": {
				completion: {
					success: createMockInsertFunction("Deleted {{count}} old job records"),
				},
			},
		};

		const completionInfo = {
			messageKey: createMockIntlayerValue("success"),
			context: { count: 42 },
		};

		const result = getCompletionMessage(jobsContent, "core:cleanup-old-jobs", completionInfo);
		expect(result).toBe("Deleted 42 old job records");
	});

	it("should return empty string when no message or key", () => {
		const completionInfo = {};
		const result = getCompletionMessage({}, "any-job", completionInfo);
		expect(result).toBe("");
	});
});

describe("useJobTitle", () => {
	const jobsContent = {
		"demo:quick-stats": {
			title: createMockIntlayerValue("Quick Stats Demo"),
			description: createMockIntlayerValue("Quick demo job"),
		},
	};

	it("should return localized job title when it exists in jobsContent", () => {
		const result = useJobTitle(jobsContent, "demo:quick-stats");

		// Now returns the intlayer object (which has .value for mocks)
		expect(String(result)).toBe("Quick Stats Demo");
	});

	it("should return job name as fallback when title doesn't exist", () => {
		const result = useJobTitle(jobsContent, "unknown-job");

		expect(result).toBe("unknown-job");
	});

	it("should return intlayer value directly for JSX rendering", () => {
		const result = useJobTitle(jobsContent, "demo:quick-stats");

		// The result should have a .value property (from our mock)
		expect(result).toHaveProperty("value", "Quick Stats Demo");
	});
});
