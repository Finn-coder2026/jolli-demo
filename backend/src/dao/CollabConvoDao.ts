import {
	type ArtifactType,
	type CollabConvo,
	type CollabMessage,
	defineCollabConvos,
	type NewCollabConvo,
} from "../model/CollabConvo";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { DaoProvider } from "./DaoProvider";
import { Op, type Sequelize } from "sequelize";

function stripNullChars(value: string): string {
	return value.includes("\0") ? value.replaceAll("\0", "") : value;
}

function sanitizeJsonValue<T>(value: T): T {
	if (typeof value === "string") {
		return stripNullChars(value) as T;
	}
	if (Array.isArray(value)) {
		return value.map(item => sanitizeJsonValue(item)) as T;
	}
	if (value !== null && typeof value === "object") {
		if (value instanceof Date) {
			return value;
		}
		const sanitizedEntries = Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
			stripNullChars(key),
			sanitizeJsonValue(nestedValue),
		]);
		return Object.fromEntries(sanitizedEntries) as T;
	}
	return value;
}

/**
 * CollabConvos DAO
 */
export interface CollabConvoDao {
	/**
	 * Creates a new CollabConvo.
	 * @param convo the convo to create.
	 */
	createCollabConvo(convo: NewCollabConvo): Promise<CollabConvo>;

	/**
	 * Gets a convo by ID.
	 * @param id the convo ID.
	 */
	getCollabConvo(id: number): Promise<CollabConvo | undefined>;

	/**
	 * Finds a convo by artifact type and ID.
	 * @param artifactType the type of artifact.
	 * @param artifactId the artifact ID.
	 */
	findByArtifact(artifactType: ArtifactType, artifactId: number): Promise<CollabConvo | undefined>;

	/**
	 * Lists convos by artifact type with pagination.
	 * @param artifactType the type of artifact.
	 * @param limit maximum number of results.
	 * @param offset number to skip.
	 */
	listByArtifactType(artifactType: ArtifactType, limit?: number, offset?: number): Promise<Array<CollabConvo>>;

	/**
	 * Appends a message to an existing convo.
	 * @param id the convo ID.
	 * @param message the message to append.
	 */
	addMessage(id: number, message: CollabMessage): Promise<CollabConvo | undefined>;

	/**
	 * Appends multiple messages to an existing convo in a single write.
	 * @param id the convo ID.
	 * @param messages the messages to append, in order.
	 */
	addMessages(id: number, messages: Array<CollabMessage>): Promise<CollabConvo | undefined>;

	/**
	 * Gets messages from a convo with pagination.
	 * @param id the convo ID.
	 * @param limit maximum number of messages to return.
	 * @param offset number of messages to skip.
	 */
	getMessages(id: number, limit?: number, offset?: number): Promise<Array<CollabMessage>>;

	/**
	 * Updates the last activity timestamp.
	 * @param id the convo ID.
	 */
	updateLastActivity(id: number): Promise<CollabConvo | undefined>;

	/**
	 * Deletes a convo.
	 * @param id the convo ID.
	 */
	deleteCollabConvo(id: number): Promise<boolean>;

	/**
	 * Deletes all convos (for testing).
	 */
	deleteAllCollabConvos(): Promise<void>;

	/**
	 * Updates metadata for a convo.
	 * @param id the convo ID.
	 * @param metadata the metadata to merge into existing metadata.
	 */
	updateMetadata(id: number, metadata: Record<string, unknown>): Promise<CollabConvo | undefined>;

	/**
	 * Updates the title of a convo.
	 * @param id the convo ID.
	 * @param title the new title.
	 */
	updateTitle(id: number, title: string): Promise<CollabConvo | undefined>;

	/**
	 * Truncates a convo's messages to keep only the first `keepCount` messages.
	 * @param id the convo ID.
	 * @param keepCount the number of messages to keep from the start.
	 */
	truncateMessages(id: number, keepCount: number): Promise<CollabConvo | undefined>;

	/**
	 * Finds a seeded conversation by artifact type, convo kind, and user ID.
	 * Used to implement idempotent get-or-create for seeded conversations.
	 * @param artifactType the artifact type to search within.
	 * @param convoKind the conversation kind (from metadata.convoKind).
	 * @param userId the user ID (from metadata.createdForUserId).
	 */
	findSeededConvo(artifactType: ArtifactType, convoKind: string, userId: number): Promise<CollabConvo | undefined>;
}

export function createCollabConvoDao(sequelize: Sequelize): CollabConvoDao {
	const CollabConvos = defineCollabConvos(sequelize);

	return {
		createCollabConvo,
		getCollabConvo,
		findByArtifact,
		listByArtifactType,
		addMessage,
		addMessages,
		getMessages,
		updateLastActivity,
		deleteCollabConvo,
		deleteAllCollabConvos,
		updateMetadata,
		updateTitle,
		truncateMessages,
		findSeededConvo,
	};

	async function createCollabConvo(convo: NewCollabConvo): Promise<CollabConvo> {
		const sanitizedConvo: NewCollabConvo = {
			...convo,
			artifactType: stripNullChars(convo.artifactType) as ArtifactType,
			...(convo.title !== undefined && {
				title: convo.title === null ? null : stripNullChars(convo.title),
			}),
			messages: sanitizeJsonValue(convo.messages),
			...(convo.metadata !== undefined && { metadata: sanitizeJsonValue(convo.metadata) }),
		};

		return await CollabConvos.create(sanitizedConvo as never);
	}

	async function getCollabConvo(id: number): Promise<CollabConvo | undefined> {
		const convo = await CollabConvos.findOne({ where: { id } });
		return convo ? convo.get({ plain: true }) : undefined;
	}

	async function findByArtifact(artifactType: ArtifactType, artifactId: number): Promise<CollabConvo | undefined> {
		const convo = await CollabConvos.findOne({
			where: { artifactType, artifactId },
		});
		return convo ? convo.get({ plain: true }) : undefined;
	}

	async function listByArtifactType(
		artifactType: ArtifactType,
		limit?: number,
		offset?: number,
	): Promise<Array<CollabConvo>> {
		const convos = await CollabConvos.findAll({
			where: { artifactType },
			order: [["updatedAt", "DESC"]],
			limit: limit ?? 50,
			offset: offset ?? 0,
		});
		return convos.map(c => c.get({ plain: true }));
	}

	async function addMessages(id: number, messages: Array<CollabMessage>): Promise<CollabConvo | undefined> {
		if (messages.length === 0) {
			return getCollabConvo(id);
		}

		const convo = await getCollabConvo(id);
		if (!convo) {
			return;
		}

		const sanitizedMessages = sanitizeJsonValue(messages);
		const updatedMessages = [...convo.messages, ...sanitizedMessages];
		await CollabConvos.update({ messages: updatedMessages }, { where: { id } });
		return getCollabConvo(id);
	}

	function addMessage(id: number, message: CollabMessage): Promise<CollabConvo | undefined> {
		return addMessages(id, [message]);
	}

	async function getMessages(id: number, limit?: number, offset?: number): Promise<Array<CollabMessage>> {
		const convo = await getCollabConvo(id);
		if (!convo) {
			return [];
		}

		let messages = convo.messages;

		if (offset !== undefined) {
			messages = messages.slice(offset);
		}

		if (limit !== undefined) {
			messages = messages.slice(0, limit);
		}

		return messages;
	}

	async function updateLastActivity(id: number): Promise<CollabConvo | undefined> {
		const convo = await getCollabConvo(id);
		if (!convo) {
			return;
		}

		// Touch the record to update updatedAt timestamp
		await CollabConvos.update({ updatedAt: new Date() }, { where: { id } });
		return getCollabConvo(id);
	}

	async function deleteCollabConvo(id: number): Promise<boolean> {
		const deleted = await CollabConvos.destroy({ where: { id } });
		return deleted > 0;
	}

	async function deleteAllCollabConvos(): Promise<void> {
		await CollabConvos.destroy({ where: {} });
	}

	async function updateMetadata(id: number, metadata: Record<string, unknown>): Promise<CollabConvo | undefined> {
		const convo = await getCollabConvo(id);
		if (!convo) {
			return;
		}

		const mergedMetadata = { ...convo.metadata, ...sanitizeJsonValue(metadata) };
		await CollabConvos.update({ metadata: mergedMetadata }, { where: { id } });
		return getCollabConvo(id);
	}

	async function updateTitle(id: number, title: string): Promise<CollabConvo | undefined> {
		const convo = await getCollabConvo(id);
		if (!convo) {
			return;
		}

		await CollabConvos.update({ title: stripNullChars(title) }, { where: { id } });
		return getCollabConvo(id);
	}

	async function truncateMessages(id: number, keepCount: number): Promise<CollabConvo | undefined> {
		const convo = await getCollabConvo(id);
		if (!convo) {
			return;
		}

		const truncated = convo.messages.slice(0, keepCount);
		await CollabConvos.update({ messages: truncated }, { where: { id } });
		return getCollabConvo(id);
	}

	async function findSeededConvo(
		artifactType: ArtifactType,
		convoKind: string,
		userId: number,
	): Promise<CollabConvo | undefined> {
		const convo = await CollabConvos.findOne({
			where: {
				artifactType,
				[Op.and]: [
					sequelize.where(
						sequelize.fn("jsonb_extract_path_text", sequelize.col("metadata"), "convoKind"),
						convoKind,
					),
					sequelize.where(
						sequelize.fn("jsonb_extract_path_text", sequelize.col("metadata"), "createdForUserId"),
						String(userId),
					),
				],
			},
		});
		return convo ? convo.get({ plain: true }) : undefined;
	}
}

export function createCollabConvoDaoProvider(defaultDao: CollabConvoDao): DaoProvider<CollabConvoDao> {
	return {
		getDao(context: TenantOrgContext | undefined): CollabConvoDao {
			return context?.database.collabConvoDao ?? defaultDao;
		},
	};
}
