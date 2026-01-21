import { getConfig } from "../config/Config";
import { getLog } from "./Logger";
import jwt from "jsonwebtoken";

const log = getLog(import.meta);

/**
 * Options for publishing an event to Mercure Hub
 */
export interface MercurePublishOptions {
	/** Topic URI to publish to (e.g., /tenants/acme/drafts/123) */
	topic: string;
	/** Data payload to publish */
	data: unknown;
	/** Whether this is a private topic requiring subscriber authorization */
	private?: boolean;
	/** Event ID for message history/deduplication */
	id?: string;
	/** Event type for filtering */
	type?: string;
	/** Retry interval hint in milliseconds */
	retry?: number;
}

/**
 * Result of a Mercure publish operation
 */
export interface MercurePublishResult {
	success: boolean;
	eventId?: string;
}

/**
 * Client for publishing events to a Mercure Hub
 */
export interface MercureClient {
	/** Check if Mercure is properly configured and enabled */
	isEnabled(): boolean;
	/** Publish an event to the Mercure Hub */
	publish(options: MercurePublishOptions): Promise<MercurePublishResult>;
}

/**
 * Creates a Mercure client for publishing events to the hub.
 *
 * The client handles JWT signing for authorization and gracefully
 * handles disabled/unconfigured states.
 */
export function createMercureClient(): MercureClient {
	return {
		isEnabled,
		publish,
	};

	/**
	 * Checks if Mercure is enabled and properly configured
	 */
	function isEnabled(): boolean {
		const config = getConfig();
		return (
			config.MERCURE_ENABLED === true && !!config.MERCURE_HUB_BASE_URL && !!config.MERCURE_PUBLISHER_JWT_SECRET
		);
	}

	/**
	 * Creates a publisher JWT with mercure.publish claim
	 */
	function createPublisherJWT(topics: Array<string>): string {
		const config = getConfig();
		/* v8 ignore start - isEnabled() checks this first, so this is defensive only */
		if (!config.MERCURE_PUBLISHER_JWT_SECRET) {
			throw new Error("MERCURE_PUBLISHER_JWT_SECRET not configured");
		}
		/* v8 ignore stop */

		return jwt.sign(
			{
				mercure: {
					publish: topics,
				},
			},
			config.MERCURE_PUBLISHER_JWT_SECRET,
			{
				expiresIn: "1h",
				algorithm: "HS256",
			},
		);
	}

	/**
	 * Publishes an event to the Mercure Hub
	 */
	async function publish(options: MercurePublishOptions): Promise<MercurePublishResult> {
		if (!isEnabled()) {
			log.debug("Mercure disabled, skipping publish to topic: %s", options.topic);
			return { success: false };
		}

		const config = getConfig();
		const hubBaseUrl = config.MERCURE_HUB_BASE_URL;

		/* v8 ignore start - isEnabled() checks this first, so this is defensive only */
		if (!hubBaseUrl) {
			log.debug("Mercure hub URL not configured, skipping publish to topic: %s", options.topic);
			return { success: false };
		}
		/* v8 ignore stop */

		// Mercure hub endpoint is always at /.well-known/mercure
		const hubUrl = `${hubBaseUrl.replace(/\/$/, "")}/.well-known/mercure`;

		// Build form data for Mercure API
		const body = new URLSearchParams();
		body.append("topic", options.topic);
		body.append("data", JSON.stringify(options.data));

		if (options.private) {
			body.append("private", "on");
		}
		if (options.id) {
			body.append("id", options.id);
		}
		if (options.type) {
			body.append("type", options.type);
		}
		if (options.retry !== undefined) {
			body.append("retry", options.retry.toString());
		}

		try {
			const publisherJwt = createPublisherJWT([options.topic]);

			const response = await fetch(hubUrl, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${publisherJwt}`,
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: body.toString(),
			});

			if (!response.ok) {
				const errorText = await response.text();
				log.error("Mercure publish failed: %d %s", response.status, errorText);
				return { success: false };
			}

			// Mercure returns the event ID in the response body
			const eventId = await response.text();
			log.debug("Published to Mercure topic: %s (id: %s)", options.topic, eventId);

			return eventId ? { success: true, eventId } : { success: true };
		} catch (error) {
			log.error(error, "Failed to publish to Mercure hub");
			return { success: false };
		}
	}
}
