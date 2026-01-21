import type {
	JobDefinition,
	JobDefinitionBuilder,
	JobEventParamsConverter,
	JobEventTriggerPredicate,
	JobHandler,
	JobScheduleOptions,
	LoopPreventionConfig,
} from "../types/JobTypes";
import { z } from "zod";

export function jobDefinitionBuilder<T = unknown, S = unknown>(): JobDefinitionBuilder<T, S> {
	const jobDef: JobDefinition<T> = {
		category: "unknown",
		name: "unknown",
		description: "",
		schema: z.object({}) as unknown as z.ZodSchema<T>,
		handler: async () => {
			// Default no-op handler
		},
		defaultOptions: {},
		triggerEvents: [],
		triggerEventParamsConverter: (params: unknown) => params as T,
		shouldTriggerEvent: async () => true,
		showInDashboard: false,
		excludeFromStats: false,
		keepCardAfterCompletion: false,
	};
	const builder: JobDefinitionBuilder<T, S> = {
		category,
		name,
		description,
		title,
		schema,
		handler,
		defaultOptions,
		triggerEvents,
		triggerEventParamsConverter,
		shouldTriggerEvent,
		loopPrevention,
		showInDashboard,
		excludeFromStats,
		keepCardAfterCompletion,
		statsSchema,
		build,
	};

	function category(category: string): JobDefinitionBuilder<T> {
		jobDef.category = category;
		return builder;
	}

	function name(name: string): JobDefinitionBuilder<T> {
		jobDef.name = name;
		return builder;
	}

	function description(description: string): JobDefinitionBuilder<T> {
		jobDef.description = description;
		return builder;
	}

	function title(title: string): JobDefinitionBuilder<T> {
		jobDef.title = title;
		return builder;
	}

	function schema(schema: z.ZodSchema<T>): JobDefinitionBuilder<T> {
		jobDef.schema = schema;
		return builder;
	}

	function handler(handler: JobHandler<T>): JobDefinitionBuilder<T> {
		jobDef.handler = handler;
		return builder;
	}

	function defaultOptions(defaultOptions: JobScheduleOptions): JobDefinitionBuilder<T> {
		jobDef.defaultOptions = defaultOptions;
		return builder;
	}

	function triggerEvents(triggerEvents: Array<string>): JobDefinitionBuilder<T> {
		jobDef.triggerEvents = triggerEvents;
		return builder;
	}

	function triggerEventParamsConverter(converter: JobEventParamsConverter<T>): JobDefinitionBuilder<T> {
		jobDef.triggerEventParamsConverter = converter;
		return builder;
	}

	function shouldTriggerEvent(shouldTriggerEvent: JobEventTriggerPredicate<T>): JobDefinitionBuilder<T> {
		jobDef.shouldTriggerEvent = shouldTriggerEvent;
		return builder;
	}

	function loopPrevention(loopPrevention: LoopPreventionConfig): JobDefinitionBuilder<T> {
		jobDef.loopPrevention = loopPrevention;
		return builder;
	}

	function showInDashboard(): JobDefinitionBuilder<T> {
		jobDef.showInDashboard = true;
		return builder;
	}

	function excludeFromStats(): JobDefinitionBuilder<T> {
		jobDef.excludeFromStats = true;
		return builder;
	}

	function keepCardAfterCompletion(): JobDefinitionBuilder<T> {
		jobDef.keepCardAfterCompletion = true;
		return builder;
	}

	function statsSchema(schema: z.ZodSchema<S>): JobDefinitionBuilder<T> {
		jobDef.statsSchema = schema;
		return builder;
	}

	function build(): JobDefinition<T> {
		const { category, name } = jobDef;
		return {
			...jobDef,
			name: category !== undefined && !name.startsWith(category) ? `${category}:${name}` : name,
		};
	}

	return builder;
}
