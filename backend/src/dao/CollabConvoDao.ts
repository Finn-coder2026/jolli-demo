import {
	type ArtifactType,
	type CollabConvo,
	type CollabMessage,
	defineCollabConvos,
	type NewCollabConvo,
} from "../model/CollabConvo";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { DaoProvider } from "./DaoProvider";
import type { Sequelize } from "sequelize";

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
	 * Appends a message to an existing convo.
	 * @param id the convo ID.
	 * @param message the message to append.
	 */
	addMessage(id: number, message: CollabMessage): Promise<CollabConvo | undefined>;

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
}

export function createCollabConvoDao(sequelize: Sequelize): CollabConvoDao {
	const CollabConvos = defineCollabConvos(sequelize);

	return {
		createCollabConvo,
		getCollabConvo,
		findByArtifact,
		addMessage,
		getMessages,
		updateLastActivity,
		deleteCollabConvo,
		deleteAllCollabConvos,
	};

	async function createCollabConvo(convo: NewCollabConvo): Promise<CollabConvo> {
		return await CollabConvos.create(convo as never);
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

	async function addMessage(id: number, message: CollabMessage): Promise<CollabConvo | undefined> {
		const convo = await getCollabConvo(id);
		if (!convo) {
			return;
		}

		const updatedMessages = [...convo.messages, message];
		await CollabConvos.update({ messages: updatedMessages }, { where: { id } });
		return getCollabConvo(id);
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
}

export function createCollabConvoDaoProvider(defaultDao: CollabConvoDao): DaoProvider<CollabConvoDao> {
	return {
		getDao(context: TenantOrgContext | undefined): CollabConvoDao {
			return context?.database.collabConvoDao ?? defaultDao;
		},
	};
}
