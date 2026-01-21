import type { ReactNode } from "react";
import type { useIntlayer } from "react-intlayer";

/**
 * Utility functions for localizing job-related text.
 * Handles message key resolution and variable interpolation.
 */

/**
 * Job log entry type (matches backend JobLog interface)
 */
export interface JobLog {
	timestamp: Date;
	level: string;
	message?: string;
	messageKey?: string;
	context?: Record<string, unknown>;
}

/**
 * Type alias for the jobs content returned by useIntlayer("jobs")
 * This is properly typed by intlayer's type generation system
 */
type JobsContent = ReturnType<typeof useIntlayer<"jobs">>;

/**
 * Type for job content parameters in functions
 * Accepts both the full typed content and partial test mocks
 */
export type JobsContentParam = JobsContent | Record<string, unknown>;

/**
 * Helper type for message containers (logs/completion sections)
 */
type MessageContainer = Record<string, unknown> | undefined;

/**
 * Helper to extract string value from intlayer content
 * Handles both IntlayerNode objects, VNodes (Preact elements), and plain strings
 */
function getStringValue(value: unknown): string {
	// Handle intlayer mock objects with .value property (used in tests)
	if (value && typeof value === "object" && "value" in value) {
		return String(value.value);
	}

	// Handle VNode objects (Preact/React elements) - intlayer wraps strings in these
	if (value && typeof value === "object" && "props" in value) {
		const props = (value as { props?: { children?: unknown } }).props;
		if (props && "children" in props) {
			// Recursively extract in case children is also wrapped
			return getStringValue(props.children);
		}
	}

	return String(value);
}

/**
 * Resolve a localized value, handling both intlayer insert() functions and plain strings.
 *
 * @param value - The localized value (can be a function from insert() or a plain string)
 * @param context - Object containing variable values for interpolation
 * @returns The resolved string
 *
 * @example
 * // With insert() function:
 * resolveLocalizedValue(content.retry, { count: 5 }) // Returns: "5 retry"
 *
 * // With plain string (legacy):
 * resolveLocalizedValue("Processing items", {}) // Returns: "Processing items"
 */
function resolveLocalizedValue(value: unknown, context?: Record<string, unknown>): string {
	// If the value is a function (from intlayer's insert()), call it with the context
	if (typeof value === "function") {
		/* c8 ignore next - covered by tests but coverage tool doesn't detect function calls properly */
		return getStringValue(value(context || {}));
	}

	// Otherwise, treat it as a plain string (legacy support)
	return getStringValue(value);
}

/**
 * Get a localized job title from a job name.
 * Falls back to the job name if not found.
 *
 * Returns the intlayer value directly (can be a VNode/ReactNode) for rendering in JSX.
 *
 * @param jobsContent - The jobs content from useIntlayer
 * @param jobName - The job name (e.g., "core:cleanup-old-jobs")
 * @returns The localized job title (as ReactNode for JSX rendering)
 */
export function useJobTitle(jobsContent: JobsContentParam, jobName: string): ReactNode {
	const jobContent = jobsContent[jobName as keyof typeof jobsContent];

	if (jobContent && typeof jobContent === "object" && "title" in jobContent) {
		return jobContent.title as ReactNode;
	}

	return jobName;
}

/**
 * Try to get a message from a message container and resolve it with context
 */
function tryGetMessage(
	messages: MessageContainer,
	messageKey: string,
	context?: Record<string, unknown>,
): string | null {
	if (messages && messageKey in messages) {
		return resolveLocalizedValue(messages[messageKey], context);
	}
	return null;
}

/**
 * Helper to safely access nested integration message containers
 */
function getIntegrationContainers(integration: unknown): Array<MessageContainer> {
	if (!integration || typeof integration !== "object") {
		return [];
	}

	const containers: Array<MessageContainer> = [];

	if ("sync" in integration && integration.sync && typeof integration.sync === "object") {
		if ("logs" in integration.sync) {
			containers.push(integration.sync.logs as MessageContainer);
		}
		if ("completion" in integration.sync) {
			containers.push(integration.sync.completion as MessageContainer);
		}
	}

	if ("process" in integration && integration.process && typeof integration.process === "object") {
		if ("logs" in integration.process) {
			containers.push(integration.process.logs as MessageContainer);
		}
		if ("completion" in integration.process) {
			containers.push(integration.process.completion as MessageContainer);
		}
	}

	return containers;
}

/**
 * Try to get a message from integration content
 */
function tryGetIntegrationMessage(
	jobsContent: JobsContentParam,
	integrationName: string,
	messageKey: string,
	context?: Record<string, unknown>,
): string | null {
	const extendedContext = { integrationName, ...context };
	const containers = getIntegrationContainers(jobsContent.integration);

	for (const container of containers) {
		const message = tryGetMessage(container, messageKey, extendedContext);
		if (message) {
			return message;
		}
	}

	return null;
}

/**
 * Try to get a message from a job-specific content
 */
function tryGetJobSpecificMessage(
	jobContent: unknown,
	messageKey: string,
	context?: Record<string, unknown>,
): string | null {
	if (!jobContent || typeof jobContent !== "object") {
		return null;
	}

	// Try logs first
	if ("logs" in jobContent) {
		const message = tryGetMessage(jobContent.logs as MessageContainer, messageKey, context);
		if (message) {
			return message;
		}
	}

	// Try completion
	if ("completion" in jobContent) {
		const message = tryGetMessage(jobContent.completion as MessageContainer, messageKey, context);
		if (message) {
			return message;
		}
	}

	return null;
}

/**
 * Resolve a localized message from a message key and context.
 * Used for job logs and completion messages.
 *
 * @param jobsContent - The jobs content from useIntlayer
 * @param jobName - The job name (e.g., "core:cleanup-old-jobs")
 * @param messageKey - The message key (e.g., "processing-records")
 * @param context - Optional context for variable interpolation
 * @returns The localized and interpolated message, or the key if not found
 */
export function getJobMessage(
	jobsContent: JobsContentParam,
	jobName: string,
	messageKey: string,
	context?: Record<string, unknown>,
): string {
	// Handle dynamic integration jobs
	if (jobName.startsWith("integration:")) {
		const integrationName = jobName.split(":")[1];
		const message = tryGetIntegrationMessage(jobsContent, integrationName, messageKey, context);
		if (message) {
			return message;
		}
	}

	// Try job-specific messages
	const jobContent = jobsContent[jobName as keyof typeof jobsContent];
	const jobMessage = tryGetJobSpecificMessage(jobContent, messageKey, context);
	if (jobMessage) {
		return jobMessage;
	}

	// Try common error messages
	const errorMessage = tryGetMessage(jobsContent.errors as MessageContainer, messageKey, context);
	if (errorMessage) {
		return errorMessage;
	}

	// Try scheduler messages (cross-cutting messages for job infrastructure)
	const scheduler = (jobsContent as Record<string, unknown>).scheduler as Record<string, unknown> | undefined;
	const schedulerMessage = tryGetMessage(scheduler?.logs as MessageContainer, messageKey, context);
	if (schedulerMessage) {
		return schedulerMessage;
	}

	// Try workflow messages (cross-cutting messages for workflow orchestration)
	const workflows = (jobsContent as Record<string, unknown>).workflows as Record<string, unknown> | undefined;
	const workflowMessage = tryGetMessage(workflows?.logs as MessageContainer, messageKey, context);
	if (workflowMessage) {
		return workflowMessage;
	}

	return messageKey;
}

/**
 * Get a localized log message from a JobLog entry.
 * Handles both legacy (plain message) and new (messageKey + context) formats.
 *
 * @param jobsContent - The jobs content from useIntlayer
 * @param jobName - The job name
 * @param log - The job log entry
 * @returns The localized log message
 */
export function getLogMessage(jobsContent: JobsContentParam, jobName: string, log: JobLog): string {
	// Legacy format: use plain message
	if (log.message) {
		return getStringValue(log.message);
	}

	// New format: resolve message key with context
	if (log.messageKey) {
		return getJobMessage(jobsContent, jobName, String(log.messageKey), log.context);
	}

	// Fallback
	return "";
}

/**
 * Get a localized completion message.
 * Handles both legacy (plain message) and new (messageKey + context) formats.
 *
 * @param jobsContent - The jobs content from useIntlayer
 * @param jobName - The job name
 * @param completionInfo - The completion info object
 * @returns The localized completion message
 */
export function getCompletionMessage(
	jobsContent: JobsContentParam,
	jobName: string,
	completionInfo: { message?: string; messageKey?: string; context?: Record<string, unknown> },
): string {
	// Legacy format: use plain message
	if (completionInfo.message) {
		return String(completionInfo.message);
	}

	// New format: resolve message key with context
	if (completionInfo.messageKey) {
		return getJobMessage(jobsContent, jobName, String(completionInfo.messageKey), completionInfo.context);
	}

	// Fallback
	return "";
}
