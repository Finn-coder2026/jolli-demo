import type { Database } from "../core/Database";
import { jobDefinitionBuilder } from "../jobs/JobDefinitions";
import type { JobEventEmitter } from "../jobs/JobEventEmitter";
import { type Integration, IntegrationSchema, type NewIntegration } from "../model/Integration";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import type {
	CreateIntegrationResponse,
	DeleteIntegrationResponse,
	IntegrationCheckResponse,
	IntegrationContext,
	IntegrationTypeBehavior,
	UpdateIntegrationResponse,
} from "../types/IntegrationTypes";
import type { JobContext, JobDefinition } from "../types/JobTypes";
import { getLog } from "../util/Logger";
import { createIntegrationTypeBehavior } from "./GithubIntegrationTypeBehavior";
import { createStaticFileIntegrationTypeBehavior } from "./StaticFileIntegrationTypeBehavior";
import {
	type GithubRepoIntegrationMetadata,
	type IntegrationEventAction,
	IntegrationEventActions,
	type IntegrationType,
	type MutableFields,
} from "jolli-common";

const log = getLog(import.meta);

export interface IntegrationsManager {
	/**
	 * Returns an array of all configured integrations types.
	 */
	getIntegrationTypes(): Array<IntegrationType>;
	/**
	 * Gets the integration type behavior for the given integration type.
	 * @param type the integration type.
	 */
	getIntegrationTypeBehavior(type: IntegrationType): IntegrationTypeBehavior;
	/**
	 * Creates a new Integration.
	 * @param integration the integration to create.
	 */
	createIntegration(integration: NewIntegration): Promise<CreateIntegrationResponse>;
	/**
	 * Looks up an Integration for the given id.
	 * @param id the id to look up the integration by.
	 */
	getIntegration(id: number): Promise<Integration | undefined>;
	/**
	 * Lists all Integrations currently in the repository.
	 */
	listIntegrations(): Promise<Array<Integration>>;
	/**
	 * Updates an Integration if one exists.
	 * @param integration the existing integration being updated.
	 * @param update the integration update.
	 * If this is passed it will do the update in a transaction.
	 */
	updateIntegration(integration: Integration, update: Partial<Integration>): Promise<UpdateIntegrationResponse>;
	/**
	 * Deletes an Integration.
	 * @param integration the existing integration being deleted.
	 */
	deleteIntegration(integration: Integration): Promise<DeleteIntegrationResponse>;
	/**
	 * Handles type-specific access checks for an integration.
	 * @param integration the integration the access it being checked for.
	 * @returns either an access check failed reason, or undefined if the access check succeeded.
	 */
	handleAccessCheck(integration: Integration): Promise<IntegrationCheckResponse>;
	/**
	 * Returns all job definitions for integration-related jobs.
	 * These should be registered with the job scheduler.
	 */
	getJobDefinitions(): Array<JobDefinition>;
}

function createUnknownIntegrationTypeBehavior() {
	return {
		handleAccessCheck(): Promise<IntegrationCheckResponse> {
			throw new Error("unknown integration type!");
		},
	};
}

export function createIntegrationManager(
	db: Database,
	eventEmitter: JobEventEmitter,
	registryClient?: TenantRegistryClient,
): IntegrationsManager {
	const { integrationDao: dao } = db;

	function getIntegrationActionEventName(type: IntegrationType, action: IntegrationEventAction) {
		return `integrations:${type}:${action}`;
	}

	function emitIntegrationEvent(integration: Integration, action: IntegrationEventAction) {
		const { id, type, name, status, metadata = {} } = integration;
		const eventName = getIntegrationActionEventName(type, action);
		log.debug("emitting event: %s", eventName);
		eventEmitter.emit(eventName, {
			id,
			type,
			name,
			status,
			metadata,
		});
	}

	const manager: IntegrationsManager = {
		getIntegrationTypes,
		getIntegrationTypeBehavior,
		createIntegration,
		getIntegration,
		listIntegrations,
		updateIntegration,
		deleteIntegration,
		handleAccessCheck,
		getJobDefinitions,
	};

	const integrationTypeBehaviors: Record<IntegrationType, IntegrationTypeBehavior> = {
		unknown: createUnknownIntegrationTypeBehavior(),
		github: createIntegrationTypeBehavior(db, manager, registryClient),
		static_file: createStaticFileIntegrationTypeBehavior(),
	};

	/** Collects all job definitions for integration types. */
	function getJobDefinitions(): Array<JobDefinition> {
		const definitions: Array<JobDefinition> = [];

		for (const [integrationType, behavior] of Object.entries(integrationTypeBehaviors)) {
			// created/updated/deleted integration item jobs
			if (integrationType !== "unknown") {
				for (const integrationEventAction of IntegrationEventActions) {
					const type = integrationType as IntegrationType;
					const actionEventName = getIntegrationActionEventName(type, integrationEventAction);
					const jobDef = jobDefinitionBuilder()
						.category(`integration.${type}`)
						.name(`handle-${integrationEventAction}`)
						.title(`${integrationEventAction} ${integrationEventAction}`)
						.description(
							`Handles integration ${integrationEventAction} event for ${type} integration types`,
						)
						.schema(IntegrationSchema)
						.handler(async (params: unknown, context: JobContext) => {
							const integration = params as Integration;
							log.debug("got %s event with params: %O", actionEventName, integration);
							if (type === "github") {
								const metadata = integration.metadata as GithubRepoIntegrationMetadata | undefined;
								context.log(
									"processing-event",
									{ eventName: actionEventName, repo: metadata?.repo, branch: metadata?.branch },
									"info",
								);
							}
							// Placeholder for future async operations
							await Promise.resolve();
						})
						.triggerEvents([actionEventName])
						.build();
					definitions.push(jobDef);
				}
			}

			if (behavior.getJobDefinitions) {
				// jobs registered by integration type behaviors
				const integrationJobs = behavior.getJobDefinitions();
				definitions.push(...integrationJobs);
			}
		}

		return definitions;
	}

	function getIntegrationBehavior(integrationInfo: { type: IntegrationType }): IntegrationTypeBehavior {
		return integrationTypeBehaviors[integrationInfo.type];
	}

	function getIntegrationTypes(): Array<IntegrationType> {
		return Object.keys(integrationTypeBehaviors) as Array<IntegrationType>;
	}

	function getIntegrationTypeBehavior(type: IntegrationType): IntegrationTypeBehavior {
		return integrationTypeBehaviors[type];
	}

	async function createIntegration(newIntegration: NewIntegration): Promise<CreateIntegrationResponse> {
		try {
			const typeBehavior = getIntegrationBehavior(newIntegration);
			if (typeBehavior.preCreate) {
				const context: IntegrationContext = {
					manager,
				};
				const mutableNewIntegration: MutableFields<NewIntegration, "status" | "metadata"> = {
					...newIntegration,
				};
				if (await typeBehavior.preCreate(mutableNewIntegration, context)) {
					const integration = await dao.createIntegration(mutableNewIntegration as NewIntegration);
					emitIntegrationEvent(integration, "created");
					return {
						result: integration,
					};
				} else {
					return {
						error: {
							statusCode: 403,
							error: "create integration not allowed.",
						},
					};
				}
			} else {
				const integration = await dao.createIntegration(newIntegration);
				emitIntegrationEvent(integration, "created");
				return {
					result: integration,
				};
			}
		} catch {
			return {
				error: {
					statusCode: 400,
					error: "Failed to create integration.",
				},
			};
		}
	}

	async function getIntegration(id: number): Promise<Integration | undefined> {
		return await dao.getIntegration(id);
	}

	async function listIntegrations(): Promise<Array<Integration>> {
		return await dao.listIntegrations();
	}

	async function updateIntegration(
		integration: Integration,
		update: Partial<Integration>,
	): Promise<UpdateIntegrationResponse> {
		const { id } = integration;
		try {
			const typeBehavior = getIntegrationBehavior(integration);
			const context: IntegrationContext = {
				manager,
			};
			const doUpdate =
				!typeBehavior.preUpdateNonTransactional ||
				(await typeBehavior.preUpdateNonTransactional(integration, context));
			if (doUpdate) {
				const preUpdateTransactional =
					typeBehavior.preUpdateTransactional &&
					(async (i: Integration) =>
						!typeBehavior.preUpdateTransactional ||
						(await typeBehavior.preUpdateTransactional(i, context)));
				const updatedIntegration = await dao.updateIntegration(id, { ...update, id }, preUpdateTransactional);
				if (updatedIntegration) {
					if (typeBehavior.postUpdate) {
						await typeBehavior.postUpdate(updatedIntegration, context);
					}
					emitIntegrationEvent(integration, "updated");
					return {
						result: updatedIntegration,
					};
				} else {
					return {
						error: {
							statusCode: 404,
							error: "Integration not found",
						},
					};
				}
			} else {
				return {
					result: integration,
				};
			}
		} catch (error) {
			log.error(error, "error while updating integration with id %d", id);
			return {
				error: {
					statusCode: 400,
					error: "Failed to update integration",
				},
			};
		}
	}

	async function deleteIntegration(integration: Integration): Promise<DeleteIntegrationResponse> {
		const { id, type } = integration;
		try {
			const typeBehavior = getIntegrationBehavior(integration);
			const context: IntegrationContext = {
				manager,
			};
			const shouldDelete = !typeBehavior.preDelete || (await typeBehavior.preDelete(integration, context));
			if (shouldDelete) {
				// Delete the integration from database
				await dao.deleteIntegration(id);
				if (typeBehavior.postDelete) {
					await typeBehavior.postDelete(integration, context);
				}
				emitIntegrationEvent(integration, "deleted");
				return {
					result: integration,
				};
			} else {
				log.debug("did not delete, but no error.");
				return {
					result: integration,
				};
			}
		} catch (error) {
			log.error(error, "failed to delete integration type %s with id %d", type, id);
			return {
				error: {
					statusCode: 400,
					error: "Failed to delete integration",
				},
			};
		}
	}

	async function handleAccessCheck(integration: Integration): Promise<IntegrationCheckResponse> {
		const typeBehavior = getIntegrationBehavior(integration);
		const context: IntegrationContext = {
			manager,
		};
		return await typeBehavior.handleAccessCheck(integration, context);
	}

	return manager;
}
