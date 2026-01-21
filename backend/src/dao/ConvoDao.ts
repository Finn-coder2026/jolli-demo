import type { ChatMessage } from "../model/Convo";
import { type Convo, defineConvos, type NewConvo } from "../model/Convo";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { DaoProvider } from "./DaoProvider";
import type { Sequelize } from "sequelize";
import { Op } from "sequelize";

/**
 * Convos DAO
 */
export interface ConvoDao {
	/**
	 * Creates a new Convo.
	 * @param convo the convo to create.
	 */
	createConvo(convo: NewConvo): Promise<Convo>;

	/**
	 * Gets a convo by ID with authorization check.
	 * @param id the convo ID.
	 * @param userId the authenticated user ID (if logged in).
	 * @param visitorId the visitor ID (if anonymous).
	 */
	getConvo(id: number, userId?: number, visitorId?: string): Promise<Convo | undefined>;

	/**
	 * Lists all convos for a user or visitor.
	 * @param userId the authenticated user ID (if logged in).
	 * @param visitorId the visitor ID (if anonymous).
	 */
	listConvos(userId?: number, visitorId?: string): Promise<Array<Convo>>;

	/**
	 * Updates a convo (title and/or messages).
	 * @param id the convo ID.
	 * @param updates partial updates to apply.
	 * @param userId the authenticated user ID (if logged in).
	 * @param visitorId the visitor ID (if anonymous).
	 */
	updateConvo(
		id: number,
		updates: Partial<Pick<Convo, "title" | "messages">>,
		userId?: number,
		visitorId?: string,
	): Promise<Convo | undefined>;

	/**
	 * Deletes a convo with authorization check.
	 * @param id the convo ID.
	 * @param userId the authenticated user ID (if logged in).
	 * @param visitorId the visitor ID (if anonymous).
	 */
	deleteConvo(id: number, userId?: number, visitorId?: string): Promise<boolean>;

	/**
	 * Appends a message to an existing convo.
	 * @param id the convo ID.
	 * @param message the message to append.
	 * @param userId the authenticated user ID (if logged in).
	 * @param visitorId the visitor ID (if anonymous).
	 */
	addMessage(id: number, message: ChatMessage, userId?: number, visitorId?: string): Promise<Convo | undefined>;
}

export function createConvoDao(sequelize: Sequelize): ConvoDao {
	const Convos = defineConvos(sequelize);

	return {
		createConvo,
		getConvo,
		listConvos,
		updateConvo,
		deleteConvo,
		addMessage,
	};

	async function createConvo(convo: NewConvo): Promise<Convo> {
		return await Convos.create(convo as never);
	}

	async function getConvo(id: number, userId?: number, visitorId?: string): Promise<Convo | undefined> {
		const whereConditions: Array<{ userId?: number; visitorId?: string }> = [];
		if (userId !== undefined) {
			whereConditions.push({ userId });
		}
		if (visitorId !== undefined) {
			whereConditions.push({ visitorId });
		}

		const convo = await Convos.findOne({
			where: {
				id,
				[Op.or]: whereConditions,
			},
		});
		return convo ? convo.get({ plain: true }) : undefined;
	}

	async function listConvos(userId?: number, visitorId?: string): Promise<Array<Convo>> {
		const whereConditions: Array<{ userId?: number; visitorId?: string }> = [];
		if (userId !== undefined) {
			whereConditions.push({ userId });
		}
		if (visitorId !== undefined) {
			whereConditions.push({ visitorId });
		}

		const convos = await Convos.findAll({
			where: {
				[Op.or]: whereConditions,
			},
			order: [["updatedAt", "DESC"]],
		});
		return convos.map(conv => conv.get({ plain: true }));
	}

	async function updateConvo(
		id: number,
		updates: Partial<Pick<Convo, "title" | "messages">>,
		userId?: number,
		visitorId?: string,
	): Promise<Convo | undefined> {
		const convo = await getConvo(id, userId, visitorId);
		if (!convo) {
			return;
		}

		const whereConditions: Array<{ userId?: number; visitorId?: string }> = [];
		if (userId !== undefined) {
			whereConditions.push({ userId });
		}
		if (visitorId !== undefined) {
			whereConditions.push({ visitorId });
		}

		await Convos.update(updates, {
			where: {
				id,
				[Op.or]: whereConditions,
			},
		});

		return getConvo(id, userId, visitorId);
	}

	async function deleteConvo(id: number, userId?: number, visitorId?: string): Promise<boolean> {
		const whereConditions: Array<{ userId?: number; visitorId?: string }> = [];
		if (userId !== undefined) {
			whereConditions.push({ userId });
		}
		if (visitorId !== undefined) {
			whereConditions.push({ visitorId });
		}

		const deleted = await Convos.destroy({
			where: {
				id,
				[Op.or]: whereConditions,
			},
		});
		return deleted > 0;
	}

	async function addMessage(
		id: number,
		message: ChatMessage,
		userId?: number,
		visitorId?: string,
	): Promise<Convo | undefined> {
		const convo = await getConvo(id, userId, visitorId);
		if (!convo) {
			return;
		}

		const updatedMessages = [...convo.messages, message];
		return updateConvo(id, { messages: updatedMessages }, userId, visitorId);
	}
}

export function createConvoDaoProvider(defaultDao: ConvoDao): DaoProvider<ConvoDao> {
	return {
		getDao(context: TenantOrgContext | undefined): ConvoDao {
			return context?.database.convoDao ?? defaultDao;
		},
	};
}
