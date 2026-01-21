/**
 * Worker job handler utilities.
 * Provides utilities for executing jobs with tenant-specific configuration.
 */
import { getConfig } from "../config/Config.js";
import { getTenantContext } from "../tenant/TenantContext.js";
import type { JobContext, JobHandler } from "../types/JobTypes.js";
import { getLog } from "../util/Logger.js";
import type { Org, Tenant } from "jolli-common";

const log = getLog(import.meta);

/**
 * Options for job execution with tenant config.
 */
export interface TenantJobExecutionOptions<T> {
	/** The tenant for this job */
	tenant: Tenant;
	/** The org for this job */
	org: Org;
	/** The job handler function */
	handler: JobHandler<T>;
	/** The job parameters */
	params: T;
	/** The job context */
	context: JobContext;
}

/**
 * Validates that we're running within a tenant context.
 * Logs warnings if the context doesn't match expectations.
 *
 * @param expectedTenant - Expected tenant
 * @param expectedOrg - Expected org
 */
export function validateTenantContext(expectedTenant: Tenant, expectedOrg: Org): void {
	const currentContext = getTenantContext();

	if (!currentContext) {
		log.warn("Job executing without tenant context - config overrides may not be applied");
		return;
	}

	if (currentContext.tenant.id !== expectedTenant.id) {
		log.warn(
			{
				expected: expectedTenant.id,
				actual: currentContext.tenant.id,
			},
			"Tenant context mismatch",
		);
	}

	if (currentContext.org.id !== expectedOrg.id) {
		log.warn(
			{
				expected: expectedOrg.id,
				actual: currentContext.org.id,
			},
			"Org context mismatch",
		);
	}
}

/**
 * Gets the effective configuration for a job.
 * This should be called within a tenant context to get tenant-specific overrides.
 *
 * @returns The effective configuration
 */
export function getJobConfig(): ReturnType<typeof getConfig> {
	// getConfig() already handles tenant context and returns
	// the appropriate config with overrides applied
	return getConfig();
}

/**
 * Logs job execution context for debugging.
 *
 * @param jobName - Name of the job being executed
 * @param tenant - Tenant the job is running for
 * @param org - Org the job is running for
 */
export function logJobExecutionContext(jobName: string, tenant: Tenant, org: Org): void {
	const config = getConfig();

	log.info(
		{
			jobName,
			tenant: tenant.slug,
			org: org.slug,
			tenantId: tenant.id,
			orgId: org.id,
			hasAnthropicKey: !!config.ANTHROPIC_API_KEY,
			hasE2bKey: !!config.E2B_API_KEY,
		},
		"Executing job %s for %s/%s",
		jobName,
		tenant.slug,
		org.slug,
	);
}

/**
 * Creates a wrapped job handler that logs execution context.
 * The actual tenant context is set by the JobScheduler's worker.
 *
 * @param originalHandler - The original job handler
 * @returns A wrapped handler with logging
 */
export function wrapJobHandler<T>(originalHandler: JobHandler<T>): JobHandler<T> {
	return async (params: T, context: JobContext): Promise<void> => {
		const tenantContext = getTenantContext();

		if (tenantContext) {
			logJobExecutionContext(context.jobName, tenantContext.tenant, tenantContext.org);
		}

		await originalHandler(params, context);
	};
}
