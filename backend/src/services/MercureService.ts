import { getConfig } from "../config/Config";
import { getTenantContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import { createMercureClient, type MercureClient, type MercurePublishResult } from "../util/MercureClient";
import jwt from "jsonwebtoken";

const log = getLog(import.meta);

/**
 * High-level service for Mercure Hub operations.
 *
 * Provides:
 * - Topic URI builders with tenant awareness
 * - Subscriber JWT token generation
 * - Convenience methods for publishing events
 */
export interface MercureService {
	/**
	 * Check if Mercure is enabled
	 */
	isEnabled(): boolean;

	/**
	 * Get the jobs event topic for the current tenant
	 */
	getJobEventsTopic(): string;

	/**
	 * Get the draft collaboration topic for a specific draft
	 */
	getDraftTopic(draftId: number): string;

	/**
	 * Get the conversation topic for a specific conversation
	 */
	getConvoTopic(convoId: number): string;

	/**
	 * Get the onboarding topic for a specific user
	 */
	getOnboardingTopic(userId: number): string;

	/**
	 * Create a subscriber JWT for the specified topics.
	 * This token is given to frontend clients to authorize subscriptions.
	 *
	 * @param topics Array of topic URIs to authorize
	 * @returns JWT string for subscriber authorization
	 */
	createSubscriberToken(topics: Array<string>): string;

	/**
	 * Publish a job event to the Mercure Hub
	 */
	publishJobEvent(eventType: string, data: unknown): Promise<MercurePublishResult>;

	/**
	 * Publish a draft collaboration event to the Mercure Hub
	 */
	publishDraftEvent(draftId: number, eventType: string, data: unknown): Promise<MercurePublishResult>;

	/**
	 * Publish a conversation event to the Mercure Hub
	 */
	publishConvoEvent(convoId: number, eventType: string, data: unknown): Promise<MercurePublishResult>;

	/**
	 * Publish an onboarding event to the Mercure Hub
	 */
	publishOnboardingEvent(userId: number, eventType: string, data: unknown): Promise<MercurePublishResult>;
}

/**
 * Creates a Mercure service for high-level Mercure operations.
 *
 * @param client Optional MercureClient for dependency injection (useful for testing)
 */
export function createMercureService(client?: MercureClient): MercureService {
	const mercureClient = client ?? createMercureClient();

	return {
		isEnabled,
		getJobEventsTopic,
		getDraftTopic,
		getConvoTopic,
		getOnboardingTopic,
		createSubscriberToken,
		publishJobEvent,
		publishDraftEvent,
		publishConvoEvent,
		publishOnboardingEvent,
	};

	function isEnabled(): boolean {
		return mercureClient.isEnabled();
	}

	/**
	 * Gets the tenant prefix for topic URIs.
	 * Uses tenant context if available, otherwise defaults to "default".
	 */
	function getTenantPrefix(): string {
		const tenantContext = getTenantContext();
		const tenantSlug = tenantContext?.tenant?.slug ?? "default";
		return `/tenants/${tenantSlug}`;
	}

	/**
	 * Gets the tenant-org prefix for topic URIs.
	 * Used for job events which are isolated by org in multi-tenant mode.
	 */
	function getTenantOrgPrefix(): string {
		const tenantContext = getTenantContext();
		const tenantSlug = tenantContext?.tenant?.slug ?? "default";
		const orgSlug = tenantContext?.org?.slug ?? "default";
		return `/tenants/${tenantSlug}/orgs/${orgSlug}`;
	}

	function getJobEventsTopic(): string {
		return `${getTenantOrgPrefix()}/jobs/events`;
	}

	function getDraftTopic(draftId: number): string {
		return `${getTenantPrefix()}/drafts/${draftId}`;
	}

	function getConvoTopic(convoId: number): string {
		return `${getTenantPrefix()}/convos/${convoId}`;
	}

	function getOnboardingTopic(userId: number): string {
		return `${getTenantOrgPrefix()}/onboarding/${userId}`;
	}

	function createSubscriberToken(topics: Array<string>): string {
		const config = getConfig();
		if (!config.MERCURE_SUBSCRIBER_JWT_SECRET) {
			throw new Error("MERCURE_SUBSCRIBER_JWT_SECRET not configured");
		}

		return jwt.sign(
			{
				mercure: {
					subscribe: topics,
				},
			},
			config.MERCURE_SUBSCRIBER_JWT_SECRET,
			{
				expiresIn: "24h",
				algorithm: "HS256",
			},
		);
	}

	async function publishJobEvent(eventType: string, data: unknown): Promise<MercurePublishResult> {
		const topic = getJobEventsTopic();
		const eventData = {
			type: eventType,
			...(typeof data === "object" && data !== null ? data : { data }),
			timestamp: new Date().toISOString(),
		};

		log.debug("Publishing job event to Mercure: %s", eventType);
		// Note: We don't pass 'type' to Mercure - the event type is already in eventData.type
		// Passing 'type' would create a named SSE event that requires specific event listeners
		return await mercureClient.publish({
			topic,
			data: eventData,
		});
	}

	async function publishDraftEvent(draftId: number, eventType: string, data: unknown): Promise<MercurePublishResult> {
		const topic = getDraftTopic(draftId);
		const eventData = {
			type: eventType,
			draftId,
			...(typeof data === "object" && data !== null ? data : { data }),
			timestamp: new Date().toISOString(),
		};

		log.debug("Publishing draft event to Mercure: %s (draft %d)", eventType, draftId);
		// Note: We don't pass 'type' to Mercure - the event type is already in eventData.type
		// Passing 'type' would create a named SSE event that requires specific event listeners
		return await mercureClient.publish({
			topic,
			data: eventData,
			private: true, // Draft events require authentication
		});
	}

	async function publishConvoEvent(convoId: number, eventType: string, data: unknown): Promise<MercurePublishResult> {
		const topic = getConvoTopic(convoId);
		const eventData = {
			type: eventType,
			convoId,
			...(typeof data === "object" && data !== null ? data : { data }),
			timestamp: new Date().toISOString(),
		};

		log.debug("Publishing convo event to Mercure: %s (convo %d)", eventType, convoId);
		// Note: We don't pass 'type' to Mercure - the event type is already in eventData.type
		// Passing 'type' would create a named SSE event that requires specific event listeners
		return await mercureClient.publish({
			topic,
			data: eventData,
			private: true, // Conversation events require authentication
		});
	}

	async function publishOnboardingEvent(
		userId: number,
		eventType: string,
		data: unknown,
	): Promise<MercurePublishResult> {
		const topic = getOnboardingTopic(userId);
		const eventData = {
			type: eventType,
			userId,
			...(typeof data === "object" && data !== null ? data : { data }),
			timestamp: new Date().toISOString(),
		};

		log.debug("Publishing onboarding event to Mercure: %s (user %d)", eventType, userId);
		return await mercureClient.publish({
			topic,
			data: eventData,
			private: true, // Onboarding events are user-specific
		});
	}
}
