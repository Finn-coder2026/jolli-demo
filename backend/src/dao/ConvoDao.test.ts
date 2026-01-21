import type { Convo } from "../model/Convo";
import { mockConvo, mockNewConvo } from "../model/Convo.mock";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import { type ConvoDao, createConvoDao, createConvoDaoProvider } from "./ConvoDao";
import { Op, type Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("ConvoDao", () => {
	let mockConvos: ModelDef<Convo>;
	let convoDao: ConvoDao;

	beforeEach(() => {
		mockConvos = {
			create: vi.fn(),
			findOne: vi.fn(),
			findAll: vi.fn(),
			update: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<Convo>;

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockConvos),
		} as unknown as Sequelize;

		convoDao = createConvoDao(mockSequelize);
	});

	describe("createConversation", () => {
		it("should create a conversation", async () => {
			const newConvo = mockNewConvo({
				userId: 1,
				visitorId: undefined,
				title: "Test Conversation",
				messages: [],
			});

			const createdConvo = mockConvo({
				...newConvo,
				id: 1,
			});

			vi.mocked(mockConvos.create).mockResolvedValue(createdConvo as never);

			const result = await convoDao.createConvo(newConvo);

			expect(mockConvos.create).toHaveBeenCalledWith(newConvo);
			expect(result).toEqual(createdConvo);
		});
	});

	describe("getConversation", () => {
		it("should return convo when found and user has access (userId)", async () => {
			const convo = mockConvo({
				id: 1,
				userId: 1,
				visitorId: undefined,
				title: "User Conversation",
			});

			const mockConvInstance = {
				get: vi.fn().mockReturnValue(convo),
			};

			vi.mocked(mockConvos.findOne).mockResolvedValue(mockConvInstance as never);

			const result = await convoDao.getConvo(1, 1, undefined);

			expect(mockConvos.findOne).toHaveBeenCalledWith({
				where: {
					id: 1,
					[Op.or]: [{ userId: 1 }],
				},
			});
			expect(mockConvInstance.get).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(convo);
		});

		it("should return convo when found and visitor has access (visitorId)", async () => {
			const convo = mockConvo({
				id: 1,
				userId: undefined,
				visitorId: "visitor123",
				title: "Visitor Conversation",
			});

			const mockConvInstance = {
				get: vi.fn().mockReturnValue(convo),
			};

			vi.mocked(mockConvos.findOne).mockResolvedValue(mockConvInstance as never);

			const result = await convoDao.getConvo(1, undefined, "visitor123");

			expect(mockConvos.findOne).toHaveBeenCalledWith({
				where: {
					id: 1,
					[Op.or]: [{ visitorId: "visitor123" }],
				},
			});
			expect(mockConvInstance.get).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(convo);
		});

		it("should return convo with both userId and visitorId provided", async () => {
			const convo = mockConvo({
				id: 1,
				userId: 1,
				visitorId: "visitor123",
				title: "Mixed Conversation",
			});

			const mockConvInstance = {
				get: vi.fn().mockReturnValue(convo),
			};

			vi.mocked(mockConvos.findOne).mockResolvedValue(mockConvInstance as never);

			const result = await convoDao.getConvo(1, 1, "visitor123");

			expect(mockConvos.findOne).toHaveBeenCalledWith({
				where: {
					id: 1,
					[Op.or]: [{ userId: 1 }, { visitorId: "visitor123" }],
				},
			});
			expect(mockConvInstance.get).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(convo);
		});

		it("should return undefined when convo not found", async () => {
			vi.mocked(mockConvos.findOne).mockResolvedValue(null);

			const result = await convoDao.getConvo(999, 1, undefined);

			expect(result).toBeUndefined();
		});
	});

	describe("listConversations", () => {
		it("should list conversations for authenticated user", async () => {
			const conversations = [
				mockConvo({ id: 1, userId: 1, visitorId: undefined }),
				mockConvo({ id: 2, userId: 1, visitorId: undefined }),
			];

			const mockConvInstances = conversations.map(conv => ({
				get: vi.fn().mockReturnValue(conv),
			}));

			vi.mocked(mockConvos.findAll).mockResolvedValue(mockConvInstances as never);

			const result = await convoDao.listConvos(1, undefined);

			expect(mockConvos.findAll).toHaveBeenCalledWith({
				where: {
					[Op.or]: [{ userId: 1 }],
				},
				order: [["updatedAt", "DESC"]],
			});
			expect(result).toEqual(conversations);
		});

		it("should list conversations for visitor", async () => {
			const conversations = [
				mockConvo({ id: 1, userId: undefined, visitorId: "visitor123" }),
				mockConvo({ id: 2, userId: undefined, visitorId: "visitor123" }),
			];

			const mockConvInstances = conversations.map(conv => ({
				get: vi.fn().mockReturnValue(conv),
			}));

			vi.mocked(mockConvos.findAll).mockResolvedValue(mockConvInstances as never);

			const result = await convoDao.listConvos(undefined, "visitor123");

			expect(mockConvos.findAll).toHaveBeenCalledWith({
				where: {
					[Op.or]: [{ visitorId: "visitor123" }],
				},
				order: [["updatedAt", "DESC"]],
			});
			expect(result).toEqual(conversations);
		});

		it("should list conversations with both userId and visitorId", async () => {
			const conversations = [
				mockConvo({ id: 1, userId: 1, visitorId: undefined }),
				mockConvo({ id: 2, userId: undefined, visitorId: "visitor123" }),
			];

			const mockConvInstances = conversations.map(conv => ({
				get: vi.fn().mockReturnValue(conv),
			}));

			vi.mocked(mockConvos.findAll).mockResolvedValue(mockConvInstances as never);

			const result = await convoDao.listConvos(1, "visitor123");

			expect(mockConvos.findAll).toHaveBeenCalledWith({
				where: {
					[Op.or]: [{ userId: 1 }, { visitorId: "visitor123" }],
				},
				order: [["updatedAt", "DESC"]],
			});
			expect(result).toEqual(conversations);
		});
	});

	describe("updateConversation", () => {
		it("should update convo title", async () => {
			const convo = mockConvo({
				id: 1,
				userId: 1,
				visitorId: undefined,
				title: "Old Title",
			});

			const updatedConvo = {
				...convo,
				title: "New Title",
			};

			const mockConvInstance = {
				get: vi.fn().mockReturnValue(convo),
			};

			const mockUpdatedInstance = {
				get: vi.fn().mockReturnValue(updatedConvo),
			};

			vi.mocked(mockConvos.findOne)
				.mockResolvedValueOnce(mockConvInstance as never)
				.mockResolvedValueOnce(mockUpdatedInstance as never);

			vi.mocked(mockConvos.update).mockResolvedValue([1] as never);

			const result = await convoDao.updateConvo(1, { title: "New Title" }, 1, undefined);

			expect(mockConvos.update).toHaveBeenCalledWith(
				{ title: "New Title" },
				{
					where: {
						id: 1,
						[Op.or]: [{ userId: 1 }],
					},
				},
			);
			expect(result).toEqual(updatedConvo);
		});

		it("should update convo messages", async () => {
			const convo = mockConvo({
				id: 1,
				userId: 1,
				visitorId: undefined,
				messages: [{ role: "user", content: "Hello" }],
			});

			const newMessages = [
				{ role: "user" as const, content: "Hello" },
				{ role: "assistant" as const, content: "Hi there!" },
			];

			const updatedConvo = {
				...convo,
				messages: newMessages,
			};

			const mockConvInstance = {
				get: vi.fn().mockReturnValue(convo),
			};

			const mockUpdatedInstance = {
				get: vi.fn().mockReturnValue(updatedConvo),
			};

			vi.mocked(mockConvos.findOne)
				.mockResolvedValueOnce(mockConvInstance as never)
				.mockResolvedValueOnce(mockUpdatedInstance as never);

			vi.mocked(mockConvos.update).mockResolvedValue([1] as never);

			const result = await convoDao.updateConvo(1, { messages: newMessages }, 1, undefined);

			expect(mockConvos.update).toHaveBeenCalledWith(
				{ messages: newMessages },
				{
					where: {
						id: 1,
						[Op.or]: [{ userId: 1 }],
					},
				},
			);
			expect(result).toEqual(updatedConvo);
		});

		it("should return undefined when convo not found", async () => {
			vi.mocked(mockConvos.findOne).mockResolvedValue(null);

			const result = await convoDao.updateConvo(999, { title: "New Title" }, 1, undefined);

			expect(mockConvos.update).not.toHaveBeenCalled();
			expect(result).toBeUndefined();
		});

		it("should update convo with visitorId", async () => {
			const convo = mockConvo({
				id: 1,
				userId: undefined,
				visitorId: "visitor123",
				title: "Old Title",
			});

			const updatedConvo = {
				...convo,
				title: "New Title",
			};

			const mockConvInstance = {
				get: vi.fn().mockReturnValue(convo),
			};

			const mockUpdatedInstance = {
				get: vi.fn().mockReturnValue(updatedConvo),
			};

			vi.mocked(mockConvos.findOne)
				.mockResolvedValueOnce(mockConvInstance as never)
				.mockResolvedValueOnce(mockUpdatedInstance as never);

			vi.mocked(mockConvos.update).mockResolvedValue([1] as never);

			const result = await convoDao.updateConvo(1, { title: "New Title" }, undefined, "visitor123");

			expect(mockConvos.update).toHaveBeenCalledWith(
				{ title: "New Title" },
				{
					where: {
						id: 1,
						[Op.or]: [{ visitorId: "visitor123" }],
					},
				},
			);
			expect(result).toEqual(updatedConvo);
		});
	});

	describe("deleteConversation", () => {
		it("should delete convo and return true when found", async () => {
			const convo = mockConvo({
				id: 1,
				userId: 1,
				visitorId: undefined,
			});

			const mockConvInstance = {
				get: vi.fn().mockReturnValue(convo),
			};

			vi.mocked(mockConvos.findOne).mockResolvedValue(mockConvInstance as never);
			vi.mocked(mockConvos.destroy).mockResolvedValue(1 as never);

			const result = await convoDao.deleteConvo(1, 1, undefined);

			expect(mockConvos.destroy).toHaveBeenCalledWith({
				where: {
					id: 1,
					[Op.or]: [{ userId: 1 }],
				},
			});
			expect(result).toBe(true);
		});

		it("should return false when convo not deleted", async () => {
			const convo = mockConvo({
				id: 1,
				userId: 1,
				visitorId: undefined,
			});

			const mockConvInstance = {
				get: vi.fn().mockReturnValue(convo),
			};

			vi.mocked(mockConvos.findOne).mockResolvedValue(mockConvInstance as never);
			vi.mocked(mockConvos.destroy).mockResolvedValue(0 as never);

			const result = await convoDao.deleteConvo(1, 1, undefined);

			expect(result).toBe(false);
		});

		it("should delete convo with visitorId", async () => {
			const convo = mockConvo({
				id: 1,
				userId: undefined,
				visitorId: "visitor123",
			});

			const mockConvInstance = {
				get: vi.fn().mockReturnValue(convo),
			};

			vi.mocked(mockConvos.findOne).mockResolvedValue(mockConvInstance as never);
			vi.mocked(mockConvos.destroy).mockResolvedValue(1 as never);

			const result = await convoDao.deleteConvo(1, undefined, "visitor123");

			expect(mockConvos.destroy).toHaveBeenCalledWith({
				where: {
					id: 1,
					[Op.or]: [{ visitorId: "visitor123" }],
				},
			});
			expect(result).toBe(true);
		});

		it("should return false when convo not found", async () => {
			vi.mocked(mockConvos.destroy).mockResolvedValue(0 as never);

			const result = await convoDao.deleteConvo(999, 1, undefined);

			expect(mockConvos.destroy).toHaveBeenCalledWith({
				where: {
					id: 999,
					[Op.or]: [{ userId: 1 }],
				},
			});
			expect(result).toBe(false);
		});
	});

	describe("addMessage", () => {
		it("should add message to conversation", async () => {
			const convo = mockConvo({
				id: 1,
				userId: 1,
				visitorId: undefined,
				messages: [{ role: "user", content: "Hello" }],
			});

			const newMessage = { role: "assistant" as const, content: "Hi there!" };

			const updatedConvo = {
				...convo,
				messages: [...convo.messages, newMessage],
			};

			const mockConvInstance = {
				get: vi.fn().mockReturnValue(convo),
			};

			const mockUpdatedInstance = {
				get: vi.fn().mockReturnValue(updatedConvo),
			};

			vi.mocked(mockConvos.findOne)
				.mockResolvedValueOnce(mockConvInstance as never)
				.mockResolvedValueOnce(mockConvInstance as never)
				.mockResolvedValueOnce(mockUpdatedInstance as never);

			vi.mocked(mockConvos.update).mockResolvedValue([1] as never);

			const result = await convoDao.addMessage(1, newMessage, 1, undefined);

			expect(mockConvos.update).toHaveBeenCalledWith(
				{ messages: [...convo.messages, newMessage] },
				{
					where: {
						id: 1,
						[Op.or]: [{ userId: 1 }],
					},
				},
			);
			expect(result).toEqual(updatedConvo);
		});

		it("should add message with visitorId", async () => {
			const convo = mockConvo({
				id: 1,
				userId: undefined,
				visitorId: "visitor123",
				messages: [{ role: "user", content: "Hello" }],
			});

			const newMessage = { role: "assistant" as const, content: "Hi there!" };

			const updatedConvo = {
				...convo,
				messages: [...convo.messages, newMessage],
			};

			const mockConvInstance = {
				get: vi.fn().mockReturnValue(convo),
			};

			const mockUpdatedInstance = {
				get: vi.fn().mockReturnValue(updatedConvo),
			};

			vi.mocked(mockConvos.findOne)
				.mockResolvedValueOnce(mockConvInstance as never)
				.mockResolvedValueOnce(mockConvInstance as never)
				.mockResolvedValueOnce(mockUpdatedInstance as never);

			vi.mocked(mockConvos.update).mockResolvedValue([1] as never);

			const result = await convoDao.addMessage(1, newMessage, undefined, "visitor123");

			expect(mockConvos.update).toHaveBeenCalledWith(
				{ messages: [...convo.messages, newMessage] },
				{
					where: {
						id: 1,
						[Op.or]: [{ visitorId: "visitor123" }],
					},
				},
			);
			expect(result).toEqual(updatedConvo);
		});

		it("should return undefined when convo not found", async () => {
			vi.mocked(mockConvos.findOne).mockResolvedValue(null);

			const result = await convoDao.addMessage(999, { role: "user", content: "Test" }, 1, undefined);

			expect(mockConvos.update).not.toHaveBeenCalled();
			expect(result).toBeUndefined();
		});
	});
});

describe("createConvoDaoProvider", () => {
	it("should return defaultDao when context is undefined", () => {
		const defaultDao = {} as ConvoDao;
		const provider = createConvoDaoProvider(defaultDao);

		const result = provider.getDao(undefined);

		expect(result).toBe(defaultDao);
	});

	it("should return context convoDao when context has database", () => {
		const defaultDao = {} as ConvoDao;
		const contextConvoDao = {} as ConvoDao;
		const context = {
			database: {
				convoDao: contextConvoDao,
			},
		} as TenantOrgContext;

		const provider = createConvoDaoProvider(defaultDao);

		const result = provider.getDao(context);

		expect(result).toBe(contextConvoDao);
	});
});
