import type { IntegrationsManager } from "../integrations/IntegrationsManager";
import type { Integration, NewIntegration } from "../model/Integration";
import type { JobDefinition } from "./JobTypes";
import type { MutableFields } from "jolli-common";

export interface MutateIntegrationError {
	statusCode: number;
	error: string;
}

/**
 * Returns information about an error that occured while trying to create an Integration item.
 */
export interface CreateIntegrationError extends MutateIntegrationError {}

/**
 * The response from the create intetegration item operation. This should return either a result or error.
 */
export interface CreateIntegrationResponse {
	result?: Integration;
	error?: CreateIntegrationError;
}

/**
 * Returns information about an error that occured while trying to update an Integration item.
 */
export interface UpdateIntegrationError extends MutateIntegrationError {}

/**
 * The response from the update intetegration item operation. This should return either a result or error.
 */
export interface UpdateIntegrationResponse {
	result?: Integration;
	error?: UpdateIntegrationError;
}

/**
 * Returns information about an error that occured while trying to delete an Integration item.
 */
export interface DeleteIntegrationError extends MutateIntegrationError {}

/**
 * The response from the delete intetegration item operation. This should return either a result or error.
 */
export interface DeleteIntegrationResponse {
	result?: Integration;
	error?: DeleteIntegrationError;
}

/**
 * Returns information about an error that occured while trying to check a caller's access to a given Integration.
 */
export interface IntegrationAccessCheckError {
	code: number;
	reason: string;
	context?: Record<string, unknown> | undefined;
}

/**
 * Returns the result of an access check
 */
export interface IntegrationCheckAccessResult {
	hasAccess: boolean;
	status: string;
}

/**
 * The response from an integration acces check. This should return either a result or error.
 */
export interface IntegrationCheckResponse {
	/**
	 * The result of the access check.
	 * Should not be undefined if the error field is undefined.
	 */
	result?: IntegrationCheckAccessResult | undefined;
	/**
	 * Returns the reason the access check could not be made.
	 */
	error?: IntegrationAccessCheckError | undefined;
}

/**
 * Provides a context for integration type behavior functions.
 */
export interface IntegrationContext {
	manager: IntegrationsManager;
}

/**
 * Provides Integration Type Specific fields and functions.
 */
export interface IntegrationTypeBehavior {
	/**
	 * If implemented, returns a function that does type-specific-checks against a new instegration to determine
	 * if it should be created. It may also mutate the new integration (to set a status or add metadata).
	 */
	preCreate?:
		| ((
				newIntegration: MutableFields<NewIntegration, "status" | "metadata">,
				context: IntegrationContext,
		  ) => Promise<boolean>)
		| undefined;

	/**
	 * if implemented, returns a function that runs integration-type-specific update logic
	 * before a specific integration is updated and returns whether to acutally update the integration or not.
	 * If a function is returned, it will NOT be executed inside a database transaction and before an update is made.
	 * @param integration the integration the update operation is being requested for.
	 * @param context the integration context.
	 * @returns whether to update the integration.
	 */
	preUpdateNonTransactional?:
		| ((integration: Integration, context: IntegrationContext) => Promise<boolean>)
		| undefined;

	/**
	 * Handles integration-type-specific update logic that runs before a specific integration is updated
	 * and returns whether to acutally update the integration or not.
	 * If this is implemented, it will excute inside a database transaction, so use cautiously.
	 * @param integration the integration the update operation is being requested for.
	 * @param context the integration context.
	 * @returns whether to update the integration.
	 */
	preUpdateTransactional?: ((integration: Integration, context: IntegrationContext) => Promise<boolean>) | undefined;

	/**
	 * Handles any integration-type-specifid post-update operations
	 * that should occur after an integration has been update.
	 * @param integration the integration that was updated.
	 * @param context the integration context.
	 */
	postUpdate?: ((integration: Integration, context: IntegrationContext) => Promise<void>) | undefined;

	/**
	 * Handles integration-type-specific delete logic that runs before a specific integration is deleted
	 * and returns whether to acutally delete the integration or not.
	 * @param integration the integration the delete operation is being requested for.
	 * @param context the integration context.
	 * @returns whether to delete the integration.
	 */
	preDelete?: ((integration: Integration, context: IntegrationContext) => Promise<boolean>) | undefined;

	/**
	 * Handles any integration-type-specifid post-delete operations
	 * that should occur after an integration has been deleted.
	 * @param integration the integration that was deleted.
	 * @param context the integration context.
	 */
	postDelete?: ((integration: Integration, context: IntegrationContext) => Promise<void>) | undefined;

	/**
	 * Handles type-specific access checks for an integration.
	 * @param integration the integration the access it being checked for.
	 * @param context the integration context.
	 * @returns either an access check failed reason, or undefined if the access check succeeded.
	 */
	handleAccessCheck(integration: Integration, context: IntegrationContext): Promise<IntegrationCheckResponse>;

	/**
	 * Returns integration-specific job definitions.
	 * If implemented, these jobs will be registered with the job scheduler.
	 * @returns array of job definitions for this integration type.
	 */
	getJobDefinitions?: (() => Array<JobDefinition>) | undefined;
}
