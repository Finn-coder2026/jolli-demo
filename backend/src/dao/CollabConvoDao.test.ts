import type { Database } from "../core/Database";
import type { CollabConvo } from "../model/CollabConvo";
import { mockCollabConvo, mockCollabMessage, mockNewCollabConvo } from "../model/CollabConvo.mock";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import { type CollabConvoDao, createCollabConvoDao, createCollabConvoDaoProvider } from "./CollabConvoDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("CollabConvoDao", () => {
	let mockCollabConvos: ModelDef<CollabConvo>;
	let collabConvoDao: CollabConvoDao;

	beforeEach(() => {
		mockCollabConvos = {
			create: vi.fn(),
			findOne: vi.fn(),
			findAll: vi.fn(),
			update: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<CollabConvo>;

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockCollabConvos),
		} as unknown as Sequelize;

		collabConvoDao = createCollabConvoDao(mockSequelize);
	});

	describe("createCollabConvo", () => {
		it("should create a collab convo", async () => {
			const newConvo = mockNewCollabConvo({
				artifactType: "doc_draft",
				artifactId: 1,
				messages: [],
			});

			const createdConvo = mockCollabConvo({
				...newConvo,
				id: 1,
			});

			vi.mocked(mockCollabConvos.create).mockResolvedValue(createdConvo as never);

			const result = await collabConvoDao.createCollabConvo(newConvo);

			expect(mockCollabConvos.create).toHaveBeenCalledWith(newConvo);
			expect(result).toEqual(createdConvo);
		});
	});

	describe("getCollabConvo", () => {
		it("should return a convo by ID", async () => {
			const convo = mockCollabConvo({ id: 1 });
			const mockGet = vi.fn().mockReturnValue(convo);

			vi.mocked(mockCollabConvos.findOne).mockResolvedValue({
				get: mockGet,
			} as never);

			const result = await collabConvoDao.getCollabConvo(1);

			expect(mockCollabConvos.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
			expect(mockGet).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(convo);
		});

		it("should return undefined if convo not found", async () => {
			vi.mocked(mockCollabConvos.findOne).mockResolvedValue(null);

			const result = await collabConvoDao.getCollabConvo(999);

			expect(result).toBeUndefined();
		});
	});

	describe("findByArtifact", () => {
		it("should find convo by artifact type and ID", async () => {
			const convo = mockCollabConvo({ artifactType: "doc_draft", artifactId: 5 });
			const mockGet = vi.fn().mockReturnValue(convo);

			vi.mocked(mockCollabConvos.findOne).mockResolvedValue({
				get: mockGet,
			} as never);

			const result = await collabConvoDao.findByArtifact("doc_draft", 5);

			expect(mockCollabConvos.findOne).toHaveBeenCalledWith({
				where: { artifactType: "doc_draft", artifactId: 5 },
			});
			expect(result).toEqual(convo);
		});

		it("should return undefined if convo not found", async () => {
			vi.mocked(mockCollabConvos.findOne).mockResolvedValue(null);

			const result = await collabConvoDao.findByArtifact("doc_draft", 999);

			expect(result).toBeUndefined();
		});
	});

	describe("addMessage", () => {
		it("should add a message to a convo", async () => {
			const message = mockCollabMessage({ content: "Hello" });
			const convo = mockCollabConvo({ id: 1, messages: [] });
			const updatedConvo = mockCollabConvo({
				id: 1,
				messages: [message],
			});

			vi.mocked(mockCollabConvos.findOne).mockResolvedValueOnce({
				get: () => convo,
			} as never);

			vi.mocked(mockCollabConvos.update).mockResolvedValue([1] as never);

			vi.mocked(mockCollabConvos.findOne).mockResolvedValueOnce({
				get: () => updatedConvo,
			} as never);

			const result = await collabConvoDao.addMessage(1, message);

			expect(mockCollabConvos.update).toHaveBeenCalledWith({ messages: [message] }, { where: { id: 1 } });
			expect(result).toEqual(updatedConvo);
		});

		it("should return undefined if convo not found", async () => {
			const message = mockCollabMessage();

			vi.mocked(mockCollabConvos.findOne).mockResolvedValue(null);

			const result = await collabConvoDao.addMessage(999, message);

			expect(result).toBeUndefined();
			expect(mockCollabConvos.update).not.toHaveBeenCalled();
		});
	});

	describe("getMessages", () => {
		it("should return all messages from a convo", async () => {
			const messages = [mockCollabMessage({ content: "Hello" }), mockCollabMessage({ content: "World" })];
			const convo = mockCollabConvo({ id: 1, messages });

			vi.mocked(mockCollabConvos.findOne).mockResolvedValue({
				get: () => convo,
			} as never);

			const result = await collabConvoDao.getMessages(1);

			expect(result).toEqual(messages);
		});

		it("should return empty array if convo not found", async () => {
			vi.mocked(mockCollabConvos.findOne).mockResolvedValue(null);

			const result = await collabConvoDao.getMessages(999);

			expect(result).toEqual([]);
		});

		it("should return messages with pagination", async () => {
			const messages = [
				mockCollabMessage({ content: "1" }),
				mockCollabMessage({ content: "2" }),
				mockCollabMessage({ content: "3" }),
				mockCollabMessage({ content: "4" }),
			];
			const convo = mockCollabConvo({ id: 1, messages });

			vi.mocked(mockCollabConvos.findOne).mockResolvedValue({
				get: () => convo,
			} as never);

			const result = await collabConvoDao.getMessages(1, 2, 1);

			expect(result).toHaveLength(2);
			expect(result[0].role).toBe("user");
			if (result[0].role === "user" || result[0].role === "assistant" || result[0].role === "system") {
				expect(result[0].content).toBe("2");
			}
			if (result[1].role === "user" || result[1].role === "assistant" || result[1].role === "system") {
				expect(result[1].content).toBe("3");
			}
		});
	});

	describe("updateLastActivity", () => {
		it("should update the last activity timestamp", async () => {
			const convo = mockCollabConvo({ id: 1 });

			vi.mocked(mockCollabConvos.findOne).mockResolvedValueOnce({
				get: () => convo,
			} as never);

			vi.mocked(mockCollabConvos.update).mockResolvedValue([1] as never);

			vi.mocked(mockCollabConvos.findOne).mockResolvedValueOnce({
				get: () => convo,
			} as never);

			const result = await collabConvoDao.updateLastActivity(1);

			expect(mockCollabConvos.update).toHaveBeenCalled();
			expect(result).toEqual(convo);
		});

		it("should return undefined if convo not found", async () => {
			vi.mocked(mockCollabConvos.findOne).mockResolvedValue(null);

			const result = await collabConvoDao.updateLastActivity(999);

			expect(result).toBeUndefined();
		});
	});

	describe("deleteCollabConvo", () => {
		it("should delete a convo", async () => {
			vi.mocked(mockCollabConvos.destroy).mockResolvedValue(1);

			const result = await collabConvoDao.deleteCollabConvo(1);

			expect(mockCollabConvos.destroy).toHaveBeenCalledWith({ where: { id: 1 } });
			expect(result).toBe(true);
		});

		it("should return false if convo not found", async () => {
			vi.mocked(mockCollabConvos.destroy).mockResolvedValue(0);

			const result = await collabConvoDao.deleteCollabConvo(999);

			expect(result).toBe(false);
		});
	});

	describe("deleteAllCollabConvos", () => {
		it("should delete all convos", async () => {
			vi.mocked(mockCollabConvos.destroy).mockResolvedValue(5);

			await collabConvoDao.deleteAllCollabConvos();

			expect(mockCollabConvos.destroy).toHaveBeenCalledWith({ where: {} });
		});
	});

	describe("createCollabConvoDaoProvider", () => {
		it("returns default DAO when context is undefined", () => {
			const defaultDao = {} as CollabConvoDao;
			const provider = createCollabConvoDaoProvider(defaultDao);

			const result = provider.getDao(undefined);

			expect(result).toBe(defaultDao);
		});

		it("returns tenant DAO when context has database with collabConvoDao", () => {
			const defaultDao = {} as CollabConvoDao;
			const tenantDao = {} as CollabConvoDao;
			const context = {
				database: { collabConvoDao: tenantDao } as Database,
			} as TenantOrgContext;
			const provider = createCollabConvoDaoProvider(defaultDao);

			const result = provider.getDao(context);

			expect(result).toBe(tenantDao);
		});

		it("returns default DAO when context database has no collabConvoDao", () => {
			const defaultDao = {} as CollabConvoDao;
			const context = {
				database: {} as Database,
			} as TenantOrgContext;
			const provider = createCollabConvoDaoProvider(defaultDao);

			const result = provider.getDao(context);

			expect(result).toBe(defaultDao);
		});
	});
});
