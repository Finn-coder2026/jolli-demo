import type { JobScheduleOptions } from "../types/JobTypes";
import { jobDefinitionBuilder } from "./JobDefinitions";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

describe("JobDefinitions", () => {
	describe("jobDefinitionBuilder", () => {
		it("should create a builder with default values and execute default handler", async () => {
			const builder = jobDefinitionBuilder();
			const jobDef = builder.build();

			// Execute the default handler to cover line 12
			await jobDef.handler(
				{},
				{
					jobId: "test",
					jobName: "test",
					emitEvent: async () => {
						// Mock emitEvent - intentionally empty
					},
					log: () => {
						// Mock log - intentionally empty
					},
					updateStats: vi.fn(),
					setCompletionInfo: vi.fn(),
				},
			);

			// Execute the default shouldTriggerEvent to cover line 21
			const shouldTrigger = await jobDef.shouldTriggerEvent?.("any-event", {});
			expect(shouldTrigger).toBe(true);

			// Execute the default triggerEventParamsConverter to cover line 23
			const convertedParams = jobDef.triggerEventParamsConverter?.({ test: "data" });
			expect(convertedParams).toEqual({ test: "data" });

			expect(jobDef.category).toBe("unknown");
			expect(jobDef.name).toBe("unknown");
		});

		it("should build a complete job definition", () => {
			const handler = async () => {
				// Test handler - intentionally empty
			};
			const jobDef = jobDefinitionBuilder()
				.category("test")
				.name("test-job")
				.description("A test job")
				.schema(z.object({ id: z.number() }))
				.handler(handler)
				.build();

			expect(jobDef.category).toBe("test");
			expect(jobDef.name).toBe("test-job");
			expect(jobDef.description).toBe("A test job");
			expect(jobDef.handler).toBe(handler);
			expect(jobDef.schema).toBeDefined();
		});

		it("should set defaultOptions", () => {
			const defaultOptions: JobScheduleOptions = {
				priority: "high",
				retryLimit: 3,
			};

			const jobDef = jobDefinitionBuilder()
				.category("test")
				.name("test-job")
				.description("A test job")
				.handler(async () => {
					// Test handler - intentionally empty
				})
				.defaultOptions(defaultOptions)
				.build();

			expect(jobDef.defaultOptions).toEqual(defaultOptions);
		});

		it("should set triggerEvents", () => {
			const events = ["event1", "event2"];

			const jobDef = jobDefinitionBuilder()
				.category("test")
				.name("test-job")
				.description("A test job")
				.handler(async () => {
					// Test handler - intentionally empty
				})
				.triggerEvents(events)
				.build();

			expect(jobDef.triggerEvents).toEqual(events);
		});

		it("should build with both defaultOptions and triggerEvents", () => {
			const defaultOptions: JobScheduleOptions = {
				priority: "normal",
			};
			const events = ["event1"];

			const jobDef = jobDefinitionBuilder()
				.category("test")
				.name("test-job")
				.description("A test job")
				.handler(async () => {
					// Test handler - intentionally empty
				})
				.defaultOptions(defaultOptions)
				.triggerEvents(events)
				.build();

			expect(jobDef.defaultOptions).toEqual(defaultOptions);
			expect(jobDef.triggerEvents).toEqual(events);
		});

		it("should set showInDashboard to true", () => {
			const jobDef = jobDefinitionBuilder()
				.category("test")
				.name("test-job")
				.description("A test job")
				.handler(async () => {
					// Test handler - intentionally empty
				})
				.showInDashboard()
				.build();

			expect(jobDef.showInDashboard).toBe(true);
		});

		it("should set excludeFromStats to true when called", () => {
			const jobDef = jobDefinitionBuilder()
				.category("test")
				.name("test-job")
				.description("A test job")
				.handler(async () => {
					// Test handler - intentionally empty
				})
				.excludeFromStats()
				.build();

			expect(jobDef.excludeFromStats).toBe(true);
		});

		it("should set keepCardAfterCompletion to true when called", () => {
			const jobDef = jobDefinitionBuilder()
				.category("test")
				.name("test-job")
				.description("A test job")
				.handler(async () => {
					// Test handler - intentionally empty
				})
				.keepCardAfterCompletion()
				.build();

			expect(jobDef.keepCardAfterCompletion).toBe(true);
		});

		it("should set statsSchema", () => {
			const statsSchema = z.object({ progress: z.number(), total: z.number() });

			const jobDef = jobDefinitionBuilder()
				.category("test")
				.name("test-job")
				.description("A test job")
				.handler(async () => {
					// Test handler - intentionally empty
				})
				.statsSchema(statsSchema)
				.build();

			expect(jobDef.statsSchema).toBe(statsSchema);
		});

		it("should set title when called", () => {
			const jobDef = jobDefinitionBuilder()
				.category("test")
				.name("test-job")
				.description("A test job")
				.title("Test Job Title")
				.handler(async () => {
					// Test handler - intentionally empty
				})
				.build();

			expect(jobDef.title).toBe("Test Job Title");
		});

		it("should set loopPrevention config when called", () => {
			const loopPreventionConfig = {
				maxChainDepth: 5,
				maxJobRepetitions: 1,
			};

			const jobDef = jobDefinitionBuilder()
				.category("test")
				.name("test-job")
				.description("A test job")
				.handler(async () => {
					// Test handler - intentionally empty
				})
				.loopPrevention(loopPreventionConfig)
				.build();

			expect(jobDef.loopPrevention).toEqual(loopPreventionConfig);
		});

		it("should set shouldTriggerEvent predicate when called", async () => {
			const predicate = (name: string, _params: unknown): Promise<boolean> => {
				return Promise.resolve(name === "allowed-event");
			};

			const jobDef = jobDefinitionBuilder()
				.category("test")
				.name("test-job")
				.description("A test job")
				.handler(async () => {
					// Test handler - intentionally empty
				})
				.shouldTriggerEvent(predicate)
				.build();

			expect(jobDef.shouldTriggerEvent).toBe(predicate);

			// Test the predicate returns true for allowed event
			const result1 = await jobDef.shouldTriggerEvent?.("allowed-event", {});
			expect(result1).toBe(true);

			// Test the predicate returns false for other events
			const result2 = await jobDef.shouldTriggerEvent?.("other-event", {});
			expect(result2).toBe(false);
		});

		it("should set triggerEventParamsConverter when called", () => {
			const converter = (params: unknown) => {
				return (params as { id: number }).id > 0 ? params : undefined;
			};

			const jobDef = jobDefinitionBuilder()
				.category("test")
				.name("test-job")
				.description("A test job")
				.handler(async () => {
					// Test handler - intentionally empty
				})
				.triggerEventParamsConverter(converter)
				.build();

			expect(jobDef.triggerEventParamsConverter).toBe(converter);

			// Test the converter with valid params
			const result1 = jobDef.triggerEventParamsConverter?.({ id: 5 });
			expect(result1).toEqual({ id: 5 });

			// Test the converter with invalid params
			const result2 = jobDef.triggerEventParamsConverter?.({ id: -1 });
			expect(result2).toBeUndefined();
		});

		it("should not prepend category when name already starts with category", () => {
			const jobDef = jobDefinitionBuilder()
				.category("test")
				.name("test:my-job")
				.description("A test job")
				.handler(async () => {
					// Test handler - intentionally empty
				})
				.build();

			// Name should remain "test:my-job", not become "test:test:my-job"
			expect(jobDef.name).toBe("test:my-job");
		});
	});
});
